// Run with Electron and a recording path. Uses the built Viewer and real GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const output=path.join(root,'artifacts/tests/recent-replay-errors',path.basename(recording,'.gtfo'));
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
            const events=view.replay().events;
            const detonations=events.filter(e=>e.kind==='Vanilla.Mine.Detonate');
            const damage=events.filter(e=>e.kind==='Vanilla.StatTracker.Damage' && e.data.type==='Explosive');
            const correlations=damage.map(e=>{const matches=detonations.filter(d=>d.data.id===e.data.source);return {time:e.time,id:e.id,...e.data,participants:e.participants,detonations:matches.map(d=>({time:d.time,id:d.id,...d.data,delay:e.time-d.time}))};});
            const seeks=[];
            for(const time of [...new Set(damage.map(e=>e.time))]) {
                view.time(time+50);await wait(30);
                if(view.replay().error){seeks.push({time,error:String(view.replay().error)});break;}
            }
            view.time(view.replay().length());await wait(750);
            const tracker=view.api().get('Vanilla.StatTracker');
            const explosiveTotal=[...(tracker?.players.values() ?? [])].reduce((sum,player)=>sum+[...player.enemyDamage.explosiveDamage.values()].reduce((n,v)=>n+v.value,0)+[...player.playerDamage.explosiveDamage.values()].reduce((n,v)=>n+v,0),0);
            const recordedTotal=damage.reduce((sum,event)=>sum+event.data.damage,0);
            const logs=view.diagnosticLogs();
            return {passed:!view.replay().error && logs.length===0 && Math.abs(explosiveTotal-recordedTotal)<.001,explosiveTotal,recordedTotal,recording:${JSON.stringify(path.basename(recording))},length:view.replay().length(),events:events.length,detonations,explosiveDamage:correlations,logs,seekFailures:seeks,nativeDiagnostics:view.api().header.get('Vanilla.Map.NativeSurfaceDiagnostics')};
        })()`);
        fs.writeFileSync(path.join(output,'scene.png'),(await contents.capturePage()).toPNG());finish(result);
    }catch(error){const details=await contents.executeJavaScript('window.floorReport ?? {}').catch(()=>({}));finish({...details,passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(root,'Viewer/electron/build/app.cjs'));
