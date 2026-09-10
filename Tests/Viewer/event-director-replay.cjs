// Run with Electron and a recording path. Uses the built Viewer and real GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const output=path.join(root,'artifacts/tests/event-director-replay',path.basename(recording,'.gtfo'));
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
            const replay=view.replay(), controls=view.renderer.get('Controls');
            const checks=[];
            for(const event of replay.events.filter(e=>e.kind==='Vanilla.StatTracker.Damage' && e.participants?.some(p=>p.type==='enemy'))) {
                const id=event.participants.find(p=>p.type==='enemy').id;
                const before=replay.api(await replay.getSnapshot(Math.max(replay.startTime,event.time-100)));
                const enemy=before.get('Vanilla.Enemy')?.get(id);
                if(!enemy || enemy.health<=0)continue;
                const after=replay.api(await replay.getSnapshot(event.time+200));
                const dead=after.get('Vanilla.Enemy')?.get(id);
                if(dead && dead.health>0)continue;
                const target={...enemy,key:'enemy:'+id,type:'enemy',id};
                controls.enableAutoCamera();controls.frameSubject(target);
                controls.director.reset(before.time()-16);controls.director.held=0;
                view.pause(false);controls.update(before,.016);view.pause(true);
                const livingHeld=controls.subject?.key===target.key;
                controls.update(after,.016);
                const pausedHeld=controls.subject?.key===target.key;
                controls.director.reset(after.time()-16);controls.director.held=0;
                view.pause(false);controls.update(after,.016);view.pause(true);
                const switched=controls.subject?.type==='player' && after.get('Vanilla.Player').has(controls.subject.id);
                const smooth=!!controls.transition;
                controls.frameSubject(target);controls.autoCamera(false);
                view.pause(false);controls.update(after,.016);view.pause(true);
                const manualHeld=controls.subject?.key===target.key;
                checks.push({id,time:event.time,livingHeld,pausedHeld,switched,smooth,manualHeld});
                if(checks.length>=3)break;
            }
            controls.enableAutoCamera();view.time(checks[0]?.time+250 || 120000);view.pause(false);await wait(700);view.pause(true);
            return {passed:checks.length===3 && checks.every(c=>c.livingHeld&&c.pausedHeld&&c.switched&&c.smooth&&c.manualHeld) && !replay.error,checks,logs:view.diagnosticLogs()};
        })()`);
        fs.writeFileSync(path.join(output,'scene.png'),(await contents.capturePage()).toPNG());finish(result);
    }catch(error){const details=await contents.executeJavaScript('window.floorReport ?? {}').catch(()=>({}));finish({...details,passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(root,'Viewer/electron/build/app.cjs'));
