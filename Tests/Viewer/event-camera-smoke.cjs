// Electron acceptance against a real recording. Never writes to the recording.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const root = path.resolve(__dirname, '../..');
const appDir = path.resolve(process.argv[2]);
const recording = path.resolve(process.argv[3]);
const output = path.join(root, 'artifacts/tests/event-camera');
fs.mkdirSync(output, {recursive:true});
app.setPath('userData', fs.mkdtempSync(path.join(output,'user-data-')));
BrowserWindow.prototype.show = function() {};
const originalLoad = Module._load;
Module._load = function(name, ...args) {
    const value = originalLoad.call(this,name,...args);
    return name !== 'electron' ? value : {...value, BrowserWindow:new Proxy(value.BrowserWindow,{construct(Target,[options]) {
        return new Target({...options,width:1440,height:900,webPreferences:{...options.webPreferences,offscreen:true}});
    }})};
};
let finished = false;
function finish(passed,result) {
    if (finished) return; finished = true;
    fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({passed,result},null,2));
    console.log(JSON.stringify({passed,result})); app.exit(passed ? 0 : 1);
}
setTimeout(()=>finish(false,'Timed out loading the recording.'),360000);
app.on('web-contents-created',(_,contents)=>{
    contents.setBackgroundThrottling(false);
    contents.setFrameRate(15);
    contents.on('console-message',(_,level,message)=>{ if(message.startsWith('CAMERA TEST') || level >= 3) console.log(message); });
    contents.once('did-finish-load',async()=>{
        try {
            const result = await contents.executeJavaScript(`(async()=>{
                const {app} = await import('./app.js');
                const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
                const until = async (condition, label, timeout=10000) => {
                    const deadline=Date.now()+timeout;
                    while (!condition() && Date.now()<deadline) await wait(50);
                    if (!condition()) throw new Error(label);
                };
                await until(()=>!app.nav.error(),'Profile did not load',45000);
                console.log('CAMERA TEST profile ready');
                await app.openFile(${JSON.stringify(recording)},false);
                const view=app.player.view;
                view.pause(true);
                const progress=setInterval(()=>console.log('CAMERA TEST '+JSON.stringify({loaded:view.replay()?.loadedLength(),events:view.replay()?.events.length,error:String(view.replay()?.error)})),10000);
                await until(()=>view.replay()?.complete || view.replay()?.error,'Recording did not finish indexing',300000);
                clearInterval(progress);
                console.log('CAMERA TEST recording indexed');
                if(view.replay().error) throw view.replay().error;
                view.pause(true);
                const events=view.replay().events;
                const downed=events.filter(e=>e.kind==='Vanilla.Player.Animation.Downed' && e.participants?.some(p=>p.name));
                if(!downed.length) throw new Error('Recording requires a named player-down event.');
                const enemy=events.flatMap(e=>e.participants??[]).find(p=>p.type==='enemy' && p.name && p.name!=='Unknown');
                if(!enemy) throw new Error('Enemy type names were not indexed.');
                await until(()=>[...document.querySelectorAll('.workspace-nav button')].some(b=>b.textContent==='Events'),'Event navigation did not mount');
                const nav=[...document.querySelectorAll('.workspace-nav button')].find(b=>b.textContent==='Events');
                nav.click(); await wait(100);
                const filter=document.querySelector('.event-filters [role=combobox]'); filter.click(); await wait(60);
                const options=[...document.querySelectorAll('[role=option]')];
                if(!options.some(o=>o.textContent==='Teammate revive') || !options.some(o=>o.textContent==='Player revived')) throw new Error('Revive types are not distinct.');
                const downOption=options.find(o=>o.textContent==='Player downed');
                if(!downOption) throw new Error('Downed filter missing: '+options.map(o=>o.textContent).join(', '));
                downOption.click(); await wait(150);
                const controls=view.renderer.get('Controls');
                const rows=()=>[...document.querySelectorAll('.event-jump')];
                await until(()=>rows().length>0,'Downed event row did not render');
                const firstRevision=controls.revision;
                rows()[0].click();
                await until(()=>controls.revision>=firstRevision+2 && Math.abs(view.api().time()-view.time())<1 && controls.targetName()===downed[0].participants.find(p=>p.type==='player').name && controls.targetSlot()!==undefined,'Down event did not follow its player');
                if(view.time()!==Math.max(view.replay().startTime,downed[0].time-3000) || !view.pause()) throw new Error('Event did not pause at the three-second lead-in.');
                if(controls.autoCamera()) throw new Error('Explicit event focus did not take manual control.');
                await wait(800);
                controls.followPlayer(); view.time(downed[0].time-500);
                await until(()=>Math.abs(view.api().time()-view.time())<1,'Seek did not settle');
                controls.enableAutoCamera(); view.timescale(1); view.pause(false);
                await until(()=>controls.targetName()===downed[0].participants.find(p=>p.type==='player').name && controls.targetSlot()!==undefined,'Automatic camera missed player-down event',5000);
                if(!controls.autoCamera() || view.pause()) throw new Error('Automatic framing changed playback mode.');
                view.pause(true);
                const camera=view.renderer.get('Camera').root;
                const position=camera.position.clone(), rotation=camera.quaternion.clone();
                controls.followPlayer(); await wait(100);
                if(!camera.position.equals(position) || !camera.quaternion.equals(rotation)) throw new Error('Free-camera release changed the world pose.');
                rows()[0].click(); await wait(1000);
                return {downedEvents:downed.length,enemy:enemy.name,leadIn:3000,followed:controls.targetName(),automaticDowned:true,releasePreservesPose:true,reviveTypesDistinct:true};
            })()`);
            fs.writeFileSync(path.join(output,'event-focus.png'),(await contents.capturePage()).toPNG());
            finish(true,result);
        } catch(error) { finish(false,error.stack||String(error)); }
    });
});
require(path.join(appDir,'app.cjs'));
