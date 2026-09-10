const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../../Viewer/assets/node_modules/three'),ts=require('../../Viewer/assets/node_modules/typescript');
const code=ts.transpileModule(fs.readFileSync('Viewer/assets/src/profiles/vanilla/renderer/map/navigation-fallback.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const moduleValue={exports:{}};new Function('require','module','exports',code)(()=>T,moduleValue,moduleValue.exports);
const {buildNavigationFallback}=moduleValue.exports;
function navigation(y=0){return new T.Mesh(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([-2,y,-2,-2,y,2,2,y,2,2,y,-2],3)).setIndex([0,1,2,0,2,3]));}
function floor(x=0,y=0,count=1){const mesh=new T.InstancedMesh(new T.PlaneGeometry(2,4).rotateX(-Math.PI/2),new T.MeshBasicMaterial(),count);mesh.userData.dimension=0;for(let i=0;i<count;i++)mesh.setMatrixAt(i,new T.Matrix4().makeTranslation(x,y,0));return {geometry:mesh.geometry,dimension:0,matrices:mesh.instanceMatrix.array};}
function area(mesh){const p=mesh.geometry.attributes.position,idx=mesh.geometry.index;let total=0;for(let i=0;i<(idx?.count??p.count);i+=3){const v=[0,1,2].map(n=>new T.Vector3().fromBufferAttribute(p,idx?idx.getX(i+n):i+n));total+=new T.Vector3().subVectors(v[1],v[0]).cross(new T.Vector3().subVectors(v[2],v[0])).length()/2;}return total;}
test('split mixed triangles at native footprint: no gray over stairs, retain uncovered ground',async()=>{
    const nav=navigation(.7),original=nav.geometry.clone();
    const stats=await buildNavigationFallback([floor(-1)],new Map([[0,[nav]]]),()=>false);
    assert.equal(stats.before,2);assert.ok(Math.abs(area(nav)-8)<1e-5);
    const p=nav.geometry.attributes.position;
    for(let i=0;i<p.count;i++)assert.ok(p.getX(i)>=-1e-5);
    assert.equal(original.index.count,6);
});
test('missing assets and other storeys/dimensions keep their navigation',async()=>{
    const upper=navigation(4),other=navigation(.7),missing=navigation(.7);
    await buildNavigationFallback([floor(-1)],new Map([[0,[upper]],[1,[other]]]),()=>false);
    await buildNavigationFallback([],new Map([[0,[missing]]]),()=>false);
    for(const mesh of [upper,other,missing])assert.equal(area(mesh),16);
});
test('overlapping support masks subtract once without cracks or fragment explosion',async()=>{
    const nav=navigation(.7);await buildNavigationFallback([floor(-1,0,2000),floor(1)],new Map([[0,[nav]]]),()=>false);
    assert.equal(area(nav),0);assert.equal(nav.geometry.attributes.position.count,0);
});
test('cancelled classification does not replace disposed navigation geometry',async()=>{
    const nav=navigation(),original=nav.geometry;await buildNavigationFallback([floor()],new Map([[0,[nav]]]),()=>true);assert.equal(nav.geometry,original);
});
