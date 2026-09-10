// Assemble prepared Low terminal parts in their native prefab transforms.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const selection = require('./data/native-cyberdeck.json');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function prepareTerminal(source, rebuilt, output, manifest, packageGLB, readGLB, writeGLB) {
    const doc = {asset:{version:'2.0'}, scene:0, scenes:[{nodes:[0]}], nodes:structuredClone(selection.nodes),
        buffers:[{byteLength:0}], bufferViews:[], accessors:[], meshes:[], materials:[], textures:[], images:[], samplers:[], extensionsUsed:[], extensionsRequired:[]};
    const chunks = [], sources = [];
    for (const part of selection.parts) {
        const input = rebuilt.load(part.assetId, part.originalFile);
        const temporary = new Map();
        packageGLB(input.bytes, input.file, `environment/low/${selection.id}.glb`, temporary, undefined, source,input.images);
        const {doc: item, binary} = readGLB(temporary.get(`environment/low/${selection.id}.glb`));
        if (item.meshes.length !== 1 || !item.nodes.some(node => node.mesh === 0 && node.extras?.sourceMesh?.name === part.meshName) || item.skins?.length || item.animations?.length)
            throw Error('CyberDeck native part identity changed: ' + part.assetId);
        for (const [file, bytes] of temporary) if (file.startsWith('environment/textures/')) output.set(file, bytes);
        const offsets = Object.fromEntries(['bufferViews','accessors','meshes','materials','textures','images','samplers'].map(key => [key,doc[key].length]));
        const bufferMap = [0];
        for (const buffer of item.buffers.slice(1)) { bufferMap.push(doc.buffers.length); doc.buffers.push(buffer); }
        const bufferOffset = doc.buffers[0].byteLength;
        for (const view of item.bufferViews) {
            if (view.buffer === 0) view.byteOffset = (view.byteOffset ?? 0) + bufferOffset;
            view.buffer = bufferMap[view.buffer];
            const packed = view.extensions?.EXT_meshopt_compression;
            if (packed) {
                if (packed.buffer === 0) packed.byteOffset = (packed.byteOffset ?? 0) + bufferOffset;
                packed.buffer = bufferMap[packed.buffer];
            }
        }
        for (const accessor of item.accessors) {
            if (accessor.bufferView !== undefined) accessor.bufferView += offsets.bufferViews;
            for (const ref of [accessor.sparse?.indices,accessor.sparse?.values].filter(Boolean)) ref.bufferView += offsets.bufferViews;
        }
        for (const primitive of item.meshes[0].primitives) {
            if (primitive.indices !== undefined) primitive.indices += offsets.accessors;
            if (primitive.material !== undefined) primitive.material += offsets.materials;
            for (const attributes of [primitive.attributes,...(primitive.targets ?? [])])
                for (const key of Object.keys(attributes)) attributes[key] += offsets.accessors;
        }
        function textureReferences(value) {
            if (!value || typeof value !== 'object') return;
            for (const [key, child] of Object.entries(value)) {
                if (key.endsWith('Texture') && child?.index !== undefined) child.index += offsets.textures;
                else textureReferences(child);
            }
        }
        item.materials.forEach(textureReferences);
        for (const texture of item.textures ?? []) {
            if (texture.sampler !== undefined) texture.sampler += offsets.samplers;
            for (const ref of [texture,...Object.values(texture.extensions ?? {})]) if (ref.source !== undefined) ref.source += offsets.images;
        }
        for (const image of item.images ?? []) if (image.bufferView !== undefined) image.bufferView += offsets.bufferViews;
        doc.nodes[part.node].mesh = offsets.meshes;
        for (const key of Object.keys(offsets)) doc[key].push(...(item[key] ?? []));
        for (const key of ['extensionsUsed','extensionsRequired']) doc[key] = [...new Set([...doc[key],...(item[key] ?? [])])];
        chunks.push(binary); doc.buffers[0].byteLength += binary.length;
        sources.push({assetId:part.assetId, revision:input.row.sha256, sourceFile:input.row.file, originalFile:input.row.originalFile});
    }
    const bytes = writeGLB(doc, Buffer.concat(chunks));
    output.set(`environment/low/${selection.id}.glb`, bytes);
    manifest.models = manifest.models.filter(model => model.id !== selection.id);
    manifest.models.push({id:selection.id, source:selection.source, file:`low/${selection.id}.glb`, revision:hash(bytes),
        level:'low', defaultScale:[1,1,1], animations:[], parts:sources,
        triangles:doc.meshes.reduce((sum,mesh) => sum + mesh.primitives.reduce((n,p) => n + doc.accessors[p.indices].count / 3,0),0)});
    output.set('environment/manifest.json', Buffer.from(JSON.stringify(manifest,null,2)+'\n'));
}
module.exports = {prepareTerminal};

if (require.main === module) {
    if (process.argv.length !== 3) throw Error('Usage: node Tools/runtime-terminal-package.cjs <model-source-project>');
    const source = path.resolve(process.argv[2]), output = new Map();
    const {packageGLB,readGLB,writeGLB} = require('./runtime-model-package.cjs');
    const assets = path.resolve(__dirname,'../Viewer/assets/assets');
    prepareTerminal(source,require('./rebuilt-model-package.cjs').rebuiltModels(source),output,
        JSON.parse(fs.readFileSync(path.join(assets,'environment/manifest.json'))),packageGLB,readGLB,writeGLB);
    const receiptPath = path.join(assets,'model-resources.json'), receipt = JSON.parse(fs.readFileSync(receiptPath));
    for (const [file,bytes] of output) {
        fs.mkdirSync(path.dirname(path.join(assets,file)),{recursive:true}); fs.writeFileSync(path.join(assets,file),bytes);
        receipt.files = receipt.files.filter(row => row.path !== file);
        receipt.files.push({path:file,bytes:bytes.length,sha256:hash(bytes)});
    }
    fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
    console.log(JSON.stringify({files:output.size,bytes:[...output.values()].reduce((sum,b)=>sum+b.length,0)}));
}
