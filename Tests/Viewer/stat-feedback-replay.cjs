// Run with Electron and a recording path. Uses the built Viewer and real GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const output=path.join(root,'artifacts/tests/stat-feedback-replay',path.basename(recording,'.gtfo'));
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
            const replay=view.replay(),checks=[];
            const pack=replay.events.find(e=>e.kind==='Vanilla.StatTracker.Pack'&&e.data.type==='Healing');
            if(!pack)throw Error('No healing pack in recording');
            view.time(pack.time+100);await wait(500);
            const api=view.api(),id=pack.data.target;
            const stats=api.get('Vanilla.Player.Stats').get(id),player=api.get('Vanilla.Player').get(id);
            const model=view.renderer.get('Players').get(id),camera=view.renderer.get('Camera'),backpack=api.get('Vanilla.Player.Backpack')?.get(id);
            const flash=stats.feedback?.health;
            if(!flash||flash.color!==0x45e887)throw Error('Healing pack did not produce recipient feedback');
            for(const age of [0,250,500,1000]){
                model.updateTmp(player,camera,flash.time+age,stats,backpack);
                checks.push({age,color:model.tmp.colorRanges[model.tmp.text.indexOf('Health:')-1]});
            }
            return {passed:checks[0].color===0x45e887&&checks[1].color!==checks[0].color&&checks[2].color!==checks[1].color&&checks[3].color===0xffffff&&!replay.error,checks,logs:view.diagnosticLogs()};
        })()`);
        fs.writeFileSync(path.join(output,'scene.png'),(await contents.capturePage()).toPNG());finish(result);
    }catch(error){const details=await contents.executeJavaScript('window.floorReport ?? {}').catch(()=>({}));finish({...details,passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(root,'Viewer/electron/build/app.cjs'));
