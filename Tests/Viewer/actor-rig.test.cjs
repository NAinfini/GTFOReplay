const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../../Viewer/assets/node_modules/three'),ts=require('../../Viewer/assets/node_modules/typescript');
const moduleOutput={exports:{}};
const code=ts.transpileModule(fs.readFileSync('Viewer/assets/src/replay/actor-rig.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
new Function('require','module','exports',code)(()=>T,moduleOutput,moduleOutput.exports);
const {ActorRig}=moduleOutput.exports;

test('shoulders retain native offsets instead of accepting independent translation',()=>{
    const root=new T.Group(),hip=new T.Bone(),upper=new T.Bone(),lower=new T.Bone(),hand=new T.Bone();
    hip.name='Hip';upper.name='RightUpperArm';lower.name='RightLowerArm';hand.name='RightHand';
    root.add(hip);hip.add(upper);upper.add(lower);lower.add(hand);
    upper.position.set(.3,1,0);lower.position.x=.3;hand.position.x=.2;
    const rig=new ActorRig(root),motion=new T.Matrix4().makeTranslation(2,-1,-3),identity=new T.Matrix4();
    const pose=joint=>joint==='hip'?identity:motion;
    rig.apply(pose);
    assert.ok(Math.abs(lower.position.length()-.3)<1e-9);
    assert.ok(upper.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3(.3,1,0))<1e-9,'ordinary actors retain native shoulder offsets');
});

test('parent-first native posing preserves complete and partial garment binds across root movement',()=>{
    const root=new T.Group(),garment=new T.Group();root.add(garment);
    const hip=new T.Bone(),spine=new T.Bone(),helper=new T.Bone(),head=new T.Bone(),roll=new T.Bone();
    hip.name='Hips';spine.name='Spine1';helper.name='UnmappedHelper';head.name='Head';roll.name='Head_Roll1';
    hip.position.set(.2,1,.1);spine.position.y=.4;helper.position.y=.15;head.position.y=.3;roll.position.x=.1;
    garment.add(hip);hip.add(spine);spine.add(helper);helper.add(head);head.add(roll);
    const sleeve=new T.Group(),hand=new T.Bone(),finger=new T.Bone();root.add(sleeve);sleeve.position.x=.35;
    hand.name='LeftHand';finger.name='LeftIndex1';hand.position.set(.6,1.3,.2);finger.position.x=.1;sleeve.add(hand);hand.add(finger);
    const rig=new ActorRig(root);
    const rest=new Map(rig.bones.map(entry=>[entry.bone,entry.rest.clone()]));
    for(const yaw of [0,.8,-1.6]){
        // All joints take the same rigid motion. Every bind, including partial
        // garments, must follow that motion regardless of the actor root pose.
        const motion=new T.Matrix4().compose(new T.Vector3(4,-2,7),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),new T.Vector3(1,1,1));
        root.position.set(-3,2,1);root.rotation.y=-.4;
        rig.apply(()=>motion);
        root.updateMatrixWorld(true); // The renderer must preserve the posed world matrices.
        for(const {bone} of rig.bones){
            const expected=new T.Matrix4().multiplyMatrices(motion,rest.get(bone));
            assert.ok(bone.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-9),bone.name);
        }
        // Changing an undriven intermediate transform must not leave its world
        // matrix stale or move the driven child off its expected bind.
        helper.rotation.z=.2;rig.apply(()=>motion);
        const expected=new T.Matrix4().multiplyMatrices(motion,rest.get(head));
        assert.ok(head.matrixWorld.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-9));
    }
    rig.apply(()=>new T.Matrix4(),false);rig.apply(()=>new T.Matrix4(),true);
    assert.ok(head.matrixWorld.elements.every((v,i)=>Math.abs(v-rest.get(head).elements[i])<1e-9),'head pose restores');
});
