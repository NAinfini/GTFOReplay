const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../../Viewer/assets/node_modules/three'),ts=require('../../Viewer/assets/node_modules/typescript');
const source=fs.readFileSync('Viewer/assets/src/profiles/vanilla/renderer/models/gearbuilder.ts','utf8');
const methods=source.slice(source.indexOf('    private static FUNC_animatePart'),source.indexOf('    private static FUNC_animate ='));
const code=ts.transpileModule('class GearBuilder {'+methods+'} exports.GearBuilder=GearBuilder;',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const output={};new Function('exports','Matrix4','Vector3','Quaternion',code)(output,T.Matrix4,T.Vector3,T.Quaternion);
test('reload poses use the native part basis without reparenting weapon or grip nodes',()=>{
 const gear=new output.GearBuilder(),root=new T.Group(),parts=gear.parts=new T.Group(),parent=new T.Group(),ref=new T.Object3D(),hand=gear.leftHand=new T.Object3D(),mag=new T.Object3D();
 root.position.set(2,3,4);root.rotation.set(.2,.4,.1);root.scale.setScalar(1.25);parts.scale.setScalar(.8);parts.position.set(.2,0,0);
 parent.rotation.x=Math.PI/2;parent.scale.setScalar(.01);ref.position.set(10,20,30);root.add(parts,hand);parts.add(parent,mag);parent.add(ref);
 let changes=0;for(const node of [parts,parent,ref])for(const event of ['added','removed'])node.addEventListener(event,()=>changes++);
 for(let i=0;i<10;i++){
  const pos=new T.Vector3(.1+i*.01,.2,.3),rot=new T.Quaternion().setFromEuler(new T.Euler(.2,.3*i,.4));
  gear.animatePart(hand,ref,{pos,rot});
  assert.equal(parts.parent,root);assert.equal(ref.parent,parent);assert.equal(changes,0);
  parts.updateMatrix();const expected=new T.Matrix4().multiplyMatrices(parts.matrix,new T.Matrix4().compose(pos,rot,new T.Vector3(1,1,1)));
  assert.ok(hand.position.distanceTo(new T.Vector3().setFromMatrixPosition(expected))<1e-8);
  assert.ok(hand.quaternion.angleTo(rot)<1e-7);
  gear.animatePart(mag,ref,{pos,rot});assert.ok(mag.position.distanceTo(pos)<1e-8);
 }
});
