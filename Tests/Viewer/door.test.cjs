const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('../../Viewer/assets/node_modules/typescript'),three=require('../../Viewer/assets/node_modules/three');
const {loadNativeGLTF}=require('./native-environment.cjs');
const root=path.resolve(__dirname,'../..'),directory=path.join(root,'Viewer/assets/assets/environment');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
function compile(file){return ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;}

test('real native doors use source-sized panels, destroy blades and locks, and restore poses on rewind', {skip:!fs.existsSync(path.join(directory,'manifest.json'))},async()=>{
 const preloaded=new Map();for(const id of ['weak-door-4x4','weak-door-8x4','door-lock','door-hack-lock','bulkhead-door-4x4','bulkhead-door-8x4','bulkhead-main-door-4x4','bulkhead-main-door-8x4'])preloaded.set(id,(await loadNativeGLTF(path.join(directory,'low',id+'.glb'))).gltf);
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
 class Wrapper{addToScene(s){s.add(this.root)}setVisible(v){this.root.visible=v}}
 const moduleLoader={registerRender(){},registerDispose(){},reportWarning(){}};
 const basic={exports:{}};new Function('require','module','exports',compile(path.join(root,'Viewer/assets/src/profiles/vanilla/renderer/models/basicModel.ts')))(id=>id==='@esm/three'?three:{ModuleLoader:moduleLoader},basic,basic.exports);
 const env={exports:{}};
 await new AsyncFunction('require','module','exports','fetch',compile(path.join(root,'Viewer/assets/src/profiles/vanilla/renderer/map/environment.ts')))(id=>{
  if(id==='@esm/three')return three;
  if(id.includes('moduleloader'))return {ModuleLoader:moduleLoader};
  if(id.endsWith('/basicModel.js'))return basic.exports;
  if(id.endsWith('/modelMaterials.js'))return {disposeModelMaterials(){}};
  if(id.endsWith('/objectwrapper.js'))return {ObjectWrapper:Wrapper,ModelGroup:three.Group};
  if(id.endsWith('/models/lib.js'))return {isCulled:()=>false};
  if(id.endsWith('/modelloader.js'))return {loadGLTF:async url=>{const asset=url.split('/').at(-1).split('.glb')[0];const source=preloaded.get(asset);assert.ok(source,asset);return ()=>{const clone=source.scene.clone(true);clone.animations=source.animations;return clone}}};
  throw Error(id);
 },env,env.exports,async()=>({ok:true,json:async()=>manifest}));
 class Text extends three.Object3D{}
 const mod={exports:{}};
 new Function('require','module','exports',compile(path.join(root,'Viewer/assets/src/profiles/vanilla/renderer/map/door.ts')))(id=>{
  if(id==='@esm/three')return three;if(id==='@esm/troika-three-text')return {Text};
  if(id.includes('moduleloader'))return {ModuleLoader:moduleLoader};
  if(id.endsWith('/i18n.js'))return {ui:text=>text};
  if(id.endsWith('/environment.js'))return env.exports;if(id.endsWith('/objectwrapper.js'))return {ObjectWrapper:Wrapper,ModelGroup:three.Group};
  if(id.endsWith('/models/lib.js'))return {isCulled:()=>false};
  if(id.endsWith('/factory.js'))return {};throw Error(id);
 },mod,mod.exports);
 for(const size of ['Small','Medium']){
  const native=size==='Small'?'4x4':'8x4';const door={id:1,serialNumber:41,dimension:0,type:'WeakDoor',size,position:{x:3,y:2,z:5},rotation:{x:0,y:0,z:0,w:1},scale:{x:2,y:2,z:2},modelName:`gate_${native}_weak_door_service(Clone)_terminalKey: DOOR_41DOOR_41`};
  const model=new mod.exports.DoorModel(door);await model.native.ready;await Promise.resolve();
  const weak={id:1,health:100,maxHealth:100,lastPunch:0,lock0:'Melee',lock1:'Hackable'};
  const blade=model.native.node(size==='Small'?'DoorBlade':'DoorBlade001');assert.ok(blade);
  const matrices=()=>{model.root.updateMatrixWorld(true);const result=[];model.native.model.traverse(n=>{if(n.isMesh)result.push(...n.matrixWorld.elements)});return result};
  model.update(0,{id:1,status:'Closed'},weak);const closed=matrices();assert.equal(blade.visible,true);assert.equal(model.locks[0].melee.root.visible,true);assert.equal(model.locks[1].hack.root.visible,true);
  model.update(6000,{id:1,status:'Open',change:1000},weak);assert.notDeepEqual(matrices(),closed);
  model.update(6000,{id:1,status:'Destroyed'},weak);assert.equal(blade.visible,false);assert.equal(model.locks[0].melee.root.visible,false);assert.equal(model.locks[1].hack.root.visible,false);
  model.update(0,{id:1,status:'Closed'},weak);assert.equal(blade.visible,true);assert.deepEqual(matrices(),closed);
  assert.deepEqual(model.root.position.toArray(),[3,2,5]);assert.deepEqual(model.root.scale.toArray(),[2,2,2]);assert.deepEqual(model.native.root.scale.toArray(),[1,1,1]);
  assert.equal(model.native.assetId,`weak-door-${native}`);
 }
 for(const id of ['bulkhead-door-4x4','bulkhead-door-8x4','bulkhead-main-door-4x4','bulkhead-main-door-8x4']){
  const main=id.includes('main'), source=preloaded.get(id);
  const model=new mod.exports.DoorModel({id:2,serialNumber:42,dimension:0,scale:{x:1,y:1,z:1},type:'SecurityDoor',size:'Medium',position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},modelName:manifest.models.find(m=>m.id===id).source});
  await model.native.ready;
  const pose=()=>{const p={};model.native.model.traverse(n=>{p[n.name]=[...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray()]});return p};
  model.update(0,{id:2,status:'Closed'});const closed=pose();
  const sequence=main?['PullHandle',id.endsWith('4x4')?'OpenClamps':'ReleaseClamps','OpenDoor1','OpenDoor2']:['lock_open','door_open'];
  let elapsed=0;
  for(const name of sequence){
   const clip=source.animations.find(c=>c.name===name);elapsed+=clip.duration;
   model.update(elapsed*1000,{id:2,status:'Open',change:0});
   for(const track of clip.tracks){
    const width=track.getValueSize(),first=track.values.slice(0,width),last=track.values.slice(-width);
    if(!first.some((v,i)=>Math.abs(v-last[i])>0.001))continue;
    const [node,property]=track.name.split('.');const actual=model.native.node(node)[property].toArray();
    assert.ok(actual.every((v,i)=>Math.abs(v-last[i])<0.001),`${id} ${name} ${track.name} completes`);
   }
  }
  const idle=source.animations.find(c=>c.name===(main?'OpenIdle':'door_open_idle'));
  for(const track of idle.tracks){
   const [node,property]=track.name.split('.'), expected=track.values.slice(0,track.getValueSize());
   const actual=model.native.node(node)[property].toArray();
   assert.ok(actual.every((v,i)=>Math.abs(v-expected[i])<0.01),`${id} final open pose ${track.name}`);
  }
  const finished=pose();model.update(0,{id:2,status:'Closed'});assert.deepEqual(pose(),closed,id+' rewind');
  model.update(60000,{id:2,status:'Open',change:0});assert.deepEqual(pose(),finished,id+' seek to end');
  model.update(60000,{id:2,status:'Open'});assert.deepEqual(pose(),finished,id+' absent timestamp');
  assert.notDeepEqual(finished,closed,id+' opens');
 }
 assert.equal(mod.exports.doorAsset({size:'Large',type:'BulkheadDoor'}),undefined);
 assert.equal(mod.exports.doorAsset({size:'Small',type:'WeakDoor'}),undefined);
 assert.equal(mod.exports.doorAsset({size:'Medium',type:'SecurityDoor'}),undefined);
 assert.equal(mod.exports.doorAsset({size:'Small',type:'WeakDoor',modelName:'modded_gate_4x4_weak_door'}),undefined);
});
