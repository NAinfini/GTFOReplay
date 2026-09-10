// Paired render-cost measurement: real replay plus synthetic repeated static props.
// Run with Electron, then a recording path and optionally a packaged resources/app.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const build=path.resolve(process.argv[3]||path.join(root,'Viewer/electron/build'));
// Normalize only synthetic fixture spacing; production uses the recorded matrices.
const catalog=JSON.parse(fs.readFileSync(path.join(root,'Viewer/assets/assets/environment/architecture/manifest.json')));
const fixtureScale=Object.fromEntries(catalog.models.filter(a=>a.kind==='prop').map(a=>{
 const raw=fs.readFileSync(path.join(root,'Viewer/assets/assets/environment/architecture',a.file));const doc=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12)));
 const p=doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION];return [a.id,Math.min(1,6/Math.max(...p.max.map((v,i)=>v-p.min[i])))];
}));
const output=path.join(root,'artifacts/tests/static-prop-performance');fs.mkdirSync(output,{recursive:true});
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1920,height:1080,useContentSize:true,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Static prop performance test timed out'}),180000);
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
    controls.followPlayer(undefined);const gl=renderer.renderer.getContext();
    const manifest=await(await fetch('../environment/architecture/manifest.json')).json();
    const assets=manifest.models.filter(a=>a.kind==='prop');if(assets.length!==82)throw Error('Unexpected reviewed prop count');
    const fixtureScale=${JSON.stringify(fixtureScale)};
    const instances=[];for(let copy=0;copy<4;copy++)for(let i=0;i<assets.length;i++){
      const n=copy*assets.length+i,x=(n%20)*4,z=Math.floor(n/20)*4;
      instances.push({asset:assets[i].id,revision:assets[i].sourceRevision,dimension:0,enabled:true,matrix:new T.Matrix4().makeTranslation(-x,0,z).scale(new T.Vector3().setScalar(fixtureScale[assets[i].id])).elements});
    }
    const NativeModels=renderer.get('NativeSurfaces').constructor;
    const loadStart=performance.now(),models=new NativeModels(instances);await models.ready;
    if(!models.root.children.length)throw Error('No static models loaded');
    const loadMs=performance.now()-loadStart;
    renderer.scene.add(models.root);camera.position.set(40,42,90);camera.lookAt(40,0,30);controls.fakeCamera.position.copy(camera.position);controls.fakeCamera.quaternion.copy(camera.quaternion);
    let untextured=0;models.root.traverse(o=>{if(o.isMesh&&![].concat(o.material).some(m=>m.map))untextured++});if(untextured)throw Error('Untextured static geometry: '+untextured);
    const sample=async visible=>{models.root.visible=visible;const timings=[];let calls=0,triangles=0;
      for(let i=0;i<130;i++){await new Promise(requestAnimationFrame);const start=performance.now();renderer.render(.016,view.api());gl.finish();if(i>=30)timings.push(performance.now()-start);calls=renderer.renderer.info.render.calls;triangles=renderer.renderer.info.render.triangles;}
      timings.sort((a,b)=>a-b);return {visible,medianMs:timings[Math.floor(timings.length*.5)],p95Ms:timings[Math.floor(timings.length*.95)],calls,triangles};};
    const ambient=renderer.scene.children.find(o=>o.isAmbientLight),fill=camera.children.find(o=>o.isDirectionalLight),point=new T.PointLight(0xffffff,1,undefined,1.2);
    const runs=[];for(const visible of [false,true,true,false])runs.push(await sample(visible));
    ambient.intensity=.5;camera.remove(fill,fill.target);camera.add(point);const previousLighting=await sample(false);
    ambient.intensity=.85;camera.remove(point);camera.add(fill,fill.target);const currentLighting=await sample(false);
    models.root.visible=true;renderer.render(0,view.api());
    const glInfo=gl.getExtension('WEBGL_debug_renderer_info');
    const baseline=runs.filter(r=>!r.visible).reduce((n,r)=>n+r.medianMs,0)/2,added=runs.filter(r=>r.visible).reduce((n,r)=>n+r.medianMs,0)/2;
    window.disposePropBenchmark=()=>models.dispose();
    return {passed:true,syntheticPlacement:true,instances:instances.length,assets:assets.length,batches:models.root.children.length,loadMs,runs,previousLighting,currentLighting,addedMedianMs:added-baseline,gpu:glInfo?gl.getParameter(glInfo.UNMASKED_RENDERER_WEBGL):'unknown',canvas:[gl.drawingBufferWidth,gl.drawingBufferHeight],memory:renderer.renderer.info.memory};
  })()`);
  fs.writeFileSync(path.join(output,'static-prop-stress.png'),(await contents.capturePage()).toPNG());await contents.executeJavaScript("window.disposePropBenchmark?.()");finish(result);
 }catch(error){finish({passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(build,'app.cjs'));
