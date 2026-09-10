// Import the explicitly reviewed floor set; mesh authoring remains in the model project.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function inside(root, relative) {
    const file = path.resolve(root, relative);
    if (!file.startsWith(path.resolve(root) + path.sep)) throw Error('Architecture path leaves source project: ' + relative);
    return file;
}
function metadata(bytes) {
    if (bytes.length < 28 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid architecture GLB');
    return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
}
function readVerified(source, row, revision = row.sha256) {
    const bytes = fs.readFileSync(inside(source, row.file));
    if (!revision || hash(bytes) !== revision) throw Error('Changed architecture source: ' + row.file);
    return bytes;
}
function prepareArchitecture(source, output, packageGLB, rebuilt) {
    const {writeGLB, readGLB} = require('./runtime-model-package.cjs');
    const read = relative => JSON.parse(fs.readFileSync(inside(source, relative)));
    const ground = require('./native-ground-coverage.cjs');
    const sourceRows = ground.readOriginals(source);
    const originals = new Map(sourceRows.map(row => [row.assetId, row]));
    const selected = ['floor', 'prop'].flatMap(kind => JSON.parse(fs.readFileSync(path.join(__dirname, `data/native-${kind}s.json`), 'utf8')).map(row => ({...row, kind})));
    const coverage = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/native-ground-coverage.json'), 'utf8'));
    ground.validateGroundCoverage(sourceRows, selected, coverage);
    const models = [], identities = new Set(), materialCache = new Map();
    for (const candidate of selected.sort((a, b) => a.asset_id.localeCompare(b.asset_id))) {
        const original = originals.get(candidate.asset_id);
        // Reviewed pins own runtime role. Website categories cannot override the
        // prefab/material evidence checked by the mandatory ground review.
        if (!original || original.sourceRevision !== candidate.source_revision) throw Error('Missing or stale reviewed native architecture: ' + candidate.asset_id);
        // Only the Original JSON metadata is interpreted; Original geometry never enters output.
        const native = metadata(readVerified(source, original, candidate.source_revision));
        const prepared = rebuilt.load(candidate.asset_id, original.file);
        if(prepared.row.originalSha256!==candidate.source_revision)throw Error('Rebuilt architecture Original differs from its recording identity: '+candidate.asset_id);
        let bytes = prepared.bytes;
        const doc = metadata(bytes);
        if ((doc.skins?.length ?? 0) || (doc.animations?.length ?? 0) || doc.nodes.length !== 1 || doc.nodes[0].mesh !== 0 || doc.nodes[0].matrix || doc.nodes[0].translation || doc.nodes[0].rotation || doc.nodes[0].scale || doc.meshes.length !== 1) throw Error('Expected static mesh-local architecture: ' + candidate.asset_id);
        const positions = new Set(native.meshes.flatMap(mesh => mesh.primitives.map(primitive => primitive.attributes.POSITION)));
        if (positions.size !== 1) throw Error('Ambiguous native vertex identity: ' + candidate.asset_id);
        const capture = { mesh: original.source.name, vertices: native.accessors[[...positions][0]].count, materials: original.materials.map(material => material?.name ?? null) };
        if (!capture.mesh || !Number.isInteger(capture.vertices) || !capture.materials.some(name => name)) throw Error('Incomplete native identity: ' + candidate.asset_id);
        const key = JSON.stringify(capture);
        if (identities.has(key)) throw Error('Duplicate native renderer identity: ' + candidate.asset_id);
        identities.add(key);
        for (const resource of original.externalResources ?? []) readVerified(source, resource);
        // MLS vertex channels select native material layers; they are not an
        // RGB tint. glTF COLOR_0 would multiply those indices into the albedo
        // (e.g. [15,0,0,255] turns a concrete floor nearly black).
        const materialSources = (original.sourceSupplementFiles ?? []).filter(file => /\/materials\/.*\.json$/.test(file)).map(read);
        const mls = new Set(materialSources.filter(material => material.shaderName === 'GTFO/Standard (MLS)').map(material => material.source.name));
        const convertedMaterials = new Set();
        const surfaceMaps=[];
        for (const material of doc.materials) {
            const nativeMaterial=materialSources.find(row=>row.shaderName==='GTFO/Standard (MLS)' && row.source.name===material.name);
            if(!nativeMaterial)continue;
            const key=JSON.stringify(nativeMaterial);
            if(!materialCache.has(key))materialCache.set(key,JSON.parse(require('node:child_process').execFileSync(process.execPath,[path.join(__dirname,'runtime-mls-material.cjs')],{
                input:JSON.stringify({source:path.resolve(source),material:nativeMaterial,supplements:original.sourceSupplementFiles}),maxBuffer:16*1024*1024,windowsHide:true
            })));
            const converted=materialCache.get(key),pbr=material.pbrMetallicRoughness;
            function texture(payload) {
                const image=doc.images.length;doc.images.push({uri:'data:image/webp;base64,'+payload});
                const index=doc.textures.length;doc.textures.push({source:image,sampler:doc.textures[pbr.baseColorTexture.index].sampler});
                return {index};
            }
            if(converted.albedo)pbr.baseColorTexture={...pbr.baseColorTexture,...texture(converted.albedo)};
            if(converted.orm){pbr.metallicRoughnessTexture=texture(converted.orm);pbr.metallicFactor=1;pbr.roughnessFactor=1;material.occlusionTexture={...pbr.metallicRoughnessTexture,strength:nativeMaterial.floats._OcclusionStrength??1};}
            material.alphaMode='OPAQUE';
            surfaceMaps.push({material:material.name,textures:converted.provenance});
        }
        for (const primitive of doc.meshes[0].primitives) {
            const material = doc.materials[primitive.material];
            if (mls.has(material.name) && primitive.attributes.COLOR_0 !== undefined) {
                delete primitive.attributes.COLOR_0;
                convertedMaterials.add(material.name);
            }
        }
        if (convertedMaterials.size || surfaceMaps.length) bytes = writeGLB(doc,readGLB(bytes).binary);
        const packed = packageGLB(bytes, prepared.file, `environment/architecture/low/${candidate.asset_id}.glb`, output, undefined, source, prepared.images);
        models.push({ id: candidate.asset_id, kind: candidate.kind, file: packed.file.replace(/^architecture\//, ''), revision: packed.revision, sourceRevision: candidate.source_revision, sourceFile:prepared.row.file, sourceSha256:prepared.row.sha256, triangles: packed.triangles, capture,
            ...(convertedMaterials.size || surfaceMaps.length ? {materialConversion:{shader:'GTFO/Standard (MLS)', ignoredVertexLayerIndices:[...convertedMaterials],surfaceMaps}} : {}) });
    }
    // Persisted recordings may still reference deliberately removed scenery.
    // These are explicit display exclusions, not missing floor resources.
    const excluded = coverage.entries.filter(row => row.excluded?.startsWith('viewer scenery:')).map(row => row.id);
    const catalog = { version: 1, coordinateSystem: 'mesh-local-reflected-x', models, excluded };
    output.set('environment/architecture/manifest.json', Buffer.from(JSON.stringify(catalog, null, 2)));
    return catalog;
}
module.exports = { prepareArchitecture };
