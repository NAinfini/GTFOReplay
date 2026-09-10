// Run with Electron against the packaged app. Exercises embedded report IPC, UI and JSON export.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{brotliCompressSync}=require('node:zlib');
const root=path.resolve(__dirname,'../..'),appDir=path.resolve(process.argv[2]);
const output=path.join(root,'artifacts/tests/embedded-diagnostics');fs.mkdirSync(output,{recursive:true});
const recording=path.join(output,'single-file.gtfo');
const {crc32}=require(path.join(appDir,'replay/container.cjs'));
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b};
const str=s=>{const b=Buffer.from(s);return Buffer.concat([u16(b.length),b])};
const types=[['ReplayRecorder.Header','0.0.2'],['ReplayRecorder.Session','0.0.1'],['Vanilla.Metadata','0.0.4'],['ReplayRecorder.EndOfHeader','0.0.1'],['Vanilla.Map.NativeSurfaces','0.0.1']];
const header=Buffer.concat([str('0.0.1'),u16(types.length),...types.flatMap(([name,version],id)=>[u16(id),str(name),str(version)]),u16(0),str('test'),Buffer.from([1]),Buffer.alloc(8),u16(1),...['embedded-test','2026-09-08T00:00:00Z','R1A1','Diagnostics fixture','R1','test'].map(str),Buffer.from([10,20]),u16(0),u16(2),str('0.0.4'),Buffer.alloc(3),u16(4),u16(0),u16(0),u32(0),u16(3)]);
const frame=b=>Buffer.concat([u32(b.length),b]);
const rawHeader=frame(header),ticks=Buffer.concat([0,1000,2000].map(time=>frame(Buffer.concat([u32(time),u32(0),u16(0)]))));
const report={SchemaVersion:1,SessionId:'embedded-test',ClosedUtc:'2026-09-08T00:00:00Z',Failure:null,Ticks:3,AverageTickMs:0.25,MaxTickMs:0.75,PeakQueueBytes:128};
function chunk(raw,offset,time,flag){const encoded=raw?brotliCompressSync(raw):Buffer.alloc(0),h=Buffer.alloc(32);h.writeUInt32LE(0x334b4843);h.writeUInt32LE(encoded.length,4);h.writeUInt32LE(raw?.length??0,8);h.writeBigUInt64LE(BigInt(offset),12);h.writeUInt32LE(time,20);h.writeUInt32LE(raw?crc32(raw):0,24);h.writeUInt32LE(flag,28);return Buffer.concat([h,encoded]);}
fs.writeFileSync(recording,Buffer.concat([Buffer.from('GTRPLY03'),chunk(rawHeader,0,0,1),chunk(ticks,rawHeader.length,2000,0),chunk(Buffer.from(JSON.stringify(report)),rawHeader.length+ticks.length,2000,4),chunk(null,rawHeader.length+ticks.length,2000,2)]));
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-data-')));
BrowserWindow.prototype.show=function(){};
let finished=false;const finish=result=>{if(finished)return;finished=true;fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Embedded diagnostics desktop test timed out.'}),120000);
app.on('web-contents-created',(_,contents)=>{
 contents.setBackgroundThrottling(false);
 contents.once('did-finish-load',async()=>{
  try{
   const result=await contents.executeJavaScript(`(async()=>{
    const {app}=await import('./app.js'),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const deadline=Date.now()+45000;while(app.profile()===undefined&&Date.now()<deadline)await wait(100);
    await app.openFile(${JSON.stringify(recording)},false);const view=app.player.view;view.pause(true);
    while(!view.replay()?.complete&&Date.now()<deadline)await wait(100);
    if(view.replay()?.error||!view.replay()?.complete)throw Error('Fixture did not finish parsing: '+view.replay()?.error);
    const embedded=await window.api.invoke('recordingDiagnostics','embedded-test');if(embedded?.Ticks!==3)throw Error('Embedded IPC report missing');
    window.dispatchEvent(new CustomEvent('replay-panel',{detail:'info'}));await wait(250);
    const panel=document.querySelector('.legacy-panel');if(!panel.innerText.includes('0.25 / 0.75 ms')||!panel.innerText.includes('embedded-test'))throw Error('Human summary or JSON missing from diagnostics page');
    const button=[...panel.querySelectorAll('button')].find(b=>b.textContent.includes('Export diagnostic report'));if(!button)throw Error('Missing diagnostic export action');button.click();await wait(250);
    const set=(input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};
    set(document.querySelector('.file-address input'),${JSON.stringify(output)});document.querySelector('.file-address').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await wait(150);
    set(document.querySelector('.file-name input'),'viewer-report.json');await wait(100);document.querySelector('.dialog-footer button:last-child').click();await wait(200);
    if(document.querySelector('.overwrite-warning'))document.querySelector('.overwrite-warning button').click();await wait(200);
    return {passed:true,embedded,summary:panel.innerText.slice(0,900)};
   })()`);
   const exported=JSON.parse(fs.readFileSync(path.join(output,'viewer-report.json')));
   if(exported.schemaVersion!==1||exported.recorder.SessionId!==report.SessionId||exported.recorder.Ticks!==3)throw Error('Exported machine report lost recorder diagnostics');
   fs.writeFileSync(path.join(output,'diagnostics.png'),(await contents.capturePage()).toPNG());
   finish({...result,exported:true});
  }catch(error){finish({passed:false,error:error.stack||String(error)})}
 });
});
process.argv.push('--skip-launcher');require(path.join(appDir,'app.cjs'));
