const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const ts = require('../../Viewer/assets/node_modules/typescript');
const THREE = require('../../Viewer/assets/node_modules/three');
function compile(file, dependencies) {
    const source = fs.readFileSync(`Viewer/assets/src/profiles/vanilla/${file}`, 'utf8');
    const code = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const module = {exports:{}};
    new Function('require','module','exports',code)(name => {assert.ok(name in dependencies, name);return dependencies[name];},module,module.exports);
    return module.exports;
}
test('recorded collision heights remain separate from navigation and old recordings remain readable', async () => {
    const parsers = new Map(); let heights = [-.6,-.5,-.7];
    const bits = {readByte:async()=>0,readUShort:async()=>3,readUInt:async()=>3,
        readVectorArrayAsFloat32:async()=>new Float32Array([0,0,0, 1,0,0, 0,0,1]),
        readUShortArray:async()=>[0,1,2],readFloat:async()=>heights.shift()};
    compile('parser/map/map.ts', {
        '@esm/@root/replay/bithelper.js':bits,
        '@esm/@root/replay/moduleloader.js':{ModuleLoader:{registerASLModule(){},registerHeader:(name,version,p)=>parsers.set(version,p)}},
        '../../library/factory.js':{Factory:()=>()=>new Map()},'../../library/floor-themes.js':{navigationSurfaceOffset:.1}
    });
    const geometry = new Map(),header={getOrDefault:()=>geometry};
    await parsers.get('0.0.3').parse({},header);
    await parsers.get('0.0.4').parse({},header);
    const [old,current] = geometry.get(0);
    assert.equal(old.supportHeights,undefined);
    assert.deepEqual([...current.vertices],[...old.vertices]);
    assert.ok(Math.abs(current.supportHeights[0]+.6)<1e-6);
    let init; const data = new Map(),scene = new THREE.Scene();
    compile('renderer/map/map.ts', {
        '@esm/three':THREE,'../../library/factory.js':{Factory:()=>()=>new Map()},
        '@esm/@root/replay/moduleloader.js':{ModuleLoader:{registerRender:(name,f)=>f(name,{getInitPasses:()=>[],setInitPasses:p=>init=p[0],getRenderLoop:()=>[],setRenderLoop(){}}),registerDispose(){}}}
    });
    init.pass({scene,set:(k,v)=>data.set(k,v)},header);
    assert.ok(Math.abs(data.get('Maps').get(0)[1].geometry.attributes.position.getY(0)+.1)<1e-6);
    assert.ok(Math.abs(data.get('NavigationFallback').get(0)[1].geometry.attributes.position.getY(0)+.6)<1e-6);
    heights=[NaN,0,0];await assert.rejects(parsers.get('0.0.4').parse({},header),/Non-finite/);
});
test('biotracker marker has an open centre and a visible red border',()=>{
    const source=fs.readFileSync('Viewer/assets/src/profiles/vanilla/renderer/enemy/lib.ts','utf8');
    const code=source.slice(source.indexOf('const tagGeometry'),source.indexOf('module.destructor'));
    const {geometry,material}=new Function('BufferGeometry','Float32BufferAttribute','MeshBasicMaterial','DoubleSide',code+';return {geometry:tagGeometry,material:tagMaterial};')(
        THREE.BufferGeometry,THREE.Float32BufferAttribute,THREE.MeshBasicMaterial,THREE.DoubleSide);
    const mesh=new THREE.Mesh(geometry,material),ray=new THREE.Raycaster();mesh.updateMatrixWorld();
    ray.set(new THREE.Vector3(0,.65,1),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(mesh).length,0);
    ray.set(new THREE.Vector3(0,.97,1),new THREE.Vector3(0,0,-1));assert.ok(ray.intersectObject(mesh).length>0);
    assert.equal(material.color.getHex(),0xff3b30);
});
test('a visible ping can render before its texture finishes loading',async()=>{
    let pass,resolveTexture;const texture=new Promise(resolve=>resolveTexture=resolve);
    class Text extends THREE.Object3D {material=new THREE.MeshBasicMaterial();}
    class Model {
        root=new THREE.Group();setVisible(value){this.root.visible=value;}isVisible(){return this.root.visible;}
        addToScene(scene){scene.add(this.root);}
    }
    compile('renderer/pings.ts',{
        '@esm/three':THREE,'@esm/troika-three-text':{Text},
        '../library/models/lib.js':{Model},'../library/modelloader.js':{loadTexture:()=>texture},
        '../datablocks/player/player.js':{getPlayerColor:()=>0xffffff},'../library/factory.js':{Factory:()=>()=>new Map()},
        '@esm/@root/replay/moduleloader.js':{ModuleLoader:{registerRender:(name,f)=>f(name,{getRenderLoop:()=>[],setRenderLoop:p=>pass=p[0].pass})}}
    });
    const models=new Map(),scene=new THREE.Scene(),camera={root:new THREE.PerspectiveCamera()};
    const pings=new Map([[1,{visible:true,dimension:0,position:new THREE.Vector3(),slot:0,style:'PlayerPingAmmo'}]]);
    const previous=Math.clamp01;Math.clamp01=value=>Math.max(0,Math.min(1,value));
    try{
        const render=()=>pass({scene,getOrDefault:()=>models,get:key=>key==='Camera'?camera:0},{time:()=>0,getOrDefault:()=>pings},0);
        assert.doesNotThrow(render);
        const quad=models.get(1).root.children.find(child=>child.isMesh);assert.equal(quad.visible,false);
        resolveTexture(new THREE.Texture());await new Promise(resolve=>setImmediate(resolve));
        assert.equal(quad.visible,true);assert.doesNotThrow(render);
    }finally{Math.clamp01=previous;}
});
