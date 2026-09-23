const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('../../Viewer/assets/node_modules/typescript');
const THREE=require('../../Viewer/assets/node_modules/three');

test('tongue starts at the recorded mouth anchor when the reconstructed head is stale',()=>{
    const source=fs.readFileSync(path.resolve(__dirname,'../../Viewer/assets/src/profiles/vanilla/renderer/enemy/tongues.ts'),'utf8');
    const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    let render;
    const modules={
        '@esm/@root/replay/moduleloader.js':{ModuleLoader:{registerRender:(name,install)=>install(name,{
            getRenderLoop:()=>[],setRenderLoop:passes=>{render=passes[0].pass;}
        })}},
        '@esm/@root/replay/pod.js':{Vec:{zero:()=>({x:0,y:0,z:0}),dist:(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z),sub:(out,a,b)=>Object.assign(out,{x:a.x-b.x,y:a.y-b.y,z:a.z-b.z}),length:v=>Math.hypot(v.x,v.y,v.z)}},
        '@esm/three':THREE,
        '../../library/dynamicspline.js':{DynamicSplineGeometry:class extends THREE.BufferGeometry{morph(points){this.points=points;}}},
        '../../library/factory.js':{Factory:()=>()=>new Map()}
    };
    const moduleValue={exports:{}};
    new Function('require','module','exports',code)(id=>{if(!(id in modules))throw Error(id);return modules[id];},moduleValue,moduleValue.exports);
    const start={x:-195.62,y:1.42,z:40.2},end={x:-190,y:1.5,z:40};
    const values=new Map([
        ['Enemy.Tongue',new Map()],['Vanilla.Enemy.Tongue',new Map([[1,{id:1,owner:2,dimension:0,progress:1,spline:[start,end]}]])],
        ['Vanilla.Enemy',new Map([[2,{id:2,position:new THREE.Vector3(-195.6,0,40.47)}]])],
        ['Enemies',new Map([[2,{model:{isVisible:()=>true,head:new THREE.Matrix4()}}]])]
    ]);
    const renderer={scene:new THREE.Scene(),getOrDefault:key=>values.get(key),get:key=>key==='Dimension'?0:values.get(key)};
    const snapshot={getOrDefault:key=>values.get(key)};
    render(renderer,snapshot);
    const geometry=values.get('Enemy.Tongue').get(1).geometry;
    assert.deepEqual(geometry.points[0].toArray(),[start.x,start.y,start.z]);
    assert.deepEqual(geometry.points.at(-1).toArray(),[end.x,end.y,end.z]);
    assert.equal(values.get('Enemy.Tongue').get(1).mesh.visible,true);
});
