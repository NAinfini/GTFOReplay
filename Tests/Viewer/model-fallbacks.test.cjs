const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const ts = require('../../Viewer/assets/node_modules/typescript'), T = require('../../Viewer/assets/node_modules/three');
const root = path.resolve(__dirname, '../../Viewer/assets/src/profiles/vanilla');
const flush = () => new Promise(resolve => setImmediate(resolve));
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
function code(file) { return ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText; }
function load(file,require) { const module={exports:{},error:(error,message)=>new Error(message?`${message}: ${error}`:String(error))};new Function('require','module','exports',code(file))(require,module,module.exports);return module.exports; }
async function loadGear(require) {
 const module={exports:{},baseURI:'https://fixture.invalid/profile/',error:(error,message)=>new Error(message?`${message}: ${error}`:String(error))};
 const poses=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../Viewer/assets/assets/player-animations/weapon-view.json'),'utf8'));
 await new AsyncFunction('require','module','exports','fetch',code('renderer/models/gearbuilder.ts'))(require,module,module.exports,async()=>({ok:true,json:async()=>poses}));
 return module.exports;
}
function harness() {
 const warnings=[],disposers=[],calls=[];
 const ModuleLoader={reportWarning:message=>warnings.push(message),registerDispose:fn=>disposers.push(fn),registerRender(){}};
 const basic=load('renderer/models/basicModel.ts',id=>id==='@esm/three'?T:{ModuleLoader});
 const materials=load('library/modelMaterials.ts',()=>T);
 const loadGLTF=url=>new Promise((resolve,reject)=>calls.push({url,resolve,reject}));
 class Wrapper{setVisible(v){this.root.visible=v}addToScene(scene){scene.add(this.root)}}
 class ItemModel extends Wrapper{constructor(){super();this.root=new T.Group();this.leftHand=new T.Object3D();this.root.add(this.leftHand)}reset(){}}
 const require=id=>{
  if(id==='@esm/three')return T;
  if(id.includes('moduleloader'))return {ModuleLoader};
  if(id.endsWith('/basicModel.js'))return basic;
  if(id.endsWith('/modelloader.js'))return {loadGLTF};
  if(id.endsWith('/modelMaterials.js'))return materials;
  if(id.endsWith('/objectwrapper.js'))return {ObjectWrapper:Wrapper,ModelGroup:T.Group};
  if(id.endsWith('/models/lib.js'))return {isCulled:()=>false};
  if(id.endsWith('/items.js'))return {ItemModel};
  if(id.endsWith('/gear.js'))return {GearModel:ItemModel};
  if(id.endsWith('/pod.js'))return {};
  if(id.endsWith('/identifier.js'))return {Identifier:{create:()=>({stringKey:'test'})}};
  if(id.endsWith('/gearjson.js'))return load('renderer/models/gearjson.ts',()=>{});
  if(id.endsWith('/factory.js'))return {};
  if(id.endsWith('/native-weapon-view.js'))return {};
  if(id.endsWith('/i18n.js'))return {ui:text=>text};
  if(id==='@esm/troika-three-text')return {Text:class extends T.Object3D{dispose(){}}};
  throw Error('Unexpected test dependency '+id);
 };
 function source(){
  const group=new T.Group(),geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial({map:new T.Texture()});group.add(new T.Mesh(geometry,material));materials.ownModelMaterials(group);
  const disposed={material:0,geometry:0,texture:0};group.children[0].material.addEventListener('dispose',()=>disposed.material++);geometry.addEventListener('dispose',()=>disposed.geometry++);material.map.addEventListener('dispose',()=>disposed.texture++);
  return {group,disposed};
 }
 return {warnings,disposers,calls,require,source,materials};
}
const record={id:'fixture',file:'low/fixture.glb',revision:'one',source:'NativeFixture',defaultScale:[1,1,1],animations:[]};
test('recorded tech door and terminal labels resolve to exact native prefab identities',async()=>{
 const h=harness(),models=['gate_4x4_weak_door','gate_8x4_weak_door','Terminal_Mini','Terminal_Floor'].map(source=>({...record,id:source,file:`low/${source}.glb`,source}));
 const env=await environment(h,async()=>({ok:true,json:async()=>({version:1,models})}));
 for(const [name,expected] of [
  ['gate_4x4_weak_door_tech(Clone)_terminalKey: DOOR_696DOOR_696','gate_4x4_weak_door'],
  ['gate_8x4_weak_door_tech(Clone)_terminalKey: DOOR_17','gate_8x4_weak_door'],
  ['Terminal_Mini_GO_UID:6517_TERMINAL_123_terminalKey: TERMINAL_123','Terminal_Mini'],
  ['Terminal_Floor(Clone)_9_TERMINAL_737_terminalKey: TERMINAL_737','Terminal_Floor']
 ]) assert.equal(env.environmentAssetForPrefab(name),expected);
 assert.equal(env.environmentAssetForPrefab('Custom_Terminal_Floor(Clone)'),undefined);
});
async function environment(h,fetch=async()=>({ok:true,json:async()=>({version:1,models:[record]})})){
 const module={exports:{}};await new AsyncFunction('require','module','exports','fetch',code('renderer/map/environment.ts'))(h.require,module,module.exports,fetch);return module.exports;
}
function nativeItems(h,descriptors=new Map([[1,{id:'item',file:'low/pickup.glb',heldFile:'low/held.glb',rightHandGrip:{pos:{x:0,y:0,z:0},rot:{x:0,y:0,z:0,w:1}},leftHandGrip:null}]])){
 return load('renderer/models/prebuilt/nativeItem.ts',id=>id.endsWith('/nativeItemCatalog.js')?{nativeItemCatalog:descriptors}:h.require(id));
}
function gear(h,parts){
 return loadGear(id=>{
  if(id.includes('/datablocks/'))return new Proxy({payloadType:['default']},{get:(target,key)=>target[key]??{get:value=>parts.get(value),matchCategory:()=>undefined}});
  return h.require(id);
 });
}
const schematic=components=>JSON.stringify({Packet:{Comps:Object.fromEntries(components.map(([c,v],i)=>[String(i),{c,v}]))}});
function basic(model){const result=[];model.traverse(object=>{if(object.userData.modelFallback)result.push(object)});assert.equal(result.length,1);assert.equal(result[0].isMesh,true);assert.equal(result[0].userData.modelFallback.animated,false);return result[0];}

test('environment network failure settles with one transformed, opacity-aware shape and no retries',async()=>{
 const h=harness(),{EnvironmentModel}=await environment(h),model=new EnvironmentModel('fixture',{position:{x:3,y:4,z:5},rotation:{x:0,y:0,z:0,w:1},scale:{x:2,y:3,z:4}});model.setOpacity(.4);await flush();h.calls[0].reject(Error('404'));await model.ready;
 const marker=basic(model.root);assert.deepEqual(model.root.position.toArray(),[3,4,5]);assert.deepEqual(model.root.scale.toArray(),[2,3,4]);assert.equal(marker.material.opacity,.4);
 for(let i=0;i<100;i++)model.sampleAnimation('missing',0);assert.equal(h.calls.length,1);assert.equal(h.warnings.length,1);assert.equal(model.model,undefined);
 let count=0;marker.geometry.addEventListener('dispose',()=>count++);model.dispose();model.dispose();assert.equal(count,1);assert.equal(model.root.children.length,0);
});
test('missing environment catalogue and identity remain visible without requesting a guessed asset',async()=>{
 const h=harness(),env=await environment(h,async()=>({ok:false,status:404})),model=new env.EnvironmentModel('not-installed');await model.ready;basic(model.root);assert.equal(h.calls.length,0);assert.equal(h.warnings.length,2);assert.equal(env.environmentAssetForPrefab('NativeFixture'),undefined);model.dispose();
});
test('environment disposal prevents both late models and stale failure markers',async()=>{
 for(const reject of [true,false]){
  const h=harness(),{EnvironmentModel}=await environment(h),model=new EnvironmentModel('fixture');await flush();h.disposers[0]();let factories=0;
  if(reject)h.calls[0].reject(Error('late'));else h.calls[0].resolve(()=>{factories++;return h.source().group});
  await model.ready;assert.equal(factories,0);assert.equal(h.warnings.length,0);assert.equal(model.root.children.length,0);
 }
});
test('missing native animation releases instance materials once and never claims an animated fallback',async()=>{
 const h=harness(),{EnvironmentModel}=await environment(h),model=new EnvironmentModel('fixture');await flush();const source=h.source();h.calls[0].resolve(()=>source.group);await model.ready;
 for(let i=0;i<100;i++)model.sampleAnimation('native-clip-missing',1);basic(model.root);assert.equal(h.warnings.length,1);assert.deepEqual(source.disposed,{material:1,geometry:0,texture:0});model.dispose();assert.equal(source.disposed.material,1);
});
test('unknown doors use recorded transforms and a basic panel that follows open and destroyed states',async()=>{
 const h=harness(),env=await environment(h),{DoorModel,doorAsset}=load('renderer/map/door.ts',id=>id.endsWith('/environment.js')?env:h.require(id));
 const door={id:3,serialNumber:41,size:'Medium',type:'SecurityDoor',modelName:'missing-native-door',position:{x:2,y:3,z:4},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:2,z:3}},model=new DoorModel(door);await model.native.ready;
 const marker=basic(model.root);assert.deepEqual(marker.geometry.parameters,{width:8,height:4,depth:.2,widthSegments:1,heightSegments:1,depthSegments:1});assert.deepEqual(model.root.scale.toArray(),[1,2,3]);
 for(const [status,visible] of [['Closed',true],['Open',false],['Destroyed',false],['Closed',true]]){model.update(0,{id:3,status});assert.equal(marker.visible,visible)}
 assert.equal(doorAsset({...door,modelName:''}),undefined);assert.equal(h.calls.length,0);assert.equal(h.warnings.length,1);model.dispose();
});

test('all native door families select clips present in their actual Low assembly and restore after seeking',async()=>{
 const {loadNativeGLTF}=require('./native-environment.cjs');
 const assets=path.resolve(__dirname,'../../Viewer/assets/assets/environment');
 const manifest=JSON.parse(fs.readFileSync(path.join(assets,'manifest.json')));
 const rows=manifest.models.filter(row=>/^(weak-door|security-door|bulkhead-door|bulkhead-main-door|apex-door)-/.test(row.id));
 assert.ok(rows.length>=10);
 for(const row of rows){
  const h=harness(),env=await environment(h,async()=>({ok:true,json:async()=>({version:1,models:[row]})}));
  const {DoorModel}=load('renderer/map/door.ts',id=>id.endsWith('/environment.js')?env:h.require(id));
  // In a real R4B3 recording, native bulkhead assemblies can have SecurityDoor type.
  const type=row.id.startsWith('weak-')?'WeakDoor':row.id.startsWith('apex-')?'ApexDoor':'SecurityDoor';
  const door={id:1,serialNumber:1,size:'Small',type,modelName:row.source,position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}};
  const model=new DoorModel(door);await flush();
  const {gltf}=await loadNativeGLTF(path.join(assets,row.file));gltf.scene.animations=gltf.animations;
  h.calls[0].resolve(()=>gltf.scene);await model.native.ready;
  const signatures=[];
  for(const [status,time] of [['Closed',0],['Open',1500],['Open',90000],['Closed',0]]){
   model.update(time,{id:1,status,change:0});assert.equal(model.native.failed,false,row.id+': '+h.warnings.join(';'));
   const state=[];gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(node=>state.push(...node.matrixWorld.elements));assert.ok(state.every(Number.isFinite));signatures.push(state);
  }
  assert.deepEqual(signatures[0],signatures[3],row.id+' did not restore closed pose');
  assert.notDeepEqual(signatures[0],signatures[2],row.id+' did not open');model.dispose();
 }
});
test('failed native items retain one shape across mode changes and release it on disposal',async()=>{
 const h=harness(),{NativeItemModel}=nativeItems(h),model=new NativeItemModel(1);await flush();h.calls[0].reject(Error('missing held asset'));await model.ready;const marker=basic(model.visual);
 for(let i=0;i<100;i++){model.inLevel();model.inHand();model.render(1,100*i)}assert.equal(h.calls.length,1);assert.equal(h.warnings.length,1);assert.equal(model.mixer,undefined);
 let disposed=0;marker.material.addEventListener('dispose',()=>disposed++);model.dispose();model.dispose();assert.equal(disposed,1);assert.equal(model.visual.children.length,0);
});
test('missing item registration is visible while native pickup-only items do not invent a held representation',async()=>{
 const h=harness(),{NativeItemModel}=nativeItems(h,new Map([[2,{file:'low/static.glb',heldFile:null}]]));
 const missing=new NativeItemModel(77),pickupOnly=new NativeItemModel(2);await Promise.all([missing.ready,pickupOnly.ready]);basic(missing.visual);assert.equal(pickupOnly.visual.children.length,0);assert.equal(h.calls.length,0);missing.dispose();pickupOnly.dispose();
});
test('native items ignore superseded and disposed requests without creating owned clones',async()=>{
 const h=harness(),{NativeItemModel}=nativeItems(h),model=new NativeItemModel(1);await flush();model.inLevel();assert.equal(h.calls.length,2);h.calls[0].reject(Error('stale held failure'));model.dispose();let factories=0;h.calls[1].resolve(()=>{factories++;return h.source().group});await model.ready;await flush();assert.equal(factories,0);assert.equal(h.warnings.length,0);assert.equal(model.visual.children.length,0);
});
test('a nonzero missing gear component yields one shape and never calls successful build hooks',async()=>{
 const h=harness(),{GearBuilder}=await gear(h,new Map());let built=0;const model=new GearBuilder(schematic([[12,999]]),()=>built++);await model.ready;basic(model.parts);assert.equal(built,0);assert.equal(h.calls.length,0);assert.equal(h.warnings.length,1);for(let i=0;i<100;i++)model.animate(i);assert.equal(h.warnings.length,1);model.dispose();
});
test('gear failure disposes partially loaded instance materials but leaves shared geometry and textures',async()=>{
 const h=harness(),{GearBuilder}=await gear(h,new Map([[1,{path:'../parts/low/one.glb'}],[2,{path:'../parts/low/two.glb'}]])),model=new GearBuilder(schematic([[12,1],[16,2]]));await flush();const source=h.source();h.calls[0].resolve(()=>source.group);await flush();assert.equal(h.calls.length,2);h.calls[1].reject(Error('second component missing'));await model.ready;basic(model.parts);assert.deepEqual(source.disposed,{material:1,geometry:0,texture:0});assert.equal(model.foldObjects.length,0);assert.deepEqual(model.aligns,{});model.dispose();assert.equal(source.disposed.material,1);
});
test('disposed gear never constructs or attaches a late part and reports no stale warning',async()=>{
 const h=harness(),{GearBuilder}=await gear(h,new Map([[1,{path:'../parts/low/one.glb'}]])),model=new GearBuilder(schematic([[12,1]]));await flush();model.dispose();let factories=0;h.calls[0].resolve(()=>{factories++;return h.source().group});await model.ready;assert.equal(factories,0);assert.equal(model.parts.children.length,0);assert.equal(h.warnings.length,0);
});

test('malformed environment rows are isolated and valid Low records still load',async()=>{
 const h=harness(),rows=[null,{...record,id:'bad-scale',defaultScale:null},{...record,id:'bad-file',file:'high/bad-file.glb'},record];
 const {EnvironmentModel}=await environment(h,async()=>({ok:true,json:async()=>({version:1,models:rows})}));
 const missing=new EnvironmentModel('bad-scale'),valid=new EnvironmentModel('fixture');await flush();await missing.ready;basic(missing.root);assert.equal(h.calls.length,1);assert.match(h.calls[0].url,/low\/fixture.glb/);
 const source=h.source();h.calls[0].resolve(()=>source.group);await valid.ready;assert.equal(valid.failed,false);assert.equal(valid.model,source.group);missing.dispose();valid.dispose();
});
test('empty GLB scenes cannot silently replace items, environment or gear',async()=>{
 const h=harness(),{EnvironmentModel}=await environment(h),env=new EnvironmentModel('fixture'),{NativeItemModel}=nativeItems(h),item=new NativeItemModel(1),{GearBuilder}=await gear(h,new Map([[1,{path:'../parts/low/one.glb'}]])),weapon=new GearBuilder(schematic([[12,1]]));
 await flush();assert.equal(h.calls.length,3);for(const call of h.calls)call.resolve(()=>new T.Group());await Promise.all([env.ready,item.ready,weapon.ready]);
 for(const model of [env.root,item.visual,weapon.parts])basic(model);assert.equal(h.warnings.length,3);env.dispose();item.dispose();weapon.dispose();
});
test('successful native item animation and grip metadata survive the failure handling',async()=>{
 const h=harness(),{NativeItemModel}=nativeItems(h),item=new NativeItemModel(1);assert.ok(item.rightHandGrip);await flush();const source=h.source();source.group.animations=[new T.AnimationClip('native',1,[new T.NumberKeyframeTrack('.position[x]',[0,1],[0,2])])];h.calls[0].resolve(()=>source.group);await item.ready;item.render(0,250);assert.equal(source.group.position.x,.5);assert.equal(h.warnings.length,0);assert.equal(item.fallback,undefined);item.dispose();assert.equal(source.disposed.material,1);assert.equal(source.disposed.geometry,0);
});
test('successful gear keeps immediate metadata and calls onBuild only after Low parts finish',async()=>{
 const h=harness(),descriptor={type:'melee'},parts=new Map([[1,{path:'../parts/low/one.glb'}]]),original=h.require;
 const {GearBuilder}=await loadGear(id=>{
  if(id.endsWith('/datablocks/gear/models.js'))return {GearDatablock:{get:()=>descriptor}};
  if(id.includes('/datablocks/'))return new Proxy({payloadType:['default']},{get:(target,key)=>target[key]??{get:value=>parts.get(value)}});
  return original(id);
 });
 let built=0;const weapon=new GearBuilder(schematic([[12,1]]),()=>built++);assert.equal(weapon.datablock,descriptor);assert.ok(weapon.schematic);assert.equal(built,0);await flush();const source=h.source();h.calls[0].resolve(()=>source.group);await weapon.ready;assert.equal(built,1);assert.equal(h.warnings.length,0);assert.equal(weapon.fallback,undefined);assert.equal(weapon.front.children[0],source.group);weapon.dispose();assert.deepEqual(source.disposed,{material:1,geometry:0,texture:0});
});

test('failed containers settle without attaching undefined, respect debug visibility and dispose safely',async()=>{
 const h=harness(),env=await environment(h),{ResourceContainerModel}=load('renderer/map/resourcecontainers.ts',id=>{
  if(id.endsWith('/environment.js'))return env;
  if(id.endsWith('/rhu/signal.js'))return {signal:initial=>{let value=initial;return function(next){if(arguments.length)value=next;return value;}}};
  if(id.endsWith('/datablocks/items/item.js'))return {ItemDatablock:{get:()=>undefined}};
  if(id.endsWith('/identifier.js'))return {Identifier:{isKnown:()=>false}};
  return h.require(id);
 });
 const container={id:4,isLocker:true,modelName:'CustomLocker(Clone)',registered:false,assignedLock:'None',position:{x:1,y:2,z:3},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1},consumableType:{}};
 const model=new ResourceContainerModel(container);let textsDisposed=0;model.tmp.dispose=()=>textsDisposed++;
 await model.ready;await flush();const marker=basic(model.root);assert.equal(marker.visible,false);assert.equal(model.content.children.length,0);
 ResourceContainerModel.debug(true);model.updateStateless();assert.equal(marker.visible,true);
 ResourceContainerModel.debug(false);model.updateStateless();assert.equal(marker.visible,false);
 container.registered=true;model.updateStateless();model.update(0);assert.equal(marker.visible,true);assert.equal(marker.material.opacity,1);
 model.dispose();model.dispose();assert.equal(textsDisposed,1);assert.equal(model.root.children.includes(marker),false);
 const late=new ResourceContainerModel({...container,id:5});late.dispose();await late.ready;await flush();assert.equal(late.model,undefined);assert.equal(late.content.children.length,0);
});
