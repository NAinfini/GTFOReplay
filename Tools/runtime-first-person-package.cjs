// Package the game's prepared FPS arms and sampled FPS controller states.
const {nativePlayerSamples} = require('./runtime-hand-package.cjs');
const {packageGLB, readGLB, writeGLB} = require('./runtime-model-package.cjs');
const path = require('node:path');

function prepareWeaponView(source, output) {
    const bytes = require('node:fs').readFileSync(path.join(source,'Runtime/player-animations/weapon-view.json'));
    const data=JSON.parse(bytes);
    if(data.version!==1 || !data.source?.sha256 || !data.wristOffsets || !data.bendGoals || !data.player?.cameraHeight) throw Error('Invalid native weapon-view package');
    for(const state of Object.values(data.states)) {
        const clip=data.clips[state.clip];
        if(!clip || !clip.times.length || !clip.sha256) throw Error('Missing native weapon movement clip');
        for(const values of Object.values(clip.tracks)) if(values.length!==clip.times.length) throw Error('Weapon movement track length differs');
    }
    for(const reload of Object.values(data.reloads)) for(const event of reload.events)
        if(!data.states[event.state]) throw Error('Unknown native weapon movement state '+event.state);
    output.set('player-animations/weapon-view.json',bytes);
}

// Keep the prepared Low garment and its skin, without shipping the rest of the
// character or its animation buffers. Meshopt payloads remain byte-identical.
function garment(bytes, name) {
    const {doc, binary} = readGLB(bytes);
    // Blender's mesh datablock names are implementation details (e.g. .002).
    // The native render node retains the game's stable garment identity.
    const meshes = new Set(doc.nodes.filter(node => node.name === name && node.mesh !== undefined).map(node => node.mesh));
    if (meshes.size !== 1) throw Error('Missing unique native Low garment: ' + name);
    const mesh = [...meshes][0];
    const selected = doc.meshes[mesh], skins = new Map();
    for (const node of doc.nodes) {
        if (node.mesh === mesh) {
            node.mesh = 0;
            if (!skins.has(node.skin)) skins.set(node.skin, skins.size);
            node.skin = skins.get(node.skin);
        } else { delete node.mesh; delete node.skin; }
    }
    doc.meshes = [selected];
    doc.skins = [...skins.keys()].map(index => doc.skins[index]);
    delete doc.animations;
    const accessors = [], indices = new Map();
    const retain = index => {
        if (!indices.has(index)) { indices.set(index, accessors.length); accessors.push(doc.accessors[index]); }
        return indices.get(index);
    };
    for (const primitive of selected.primitives) {
        primitive.indices = retain(primitive.indices);
        for (const key of Object.keys(primitive.attributes)) primitive.attributes[key] = retain(primitive.attributes[key]);
    }
    for (const skin of doc.skins) skin.inverseBindMatrices = retain(skin.inverseBindMatrices);
    doc.accessors = accessors;
    const views = [], mapping = new Map(), chunks = []; let offset = 0;
    const viewIndex = index => {
        if (mapping.has(index)) return mapping.get(index);
        const view = structuredClone(doc.bufferViews[index]);
        const payload = view.extensions?.EXT_meshopt_compression ?? view;
        if (payload.buffer !== 0) throw Error('Expected embedded Low mesh payload');
        const data = binary.subarray(payload.byteOffset ?? 0, (payload.byteOffset ?? 0) + payload.byteLength);
        payload.byteOffset = offset;
        const padding = Buffer.alloc((-data.length) & 3);
        chunks.push(data, padding); offset += data.length + padding.length;
        mapping.set(index, views.length); views.push(view); return views.length - 1;
    };
    for (const accessor of accessors) {
        if (accessor.bufferView !== undefined) accessor.bufferView = viewIndex(accessor.bufferView);
        for (const value of Object.values(accessor.sparse ?? {})) if (value?.bufferView !== undefined) value.bufferView = viewIndex(value.bufferView);
    }
    const materials = new Map();
    for (const primitive of selected.primitives) {
        if (!materials.has(primitive.material)) materials.set(primitive.material, materials.size);
        primitive.material = materials.get(primitive.material);
    }
    doc.materials = [...materials.keys()].map(index => doc.materials[index]);
    doc.bufferViews = views; doc.buffers[0].byteLength = offset;
    return {doc, binary:Buffer.concat(chunks)};
}

function prepareFirstPerson(source, rebuilt, output) {
    prepareWeaponView(source,output);
    const samples = nativePlayerSamples(source);
    // Modern FPSBody_genericRigForClothes uses the same modular garments as the
    // player rig. Use their prepared arm-only meshes with the already baked game
    // clothing materials; the obsolete FPSBody_Character_a has a different avatar.
    const clothing = rebuilt.load('bishop','artifacts/actor-lod-review/original/bishop.glb');
    const palette = readGLB(clothing.bytes).doc;
    const models = [];
    for (const [name, mesh] of [['arms', 'longsleeves'], ['gloves', 'Gloves001']]) {
        const input = clothing;
        const {doc,binary} = garment(input.bytes, mesh);
        doc.images=[]; doc.textures=[]; doc.samplers=palette.samplers;
        doc.materials = doc.materials.map(original => {
            const prepared = palette.materials.find(material => material.name === original.name);
            if (!prepared?.pbrMetallicRoughness?.baseColorTexture) throw Error('Missing baked clothing material: ' + original.name);
            const material = structuredClone(prepared);
            for (const field of [material.pbrMetallicRoughness.baseColorTexture,material.pbrMetallicRoughness.metallicRoughnessTexture,material.normalTexture,material.occlusionTexture,material.emissiveTexture].filter(Boolean)) {
                const texture = structuredClone(palette.textures[field.index]);
                for (const ref of [texture,...Object.values(texture.extensions??{})]) if (ref.source !== undefined) {
                    const image = structuredClone(palette.images[ref.source]);
                    if (!image.uri || image.bufferView !== undefined) throw Error('Expected prepared external game texture.');
                    image.uri = path.relative(path.dirname(input.file),path.resolve(path.dirname(clothing.file),image.uri)).split(path.sep).join('/');
                    ref.source=doc.images.length;doc.images.push(image);
                }
                field.index=doc.textures.length;doc.textures.push(texture);
            }
            return material;
        });
        const asset = packageGLB(writeGLB(doc,binary), input.file, `actors/first-person/${name}.glb`, output, undefined, source,input.images);
        models.push({id:`first-person-${name}`, name, group:'first-person', radius:2, sourceRevision:input.row.inputSha256, model:{...asset,radius:2}});
    }
    const states = {
        shoulder:'fps_shoulder_pose', hacking:'hackingtool_idle', scanner:'motion_scanner_idle',
        glue:'glue_gun_idle', mine:'TripMine', grenade:'grenade_idle', glowstick:'glowstick_idle',
        hammerIdle:'MeleeSledgehammer.sledgehammer_idle', hammerCharge:'MeleeSledgehammer.sledgehammer_chargeup',
        hammerRelease:'MeleeSledgehammer.sledgehammer_chargeup_release', hammerHit:'MeleeSledgehammer.sledgehammer_hit', hammerPush:'MeleeSledgehammer.sledgehammer_push',
        knifeIdle:'MeleeKnife.Knife_Idle', knifeCharge:'MeleeKnife.Knife_Chargeup',
        knifeRelease:'MeleeKnife.Knife_ChargeupRelease', knifeHit:'MeleeKnife.Knife_Hit', knifePush:'MeleeKnife.Knife_Push',
        spearIdle:'MeleeSpear.Spear_Idle', spearCharge:'MeleeSpear.Spear_Chargeup',
        spearRelease:'MeleeSpear.Spear_ChargeupRelease', spearHit:'MeleeSpear.Spear_Hit', spearPush:'MeleeSpear.Spear_Shove',
        batIdle:'MeleeBat.Bat_Idle', batCharge:'MeleeBat.Bat_Chargeup',
        batRelease:'MeleeBat.Bat_ChargeupRelease', batHit:'MeleeBat.Bat_Hit', batPush:'MeleeBat.Bat_Push'
    };
    const clips = {};
    for (const [key, name] of Object.entries(states)) {
        const {animation, provenance} = samples.load('FPS_Weapon_Pose.' + name);
        clips[key] = {...animation, provenance};
    }
    output.set('player-animations/first-person.json', Buffer.from(JSON.stringify({version:1, sourceRevision:samples.sourceRevision, samplingRevision:samples.samplingRevision, models, clips})));
}
module.exports = {prepareFirstPerson,prepareWeaponView};

if (require.main === module) {
    const fs = require('node:fs'), crypto = require('node:crypto');
    const {rebuiltModels} = require('./rebuilt-model-package.cjs');
    if (process.argv.length < 3 || process.argv.length > 4 || process.argv[3] && process.argv[3] !== '--weapon-view') throw Error('Usage: node Tools/runtime-first-person-package.cjs <model-source-project> [--weapon-view]');
    const source = path.resolve(process.argv[2]), output = new Map();
    if(process.argv[3]==='--weapon-view') prepareWeaponView(source,output);
    else prepareFirstPerson(source, rebuiltModels(source), output);
    const assets = path.resolve(__dirname, '../Viewer/assets/assets');
    const receiptPath = path.join(assets, 'model-resources.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    for (const [relative, bytes] of output) {
        const file = path.join(assets, relative);
        fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, bytes);
        receipt.files = receipt.files.filter(row => row.path !== relative);
        receipt.files.push({path:relative, bytes:bytes.length, sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
    }
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({files:output.size, paths:[...output.keys()]}));
}
