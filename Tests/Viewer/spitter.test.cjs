const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('../../Viewer/assets/node_modules/typescript'),three=require('../../Viewer/assets/node_modules/three');
const root=path.resolve(__dirname,'../..');
const code=ts.transpileModule(fs.readFileSync(path.join(root,'Viewer/assets/src/profiles/vanilla/renderer/map/spitter.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;

test('native spitter keeps captured scale and maps recorded blend deterministically',()=>{
 const oldClamp=Math.clamp01;Math.clamp01=value=>Math.max(0,Math.min(1,value));
 class Wrapper{setVisible(value){this.root.visible=value}addToScene(scene){scene.add(this.root)}}
 class EnvironmentModel{
  constructor(assetId){this.assetId=assetId;this.root=new three.Group();this.cullingRadius=2;this.ready=Promise.resolve();}
  dispose(){this.disposed=true;this.root.removeFromParent()}
 }
 const moduleLoader={registerRender(){},registerDispose(){}};
 const mod={exports:{}};
 try{
  new Function('require','module','exports',code)(id=>{
   if(id==='@esm/three')return three;if(id.includes('moduleloader'))return {ModuleLoader:moduleLoader};
   if(id.endsWith('/environment.js'))return {EnvironmentModel};if(id.endsWith('/objectwrapper.js'))return {ObjectWrapper:Wrapper,ModelGroup:three.Group};
   if(id.endsWith('/models/lib.js'))return {isCulled:()=>false};if(id.endsWith('/factory.js'))return {Factory:()=>()=>new Map()};throw Error(id);
  },mod,mod.exports);
  const spitter={id:1,dimension:0,position:{x:2,y:3,z:4},rotation:{x:0,y:0,z:0,w:1},scale:1.25};
  const model=new mod.exports.SpitterModel(spitter);
  model.update(1000,{id:1,state:'Woke',lastStateTime:0,lastExplodeTime:0,appearance:{blend:.5,glow:[.03,.3,.22,.3],scale:{x:1.4,y:1.3,z:1.2}}});
  assert.deepEqual(model.root.scale.toArray(),[1.4,1.3,1.2]);assert.deepEqual(model.native.root.scale.toArray(),[1,1,1]);
  model.update(1000,{id:1,state:'Retracted',lastStateTime:0,lastExplodeTime:0,appearance:{blend:1,glow:[0,0,0,0],scale:{x:.7,y:.7,z:.7}}});
  assert.deepEqual(model.root.scale.toArray(),[.7,.7,.7]);assert.deepEqual(model.native.root.scale.toArray(),[.8,.8,.8]);
  const fallback={id:1,state:'Woke',lastStateTime:100,lastExplodeTime:0};model.update(100,fallback);assert.deepEqual(model.root.scale.toArray(),[1.25,1.25,1.25]);assert.equal(model.native.root.scale.x,.8);
  model.update(600,fallback);assert.equal(model.native.root.scale.x,1);model.update(100,fallback);assert.equal(model.native.root.scale.x,.8);
  model.dispose();assert.equal(model.native.disposed,true);
 }finally{Math.clamp01=oldClamp;}
});
