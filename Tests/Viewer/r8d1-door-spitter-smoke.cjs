// Inspect native door and spitter rendering against an actual recording.
// Run with Electron, then a recording path and optionally a packaged resources/app.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const build=path.resolve(process.argv[3]||path.join(root,'Viewer/electron/build'));
const output=path.join(root,'artifacts/tests/r8d1-door-spitter');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1280,height:900,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'R8D1 door and spitter test timed out'}),70000);
app.on('web-contents-created',(_,contents)=>{
 contents.setBackgroundThrottling(false);
 contents.on('console-message',(_,level,message)=>fs.appendFileSync(path.join(output,'console.log'),level+': '+message+'\n'));
 contents.once('did-finish-load',async()=>{try{
  const result=await contents.executeJavaScript(`(async()=>{try{
    const {app}=await import('./app.js');const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    app.onLoadModule(await window.api.invoke('loadModule','vanilla'));
    const deadline=Date.now()+30000;while(!app.profile()&&Date.now()<deadline)await wait(100);
    await app.openFile(${JSON.stringify(recording)},false);const view=app.player.view;
    const indexing=Date.now()+60000;while(!view.replay()?.complete&&Date.now()<indexing){if(view.replay()?.error)throw view.replay().error;await wait(100)}
    if(!view.replay()?.complete)throw Error('Recording did not finish indexing');
    view.pause(true);view.time(120000);await wait(3000);
    const renderer=view.renderer;
    const doorHeaders=[...view.api().header.get('Vanilla.Map.Doors')],doorModels=[...renderer.get('Doors').values()];
    await Promise.all(doorModels.map(model=>model.native.ready));
    if(doorModels.length!==doorHeaders.length)throw Error('Not every recorded R8D1 door has a renderer');
    if(doorModels.some(model=>model.native.failed))throw Error('An R8D1 door still uses a basic fallback');
    const serviceDoors=doorHeaders.filter(([,door])=>/_weak_door_service/.test(door.modelName));
    if(!serviceDoors.some(([,door])=>door.size==='Small')||!serviceDoors.some(([,door])=>door.size==='Medium'))throw Error('R8D1 fixture is missing a service door size');
    for(const [id,door] of serviceDoors){const expected='weak-door-'+(door.size==='Small'?'4x4':'8x4');if(renderer.get('Doors').get(id).native.assetId!==expected)throw Error(door.modelName+' did not map to '+expected);}
    const doors=doorHeaders.map(([id,door])=>({id,type:door.type,size:door.size,modelName:door.modelName,assetId:renderer.get('Doors').get(id).native.assetId}));
    const spitterStates=view.api().get('Vanilla.Enemy.Spitters.State');
    const spitterHeaders=[...view.api().header.get('Vanilla.Enemy.Spitters')];
    const camera=renderer.get('Camera'),intersectsSphere=camera.frustum.intersectsSphere;
    camera.renderDistance(Infinity);camera.frustum.intersectsSphere=()=>true;await wait(300);
    const spitterModels=[...renderer.get('Spitters').values()];await Promise.all(spitterModels.map(model=>model.native.ready));
    if(spitterModels.length!==spitterHeaders.length||!spitterModels.length)throw Error('Visible R8D1 spitters were not instantiated from the Low model');
    if(spitterModels.some(model=>model.native.failed||model.native.assetId!=='spitter'||!model.native.model))throw Error('An R8D1 spitter still uses a primitive fallback');
    for(const [id] of spitterHeaders){const model=renderer.get('Spitters').get(id),state=spitterStates.get(id);if(!state?.appearance)throw Error('Spitter '+id+' lacks captured appearance');if(model.root.scale.distanceTo(state.appearance.scale)>1e-5)throw Error('Spitter '+id+' lost its captured scale');}
    view.time(1300000);await wait(300);const retracted=[...view.api().get('Vanilla.Enemy.Spitters.State')].filter(([,state])=>state.appearance?.blend===1);
    if(!retracted.length)throw Error('R8D1 fixture has no retracted spitter state');
    for(const [id,state] of retracted){const model=renderer.get('Spitters').get(id);if(model.root.scale.distanceTo(state.appearance.scale)>1e-5||Math.abs(model.native.root.scale.x-.8)>1e-5)throw Error('Spitter '+id+' retraction is not deterministic');}
    view.time(120000);await wait(300);for(const [id,state] of view.api().get('Vanilla.Enemy.Spitters.State')){const model=renderer.get('Spitters').get(id);if(model&&state.appearance&&Math.abs(model.native.root.scale.x-1)>1e-5)throw Error('Spitter '+id+' did not restore its expanded pose on rewind');}
    camera.frustum.intersectsSphere=intersectsSphere;
    const logs=view.diagnosticLogs().filter(row=>/unregistered-door:.*weak_door_service|environment spitter/i.test(row.message));
    if(logs.length)throw Error(logs.map(row=>row.message).join('\\n'));
    return {passed:true,doors:doors.length,serviceDoors:serviceDoors.length,spitters:spitterModels.length,nativeSpitter:true,deterministicRetraction:true};
   }catch(error){return {passed:false,error:String(error.stack||error)}}
  })()`);
  finish(result);
 }catch(error){finish({passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(build,'app.cjs'));
