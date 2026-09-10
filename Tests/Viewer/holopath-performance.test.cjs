const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../../Viewer/assets/node_modules/three'),ts=require('../../Viewer/assets/node_modules/typescript');
const podModule={exports:{}};
new Function('exports',ts.transpileModule(fs.readFileSync('Viewer/assets/src/replay/pod.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(podModule.exports);
test('holopath rebuilds only on changed geometry/progress, including seeks, and disposes resources',()=>{
 let pass,dispose,morphs=0,geometryDisposals=0;
 class Geometry extends T.BufferGeometry {morph(){morphs++}dispose(){geometryDisposals++;super.dispose()}}
 const loader={registerRender(name,register){register(name,{getRenderLoop:()=>[],setRenderLoop:p=>pass=p[0].pass})},registerDispose(fn){dispose=fn}};
 const deps={'@esm/three':T,'@esm/@root/replay/pod.js':podModule.exports,'@esm/@root/replay/moduleloader.js':{ModuleLoader:loader},'../../library/dynamicspline.js':{DynamicSplineGeometry:Geometry},'../../library/factory.js':{Factory:()=>()=>new Map()}};
 const code=ts.transpileModule(fs.readFileSync('Viewer/assets/src/profiles/vanilla/renderer/chainedpuzzles/holopath.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports',code)(id=>deps[id],{});
 const state=new Map(),models=new Map(),renderer={scene:new T.Scene(),get:k=>k==='Dimension'?0:models.get(k),getOrDefault(k,f){if(!models.has(k))models.set(k,f());return models.get(k)}};
 const snapshot={getOrDefault:()=>state};
 const path={id:1,dimension:0,progress:1,spline:[{x:0,y:0,z:0},{x:2,y:0,z:0}]};
 state.set(1,path);pass(renderer,snapshot);assert.equal(morphs,1);
 state.set(1,structuredClone(path));pass(renderer,snapshot);assert.equal(morphs,1,'cloned replay data is unchanged');
 state.get(1).progress=.5;pass(renderer,snapshot);assert.equal(morphs,2,'backward seek rebuilds');
 state.get(1).spline[1].x=3;pass(renderer,snapshot);assert.equal(morphs,3,'reused ID with a new spline rebuilds');
 state.get(1).dimension=1;state.get(1).progress=.8;pass(renderer,snapshot);assert.equal(morphs,3);
 state.get(1).dimension=0;pass(renderer,snapshot);assert.equal(morphs,4,'newly visible progress is current');
 state.clear();pass(renderer,snapshot);assert.equal(geometryDisposals,1);assert.equal(renderer.scene.children.length,0);
 state.set(1,path);pass(renderer,snapshot);dispose(renderer);assert.equal(geometryDisposals,2);
});
