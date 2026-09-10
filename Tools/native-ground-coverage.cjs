const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const sourceManifests = ['architecture-review', 'native-gap-review', 'remaining-static-review', 'remaining-auxiliary-review', 'remaining-skinned-review'];
// Candidate discovery is intentionally broader than rendering selection. A mesh
// name or a website category cannot veto prefab/material evidence of a floor.
function isGroundCandidate(row) {
    return /^architecture-(floors|terrain|stairs|platforms)$/.test(row.category) ||
        /ground|floor|terrain|stair|platform|ramp|catwalk|walkway|slope|bridge|cliff|bedrock|sand|dirt|rock|slab|gravel/i.test([
            row.source.name, ...(row.source.hierarchy ?? []), ...(row.materials ?? []).map(material => material?.name ?? '')
        ].join(' '));
}
function evidenceRevision(row) {
    return crypto.createHash('sha256').update(JSON.stringify([row.sourceRevision, row.category, row.source, row.materials])).digest('hex');
}
function validateGroundCoverage(originals, selected, coverage) {
    const reviewed = new Map(coverage.entries.map(row => [row.id, row]));
    if (reviewed.size !== coverage.entries.length) throw Error('Duplicate ground review entries');
    const pins = new Map(selected.map(row => [row.asset_id, row]));
    const candidates = originals.filter(isGroundCandidate);
    for (const row of candidates) {
        const entry = reviewed.get(row.assetId);
        if (!entry || entry.evidenceRevision !== evidenceRevision(row)) throw Error('Native ground requires review: ' + row.assetId + ' (' + row.source.name + ')');
        if (entry.excluded) {
            if (entry.excluded.startsWith('redundant native LOD') && (!entry.replacedBy || !pins.has(entry.replacedBy))) throw Error('Excluded LOD has no captured base model: ' + row.assetId);
            if (entry.kind || pins.has(row.assetId)) throw Error('Excluded ground is selected: ' + row.assetId);
        } else {
            const pin = pins.get(row.assetId);
            if (!pin || pin.kind !== entry.kind || pin.source_revision !== row.sourceRevision) throw Error('Reviewed ground missing from capture catalog: ' + row.assetId);
        }
    }
    if (candidates.length !== reviewed.size) throw Error('Stale ground review entries; reconcile the source catalog');
    return candidates.length;
}
function readOriginals(source) {
    return sourceManifests.flatMap(folder => JSON.parse(fs.readFileSync(path.join(source, 'artifacts', folder, 'manifest.json'), 'utf8')));
}
module.exports = { sourceManifests, isGroundCandidate, evidenceRevision, validateGroundCoverage, readOriginals };
