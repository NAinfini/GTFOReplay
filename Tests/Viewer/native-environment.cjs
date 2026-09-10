const fs = require('node:fs');

// Three's real GLTFLoader and AnimationMixer can validate geometry/rigging in Node.
// Texture decoding has a separate byte-and-dimension check in the extractor.
async function loadNativeGLTF(file) {
    const {GLTFLoader} = await import('../../Viewer/assets/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
    const {MeshoptDecoder} = await import('../../Viewer/assets/node_modules/three/examples/jsm/libs/meshopt_decoder.module.js');
    const raw = fs.readFileSync(file), length = raw.readUInt32LE(12);
    const doc = JSON.parse(raw.subarray(20, 20 + length)), binary = raw.subarray(28 + length);
    const original = structuredClone(doc);
    delete doc.images; delete doc.textures; delete doc.samplers;
    doc.extensionsUsed = (doc.extensionsUsed ?? []).filter(name => !name.startsWith('KHR_materials_') && name !== 'KHR_texture_basisu');
    doc.extensionsRequired = (doc.extensionsRequired ?? []).filter(name => !name.startsWith('KHR_materials_') && name !== 'KHR_texture_basisu');
    doc.materials = [{}];
    for (const mesh of doc.meshes ?? []) for (const primitive of mesh.primitives) primitive.material = 0;
    const json = Buffer.from(JSON.stringify(doc)), padded = Buffer.alloc((json.length + 3) & ~3, 32);
    json.copy(padded);
    const header = Buffer.alloc(20), binaryHeader = Buffer.alloc(8);
    header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4);
    header.writeUInt32LE(28 + padded.length + binary.length, 8);
    header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
    binaryHeader.writeUInt32LE(binary.length); binaryHeader.writeUInt32LE(0x004e4942, 4);
    const all = Buffer.concat([header, padded, binaryHeader, binary]);
    const gltf = await new Promise((resolve, reject) => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parse(
        all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength), '', resolve, reject));
    return {gltf, doc: original};
}
module.exports = {loadNativeGLTF};
