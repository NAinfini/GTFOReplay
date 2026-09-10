const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const assets=path.resolve(__dirname,'../../Viewer/assets/assets');
const bytes=fs.readFileSync(path.join(assets,'player-animations/hands.json')),data=JSON.parse(bytes);
test('shipped hand animations contain only native finger rotations and complete mapped states',()=>{
    assert.equal(data.version,1);
    for(const pair of [...Object.values(data.gear),...Object.values(data.melee)])for(const [side,hand] of Object.entries(pair))for(const name of Object.values(hand)){
        assert.ok(name.startsWith(side==='left'?'Left_Hand.':'Right_Hand.'));
        const clip=data.poses[name];assert.ok(clip?.frames.length);assert.ok(clip.rate>0&&clip.duration>0);
        assert.match(data.provenance[name].sourceSha256,/^[a-f0-9]{64}$/);
        for(const frame of clip.frames){assert.equal(Object.keys(frame.joints).length,15);
            for(const [joint,value] of Object.entries(frame.joints)){
                assert.match(joint,new RegExp('^'+side+'(Thumb|Index|Middle|Ring|Pinky)[123]$'));
                assert.deepEqual(Object.keys(value),['rot']);
                assert.ok(Math.abs(Math.hypot(...Object.values(value.rot))-1)<.00001);
            }
        }
        if(!/reload/i.test(name))assert.equal(clip.frames.length,1);
    }
    const receipt=JSON.parse(fs.readFileSync(path.join(assets,'model-resources.json'))).files.find(row=>row.path==='player-animations/hands.json');
    assert.equal(receipt.bytes,bytes.length);assert.equal(receipt.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
});
