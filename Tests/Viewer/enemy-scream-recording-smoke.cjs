// Run with Electron and the local R5C2 recording containing IDs 33240 and 34123.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),output=path.join(root,'artifacts/tests/enemy-scream-recording');
const recording=process.argv[2];
if(!recording || !fs.existsSync(recording))throw Error('Provide the local R5C2 regression recording as the first argument.');
const compiled=path.join(root,'Viewer/electron/build/assets/profiles/vanilla/parser/enemy/scream.js');
if(!fs.readFileSync(compiled,'utf8').includes('Vanilla.Enemy.Animation.Despawned'))throw Error('Build and offload the updated viewer before this test.');
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-data-')));
BrowserWindow.prototype.show=function(){};
const errors=[];let complete=false;
const finish=result=>{if(complete)return;complete=true;result={...result,errors};result.passed=result.passed&&!errors.length;fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Recording regression test timed out.'}),360000);
app.on('web-contents-created',(_,contents)=>{
 contents.setBackgroundThrottling(false);
 contents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
 contents.once('did-finish-load',async()=>{
  try{finish(await contents.executeJavaScript(`(async()=>{
   const {app}=await import('./app.js');const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const profileDeadline=Date.now()+45000;while(app.profile()===undefined&&Date.now()<profileDeadline)await wait(100);if(app.profile()===undefined)throw Error('Profile load timeout.');
   await app.openFile(${JSON.stringify(path.resolve(recording))},false);
   const view=app.player.view;view.pause(true);const start=Date.now();
   while(!view.replay()?.complete){if(Date.now()-start>240000)throw Error('Parse timeout.');await wait(200)}
   const replay=view.replay(),targets=[33240,34123],records=[];
   for(const descriptor of replay.blocks){const block=await replay.loadBlock(descriptor.id);for(const frame of block.timeline){
    for(const event of frame.events){if(targets.includes(event.data?.id??event.data?.enemy))records.push({time:frame.time-event.delta,kind:replay.typemap.get(event.type).typename,data:event.data});}
   }}
   const lateScreams=records.filter(record=>record.kind==='Vanilla.Enemy.Animation.Scream');
   for(const id of targets)if(!lateScreams.some(record=>record.data.enemy===id))throw Error('Missing regression Scream for '+id);
   const seeks=[];
   for(const time of [4196000,4196044,4196400,5169600,5169611,5170000,4196000]){
    const state=await replay.getSnapshot(time);if(!state)throw Error('Missing seek state at '+time);
    seeks.push({time,activeAnimationIds:targets.filter(id=>state.data.get('Vanilla.Enemy.Animation')?.has(id))});
   }
   const logs=view.diagnosticLogs();return {passed:logs.length===0,duration:replay.length(),blocks:replay.blocks.length,lateScreams,seeks,logs};
  })()`))}catch(error){finish({passed:false,error:String(error)})}
 });
});
require(path.join(root,'Viewer/electron/build/app.cjs'));
