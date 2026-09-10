const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const ts=require('../../Viewer/assets/node_modules/typescript'),T=require('../../Viewer/assets/node_modules/three');
const code=ts.transpileModule(fs.readFileSync('Viewer/assets/src/replay/native-weapon-view.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};new Function('require','exports','module',code)(()=>T,mod.exports,mod);
const {WeaponView}=mod.exports;
const bytes=fs.readFileSync('Viewer/assets/assets/player-animations/weapon-view.json'),data=JSON.parse(bytes);

test('contact retargeting moves both shoulders together without stretching either arm',()=>{
    const {solveBodyReach}=mod.exports,out=new T.Vector3();
    solveBodyReach(out,new T.Vector3(.2,0,0),new T.Vector3(.3,0,0),.6,.6);
    assert.equal(out.length(),0);
    const right=new T.Vector3(1,0,0),left=new T.Vector3(0,1,0);
    solveBodyReach(out,right,left,.75,.75);
    assert.ok(out.distanceTo(right)<=.750000001);assert.ok(out.distanceTo(left)<=.750000001);
    assert.ok(Math.abs(out.x-out.y)<1e-9);assert.ok(out.length()<.5);
    assert.throws(()=>solveBodyReach(out,right,left,.1,.1),/exceed both arm reaches/);
});

test('native FPS export is covered by the runtime receipt and resolves every controller state',()=>{
    const receipt=JSON.parse(fs.readFileSync('Viewer/assets/assets/model-resources.json'));
    const row=receipt.files.find(r=>r.path==='player-animations/weapon-view.json');
    assert.equal(row.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));
    for(const {clip} of Object.values(data.states)) {
        const c=data.clips[clip];assert.ok(c.sha256);assert.ok(c.duration>0);
        for(let i=1;i<c.times.length;i++)assert.ok(c.times[i]>c.times[i-1]);
        for(const values of Object.values(c.tracks))assert.equal(values.length,c.times.length);
    }
    for(const r of Object.values(data.reloads))for(const e of r.events)assert.ok(data.states[e.state],e.state);
});

test('native datablock IDs select distinct poses without display-name matching',()=>{
    const pistol=new WeaponView(data,[{c:4,v:8}]),rifle=new WeaponView(data,[{c:4,v:1}]);
    assert.equal(pistol.settings,data.settings['8']);assert.equal(rifle.settings,data.settings['1']);
    assert.notDeepEqual(pistol.settings.localPosHip,rifle.settings.localPosHip);
    assert.throws(()=>new WeaponView(data,[{c:4,v:999999}]),/Missing native FPS/);
});

test('native movement samples are stable across backwards seeks and use the authored track',()=>{
    const state=data.states.Revolver_Front_1_Reload,clip=data.clips[state.clip];
    const view=new WeaponView(data,[{c:4,v:20},{c:12,v:36}]);
    const p=new T.Vector3(),q=new T.Quaternion(),first=new T.Vector3();
    view.sample(p,q,10,.4);first.copy(p);const rotation=q.clone();
    view.sample(p,q,99,.9);view.sample(p,q,0,.4);
    assert.ok(p.distanceTo(first)<1e-12);assert.ok(q.angleTo(rotation)<1e-7);
    const nativeTime=clip.duration*.4*state.speed;
    const i=clip.times.findIndex(t=>Math.abs(t-nativeTime)<1e-6);assert.ok(i>=0);
    const hip=view.settings.localPosHip;
    assert.ok(p.distanceTo(new T.Vector3(-hip.x,hip.y,hip.z).add(new T.Vector3().fromArray(clip.tracks.position[i])))<1e-6);
});

test('idle presentation measures a ceiling without changing native geometry or pose',()=>{
    const view=new WeaponView(data,[{c:4,v:1}]),root=new T.Group();
    root.add(new T.Mesh(new T.BoxGeometry(.2,.4,.7)));
    const before=root.children[0].geometry.attributes.position.array.slice();view.measure(root,1);
    assert.ok(view.hipCeiling>0);assert.deepEqual(root.children[0].geometry.attributes.position.array,before);
    const p=new T.Vector3(),q=new T.Quaternion();view.sample(p,q,0);
    assert.ok(p.toArray().every(Number.isFinite));assert.ok(Math.abs(q.length()-1)<1e-6);
});
