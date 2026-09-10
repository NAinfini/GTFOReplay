// Assemble prepared Low meshes with the vanilla pickup transforms. No mesh extraction.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {readGLB, writeGLB, packageGLB} = require('./runtime-model-package.cjs');
const selected = require('./data/native-artifacts.json');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function prepareArtifacts(source, rebuilt, output, items) {
    const catalog = items.filter(item => !selected.some(row => row.id === item.id));
    for (const row of selected) {
        const input = rebuilt.load(row.assetId, row.originalFile);
        const {doc, binary} = readGLB(input.bytes);
        if (doc.meshes.length !== 1 || doc.meshes[0].name !== row.sourceMesh.name || doc.skins?.length || doc.animations?.length ||
            JSON.stringify(doc.materials.map(material => material.name)) !== JSON.stringify(row.materials.map(material => material.name)))
            throw Error('Artifact mesh/material identity changed: ' + row.id);
        // Muted shares its mesh/materials with commodity 122, but not its prefab
        // scale or placement. All booster categories deliberately share this appearance.
        doc.nodes = structuredClone(row.nodes);
        doc.nodes.forEach((node, index) => {
            if (index + 1 < doc.nodes.length) node.children = [index + 1];
            else node.mesh = 0;
        });
        doc.scenes = [{nodes:[0]}]; doc.scene = 0;
        const packed = packageGLB(writeGLB(doc, binary), input.file, `items/low/${row.id}.glb`, output, undefined, source,input.images);
        catalog.push({id:row.id, name:'Artifact', itemIds:[152], assetId:row.assetId,
            rootTransformPolicy:'Discard prefab editor root translation; retain active Muted pickup transforms; Unity X reflection.',
            sourceRevision:input.row.originalSha256, sourceFile:input.row.file, sourceSha256:input.row.sha256, level:'low', ...packed, heldFile:null, rightHandGrip:null, leftHandGrip:null});
    }
    output.set('items/manifest.json', Buffer.from(JSON.stringify(catalog, null, 2) + '\n'));
}
module.exports = {prepareArtifacts};

if (require.main === module) {
    if (process.argv.length !== 3) throw Error('Usage: node Tools/runtime-artifact-package.cjs <model-source-project>');
    const {rebuiltModels} = require('./rebuilt-model-package.cjs');
    const source = path.resolve(process.argv[2]), output = new Map();
    const assets = path.resolve(__dirname, '../Viewer/assets/assets');
    prepareArtifacts(source, rebuiltModels(source), output, JSON.parse(fs.readFileSync(path.join(assets, 'items/manifest.json'))));
    const receiptPath = path.join(assets, 'model-resources.json'), receipt = JSON.parse(fs.readFileSync(receiptPath));
    for (const [relative, bytes] of output) {
        const file = path.join(assets, relative);
        fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, bytes);
        receipt.files = receipt.files.filter(row => row.path !== relative);
        receipt.files.push({path:relative, bytes:bytes.length, sha256:hash(bytes)});
    }
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({files:output.size, bytes:[...output.values()].reduce((sum, bytes) => sum + bytes.length, 0)}));
}
