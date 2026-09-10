const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../Viewer/assets/node_modules/typescript');
const THREE = require('../../Viewer/assets/node_modules/three');
const root = path.resolve(__dirname, '../..');
const AsyncFunction = Object.getPrototypeOf(async function() {}).constructor;
const flush = () => new Promise(resolve => setImmediate(resolve));

async function compile(file, imports, globals = {}) {
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
        compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}
    }).outputText;
    const module = {exports: {}};
    await new AsyncFunction('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
        if (!(name in imports)) throw Error('Unexpected import: ' + name);
        return imports[name];
    }, module, module.exports, ...Object.values(globals));
    return module.exports;
}

test('modded terminal names and missing environment files retain positioned shapes across rendering and dimension switches', async () => {
    const warnings = [], disposals = [], passes = [], loads = [];
    const ModuleLoader = {reportWarning: message => warnings.push(message), registerDispose: fn => disposals.push(fn),
        registerRender(name, setup) { setup(name, {getRenderLoop: () => passes, setRenderLoop: next => { passes.splice(0, passes.length, ...next); }}); }};
    const common = {'@esm/three': THREE, '@esm/@root/replay/moduleloader.js': {ModuleLoader}};
    const basic = await compile('Viewer/assets/src/profiles/vanilla/renderer/models/basicModel.ts', common);
    const wrapper = await compile('Viewer/assets/src/profiles/vanilla/renderer/objectwrapper.ts', common);
    const environment = await compile('Viewer/assets/src/profiles/vanilla/renderer/map/environment.ts', {
        ...common, '../objectwrapper.js': wrapper, '../models/basicModel.js': basic,
        '../../library/models/lib.js': {isCulled:()=>false},
        '../../library/modelMaterials.js': {disposeModelMaterials() {}},
        '../../library/modelloader.js': {loadGLTF: async url => { loads.push(url); throw Error('Missing custom texture'); }}
    }, {fetch: async () => ({ok: true, json: async () => ({version: 1, models: [
        {id: 'terminal', file: 'low/terminal.glb', revision: 'fixture', defaultScale: [1,1,1], source: 'Terminal_Floor', animations: []}
    ]})})});
    for (const name of ['Terminal_Floor_TERMINAL_201_terminalKey: TERMINAL_201_Sync:9',
        'Terminal_Floor_GO_UID:350_TERMINAL_585_terminalKey: TERMINAL_585_Sync:5',
        'Terminal_Floor(Clone)_1_TERMINAL_102_terminalKey: TERMINAL_102_Sync:1'])
        assert.equal(environment.environmentAssetForPrefab(name), 'terminal');
    assert.equal(environment.environmentAssetForPrefab('Modded_Terminal_Floor_TERMINAL_201'), undefined);
    await compile('Viewer/assets/src/profiles/vanilla/renderer/map/terminal.ts', {
        ...common, '../../library/factory.js': {Factory: () => () => new Map()}, './environment.js': environment
    });
    const models = new Map(), terminals = new Map();
    for (const [id, modelName] of [[1, 'Custom_Rundown_Terminal(Clone)'], [2, 'Terminal_Floor(Clone)'], [3, '']])
        terminals.set(id, {id, modelName, dimension: 2, position: {x:id*3,y:4,z:5}, rotation: {x:0,y:0,z:0,w:1}, scale: {x:2,y:1,z:3}});
    let dimension = 2;
    const renderer = {scene: new THREE.Scene(), get: () => dimension, getOrDefault: () => models};
    const snapshot = {header: {getOrDefault: () => terminals}};
    passes[0].pass(renderer, snapshot);
    await Promise.all([...models.values()].map(model => model.ready));
    assert.equal(models.size, 3); assert.equal(loads.length, 1); assert.equal(warnings.length, 3);
    for (const [id, model] of models) {
        assert.equal(model.failed, true); assert.deepEqual(model.root.position.toArray(), [id*3,4,5]);
        assert.deepEqual(model.root.scale.toArray(), [2,1,3]);
        assert.equal(model.root.children.filter(child => child.isMesh).length, 1);
    }
    for (const value of [0,2,0,2]) {
        dimension = value; passes[0].pass(renderer, snapshot);
        assert.ok([...models.values()].every(model => model.root.visible === (value === 2)));
    }
    assert.equal(loads.length, 1); assert.equal(warnings.length, 3);
    disposals.forEach(dispose => dispose()); assert.equal(renderer.scene.children.length, 0);
});

test('navigation picking remains complete while fallback waits for native support classification', async () => {
    const init = [], dispose = [], loop = [];
    const ModuleLoader = {registerDispose: fn => dispose.push(fn), registerRender(name, setup) {
        setup(name, {getInitPasses: () => init, setInitPasses: next => init.push(...next),
            getRenderLoop: () => loop, setRenderLoop: next => loop.push(...next)});
    }};
    await compile('Viewer/assets/src/profiles/vanilla/renderer/map/map.ts', {
        '@esm/@root/replay/moduleloader.js': {ModuleLoader}, '@esm/three': THREE,
        '../../library/factory.js': {Factory: () => () => new Map()}
    });
    const data = new Map(), scene = new THREE.Scene();
    const renderer = {scene, set: (k,v) => data.set(k,v), get: k => data.get(k)};
    const source = {vertices: new Float32Array([-2,0,-2, -2,0,2, 2,0,-2]), indices: [0,1,2], themes: new Uint8Array([0])};
    init[0].pass(renderer, {getOrDefault: () => new Map([[0,[source]], [1,[source]]])});
    const ray = new THREE.Raycaster(new THREE.Vector3(0,3,0), new THREE.Vector3(0,-1,0));
    let disposed = 0;
    for (const dimension of [0,1]) {
        data.set('Dimension',dimension);
        const mesh = data.get('Maps').get(dimension)[0];
        assert.equal(mesh.parent,null); assert.equal(mesh.visible,false);
        assert.equal(ray.intersectObject(mesh).length,1);
        mesh.geometry.addEventListener('dispose',()=>disposed++);
        mesh.material.addEventListener('dispose',()=>disposed++);
    }
    assert.equal(loop.length,1); assert.equal(scene.children.length,2);
    loop[0].pass(renderer);assert.ok(scene.children.every(mesh=>!mesh.visible));
    data.set('NativeSurfaces',{navigationReady:true});data.set('Dimension',1);loop[0].pass(renderer);
    assert.equal(data.get('NavigationFallback').get(0)[0].visible,false);
    assert.equal(data.get('NavigationFallback').get(1)[0].visible,true);
    dispose.forEach(fn=>fn(renderer)); assert.equal(disposed,4);assert.equal(scene.children.length,0);
});

test('culled model subtrees skip automatic matrices, then restore correct world transforms on visibility',async()=>{
    const wrapper = await compile('Viewer/assets/src/profiles/vanilla/renderer/objectwrapper.ts', {'@esm/three':THREE});
    const {Model} = await compile('Viewer/assets/src/profiles/vanilla/library/models/lib.ts', {'@esm/three':THREE,'../../renderer/objectwrapper.js':wrapper});
    const scene=new THREE.Scene(),model=new Model(),bone=new THREE.Bone();
    scene.add(model.root); model.root.add(bone); model.root.position.x=4; bone.position.y=2;
    let calls=0; const update=bone.updateMatrixWorld.bind(bone); bone.updateMatrixWorld=(...args)=>{calls++;update(...args)};
    scene.updateMatrixWorld(true); assert.equal(calls,1);
    model.setVisible(false); model.root.position.x=9; bone.position.y=5;
    scene.updateMatrixWorld(true); assert.equal(calls,1);
    model.setVisible(true); scene.updateMatrixWorld(true); assert.equal(calls,2);
    assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld).toArray(),[9,5,0]);
    model.setVisible(false); bone.position.y=7;
    assert.deepEqual(bone.getWorldPosition(new THREE.Vector3()).toArray(),[9,7,0]);
});

test('unknown enemies and held/dropped items use real basic geometry and preserve transforms without animation assets', async () => {
    const warnings = [];
    const ModuleLoader = {reportWarning: message => warnings.push(message)};
    const common = {'@esm/three': THREE, '@esm/@root/replay/moduleloader.js': {ModuleLoader}};
    const basic = await compile('Viewer/assets/src/profiles/vanilla/renderer/models/basicModel.ts', common);
    const wrapper = await compile('Viewer/assets/src/profiles/vanilla/renderer/objectwrapper.ts', common);
    const lib = await compile('Viewer/assets/src/profiles/vanilla/library/models/lib.ts', {...common, '../../renderer/objectwrapper.js': wrapper});
    const items = await compile('Viewer/assets/src/profiles/vanilla/renderer/models/items.ts', {
        ...common, '../../library/models/lib.js': lib, './basicModel.js': basic,
        '../../library/constants.js': {zeroV: {x:0,y:0,z:0}, zeroQ: {x:0,y:0,z:0,w:1}}
    });
    for (const factory of [undefined, () => undefined, () => {throw Error('Custom gear model unavailable');}]) {
        const item = items.createItemModel(factory, 'modded-equipment');
        assert.ok(item instanceof items.BasicItemModel);
        item.inLevel(); item.reset(); item.render(0, 1000);
        assert.equal(item.root.children.filter(child => child.isMesh).length, 1);
        item.dispose();
    }
    const native = new items.ItemModel();
    assert.equal(items.createItemModel(() => native, 'registered-item'), native);
    const {BasicEnemyModel} = await compile('Viewer/assets/src/profiles/vanilla/renderer/enemy/models/basic.ts', {
        ...common, '../../../library/models/lib.js': lib, '../../models/basicModel.js': basic
    });
    const enemy = {type:{hash:'Enemy_99999'},scale:3,position:{x:4,y:5,z:6},rotation:{x:0,y:0,z:0,w:1}};
    const model = new BasicEnemyModel(enemy, 'Custom enemy model unavailable');
    assert.deepEqual(model.root.scale.toArray(), [3,3,3]);
    assert.equal(model.root.children.filter(child => child.isMesh).length, 1);
    for (const x of [8, -2, 4]) {
        model.render(0, 0, {...enemy, position:{x,y:5,z:6}});
        assert.deepEqual(model.root.position.toArray(), [x,5,6]);
    }
    assert.equal(warnings.length, 4); model.dispose();
});
