// Regression: dense native scenes must load, seek and accept playback input.
// Run with Electron, then a recording path and optionally a packaged resources/app.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const build=path.resolve(process.argv[3]||path.join(root,'Viewer/electron/build'));
const output=path.join(root,'artifacts/tests/r8d1-runtime');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1280,height:900,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Dense replay test timed out'}),70000);
app.on('web-contents-created',(_,contents)=>{
 contents.setBackgroundThrottling(false);
 contents.on('console-message',(_,level,message)=>fs.appendFileSync(path.join(output,'console.log'),level+': '+message+'\n'));
 require('electron').ipcMain.removeHandler('denseReplaySpace');
 require('electron').ipcMain.handle('denseReplaySpace',async(_,characterOnly=false)=>{
  if(characterOnly){
   if(!contents.debugger.isAttached())contents.debugger.attach('1.3');
   for(const type of ['keyDown','keyUp'])await contents.debugger.sendCommand('Input.dispatchKeyEvent',{type,key:' ',code:'',windowsVirtualKeyCode:32,nativeVirtualKeyCode:32});
  }else{contents.sendInputEvent({type:'keyDown',keyCode:'Space'});contents.sendInputEvent({type:'keyUp',keyCode:'Space'});}
 });
 require('electron').ipcMain.removeHandler('denseReplayClick');
 require('electron').ipcMain.handle('denseReplayClick',(_,x,y)=>{for(const type of ['mouseDown','mouseUp'])contents.sendInputEvent({type,x,y,button:'left',clickCount:1});});
 contents.once('did-finish-load',async()=>{try{
  const result=await contents.executeJavaScript(`(async()=>{
    const {app}=await import('./app.js'),T=await import('../js3party/three/build/three.module.js');
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    app.onLoadModule(await window.api.invoke('loadModule','vanilla'));
    const deadline=Date.now()+30000;while(!app.profile()&&Date.now()<deadline)await wait(100);
    const started=performance.now();
    await app.openFile(${JSON.stringify(recording)},false);const view=app.player.view;
    const indexing=Date.now()+90000;while(!view.replay()?.complete&&Date.now()<indexing){if(view.replay()?.error)throw view.replay().error;await wait(100)}
    if(!view.replay()?.complete)throw Error('Recording did not finish indexing');
    view.pause(true);view.time(120000);await wait(3000);


    const renderer=view.renderer,native=renderer.get('NativeSurfaces');await native.ready;
    const concrete=native.root.children.filter(mesh=>mesh.name.includes('architecture-31ddf207c0d01dca'));
    if(!concrete.length || concrete.some(mesh=>mesh.geometry.getAttribute('color') || mesh.material.vertexColors || !mesh.material.map))
        throw Error('Native concrete still treats MLS indices as albedo tint');
    const loadedMs=performance.now()-started;
    const soil=native.root.children.filter(mesh=>mesh.name.includes('architecture-4aa4f9719addcd38'));
    if(!soil.length || soil.some(mesh=>!mesh.material.map || !mesh.material.roughnessMap || mesh.material.roughness!==1))
        throw Error('Gardens soil is missing its native surface map');
    const navigation=[...renderer.get('Maps').values()].flat();
    if(!navigation.length || navigation.some(mesh=>mesh.parent || mesh.visible))
        throw Error('Navigation geometry entered the rendered scene');
    const terminals=[...view.api().header.get('Vanilla.Map.Terminals').values()];
    const models=[...renderer.get('Terminals').values()];await Promise.all(models.map(model=>model.ready));
    if(models.some(model=>model.failed))throw Error('A recorded terminal still uses basic fallback');
    for(const model of models) {let textured=false;model.model.traverse(o=>{if(o.isMesh&&[].concat(o.material).some(m=>m.map))textured=true});if(!textured)throw Error('Terminal has no native texture');}
    const surfaces=view.api().header.get('Vanilla.Map.NativeSurfaces');
    for(const time of [1300000,2500000,120000]){view.time(time);await wait(600);if(view.replay().error)throw view.replay().error;}
    const players=[...view.api().get('Vanilla.Player').values()];
    const controls=renderer.get('Controls');controls.followPlayer(players[0].slot);controls.setFirstPerson(true);await wait(500);
    const fp=renderer.get('FirstPerson');await Promise.all(fp.actors.map(actor=>actor.ready));
    if(!fp.pass.enabled)throw Error('First person did not activate');
    for(const target of [view.canvas,document.querySelector('.follow-field [role="combobox"]'),document.querySelector('.transport button[aria-pressed]')]){
      if(target===view.canvas){
        document.querySelector('.follow-field [role="combobox"]').focus();
        const r=target.getBoundingClientRect();await window.api.invoke('denseReplayClick',Math.round(r.x+r.width/2),Math.round(r.y+r.height/2));await wait(100);
        if(document.activeElement!==target)throw Error('Clicking the scene failed to focus the canvas');
      }else target.focus();
      view.pause(true);const beforeTime=view.time();await window.api.invoke('denseReplaySpace');await wait(300);
      if(view.pause())throw Error('Space failed to resume');
      if(view.time()<=beforeTime)throw Error('Space changed pause state but did not advance playback');
      await window.api.invoke('denseReplaySpace');await wait(100);if(!view.pause())throw Error('Space failed to pause');
      const stopped=view.time();await wait(200);if(view.time()!==stopped)throw Error('Space failed to stop the timeline');
    }
    view.canvas.focus();
    const hiddenMenu=document.createElement('div');hiddenMenu.role='listbox';hiddenMenu.hidden=true;document.body.append(hiddenMenu);
    await window.api.invoke('denseReplaySpace',true);await wait(100);if(view.pause())throw Error('Character-only Space or a hidden menu blocked resume');
    await window.api.invoke('denseReplaySpace',true);await wait(100);if(!view.pause())throw Error('Character-only Space failed to pause');
    hiddenMenu.remove();
    controls.setFirstPerson(false);
    controls.followPlayer();await wait(100);
    const worldCamera=renderer.get('Camera').root;
    worldCamera.position.set(8,17,258);worldCamera.lookAt(0,2.8,273);await wait(100);
    renderer.render(0,view.api());
    return {passed:true,loadedMs,terminals:models.length,surfaces:surfaces.length,batches:native.root.children.length,players:players.length,nativeSpace:true,clickedCanvasSpace:true,characterOnlySpace:true,navigationHidden:true,gardensMaterial:true,navigationMeshes:navigation.length};
  })()`);
  fs.writeFileSync(path.join(output,'recorded-scene.png'),(await contents.capturePage()).toPNG());finish(result);
 }catch(error){finish({passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(build,'app.cjs'));
