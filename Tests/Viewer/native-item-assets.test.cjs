const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Group, Object3D, Quaternion, Vector3 } = require('../../Viewer/assets/node_modules/three');
const root = path.resolve(__dirname, '../..');
const directory = path.join(root, 'Viewer/assets/assets/items');
const entries = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json')));
const resources = new Map(JSON.parse(fs.readFileSync(path.join(root, 'Viewer/assets/assets/model-resources.json'))).files.map(file => [file.path, file]));

function read(file) {
    const data = fs.readFileSync(path.join(directory, file));
    assert.equal(data.readUInt32LE(0), 0x46546c67);
    assert.equal(data.readUInt32LE(8), data.length);
    return JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)));
}

function hierarchy(doc) {
    const nodes = doc.nodes.map(node => {
        const object = new Object3D();
        object.name = node.name;
        if (node.translation) object.position.fromArray(node.translation);
        if (node.rotation) object.quaternion.fromArray(node.rotation);
        if (node.scale) object.scale.fromArray(node.scale);
        if (node.matrix) { object.matrix.fromArray(node.matrix); object.matrix.decompose(object.position, object.quaternion, object.scale); }
        return object;
    });
    doc.nodes.forEach((node, i) => node.children?.forEach(child => nodes[i].add(nodes[child])));
    const root = new Group();
    doc.scenes[doc.scene ?? 0].nodes.forEach(i => root.add(nodes[i]));
    root.updateMatrixWorld(true);
    return root;
}

test('all installed item wrists match their native held hierarchy', () => {
    let count = 0;
    for (const entry of entries) {
        if (!entry.heldFile) { assert.equal(entry.rightHandGrip, null); continue; }
        const scene = hierarchy(read(entry.heldFile));
        for (const [name, grip] of [['RightHand', entry.rightHandGrip], ['LeftHand', entry.leftHandGrip]]) {
            if (grip === null) continue;
            const node = scene.getObjectByName(name);
            assert.ok(node, `${entry.id} lost ${name}`);
            assert.ok(node.getWorldPosition(new Vector3()).distanceTo(new Vector3().copy(grip.pos)) < 1e-5, `${entry.id}/${name} position`);
            assert.ok(node.getWorldQuaternion(new Quaternion()).normalize().angleTo(new Quaternion().copy(grip.rot).normalize()) < 1e-5, `${entry.id}/${name} rotation`);
        }
        ++count;
    }
    assert.ok(count >= 26);
});

test('native item archive mapping is exact and source variants remain distinct', () => {
    const ids = new Map();
    for (const entry of entries) {
        for (const id of entry.itemIds) { assert.ok(!ids.has(id)); ids.set(id, entry); }
        assert.equal(entry.assetId, entry.id === 'artifact-muted' ? 'item-122' : entry.id);
        assert.ok(entry.rootTransformPolicy.includes('root translation'));
        assert.equal(entry.lods, undefined);
        for (const file of [entry.file, entry.heldFile]) {
            if (!file) continue;
            assert.ok(file.startsWith('low/'));
            const resource = resources.get('items/' + file);
            assert.ok(resource, `${entry.id}: missing delivery receipt`);
            assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(directory, file))).digest('hex'), resource.sha256);
        }
    }
    assert.equal(ids.size, 61);
    assert.notEqual(ids.get(114).file, ids.get(174).file);
    assert.notEqual(ids.get(137).file, ids.get(170).file);
    for (const id of [27, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94]) {
        const entry = ids.get(id), doc = read(entry.file);
        assert.equal(entry.heldFile, null);
        assert.equal(doc.skins?.length ?? 0, 0);
        assert.equal(doc.animations?.length ?? 0, 0);
    }
    const hsu = read(ids.get(170).file);
    assert.ok(hsu.meshes.some(mesh => mesh.primitives.some(p => p.targets?.length === 5)));
    assert.ok(hsu.animations.some(clip => clip.channels.some(channel => channel.target.path === 'weights')));
});

test('booster artifacts share the textured 256-triangle Muted Low pickup', () => {
    const artifact = entries.find(entry => entry.itemIds.includes(152));
    assert.equal(artifact.id, 'artifact-muted');
    assert.equal(artifact.triangles, 256);
    assert.equal(artifact.heldFile, null);
    const doc = read(artifact.file);
    assert.equal(doc.meshes.length, 1);
    assert.equal(doc.meshes[0].name, 'g_artifact_shape_a');
    assert.ok(doc.materials.some(material => material.pbrMetallicRoughness?.baseColorTexture));
    assert.equal(doc.nodes.length, 3); // Only the active hierarchy, no debug cube.
    assert.ok(doc.nodes[0].translation[1] > .07 && doc.nodes[0].translation[1] < .09);
    assert.ok(doc.nodes[0].scale[0] > 1.42); // Native Muted placement, not the small commodity's .7 scale.
    for (const image of doc.images) assert.match(image.uri, /^\.\.\/textures\/[a-f0-9]{64}\.ktx2$/);
    assert.ok(!entries.some(entry => entry.id === 'artifact-bold' || entry.id === 'artifact-aggressive'));
});
