const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../../Viewer/assets/node_modules/three');
const ts=require('../../Viewer/assets/node_modules/typescript');
const code=ts.transpileModule(fs.readFileSync('Viewer/assets/src/replay/skinned-height.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};new Function('require','module','exports',code)(()=>T,mod,mod.exports);
const {SkinnedHeight}=mod.exports;

test('projected support matches full Three skinning across poses, morphs, transforms and non-unit weights',()=>{
 const root=new T.Group(),a=new T.Bone(),b=new T.Bone();a.add(b);b.position.y=1;root.add(a);
 const geometry=new T.BoxGeometry(1,2,1),count=geometry.attributes.position.count;
 const indices=[],weights=[];
 for(let i=0;i<count;i++){indices.push(0,1,0,1);weights.push(.3,.5,.1,i%2?.1:.08)}
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 geometry.morphAttributes.position=[geometry.attributes.position.clone()];geometry.morphTargetsRelative=true;
 const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial());root.add(mesh);root.updateMatrixWorld(true);mesh.bind(new T.Skeleton([a,b]));
 const vertices=Array.from({length:count},(_,i)=>i),support=new SkinnedHeight(mesh,vertices),point=new T.Vector3();
 for(let pose=0;pose<40;pose++){
  root.position.set(pose,pose*.37,-pose);root.rotation.y=pose*.11;root.scale.set(1.2,.8,1.4);
  a.rotation.z=pose*.07;b.rotation.x=pose*.13;mesh.morphTargetInfluences[0]=pose/80;
  root.updateMatrixWorld(true);let expected=Infinity;
  for(const vertex of vertices)expected=Math.min(expected,mesh.getVertexPosition(vertex,point).applyMatrix4(mesh.matrixWorld).y);
  const update=mesh.updateMatrixWorld;
  mesh.updateMatrixWorld=()=>{throw Error('Support query must not repeat the pose traversal')};
  try { assert.ok(Math.abs(support.minimum()-expected)<1e-10,`${pose}: ${support.minimum()} vs ${expected}`); }
  finally { mesh.updateMatrixWorld=update; }
 }
 assert.equal(new SkinnedHeight(mesh,[]).minimum(),Infinity);
 geometry.dispose();mesh.material.dispose();mesh.skeleton.dispose();
});
