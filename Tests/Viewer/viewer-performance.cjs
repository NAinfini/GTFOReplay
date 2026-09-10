// Diagnostic only: instruments the current built viewer without changing source.
const {app,BrowserWindow,screen}=require('electron'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'artifacts/tests/viewer-performance');fs.mkdirSync(output,{recursive:true});
const recording=process.argv[2],label=process.argv[3]||'run';
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
for(const flag of ['disable-background-timer-throttling','disable-renderer-backgrounding'])app.commandLine.appendSwitch(flag);
app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion');
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1920,height:1080,useContentSize:true,show:false,webPreferences:{...o.webPreferences,backgroundThrottling:false,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const report={recording,hidden:true,offscreen:true,schedulingCeiling:144,runs:[],cpu:os.cpus()[0].model,electron:process.versions.electron};
const save=()=>fs.writeFileSync(path.join(output,label+'.json'),JSON.stringify(report,null,2));
const finish=error=>{if(error)report.error=String(error.stack||error);report.complete=!error;save();console.log(JSON.stringify({complete:report.complete,error:report.error,runs:report.runs.map(r=>({name:r.name,fps:r.fps,renderCpuMs:r.renderCpuMs.mean})),visibility:report.visibility}));app.exit(error?1:0)};
setTimeout(()=>finish(Error('Timed out')),360000);
app.on('web-contents-created',(_,contents)=>{
 contents.setBackgroundThrottling(false);contents.setFrameRate(144);
 contents.on('console-message',(_,level,message)=>{if(level>=3)console.log('renderer: '+message.slice(0,400))});
 contents.once('did-finish-load',async()=>{try{
  console.log('page loaded');
  report.gpu=(await app.getGPUInfo('complete'));report.gpuStatus=app.getGPUFeatureStatus();report.displays=screen.getAllDisplays().map(d=>({size:d.size,scaleFactor:d.scaleFactor,frequency:d.displayFrequency}));
  save();console.log('GPU ready');
  report.setup=await contents.executeJavaScript(`(async()=>{
    console.error('diagnostic: import');const {app}=await import('./app.js');const wait=ms=>new Promise(r=>setTimeout(r,ms));
    console.error('diagnostic: load profile');app.onLoadModule(await window.api.invoke('loadModule','vanilla'));
    const deadline=Date.now()+30000;while(!app.profile()&&Date.now()<deadline)await wait(100);
    console.error('diagnostic: open '+app.profile());await app.openFile(${JSON.stringify(recording)},false);const v=app.player.view;
    const indexStarted=performance.now(),end=Date.now()+180000;while(!v.replay()?.complete&&Date.now()<end){if(v.replay()?.error)throw v.replay().error;await wait(100)}
    if(!v.replay()?.complete)throw Error('Index incomplete');
    console.error('diagnostic: indexed');v.pause(true);v.time(250000);await wait(4000);
    const r=v.renderer,c=r.get('Controls');const slot=[...v.api().get('Vanilla.Player').values()][0].slot;
    c.followPlayer(slot);c.setFirstPerson(true);await wait(3000);
    window.perfView=v;window.perfSlot=slot;
    const gl=r.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {indexMs:performance.now()-indexStarted,duration:v.length(),canvas:[v.canvas.width,v.canvas.height],pixelRatio:r.renderer.getPixelRatio(),visibility:document.visibilityState,webgl:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,passes:r.renderLoop.map(p=>p.name)};
  })()`);save();
  for(const config of [
   {name:'first-person-1080',firstPerson:true,scale:1,time:250000},
   {name:'first-person-half',firstPerson:true,scale:.5,time:250000},
   {name:'third-person-1080',firstPerson:false,scale:1,time:250000},
   {name:'paused-first-person',firstPerson:true,scale:1,time:250000,paused:true},
   {name:'first-person-120s',firstPerson:true,scale:1,time:120000},
  ]){
   const run=await contents.executeJavaScript(`(async()=>{
     const cfg=${JSON.stringify(config)},v=window.perfView,r=v.renderer,wait=ms=>new Promise(res=>setTimeout(res,ms));
     v.pause(true);v.time(cfg.time);r.get('Controls').followPlayer(window.perfSlot);r.get('Controls').setFirstPerson(cfg.firstPerson);
     r.renderer.setPixelRatio(cfg.scale);r.composer.setPixelRatio(cfg.scale);await wait(1500);
     const records=[],snaps=[],passes=new Map(),raw=r.render,rawSnap=v.replay().getSnapshot,originalPasses=r.renderLoop.map(p=>p.pass),rawComposer=r.composer.render;
     let last=performance.now(),lastSnap=-1,unique=0;const compositions=[];
     r.renderLoop.forEach(p=>{const original=p.pass;passes.set(p.name,[]);p.pass=function(...a){const t=performance.now();try{return original.apply(this,a)}finally{passes.get(p.name).push(performance.now()-t)}}});
     r.composer.render=function(...a){const t=performance.now();try{return rawComposer.apply(this,a)}finally{compositions.push(performance.now()-t)}};
     v.replay().getSnapshot=async function(...a){const t=performance.now();try{return await rawSnap.apply(this,a)}finally{snaps.push(performance.now()-t)}};
     const autoReset=r.renderer.info.autoReset;r.renderer.info.autoReset=false;
     r.render=function(...a){r.renderer.info.reset();const t=performance.now(),interval=t-last;last=t;const st=v.snapshot?.time;if(st!==lastSnap){unique++;lastSnap=st;}raw.apply(this,a);records.push({interval,work:performance.now()-t,lag:v.time()-st,calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles})};
     const started=performance.now();v.pause(!!cfg.paused);await wait(8000);v.pause(true);const elapsed=performance.now()-started;
     r.renderer.info.autoReset=autoReset;r.render=raw;r.composer.render=rawComposer;v.replay().getSnapshot=rawSnap;r.renderLoop.forEach((p,i)=>p.pass=originalPasses[i]);
     const stats=a=>{if(!a.length)return null;const s=a.slice().sort((a,b)=>a-b);return {mean:a.reduce((s,v)=>s+v,0)/a.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)}};
     return {name:cfg.name,frames:records.length,elapsedMs:elapsed,fps:records.length*1000/elapsed,uniqueSnapshotFps:unique*1000/elapsed,frameMs:stats(records.map(x=>x.interval)),renderCpuMs:stats(records.map(x=>x.work)),snapshotMs:stats(snaps),snapshotLagMs:stats(records.map(x=>x.lag)),composerCpuMs:stats(compositions),passes:[...passes].map(([name,a])=>({name,...stats(a)})).sort((a,b)=>b.mean-a.mean),lastFrame:records.at(-1),canvas:[v.canvas.width,v.canvas.height],players:v.api().get('Vanilla.Player')?.size,enemies:v.api().get('Vanilla.Enemy')?.size,error:String(v.replay().error||'')};
   })()`);report.runs.push(run);save();console.log(label+' '+run.name+' '+run.fps.toFixed(1)+' fps render '+run.renderCpuMs.mean.toFixed(1)+'ms snapshot '+run.snapshotMs?.mean.toFixed(1));
  }
  contents.debugger.attach('1.3');await contents.debugger.sendCommand('Profiler.enable');await contents.debugger.sendCommand('Profiler.start');
  await contents.executeJavaScript('window.perfView.time(250000);window.perfView.pause(false)');
  await new Promise(r=>setTimeout(r,8000));const {profile}=await contents.debugger.sendCommand('Profiler.stop');
  fs.writeFileSync(path.join(output,label+'.cpuprofile'),JSON.stringify(profile));
  const counts=new Map();for(const id of profile.samples||[])counts.set(id,(counts.get(id)||0)+1);
  report.cpuSamples=profile.samples?.length;report.topCpu=profile.nodes.map(n=>({function:n.callFrame.functionName,url:n.callFrame.url,line:n.callFrame.lineNumber+1,samples:counts.get(n.id)||0})).sort((a,b)=>b.samples-a.samples).slice(0,25);
  report.visibility=await contents.executeJavaScript(`(async()=>{
    const v=window.perfView,r=v.renderer,c=r.get('Controls'),camera=r.get('Camera');
    v.pause(true);const controlUpdate=c.update;c.update=()=>{};
    const rotation=camera.root.quaternion.clone();
    const counts=()=>({rooms:r.get('NativeSurfaces').root.children.filter(m=>m.visible).length,roomTotal:r.get('NativeSurfaces').root.children.length,players:[...r.get('Players')].filter(([id,m])=>m.isVisible()).map(([id])=>id),enemies:[...r.get('Enemies').values()].filter(m=>m.model.isVisible()).length});
    try {r.render(0,v.api());const front=counts();camera.root.rotateY(Math.PI);r.render(0,v.api());const back=counts();camera.root.quaternion.copy(rotation);r.render(0,v.api());const restored=counts();
      if(JSON.stringify(front)!==JSON.stringify(restored))throw Error('Visibility did not restore on same-frame camera cut');
      return {front,back,restored};
    }finally{c.update=controlUpdate}
  })()`);
  const png=await contents.executeJavaScript('(()=>{const v=window.perfView;v.renderer.render(0,v.api());return v.canvas.toDataURL("image/png")})()');fs.writeFileSync(path.join(output,label+'.png'),Buffer.from(png.split(',')[1],'base64'));
  finish();
 }catch(error){finish(error)}});
});
process.argv.push('--skip-launcher');require(path.join(root,'Viewer/electron/build/app.cjs'));
