// Run with Electron and a recording path. Uses the built Viewer and real GPU.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const output=path.join(root,'artifacts/tests/native-floor-replays',path.basename(recording,'.gtfo'));
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1500,height:1000,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
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
            const renderer=view.renderer,native=renderer.get('NativeSurfaces');
            if(!native)throw Error('Native surface renderer unavailable');
            await native.ready;
            const surfaces=view.api().header.get('Vanilla.Map.NativeSurfaces');
            const manifest=await (await fetch('../environment/architecture/manifest.json')).json();
            const loaded=new Set(native.root.children.map(mesh=>mesh.name.split(' ').at(-1)));
            const identities=[...new Set(surfaces.filter(s=>s.enabled).map(s=>s.asset))];
            const excluded=new Set(manifest.excluded);
            if([...loaded].some(id=>excluded.has(id)))throw Error('Excluded scenery was loaded');
            if(view.diagnosticLogs().some(log=>[...excluded].some(id=>JSON.stringify(log).includes(id))))throw Error('Excluded scenery produced a missing-resource warning');
            const excludedInstances=surfaces.filter(s=>s.enabled&&excluded.has(s.asset)).length;
            const missing=identities.filter(id=>!loaded.has(id)&&!excluded.has(id));
            const models=identities.map(id=>{const asset=manifest.models.find(m=>m.id===id);return {id,mesh:asset?.capture.mesh,kind:asset?.kind,loaded:loaded.has(id),instances:surfaces.filter(s=>s.enabled&&s.asset===id).length};});
            const untextured=native.root.children.filter(mesh=>[].concat(mesh.material).some(m=>!m.map)).map(mesh=>mesh.name);
            const disabledModels=[...new Set(surfaces.filter(s=>!s.enabled).map(s=>s.asset))].map(id=>({id,mesh:manifest.models.find(m=>m.id===id)?.capture.mesh,instances:surfaces.filter(s=>s.asset===id&&!s.enabled).length}));
            window.floorReport={excludedInstances,disabledModels,surfaces:surfaces.length,loadedIdentities:loaded.size,missing,untextured:[...new Set(untextured)],models,diagnostics:view.api().header.get('Vanilla.Map.NativeSurfaceDiagnostics')};
            const navigation=[...renderer.get('Maps').values()].flat();
            const fallback=[...renderer.get('NavigationFallback').values()].flat();
            if(!native.navigationReady)throw Error('Fallback support classification incomplete');
            if(!surfaces.some(s=>s.enabled) && !fallback.some(mesh=>mesh.geometry.attributes.position.count>0))throw Error('Missing native floors lost their default ground');
            window.floorReport.navigationTriangles=native.navigationTriangles;
            for(const time of [120000,600000,1200000,120000]){
                view.time(time);await wait(250);
                if(view.replay().error)throw view.replay().error;
                if(navigation.some(mesh=>mesh.parent||mesh.visible))throw Error('Navigation rendered over native geometry');
            }
            view.pause(false);const before=view.time();await wait(250);view.pause(true);
            if(view.time()<=before)throw Error('Playback did not advance');
            if (${process.argv.includes('--survey')}) {
                const T=await import('../js3party/three/build/three.module.js');
                const ray=new T.Raycaster(),samples=[];
                for(let t=10000;t<780000;t+=5000){
                    view.time(t);await wait(50);renderer.render(0,view.api());
                    for(const player of view.api().get('Vanilla.Player').values()){
                        const model=renderer.get('Players').get(player.id),anim=view.api().get('Vanilla.Player.Animation').get(player.id);
                        if(!model)continue;
                        ray.set(new T.Vector3(player.position.x,player.position.y+1,player.position.z),new T.Vector3(0,-1,0));
                        const ground=ray.intersectObjects(fallback.filter(m=>m.visible),false)[0]?.point.y;
                        const foot=model.actor.footHeight();
                        if(ground!==undefined && ground-foot>.15)samples.push({time:t,id:player.id,slot:player.slot,state:anim.state,crouch:anim.crouch,isDowned:anim.isDowned,y:player.position.y,foot,ground,lift:model.offset.position.y});
                    }
                }
                window.floorReport.penetration=samples.sort((a,b)=>(b.ground-b.foot)-(a.ground-a.foot));
                view.time(120000);await wait(250);
            }
            const players=[...view.api().get('Vanilla.Player').values()];
            const controls=renderer.get('Controls');controls.followPlayer();
            const camera=renderer.get('Camera').root,position=players[0]?.position;
            if(position){camera.position.set(position.x+10,position.y+17,position.z-15);camera.lookAt(position.x,position.y,position.z);}
            await wait(250);renderer.render(0,view.api());
            return {excludedInstances,penetration:window.floorReport.penetration,disabledModels,passed:missing.length===0,recording:${JSON.stringify(path.basename(recording))},surfaces:surfaces.length,loadedIdentities:loaded.size,missing,untextured:[...new Set(untextured)],models,navigationTriangles:native.navigationTriangles,fallbackAvailable:true,playback:true,seeking:true,diagnostics:view.api().header.get('Vanilla.Map.NativeSurfaceDiagnostics')};
        })()`);
        fs.writeFileSync(path.join(output,'scene.png'),(await contents.capturePage()).toPNG());finish(result);
    }catch(error){const details=await contents.executeJavaScript('window.floorReport ?? {}').catch(()=>({}));finish({...details,passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(root,'Viewer/electron/build/app.cjs'));
