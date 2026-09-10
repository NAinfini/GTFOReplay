const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../../Viewer/assets/node_modules/three'),ts=require('../../Viewer/assets/node_modules/typescript');
const code=ts.transpileModule(fs.readFileSync('Viewer/assets/src/profiles/vanilla/renderer/enemy/lib.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
Math.clamp01=value=>Math.max(0,Math.min(1,value));
const moduleUnderTest={exports:{},ready(){}};
class Model {
    root=new T.Group(); visible=true;
    isVisible(){return this.visible;}
    dispose(){}
}
new Function('require','module','exports',code)(name=>{
    if(name==='@esm/three')return T;
    if(name.endsWith('/signal.js'))return {signal:value=>()=>value};
    if(name==='@esm/troika-three-text')return {Text:class extends T.Object3D {dispose(){}}};
    if(name.endsWith('/datablocks/enemy/enemy.js'))return {EnemyDatablock:new Map()};
    if(name.endsWith('/models/basic.js'))return {BasicEnemyModel:Model};
    if(name.endsWith('/controls.js'))return {Controls:{selected:()=>undefined}};
    return {};
},moduleUnderTest,moduleUnderTest.exports);
const {EnemyModelWrapper}=moduleUnderTest.exports;

test('biotracker triangle follows recorded tag state and sits above a transformed head',()=>{
    const enemy={type:{hash:'custom'},scale:1,tagged:false,targetPlayerSlotIndex:255,health:10,stagger:Infinity};
    const wrapper=new EnemyModelWrapper(enemy),camera={root:new T.PerspectiveCamera()};
    camera.root.position.set(5,7,10);
    wrapper.model.root.position.set(4,1,2);wrapper.model.root.rotation.y=.8;
    wrapper.model.root.scale.setScalar(1.5);
    const head=new T.Object3D();head.position.set(.2,1.8,.1);wrapper.model.root.add(head);wrapper.tagTarget=head;
    wrapper.updateTmp(enemy,undefined,camera,[]);assert.equal(wrapper.tag.visible,false);
    enemy.tagged=true;wrapper.updateTmp(enemy,undefined,camera,[]);
    assert.equal(wrapper.tag.visible,true);assert.equal(wrapper.tag.material.color.getHex(),0xff3b30);
    // Outer and inner triangles form a hollow marker with six indexed faces.
    assert.equal(wrapper.tag.geometry.getAttribute('position').count,6);
    assert.equal(wrapper.tag.geometry.index.count,18);
    const expected=head.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.35,0));
    assert.ok(wrapper.tag.getWorldPosition(new T.Vector3()).distanceTo(expected)<1e-6);
    const facing=wrapper.tag.getWorldDirection(new T.Vector3());
    assert.ok(facing.dot(camera.root.position.clone().sub(expected).normalize())>.999);
    assert.equal(wrapper.tag.material.depthTest,false);assert.equal(wrapper.tag.material.depthWrite,false);
    enemy.tagged=false;wrapper.updateTmp(enemy,undefined,camera,[]);assert.equal(wrapper.tag.visible,false);
    enemy.tagged=true;wrapper.model.visible=false;wrapper.updateTmp(enemy,undefined,camera,[]);assert.equal(wrapper.tag.visible,false);
    wrapper.dispose();
});

test('custom enemies have an elevated tag and share marker resources safely',()=>{
    const enemy={type:{hash:'custom'},scale:2,tagged:true,targetPlayerSlotIndex:255,health:10,stagger:Infinity};
    const a=new EnemyModelWrapper(enemy),b=new EnemyModelWrapper(enemy),camera={root:new T.PerspectiveCamera()};
    camera.root.position.set(0,4,10);a.model.root.scale.setScalar(2);a.updateTmp(enemy,undefined,camera,[]);
    assert.equal(a.tag.getWorldPosition(new T.Vector3()).y,4.4);assert.equal(a.tag.geometry,b.tag.geometry);assert.equal(a.tag.material,b.tag.material);
    let disposed=false;b.tag.material.addEventListener('dispose',()=>disposed=true);
    a.dispose();assert.equal(disposed,false);b.updateTmp(enemy,undefined,camera,[]);assert.equal(b.tag.visible,true);b.dispose();
    moduleUnderTest.destructor();assert.equal(disposed,true);
});
