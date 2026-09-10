// Check native ladder assembly and texture loading against an actual recording.
// Run with Electron, then a recording path and optionally a packaged resources/app.
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),recording=path.resolve(process.argv[2]);
const build=path.resolve(process.argv[3]||path.join(root,'Viewer/electron/build'));
const output=path.join(root,'artifacts/tests/ladder-replay');fs.mkdirSync(output,{recursive:true});
app.setPath('userData',fs.mkdtempSync(path.join(output,'user-')));
const Module=require('node:module'),load=Module._load;
Module._load=function(name,...args){const value=load.call(this,name,...args);return name==='electron'?{...value,BrowserWindow:new Proxy(value.BrowserWindow,{construct(T,[o]){return new T({...o,width:1280,height:900,show:false,webPreferences:{...o.webPreferences,offscreen:true}})}})}:value};
BrowserWindow.prototype.show=function(){};
const finish=result=>{fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));app.exit(result.passed?0:1)};
setTimeout(()=>finish({passed:false,error:'Native ladder replay test timed out'}),180000);
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
    controls.followPlayer(undefined);
    const ladders=renderer.get('Ladders');if(!ladders?.length)throw Error('No recorded ladders');
    await Promise.all(ladders.map(ladder=>ladder.ready));
    const samples=[];
    for(const ladder of ladders){
      let meshes=0,textured=0;for(const part of ladder.parts){
        if(part.failed||!part.model)throw Error('Ladder part failed: '+part.assetId);
        if(!part.root.scale.equals(new T.Vector3(1,1,1)))throw Error('Ladder was stretched');
        part.model.traverse(o=>{if(o.isMesh){meshes++;if([].concat(o.material).some(m=>m.map))textured++}});
      }
      if(!meshes||meshes!==textured)throw Error('Untextured ladder meshes '+textured+'/'+meshes);
      samples.push({top:ladder.root.position.toArray(),parts:ladder.parts.map(p=>({asset:p.assetId,y:p.root.position.y})),meshes,textured});
    }
    const sample=ladders[0],offset=new T.Vector3(4,1,7).applyQuaternion(sample.root.quaternion);
    camera.position.copy(sample.center).add(offset);camera.lookAt(sample.center);controls.fakeCamera?.position.copy(camera.position);controls.fakeCamera?.quaternion.copy(camera.quaternion);
    renderer.render(0,view.api());await wait(100);
    return {passed:true,ladders:ladders.length,samples};
  })()`);
  fs.writeFileSync(path.join(output,'recorded-ladder.png'),(await contents.capturePage()).toPNG());finish(result);
 }catch(error){finish({passed:false,error:String(error.stack||error)})}});
});
process.argv.push('--skip-launcher');require(path.join(build,'app.cjs'));
