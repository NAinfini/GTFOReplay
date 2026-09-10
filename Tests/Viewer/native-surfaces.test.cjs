const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../Viewer/assets/node_modules/typescript');
const THREE = require('../../Viewer/assets/node_modules/three');
const root = path.resolve(__dirname, '../..');
const folder = path.join(root, 'Viewer/assets/assets/environment/architecture');
const catalog = JSON.parse(fs.readFileSync(path.join(folder, 'manifest.json')));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const identity = new THREE.Matrix4().elements;
const asset = catalog.models[0];

function compile(relative, dependencies, globals = {}) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const code = ts.transpileModule(source, {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
    const module = {exports: {}, src: relative};
    new Function('require', 'module', 'exports', ...Object.keys(globals), code)(name => {
        assert.ok(name in dependencies, name);
        return dependencies[name];
    }, module, module.exports, ...Object.values(globals));
    return module.exports;
}
const warnings = [];
function loader() { return {registerASLModule() {}, registerHeader() {}, registerRender() {}, registerDispose() {}, reportWarning(message) { warnings.push(message); }}; }
const {isCulled} = compile('Viewer/assets/src/profiles/vanilla/library/models/lib.ts', {
    '@esm/three': THREE, '../../renderer/objectwrapper.js': {ObjectWrapper: class {}, ModelGroup: THREE.Group}
});
function camera() {
    const root = new THREE.PerspectiveCamera(90, 1, .1, 1000);
    root.position.set(0, 0, 200); root.updateMatrixWorld(true);
    return {root, worldPosition: root.position.clone(), renderDistance: () => 1000,
        frustum: new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(root.projectionMatrix, root.matrixWorldInverse))};
}

test('delivered native floors and props have unique identities, exact Low hashes and shared textures', () => {
    assert.equal(catalog.version, 1);
    assert.equal(catalog.models.filter(model => model.kind === 'floor').length, JSON.parse(fs.readFileSync(path.join(root,'Tools/data/native-floors.json'))).length);
    assert.equal(catalog.models.filter(model => model.kind === 'prop').length, JSON.parse(fs.readFileSync(path.join(root,'Tools/data/native-props.json'))).length);
    assert.equal(new Set(catalog.models.map(model => JSON.stringify(model.capture))).size, catalog.models.length);
    const wedges = catalog.models.filter(model => model.capture.mesh === 'g_stairs_steps_wedge_c45_01');
    assert.deepEqual(wedges.map(model => model.capture.vertices).sort((a, b) => a - b), [178, 201]);
    for (const model of catalog.models) {
        assert.match(model.file, /^low\/architecture-[a-f0-9]{16}\.glb$/);
        const file = path.join(folder, model.file), bytes = fs.readFileSync(file);
        assert.equal(digest(bytes), model.revision);
        const doc = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
        assert.equal(doc.skins?.length ?? 0, 0); assert.equal(doc.nodes.length, 1);
        assert.equal(doc.animations?.length ?? 0, 0);
        for (const image of doc.images ?? []) {
            assert.match(image.uri, /^\.\.\/\.\.\/textures\/[a-f0-9]{64}\.(ktx2|webp)$/);
            assert.equal(digest(fs.readFileSync(path.resolve(path.dirname(file), image.uri))), path.parse(image.uri).name);
        }
    }
});

test('native surface parser preserves raw matrix columns and rejects corrupt identity/matrix data', async () => {
    let parse;
    const ModuleLoader = {...loader(), registerHeader(name, version, handler) { assert.equal(name, 'Vanilla.Map.NativeSurfaces'); parse = handler.parse; }};
    const BitHelper = Object.fromEntries(['Byte', 'UShort', 'UInt', 'Float', 'String'].map(type => ['read' + type, async data => data.shift()]));
    compile('Viewer/assets/src/profiles/vanilla/parser/map/native-surfaces.ts', {'@esm/@root/replay/bithelper.js': BitHelper, '@esm/@root/replay/moduleloader.js': {ModuleLoader}});
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(12, 3, -4), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .7), new THREE.Vector3(2, 1, 3)).elements;
    const values = (m = matrix, index = 0) => [0, 1, asset.id, asset.sourceRevision, 1, index, 2, 1, ...m];
    const header = new Map(); await parse(values(), header);
    assert.deepEqual(header.get('Vanilla.Map.NativeSurfaces')[0], {asset: asset.id, revision: asset.sourceRevision, dimension: 2, enabled: true, matrix});
    await assert.rejects(parse(values(), header), /Duplicate/);
    await assert.rejects(parse(values(matrix, 1), new Map()), /unknown/);
    await assert.rejects(parse(values([...matrix.slice(0, 15), Infinity]), new Map()), /affine/);
});

function rendererHarness(loadGLTF, fetch = async () => ({ok: true, json: async () => catalog}), moduleLoader = loader(), logger = console) {
    return compile('Viewer/assets/src/profiles/vanilla/renderer/map/native-surfaces.ts', {
        '@esm/@root/replay/moduleloader.js': {ModuleLoader: moduleLoader}, '@esm/three': THREE,
        '../../library/modelloader.js': {loadGLTF},
        './map.js': {},
        '../../library/models/lib.js': {isCulled},
        './navigation-fallback.js': compile('Viewer/assets/src/profiles/vanilla/renderer/map/navigation-fallback.ts', {'@esm/three':THREE}),
        '../../library/modelMaterials.js': {disposeModelMaterials(group) { group.traverse(object => { if (object.isMesh) object.material.dispose(); }); }}
    }, {fetch, console: logger});
}
test('old identity samples stay in diagnostics without toast spam; capture failures still warn', async () => {
    let init; const toasts = [], logs = [];
    rendererHarness(async () => { throw Error('No models expected'); }, undefined, {
        ...loader(), reportWarning: text => toasts.push(text),
        registerRender: (name, register) => register(name, {getInitPasses:()=>[],setInitPasses:p=>init=p[0].pass,getRenderLoop:()=>[],setRenderLoop(){}})
    }, {warn: text => logs.push(text)});
    const samples = ['Unmatched native floor identity: g_main; vertices=1085; materials=prop_electronics_kit_cableConnector_small',
        'Unmatched native floor identity: g_main; vertices=256; materials=prop_generic_beam_a_column_1m_tile_002'];
    const failure = 'Native floor capture failed; this recording retains basic navigation geometry.';
    const header = new Map([['Vanilla.Map.NativeSurfaces', []], ['Vanilla.Map.NativeSurfaceDiagnostics', [...samples, failure]]]);
    const data = new Map();
    init({scene:new THREE.Scene(), get:key=>data.get(key), set:(key,value)=>data.set(key,value)},header);
    await data.get('NativeSurfaces').ready;
    assert.deepEqual(logs,samples); assert.deepEqual(toasts,[failure]);
    assert.deepEqual(header.get('Vanilla.Map.NativeSurfaceDiagnostics'),[...samples,failure]);
    data.get('NativeSurfaces').dispose();
});
const surface = (matrix, dimension = 0) => ({asset: asset.id, revision: asset.sourceRevision, dimension, enabled: true, matrix: matrix.elements});

test('camera collision uses original instances even when rendering another dimension', async () => {
    const geometry = new THREE.BoxGeometry(2, 2, 1);
    const {NativeSurfaceModels} = rendererHarness(async () => () => new THREE.Group().add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial())));
    const models = new NativeSurfaceModels([surface(new THREE.Matrix4().makeTranslation(0, 0, -3))]);
    await models.ready;
    models.update(1, camera());
    assert.ok(models.root.children.every(mesh => !mesh.visible));
    const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), 0, 10);
    assert.equal(models.cameraDistance(ray, 0), 2.5);
    assert.equal(models.cameraDistance(ray, 1), 10);
    ray.set(new THREE.Vector3(0, 0, -6), new THREE.Vector3(0, 0, 1));
    assert.equal(models.cameraDistance(ray, 0), 2.5);
    models.dispose();
});

test('different recorded floor identities retain their own materials and source UVs', async () => {
    const selected = catalog.models.filter(model => model.kind === 'floor').slice(0, 2);
    const materials = selected.map(() => new THREE.MeshStandardMaterial({map: new THREE.Texture()}));
    const geometries = selected.map(() => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
    const {NativeSurfaceModels} = rendererHarness(async url => {
        const i = selected.findIndex(row => url.includes(row.file));
        assert.notEqual(i, -1);
        return () => new THREE.Group().add(new THREE.Mesh(geometries[i], materials[i]));
    });
    const instances = selected.map((row, i) => ({asset: row.id, revision: row.sourceRevision, enabled: true, dimension: 0, matrix: new THREE.Matrix4().makeTranslation(i * 4, 0, 0).elements}));
    const floors = new NativeSurfaceModels(instances); await floors.ready;
    for (let i = 0; i < selected.length; ++i) {
        const mesh = floors.root.children.find(mesh => mesh.name === 'Native floor ' + selected[i].id);
        assert.equal(mesh.material, materials[i]);
        assert.equal(mesh.geometry.getAttribute('uv'), geometries[i].getAttribute('uv'));
        assert.notEqual(mesh.material.map, materials[1 - i].map);
    }
    floors.dispose(); geometries.forEach(geometry => geometry.dispose());
});

test('unmatched floor identities and empty capture produce no substitute meshes', async () => {
    let loads = 0, fetches = 0;
    const {NativeSurfaceModels} = rendererHarness(async () => { ++loads; throw Error('Unexpected model request'); }, async () => { ++fetches; return {ok:true, json:async()=>catalog}; });
    for (const surfaces of [[], [{...surface(new THREE.Matrix4()), asset:'custom-rundown-floor'}], [{...surface(new THREE.Matrix4()), revision:'custom-material-revision'}]]) {
        const models = new NativeSurfaceModels(surfaces); await models.ready;
        assert.equal(models.root.children.length, 0);
        assert.doesNotThrow(() => {models.update(2, camera()); models.update(0, camera());});
        models.dispose();
    }
    assert.equal(loads, 0); assert.equal(fetches, 2);
});

test('native floor transforms, mirrored winding, dimension/cell batching and disposal use real Three objects', async () => {
    let loads = 0, materialDisposals = 0;
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 1, 1, 0, 0], 3)).setIndex([0, 1, 2]);
    const material = new THREE.MeshStandardMaterial(); material.addEventListener('dispose', () => ++materialDisposals);
    const {nativeSurfaceMatrix, NativeSurfaceModels} = rendererHarness(async () => { ++loads; return () => { const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, material)); return group; }; });
    const unity = new THREE.Matrix4().compose(new THREE.Vector3(5, 4, 3), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .8), new THREE.Vector3(2, 3, 4));
    const nativePoint = new THREE.Vector3(1, 2, 3), exported = nativePoint.clone().multiply(new THREE.Vector3(-1, 1, 1));
    const expected = nativePoint.clone().applyMatrix4(unity).multiply(new THREE.Vector3(-1, 1, 1));
    assert.ok(exported.applyMatrix4(nativeSurfaceMatrix(unity.elements)).distanceTo(expected) < 1e-6);
    const models = new NativeSurfaceModels([surface(new THREE.Matrix4()), surface(new THREE.Matrix4().makeTranslation(1, 0, 0)), surface(new THREE.Matrix4().makeTranslation(64, 0, 0)), surface(new THREE.Matrix4(), 1), surface(new THREE.Matrix4().makeScale(-1, 1, 1))]);
    await models.ready; models.update(0, camera());
    assert.equal(loads, 1); assert.equal(models.root.children.length, 3); // Separate spatial cells share a draw within their dimension and parity.
    assert.equal(models.root.children.filter(mesh => mesh.visible).length, 2);
    const mirrored = models.root.children.find(mesh => mesh.geometry !== geometry);
    assert.deepEqual(Array.from(mirrored.geometry.index.array), [0, 2, 1]);
    const instance = new THREE.Matrix4(); mirrored.getMatrixAt(0, instance); assert.ok(instance.determinant() > 0);
    assert.ok(models.root.children.every(mesh => !mesh.frustumCulled && mesh.boundingSphere.radius > 0));
    models.update(1, camera()); assert.equal(models.root.children.filter(mesh => mesh.visible).length, 1);
    models.dispose(); assert.equal(models.root.children.length, 0); assert.equal(materialDisposals, 1);
});

test('native floor load failures warn without substitute geometry, and disposal prevents late instances', async () => {
    const broken = rendererHarness(async () => { throw Error('missing Low texture'); }).NativeSurfaceModels;
    const failed = new broken([surface(new THREE.Matrix4())]); await failed.ready;
    assert.doesNotThrow(() => failed.update(0, camera())); assert.match(warnings.at(-1), /missing Low texture/); failed.dispose();
    let complete, factories = 0;
    const pending = rendererHarness(() => new Promise(resolve => { complete = resolve; })).NativeSurfaceModels;
    const models = new pending([surface(new THREE.Matrix4())]);
    for (let i = 0; i < 10 && !complete; ++i) await Promise.resolve();
    assert.ok(complete); models.dispose(); complete(() => { ++factories; return new THREE.Group(); });
    await models.ready; assert.equal(factories, 0); assert.equal(models.root.children.length, 0);
});

test('static rooms outside distance or view disappear and return immediately after a camera cut', async () => {
    const {NativeSurfaceModels} = rendererHarness(async () => () => {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(new THREE.BoxGeometry(8, 2, 8), new THREE.MeshStandardMaterial()));
        return group;
    });
    const models = new NativeSurfaceModels([-20, 20, -180].map(z => surface(new THREE.Matrix4().makeTranslation(0, 0, z))));
    await models.ready;
    const view = camera(); view.root.position.set(0, 0, 0); view.renderDistance = () => 100;
    const update = () => {
        view.root.updateWorldMatrix(true, false); view.worldPosition.setFromMatrixPosition(view.root.matrixWorld);
        view.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(view.root.projectionMatrix, view.root.matrixWorldInverse));
        models.update(0, view);
        return models.root.children.filter(mesh => mesh.visible).flatMap(mesh => Array.from({length:mesh.count}, (_,i) => {
            const matrix = new THREE.Matrix4(); mesh.getMatrixAt(i,matrix); return Math.round(matrix.elements[14]);
        }));
    };
    assert.deepEqual(update(), [-20]);
    view.root.rotation.y = Math.PI; assert.deepEqual(update(), [20]);
    view.root.position.z = -150; view.root.rotation.y = 0; assert.deepEqual(update(), [-180]);
    view.root.position.z = 0; assert.deepEqual(update(), [-20]);
    assert.equal(isCulled({x:0,y:0,z:-105}, 10, view), false, 'a large room overlapping the distance boundary stays visible');
    assert.ok(models.root.children.every(mesh => !mesh.matrixAutoUpdate && !mesh.matrixWorldAutoUpdate));
    models.dispose();
});

const source = process.env.GTFO_MODEL_SITE_ROOT ?? path.resolve(root, '../Infini-GTFO-Model-Site');
test('architecture importer rejects changed Original, changed Low and missing textures before installation', {skip: !fs.existsSync(path.join(source, 'artifacts/architecture-review/manifest.json'))}, () => {
    const {prepareArchitecture} = require('../../Tools/runtime-architecture-package.cjs');
    const {packageGLB} = require('../../Tools/runtime-model-package.cjs');
    const rebuilt = require('../../Tools/rebuilt-model-package.cjs').rebuiltModels(source);
    const originals = JSON.parse(fs.readFileSync(path.join(source, 'artifacts/architecture-review/manifest.json')));
    const original = originals.find(row => row.assetId === asset.id), low = rebuilt.row(asset.id);
    const read = fs.readFileSync;
    for (const target of [original.file, low.file, original.externalResources[0].file]) {
        fs.readFileSync = (file, ...args) => {
            const bytes = read(file, ...args);
            if (path.resolve(file) !== path.resolve(source, target)) return bytes;
            if (target.endsWith('.webp')) throw Error('ENOENT missing texture');
            const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1; return changed;
        };
        try { assert.throws(() => prepareArchitecture(source, new Map(), packageGLB, rebuilt), /Changed architecture source|Changed rebuilt input|ENOENT/); }
        finally { fs.readFileSync = read; }
    }
});


test('MLS layer indices cannot tint native concrete floors black', async () => {
    const concrete=catalog.models.find(m=>m.capture.mesh==='g_floor_a_4x4m');
    const {gltf,doc}=await require('./native-environment.cjs').loadNativeGLTF(path.join(folder,concrete.file));
    assert.equal(concrete.materialConversion.shader,'GTFO/Standard (MLS)');
    assert.deepEqual(concrete.materialConversion.ignoredVertexLayerIndices,['BP_Gardens_Concrete_Shared_01']);
    for(const primitive of doc.meshes[0].primitives) {
        assert.equal(primitive.attributes.COLOR_0,undefined);
        assert.ok(doc.materials[primitive.material].pbrMetallicRoughness.baseColorTexture);
        assert.ok(doc.materials[primitive.material].normalTexture);
    }
    gltf.scene.traverse(mesh=>{if(mesh.isMesh){assert.equal(mesh.geometry.getAttribute('color'),undefined);assert.ok(mesh.geometry.getAttribute('uv'));}});
    assert.equal(concrete.triangles,70);
});

test('Gardens soil preserves opaque albedo and native surface channels', async () => {
    const soil=catalog.models.find(m=>m.capture.mesh==='g_BP_Gardens_ForestGround_4x4M');
    const {gltf,doc}=await require('./native-environment.cjs').loadNativeGLTF(path.join(folder,soil.file));
    const material=doc.materials[0],pbr=material.pbrMetallicRoughness;
    assert.equal(material.alphaMode,'OPAQUE');
    assert.equal(pbr.roughnessFactor,1);assert.equal(pbr.metallicFactor,1);
    assert.ok(pbr.metallicRoughnessTexture);assert.ok(material.occlusionTexture);
    assert.deepEqual(soil.materialConversion.surfaceMaps[0].textures.map(t=>t.slot),['_MainTex','_MaskTex']);
    assert.equal(soil.triangles,623);
    // Pixel checks catch alpha premultiplication, even when GLB maps exist.
    const sharp=require('../../../Infini-GTFO-Model-Site/Tools/Models/Optimization/node_modules/sharp');
    const image=info=>path.resolve(folder,path.dirname(soil.file),doc.images[doc.textures[info.index].source].uri);
    const albedo=await sharp(image(pbr.baseColorTexture)).stats();
    assert.ok(albedo.isOpaque);assert.ok(albedo.channels[0].mean>70 && albedo.channels[0].mean<115);
    const orm=await sharp(image(pbr.metallicRoughnessTexture)).stats();
    assert.ok(orm.channels[1].mean>140 && orm.channels[1].mean<185);
    assert.equal(orm.channels[2].max,0);
});
