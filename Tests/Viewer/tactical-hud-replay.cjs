// Run with Electron and a recording path. Uses the built Viewer and real GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const output=path.join(root,'artifacts/tests/tactical-hud-replay',path.basename(recording,'.gtfo'));
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1500,height:1000,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,(_key,value)=>typeof value==='bigint'?String(value):value,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Replay verification timed out'}),120000);
app.on('web-contents-created',(_,contents)=>{
    contents.setBackgroundThrottling(false);
    contents.on('console-message',(_,level,message)=>fs.appendFileSync(path.join(output,'console.log'),level+': '+message+'\n'));
    contents.once('did-finish-load',async()=>{try{
        const result=await contents.executeJavaScript(`(async()=>{
            const {app}=await import('./app.js');
            const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
            app.onLoadModule(await window.api.invoke('loadModule','vanilla'));
            const deadline=Date.now()+30000;while(!app.profile()&&Date.now()<deadline)await wait(100);
            await app.openFile(${JSON.stringify(recording)},false);
            const view=app.player.view;
            const indexing=Date.now()+60000;
            while(!view.replay()?.complete&&Date.now()<indexing){if(view.replay()?.error)throw view.replay().error;await wait(100)}
            if(!view.replay()?.complete)throw Error('Recording did not finish indexing');
            view.pause(true);view.time(120000);await wait(1000);
            const replay=view.replay(),checks=[],frames=[];
            const panel=document.querySelector('[aria-label="Scans and mission information"]');
            for(let time=30000;time<Math.min(replay.length(),1200000);time+=30000){
                view.time(time);await wait(150);
                // The panel must never stay on screen as an empty frame, nor stretch past its content.
                const rect=panel.getBoundingClientRect();
                frames.push({time,hidden:panel.hidden,children:panel.childNodes.length,height:Math.round(rect.height),scrollHeight:panel.scrollHeight});
                const scans=view.api().get('Vanilla.Bioscan.Status');
                if(!scans?.size)continue;
                const bars=[...panel.querySelectorAll('progress')];
                if(!bars.length)continue;
                checks.push({time,text:panel.innerText,bars:bars.map(bar=>bar.value),recordedProgress:[...scans.values()].map(scan=>scan.progress),height:Math.round(rect.height),scrollHeight:panel.scrollHeight});
                if(checks.length===2)break;
            }
            let progressCheck;
            for(let time=checks[0].time;time<checks[0].time+120000;time+=1000){
                const state=await replay.getSnapshot(time),api=replay.api(state);
                const scans=api.get('Vanilla.Bioscan.Status');
                const active=[...(scans?.values()??[])].find(scan=>scan.progress>0&&scan.progress<1);
                if(!active)continue;
                view.time(time);await wait(250);
                const bars=[...document.querySelectorAll('[aria-label="Scans and mission information"] progress')].map(bar=>bar.value);
                progressCheck={time,recorded:Math.round(active.progress*100),bars};break;
            }
            const logs=view.diagnosticLogs();
            const emptyFrames=frames.filter(frame=>!frame.hidden&&frame.children===0).length;
            const stretched=frames.filter(frame=>!frame.hidden&&frame.height>frame.scrollHeight+1).length;
            return {passed:!!progressCheck&&progressCheck.bars.includes(progressCheck.recorded)&&checks.length===2&&checks.every(c=>c.text.includes('BIOSCAN')&&c.bars.length>0&&c.height<=c.scrollHeight+1)&&emptyFrames===0&&stretched===0&&!replay.error&&logs.length===0,checks,progressCheck,emptyFrames,stretched,frames,logs};
        })()`);
        fs.writeFileSync(path.join(output,'scene.png'),(await contents.capturePage()).toPNG());finish(result);
    }catch(error){const details=await contents.executeJavaScript('window.floorReport ?? {}').catch(()=>({}));finish({...details,passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(root,'Viewer/electron/build/app.cjs'));
