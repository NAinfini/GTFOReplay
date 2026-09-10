// Consume the model project's completed native rebuild; never author or reduce meshes here.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function rebuiltModels(source, published) {
    source = path.resolve(source);
    const inside = relative => {
        const file = path.resolve(source, relative);
        if (!file.startsWith(source + path.sep)) throw Error('Rebuilt input leaves source project: ' + relative);
        return file;
    };
    const read = relative => fs.readFileSync(inside(relative));
    const manifestBytes = read('artifacts/rebuilt-models/manifest.json');
    const validationBytes = read('artifacts/rebuilt-models/packed-validation.json');
    const completion = JSON.parse(read('artifacts/rebuilt-models/completion.json'));
    const rows = JSON.parse(manifestBytes), validation = JSON.parse(validationBytes);
    if (completion.passed !== true || validation.passed !== true || validation.phase !== 'packed' ||
        completion.manifestSha256 !== hash(manifestBytes) || completion.validationSha256 !== hash(validationBytes))
        throw Error('The native model rebuild has not passed complete validation.');
    const receipt = Object.fromEntries(['manifestSha256','validationSha256','pipelineRevision'].map(key => [key,completion[key]]));
    if (published && Object.keys(receipt).some(key => published[key] !== receipt[key])) throw Error('Runtime does not match the validated native rebuild.');
    const models = new Map(), families = new Map();
    for (const row of rows) {
        if (!row || !['low','mid','high'].includes(row.level) || row.id !== row.assetId + '-' + row.level || models.has(row.id) ||
            row.algorithm !== 'blender-native-decimate' || row.geometryMethod !== (row.library === 'actor' ? 'native-actor' : 'original-glb') ||
            row.pipelineRevision !== completion.pipelineRevision || row.inputFile !== row.originalFile || row.inputSha256 !== row.originalSha256 ||
            !row.file.startsWith('artifacts/rebuilt-models/models/') || row.originalFile.startsWith('artifacts/rebuilt-models/') ||
            !Number.isInteger(row.triangles) || row.triangles < 1 || !Number.isInteger(row.fileBytes) || row.fileBytes < 1 || !Array.isArray(row.textures))
            throw Error('Invalid native rebuild provenance: ' + row?.id);
        models.set(row.id, row);
        if (!families.has(row.assetId)) families.set(row.assetId, new Set());
        families.get(row.assetId).add(row.level);
    }
    if (rows.length !== completion.variants || families.size !== completion.families || validation.variants !== rows.length ||
        validation.families !== families.size || [...families.values()].some(levels => levels.size !== 3))
        throw Error('Incomplete native rebuild families.');
    function readVerified(relative, expected, size) {
        const bytes = read(relative);
        if (!/^[a-f0-9]{64}$/.test(expected ?? '') || (size !== undefined && bytes.length !== size) ||
            hash(bytes) !== expected) throw Error('Changed rebuilt input: ' + relative);
        return bytes;
    }
    return {
        receipt,
        row(id, level = 'low') {
            const row = models.get(id + '-' + level);
            if (!row) throw Error('Missing validated native rebuild: ' + id + '/' + level);
            return row;
        },
        load(id, expectedOriginal) {
            const row = this.row(id);
            if (expectedOriginal && row.originalFile !== expectedOriginal) throw Error('Unexpected native Original: ' + id);
            readVerified(row.originalFile, row.originalSha256);
            const bytes = readVerified(row.file, row.sha256, row.fileBytes);
            const images = new Map();
            for (const texture of row.textures) {
                if (texture.file !== 'artifacts/rebuilt-models/textures/' + texture.sha256 + '.ktx2') throw Error('Invalid rebuilt texture path: ' + texture.file);
                images.set(inside(texture.file), readVerified(texture.file, texture.sha256, texture.bytes));
            }
            return { row, file: inside(row.file), bytes, images };
        }
    };
}
module.exports = { rebuiltModels };
