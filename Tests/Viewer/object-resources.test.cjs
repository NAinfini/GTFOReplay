const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadNativeGLTF}=require('./native-environment.cjs');
const {packageGLB,readGLB,writeGLB}=require('../../Tools/runtime-model-package.cjs');
const root=path.resolve(__dirname,'../../Viewer/assets/assets');

test('model instances own materials but share geometry and texture storage',()=>{
 const T=require('../../Viewer/assets/node_modules/three'),ts=require('../../Viewer/assets/node_modules/typescript');
 const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../../Viewer/assets/src/profiles/vanilla/library/modelMaterials.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};new Function('require','module','exports',code)(()=>T,module,module.exports);
 const {ownModelMaterials,disposeModelMaterials}=module.exports;
 const original=new T.MeshStandardMaterial({map:new T.Texture()}),geometry=new T.BoxGeometry(),a=new T.Group(),b=new T.Group();
 for(const group of [a,b]){group.add(new T.Mesh(geometry,original),new T.Mesh(geometry,original));ownModelMaterials(group);}
 assert.equal(a.children[0].material,a.children[1].material);assert.notEqual(a.children[0].material,b.children[0].material);
 assert.equal(a.children[0].material.map,b.children[0].material.map);assert.equal(a.children[0].geometry,b.children[0].geometry);
 a.children[0].material.opacity=.35;assert.equal(b.children[0].material.opacity,1);
 let disposed=0;a.children[0].material.addEventListener('dispose',()=>disposed++);disposeModelMaterials(a);disposeModelMaterials(a);assert.equal(disposed,1);
 assert.equal(original.opacity,1);
});

test('the runtime receipt contains only Low models and all texture dependencies resolve',async()=>{
 const receipt=JSON.parse(fs.readFileSync(path.join(root,'model-resources.json'))),files=new Set(receipt.files.map(f=>f.path));
 assert.ok(![...files].some(file=>/(^|\/)(mid|high|original)\//i.test(file)));
 assert.ok(!files.has('details/manifest.json'));
 const animationFiles=require('../../Tools/import-model-resources.cjs').playerAnimationFiles();
 for(const file of animationFiles)assert.ok(files.has(file),'Missing playback animation '+file);
 for(const file of files)if(file.startsWith('player-animations/'))assert.ok(animationFiles.has(file)||['player-animations/hands.json','player-animations/first-person.json','player-animations/weapon-view.json'].includes(file),'Unused animation '+file);
 assert.ok(![...files].some(file=>file.startsWith('environment/spitter-shader/')||file.startsWith('environment/floors/')));
 const models=[...files].filter(file=>file.endsWith('.glb'));assert.ok(models.length>=366);
 for(const file of models){
  const {gltf,doc}=await loadNativeGLTF(path.join(root,file));
  for(const image of doc.images??[])if(image.uri&&!image.uri.startsWith('data:')){
   const relative=path.posix.normalize(path.posix.join(path.posix.dirname(file),image.uri));assert.ok(files.has(relative),file+' missing '+relative);
  }
  gltf.scene.traverse(mesh=>{if(mesh.isMesh){assert.ok(mesh.geometry.getAttribute('position').count>0,file);mesh.geometry.dispose();if(mesh.isSkinnedMesh)mesh.skeleton.dispose();}});
 }
});
test('texture packaging shares exact image bytes and preserves geometry accessors',()=>{
    const image=Buffer.from([137,80,78,71,1,2,3,4]),geometry=Buffer.from([9,8,7,6]),binary=Buffer.concat([image,geometry]);
    const doc={asset:{version:'2.0'},buffers:[{byteLength:binary.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:8},{buffer:0,byteOffset:8,byteLength:4}],
        images:[{bufferView:0,mimeType:'image/png'}],accessors:[{bufferView:1,componentType:5121,count:4,type:'SCALAR'}],meshes:[]};
    const output=new Map();
    for(const name of ['a','b'])packageGLB(writeGLB(doc,binary),path.join(root,'source.glb'),`items/low/${name}.glb`,output);
    assert.equal([...output.keys()].filter(key=>key.startsWith('items/textures/')).length,1);
    const packed=readGLB(output.get('items/low/a.glb'));
    assert.deepEqual(packed.binary,geometry);assert.equal(packed.doc.accessors[0].bufferView,0);
    assert.equal(packed.doc.images[0].bufferView,undefined);assert.match(packed.doc.images[0].uri,/^\.\.\/textures\/[a-f0-9]{64}\.png$/);
});

test('packaging consumes the verified texture snapshot instead of rereading the source project',()=>{
    const texture=Buffer.from([137,80,78,71,1,2,3,4]),source=path.join(root,'source/model.glb');
    const file=path.resolve(path.dirname(source),'../textures/shared.png');
    const doc={asset:{version:'2.0'},buffers:[{byteLength:0}],bufferViews:[],images:[{uri:'../textures/shared.png'}],meshes:[]};
    const output=new Map();
    packageGLB(writeGLB(doc,Buffer.alloc(0)),source,'items/low/snapshot.glb',output,undefined,root,new Map([[file,texture]]));
    assert.deepEqual([...output].find(([file])=>file.startsWith('items/textures/'))[1],texture);
    assert.throws(()=>packageGLB(writeGLB(doc,Buffer.alloc(0)),source,'items/low/snapshot.glb',new Map(),undefined,root,new Map()),/validated rebuilt snapshot/);
});
