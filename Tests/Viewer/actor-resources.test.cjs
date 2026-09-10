const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const ts=require('../../Viewer/assets/node_modules/typescript');
const repo=path.resolve(__dirname,'../..');
const threeRoot=path.join(repo,'Viewer/assets/node_modules/three');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function compile(relative,dependencies,storage){
    const code=ts.transpileModule(fs.readFileSync(path.join(repo,relative),'utf8'),{
        compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
    }).outputText;
    const module={exports:{}};
    new Function('require','module','exports','localStorage',code)(name=>{
        if(name in dependencies)return dependencies[name];
        throw Error('Unexpected test import: '+name);
    },module,module.exports,storage);
    return module.exports;
}

async function environment(){
    const T=await import(pathToFileURL(path.join(threeRoot,'build/three.module.js')));
    const {clone}=await import(pathToFileURL(path.join(threeRoot,'examples/jsm/utils/SkeletonUtils.js')));
    const helpers={};
    for(const name of ['actor-rig','soft-tentacles','actor-colors','skinned-height'])helpers[name]=compile('Viewer/assets/src/replay/'+name+'.ts',{'three':T});
    const warnings=[];
    const basic=compile('Viewer/assets/src/profiles/vanilla/renderer/models/basicModel.ts',{'@esm/three':T,'@esm/@root/replay/moduleloader.js':{ModuleLoader:{reportWarning:message=>warnings.push(message)}}});
    const calls=[];
    class GLTFLoader {loadAsync(url){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});calls.push({url,resolve,reject});return promise}}
    const descriptors=['alpha','beta'].map(id=>({id,name:id,group:'enemies',radius:2,sourceRevision:'source',
        model:{file:'low/'+id+'.glb',revision:id+'-low',triangles:1,radius:2}}));
    const {Actor}=compile('Viewer/assets/src/profiles/vanilla/renderer/models/actor.ts',{
        '@esm/three':T,'@esm/@root/replay/model-loader.js':{modelLoader:new GLTFLoader()},
        '@esm/three/examples/jsm/utils/SkeletonUtils.js':{clone},
        '@esm/@root/replay/actor-rig.js':helpers['actor-rig'],
        '@esm/@root/replay/soft-tentacles.js':helpers['soft-tentacles'],
        '@esm/@root/replay/actor-colors.js':helpers['actor-colors'],
        '@esm/@root/replay/skinned-height.js':helpers['skinned-height'],
        '../../library/actorCatalog.js':{actorCatalog:descriptors},'./basicModel.js':basic,
        '../objectwrapper.js':compile('Viewer/assets/src/profiles/vanilla/renderer/objectwrapper.ts',{'@esm/three':T})
    });
    function source(label){
        const scene=new T.Group(),hip=new T.Bone(),head=new T.Bone();hip.name='Hips';head.name='Head';head.position.y=1;hip.add(head);scene.add(hip);
        const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
        geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute([0,0,0,0,0,0,0,0,1,0,0,0],4));
        geometry.setAttribute('skinWeight',new T.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));geometry.setIndex([0,1,2]);
        const texture=new T.DataTexture(new Uint8Array([34,99,76,255]),1,1),material=new T.MeshStandardMaterial({map:texture});
        const mesh=new T.SkinnedMesh(geometry,material);mesh.name=label;scene.add(mesh);scene.updateMatrixWorld(true);mesh.bind(new T.Skeleton([hip,head]));
        const disposed={geometry:0,material:0,texture:0,image:0};
        for(const [key,object] of Object.entries({geometry,material,texture}))object.addEventListener('dispose',()=>disposed[key]++);
        texture.source.data.close=()=>disposed.image++;
        return {scene,geometry,material,texture,disposed};
    }
    function request(level,id='alpha'){const result=calls.filter(call=>call.url.includes('/'+level+'/'+id+'.glb'));assert.equal(result.length,1);return result[0]}
    async function resolve(level,value,id='alpha'){request(level,id).resolve({scene:value.scene,animations:[]});await flush()}
    return {T,Actor,calls,source,request,resolve,warnings};
}

test('same species shares source data while each actor owns its rig and material',async()=>{
    const e=await environment(),a=new e.Actor('alpha',new e.T.Group()),b=new e.Actor('alpha',new e.T.Group());
    await flush();assert.equal(e.calls.length,1);
    const source=e.source('low');await e.resolve('low',source);await Promise.all([a.ready,b.ready]);
    const am=a.active.scene.getObjectByName('low'),bm=b.active.scene.getObjectByName('low');
    assert.equal(am.geometry,bm.geometry);assert.equal(am.material.map,bm.material.map);
    assert.notEqual(am.material,bm.material);assert.notEqual(am.skeleton,bm.skeleton);assert.notEqual(am.skeleton.bones[0],bm.skeleton.bones[0]);
    a.update(true,0xff0000);assert.equal(am.material.color.g,0);assert.equal(bm.material.color.g,1);
    a.dispose();assert.equal(source.disposed.geometry,0);b.dispose();
    assert.deepEqual(source.disposed,{geometry:1,material:1,texture:1,image:1});
    a.dispose();b.dispose();assert.equal(source.disposed.geometry,1);
});

test('eye view hides the tracked third-person mesh and restores it without changing shared geometry',async()=>{
    const e=await environment(),a=new e.Actor('alpha',new e.T.Group()),b=new e.Actor('alpha',new e.T.Group());
    function source(level){
        const result=e.source(level),base=result.scene.getObjectByName(level);
        base.skeleton.bones[0].name='LeftUpperArm';base.skeleton.bones[1].name='RightLowerArm';
        result.geometry.setAttribute('position',new e.T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,0,0,1,1,0,1,0,1,1],3));
        result.geometry.setAttribute('skinIndex',new e.T.Uint16BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],4));
        result.geometry.setAttribute('skinWeight',new e.T.Float32BufferAttribute(Array.from({length:24},(_,i)=>i%4===0?1:0),4));
        result.geometry.setIndex([0,1,2,3,4,5]);
        for(const name of ['Arms003Woods','Gloves001','longsleeves','Torso003Woods','Backpack','g_bishop_mask','Shoes']) {
            const mesh=base.clone();mesh.name=name;result.scene.add(mesh);
        }
        return result;
    }
    function verify(actor,enabled){
        const scene=actor.active.scene;
        for(const name of ['Arms003Woods','Gloves001','longsleeves','Torso003Woods','Backpack','g_bishop_mask','Shoes'])assert.equal(scene.getObjectByName(name).visible,!enabled,name);
        const arms=scene.getObjectByName('Arms003Woods');
        assert.deepEqual([...arms.geometry.index.array],[0,1,2,3,4,5]);
    }
    a.update(true,undefined,false,0,true);
    await e.resolve('low',source('low'));verify(a,true);verify(b,false);
    a.update();verify(a,false);
    a.update(true,undefined,false,0,true);
    const geometry=a.active.scene.getObjectByName('Arms003Woods').geometry;let disposed=0;
    geometry.addEventListener('dispose',()=>disposed++);
    a.update();verify(a,false);a.dispose();b.dispose();assert.equal(disposed,1);
});

test('loading applies the latest appearance and substitutes one basic shape without frame retries',async()=>{
 const e=await environment(),actor=new e.Actor('alpha',new e.T.Group());
 actor.update(false,0x00ff00,true,1250);
 await e.resolve('low',e.source('low'));
 const mesh=actor.active.scene.getObjectByName('low');
 assert.equal(mesh.material.color.g,1);assert.equal(mesh.material.color.r,0);assert.equal(mesh.material.opacity,.35);
 assert.equal(e.calls.length,1);assert.match(e.calls[0].url,/actors\/low\//);actor.dispose();
 const failed=new e.Actor('beta',new e.T.Group()),old=console.error;console.error=()=>{};
 try{e.request('low','beta').reject(Error('missing test asset'));await failed.ready;}finally{console.error=old;}
 for(let i=0;i<100;i++)assert.doesNotThrow(()=>failed.update(true,0x112233,true));
 assert.equal(e.calls.length,2);assert.equal(e.warnings.length,1);assert.match(e.warnings[0],/actor beta.*missing test asset/);
 const basic=failed.fallback;assert.equal(basic.isMesh,true);assert.equal(basic.material.opacity,.35);assert.equal(basic.userData.modelFallback.animated,false);
 let geometryDisposals=0,materialDisposals=0;basic.geometry.addEventListener('dispose',()=>geometryDisposals++);basic.material.addEventListener('dispose',()=>materialDisposals++);
 failed.dispose();failed.dispose();assert.equal(geometryDisposals,1);assert.equal(materialDisposals,1);
});

test('disposing before a request completes cannot attach or retain the late model',async()=>{
 const e=await environment(),parent=new e.T.Group(),actor=new e.Actor('alpha',parent);actor.dispose();actor.dispose();
 const late=e.source('late');await e.resolve('low',late);assert.equal(parent.children.length,0);
 assert.deepEqual(late.disposed,{geometry:1,material:1,texture:1,image:1});
});


test('unregistered actors retain identity and culling while reporting one visible shape',async()=>{
 const e=await environment(),parent=new e.T.Group(),actor=new e.Actor('unregistered',parent);await actor.ready;
 assert.equal(actor.descriptor.id,'unregistered');assert.ok(Number.isFinite(actor.cullingRadius)&&actor.cullingRadius>0);
 assert.equal(parent.children.length,1);assert.equal(parent.children[0].isMesh,true);
 for(let i=0;i<100;i++)actor.update();assert.equal(e.calls.length,0);assert.equal(e.warnings.length,1);
 actor.dispose();assert.equal(parent.children.length,0);
});

test('a rejected request after actor disposal cannot add a shape or log a stale warning',async()=>{
 const e=await environment(),parent=new e.T.Group(),actor=new e.Actor('alpha',parent);actor.dispose();
 e.request('low').reject(Error('late failure'));await flush();assert.equal(parent.children.length,0);assert.equal(e.warnings.length,0);
});

test('an empty actor scene is a failed resource and yields one visible basic shape',async()=>{
 const e=await environment(),parent=new e.T.Group(),actor=new e.Actor('alpha',parent);e.request('low').resolve({scene:new e.T.Group(),animations:[]});await actor.ready;
 assert.equal(parent.children.length,1);assert.equal(parent.children[0].userData.modelFallback.animated,false);assert.equal(e.warnings.length,1);assert.equal(actor.active,undefined);actor.dispose();
});

test('posed actor owns native transforms and attached skin binds without a second scene traversal',async()=>{
 const e=await environment(),parent=new e.T.Group(),hip=new e.T.Object3D(),head=new e.T.Object3D();
 hip.add(head);head.position.y=1;parent.add(hip);parent.updateMatrixWorld(true);
 const reference=new Map([['hip',hip.matrixWorld.clone().invert()],['head',head.matrixWorld.clone().invert()]]);
 const actor=new e.Actor('alpha',parent,{joints:{hip,head}},reference);
 await flush();await e.resolve('low',e.source('skin'));await actor.ready;
 const mesh=actor.active.scene.getObjectByName('skin');let traversals=0;
 assert.equal(mesh.skeleton.bones[0].visible,false,'bone-only branch excluded from draw traversal');
 assert.equal(mesh.visible,true);
 mesh.updateMatrixWorld=()=>{traversals++;throw Error('Unexpected renderer skin traversal')};
 for(const x of [0,3,-2]){
  parent.position.set(x,2,4);head.rotation.z=.4;actor.update();
  const before=mesh.skeleton.bones.map(b=>b.matrixWorld.clone());
  actor.active.scene.updateMatrixWorld(true);
  assert.equal(traversals,0);
  assert.ok(mesh.bindMatrixInverse.elements.every((v,i)=>Math.abs(v-mesh.matrixWorld.clone().invert().elements[i])<1e-9));
  for(let i=0;i<before.length;i++)assert.deepEqual(mesh.skeleton.bones[i].matrixWorld.elements,before[i].elements);
  mesh.skeleton.update();assert.ok(Number.isFinite(mesh.getVertexPosition(2,new e.T.Vector3()).x));
 }
 actor.dispose();
});
