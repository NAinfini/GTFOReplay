const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Deliver only finger rotations from the game's hand layers, never FPS body/camera tracks.
function nativePlayerSamples(source) {
    const directory = 'artifacts/player-animation-gap-review/';
    const read = relative => {
        const file = path.resolve(source, relative);
        if (!file.startsWith(path.resolve(source) + path.sep)) throw Error('Hand animation source leaves project.');
        return fs.readFileSync(file);
    };
    const verified = (file, sha) => { const bytes = read(file); if (hash(bytes) !== sha) throw Error('Changed hand animation input: ' + file); return bytes; };
    const manifestBytes = read(directory + 'native-source-manifest.json');
    const manifest = JSON.parse(manifestBytes);
    const reportBytes = read(directory + 'samples-native/sampling-report.json');
    const report = JSON.parse(reportBytes);
    if (manifest.schemaVersion !== 2 || !report.validAvatar || !report.humanAvatar || report.clips.length !== manifest.sampleRequests || report.nativeInputs.length !== manifest.sampleRequests)
        throw Error('Native hand animation sampling is incomplete.');
    for (const input of [...manifest.projectInputs, manifest.avatar, manifest.controller]) {
        if (input.rawFile) verified(input.rawFile, input.rawSha256);
        else if (input.file && input.sha256) verified(input.file, input.sha256);
    }
    const controllerBytes = read(manifest.controller.decodedFile);
    const controller = JSON.parse(controllerBytes), names = new Map(controller.m_TOS);
    return { sourceRevision:hash(manifestBytes), samplingRevision:hash(reportBytes), controllerRevision:hash(controllerBytes), load(stateName) {
        const layer = controller.m_Controller.m_LayerArray.find(row => names.get(row.data.m_Binding) === stateName.split('.')[0]);
        if (!layer) throw Error('Unknown native animation layer: ' + stateName);
        const state = controller.m_Controller.m_StateMachineArray[layer.data.m_StateMachineIndex].data.m_StateConstantArray.find(row => names.get(row.data.m_FullPathID) === stateName)?.data;
        const ids = state?.m_BlendTreeConstantArray.flatMap(tree => tree.data.m_NodeArray).filter(node => node.data.m_ClipID !== 4294967295).map(node => node.data.m_ClipID);
        if (ids?.length !== 1) throw Error('Expected one source hand clip: ' + stateName);
        const pointer = controller.m_AnimationClips[ids[0]];
        if (![0,4].includes(pointer.m_FileID)) throw Error('Unexpected source clip file.');
        const nativeClip = `${pointer.m_FileID === 0 ? 'resources' : 'sharedassets0'}.assets:${pointer.m_PathID}`;
        const row = manifest.clips.find(clip => clip.nativeClip === nativeClip);
        if (!row?.nativeCurveInput || row.nativeCurveInput.maxNativePolynomialError > 0.00001) throw Error('Native curve validation failed: ' + stateName);
        verified(row.rawFile, row.rawSha256);
        verified(row.nativeCurveInput.file, row.nativeCurveInput.sha256);
        const sampled = report.clips.find(clip => clip.name === row.name);
        const checked = report.nativeInputs.find(clip => clip.name === row.name);
        // Unity stores muscle curves as floats; allow their measured rounding error.
        if (!sampled?.humanMotion || sampled.maxJointScaleDeviation > 0.00001 || !checked || checked.maxCurveError > 0.0001) throw Error('Unity hand sampling validation failed: ' + stateName);
        const bytes = read(directory + 'samples-native/' + row.name + '.json'), animation = JSON.parse(bytes);
        if (!(animation.rate > 0) || !(animation.duration > 0) || animation.frames.length !== sampled.frames) throw Error('Invalid hand sample timing.');
        return {animation, provenance:{nativeClip, sampleSha256:hash(bytes), sourceSha256:row.rawSha256}};
    }};
}

function prepareHands(source) {
    const config = require('./data/player-hand-animations.json');
    const samples = nativePlayerSamples(source), poses = {}, provenance = {};
    const wanted = new Set(Object.values({...config.gear, ...config.melee}).flatMap(pair => Object.values(pair).flatMap(hand => Object.values(hand))));
    for (const stateName of wanted) {
        const side = stateName.startsWith('Left_Hand.') ? 'left' : 'right';
        const result = samples.load(stateName), {animation} = result;
        const joints = ['Thumb','Index','Middle','Ring','Pinky'].flatMap(finger => [1,2,3].map(n => side + finger + n));
        const frames = animation.frames.map(frame => ({joints:Object.fromEntries(joints.map(joint => {
            const q = frame.joints[joint]?.rot;
            if (!q || !['x','y','z','w'].every(key => Number.isFinite(q[key])) || Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1) > 0.001) throw Error('Invalid finger rotation: ' + stateName + '/' + joint);
            return [joint,{rot:Object.fromEntries(['x','y','z','w'].map(key=>[key,Number(q[key].toFixed(6))]))}];
        }))}));
        // Grip states are sampled at their first frame; reloads retain their full timing.
        poses[stateName] = {rate:animation.rate,duration:animation.duration,frames: /reload/i.test(stateName) ? frames : frames.slice(0,1)};
        provenance[stateName] = result.provenance;
    }
    return Buffer.from(JSON.stringify({version:1, sourceRevision:samples.sourceRevision, samplingRevision:samples.samplingRevision, controllerRevision:samples.controllerRevision, ...config, poses, provenance}));
}
module.exports = {prepareHands, nativePlayerSamples};

if (require.main === module) {
    const source = process.argv[2];
    if (!source) throw Error('Usage: node Tools/runtime-hand-package.cjs <model-source-project>');
    const bytes = prepareHands(path.resolve(source));
    const assets = path.resolve(__dirname, '../Viewer/assets/assets');
    const receiptPath = path.join(assets, 'model-resources.json');
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    const relative = 'player-animations/hands.json';
    receipt.files = receipt.files.filter(row => row.path !== relative);
    receipt.files.push({path:relative, bytes:bytes.length, sha256:hash(bytes)});
    fs.writeFileSync(path.join(assets, relative), bytes);
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({file:relative, bytes:bytes.length, sha256:hash(bytes)}));
}
