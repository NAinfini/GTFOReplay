// Full replay pipeline: world and hands must survive composition together.
// Run with Electron, then a recording path and optionally a packaged resources/app.
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const build=path.resolve(process.argv[3]||path.join(root,'Viewer/electron/build'));
const output=path.join(root,'artifacts/tests/first-person-composite');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1280,height:900,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
ipcMain.handle('compositeSpace',event=>{
 event.sender.sendInputEvent({type:'keyDown',keyCode:'Space'});
 event.sender.sendInputEvent({type:'keyUp',keyCode:'Space'});
});
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Full replay composition timed out'}),180000);
app.on('web-contents-created',(_,contents)=>{
 contents.setBackgroundThrottling(false);
 contents.once('did-finish-load',async()=>{try{
  const result=await contents.executeJavaScript(`(async()=>{
    const {app}=await import('./app.js'),T=await import('../js3party/three/build/three.module.js');
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    app.onLoadModule(await window.api.invoke('loadModule','vanilla'));
    const deadline=Date.now()+30000;while(!app.profile()&&Date.now()<deadline)await wait(100);
    await app.openFile(${JSON.stringify(recording)},false);const view=app.player.view;
    const indexing=Date.now()+90000;while(!view.replay()?.complete&&Date.now()<indexing){if(view.replay()?.error)throw view.replay().error;await wait(100)}
    if(!view.replay()?.complete)throw Error('Recording did not finish indexing');
    view.pause(true);view.time(120000);await wait(3000);
    const renderer=view.renderer,controls=renderer.get('Controls'),camera=renderer.get('Camera').root;
    const players=[...view.api().get('Vanilla.Player').values()],samples=[];
    const marker=new T.Mesh(new T.PlaneGeometry(50,50),new T.MeshBasicMaterial({color:0x00ff00,depthTest:false,depthWrite:false,toneMapped:false,fog:false}));
    marker.position.z=-5;marker.renderOrder=10000;camera.add(marker);
    const gl=renderer.renderer.getContext(),pixel=new Uint8Array(4);
    for(const player of players){
      controls.followPlayer(player.slot);controls.setFirstPerson(true);await wait(300);
      const fp=renderer.get('FirstPerson');if(!fp)throw Error('No first-person rig');
      await Promise.all(fp.actors.map(actor=>actor.ready));await wait(300);
      if(!fp.pass.enabled)throw Error('Hands pass is disabled for slot '+player.slot);
      renderer.render(0,view.api());
      gl.readPixels(8,gl.drawingBufferHeight-8,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      if(pixel[1]<200||pixel[0]>30||pixel[2]>30)throw Error('First-person pass erased the world for slot '+player.slot+': '+[...pixel]);
      const count=gl.drawingBufferWidth*gl.drawingBufferHeight,frame=new Uint8Array(count*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,frame);
      let hands=0;for(let i=0;i<frame.length;i+=4)if(frame[i+1]<150)hands++;
      if(hands<100)throw Error('Hands were not composited over the world');
      samples.push({slot:player.slot,worldPixel:[...pixel],handPixels:hands,firearm:!!fp.held?.reloadAnimation});
      controls.setFirstPerson(false);await wait(100);
      if(fp.pass.enabled)throw Error('Hands pass did not close');
    }
    marker.removeFromParent();marker.geometry.dispose();marker.material.dispose();
    controls.followPlayer(samples.find(sample=>sample.firearm)?.slot ?? players[0].slot);controls.setFirstPerson(true);await wait(400);
    for(const target of [view.canvas,document.querySelector('.follow-field [role="combobox"]'),document.querySelector('.transport button[aria-pressed]')]){
      target.focus();view.pause(true);
      await window.api.invoke('compositeSpace');await wait(80);
      if(view.pause())throw Error('Real replay did not resume from '+target.outerHTML.slice(0,100));
      await window.api.invoke('compositeSpace');await wait(80);
      if(!view.pause())throw Error('Real replay did not pause');
    }
    if(view.replay().error)throw view.replay().error;
    return {passed:true,players:players.length,samples,nativeSpace:true};
  })()`);
  fs.writeFileSync(path.join(output,'recorded-first-person.png'),(await contents.capturePage()).toPNG());finish(result);
 }catch(error){finish({passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(build,'app.cjs'));
