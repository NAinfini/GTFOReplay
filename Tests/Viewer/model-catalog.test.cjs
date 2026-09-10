const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('../../Viewer/assets/node_modules/typescript');
const root=path.resolve(__dirname,'../../Viewer/assets/src/profiles/vanilla/library');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function load(name,fetch){
 const warnings=[],module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.join(root,name+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 await new AsyncFunction('module','exports','require','fetch',code)(module,module.exports,id=>{assert.ok(id.endsWith('/moduleloader.js'));return {ModuleLoader:{reportWarning:message=>warnings.push(message)}}},fetch);
 return {...module.exports,warnings};
}
test('unavailable actor and item catalogs allow basic geometry with diagnostics',async()=>{
 for(const name of ['actorCatalog','nativeItemCatalog'])for(const fetch of [async()=>({ok:false,status:404}),async()=>{throw Error('Network unavailable')},async()=>({ok:true,json:async()=>({invalid:true})})]){
  const result=await load(name,fetch);assert.equal((result.actorCatalog??result.nativeItems).length,0);assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/basic shapes/);
 }
});
test('invalid model entries do not hide valid catalog entries or overwrite identifiers',async()=>{
 const actor={id:'test',name:'Test',enemyIds:[1],model:{file:'low/test.glb',revision:'123',triangles:100}};
 const result=await load('actorCatalog',async()=>({ok:true,json:async()=>[actor,{...actor,name:'Duplicate'},{id:'missing'}]}));
 assert.deepEqual(result.actorCatalog,[actor]);assert.equal(result.enemyNames.get(1),'Test');assert.equal(result.warnings.length,2);
 const item={id:'pack',file:'low/pack.glb',itemIds:[102]};
 const items=await load('nativeItemCatalog',async()=>({ok:true,json:async()=>[item,{...item,id:'duplicate'},{id:'bad',file:'mid/bad.glb',itemIds:[9]}]}));
 assert.deepEqual(items.nativeItems,[item]);assert.equal(items.nativeItemCatalog.get(102).id,'pack');assert.equal(items.warnings.length,2);
});
