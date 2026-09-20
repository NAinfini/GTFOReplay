const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../Viewer/assets/node_modules/typescript');
const three = require('../../Viewer/assets/node_modules/three');

function compile(file) {
    return ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
}
const controlsCode = compile('Viewer/assets/src/profiles/vanilla/renderer/controls.ts');
function setup() {
    const window = new EventTarget(), canvas = new EventTarget();
    canvas.focus = () => {};
    canvas.getBoundingClientRect = () => ({left:0,top:0,width:1000,height:600});
    const signal = value => function (next) { if (arguments.length) value = next; return value; };
    const pause = signal(true), time = signal(0), rate = signal(1);
    const replay = { events: [], loading: false };
    const view = { pause, time, timescale: rate, replay: () => replay };
    window.matchMedia = () => ({ matches: false });
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', 'window', controlsCode)(id => {
        if (id === '@esm/three') return three;
        if (id.endsWith('/signal.js')) return { signal };
        if (id.endsWith('/datastore.js')) return { DataStore: new Map() };
        if (id.endsWith('/OrbitControls.js')) return { OrbitControls: class { dispose() {} } };
        if (id.endsWith('/eventCamera.js')) { const child = {exports:{}}; new Function('module','exports',compile('Viewer/assets/src/profiles/vanilla/library/eventCamera.ts'))(child,child.exports); return child.exports; }
        if (id.endsWith('/factory.js')) return { Factory: () => () => new Map() };
        if (id.endsWith('/main.js')) return { dispose: new AbortController(), ui: () => ({ display: { view: () => view } }) };
        throw new Error('Unexpected import: ' + id);
    }, mod, mod.exports, window);
    const root = new three.PerspectiveCamera();
    root.rotation.order = 'YXZ';
    const data = new Map([['Dimension', 0]]);
    const renderer = { renderer: { domElement: canvas }, canvas, scene: new three.Scene(), get: key => data.get(key), set: (key,value) => data.set(key,value) };
    renderer.scene.add(root);
    const controls = new mod.exports.Controls({ root }, renderer);
    const players = new Map(), enemies = new Map(), animations = new Map();
    const snapshot = { time, getOrDefault: name => name === 'Vanilla.Player' ? players : name === 'Vanilla.Enemy' ? enemies : name === 'Vanilla.Player.Animation' ? animations : new Map() };
    const key = (type, keyCode) => {
        const event = new Event(type, { cancelable: true });
        Object.defineProperty(event, 'keyCode', { value: keyCode });
        window.dispatchEvent(event);
    };
    canvas.dispatchEvent(new Event('focusin'));
    return { controls, root, canvas, window, key, pause, time, rate, replay, players, enemies, animations, renderer, step: dt => controls.update(snapshot, dt) };
}

test('WASD stays horizontal at any pitch and diagonal speed equals straight speed', () => {
    for (const pitch of [0, .8, -1.2, Math.PI / 2]) {
        for (const keys of [[87], [83], [65], [68], [87, 68]]) {
            const { key, root, step } = setup();
            root.rotation.set(pitch, Math.PI / 2, .2);
            root.position.y = 7;
            keys.forEach(code => key('keydown', code));
            step(.1);
            assert.equal(root.position.y, 7);
            assert.ok(Math.abs(Math.hypot(root.position.x, root.position.z) - 2.1) < 1e-9);
            if (keys.length === 1 && keys[0] === 87) assert.ok(root.position.x < 0 && Math.abs(root.position.z) < 1e-9);
        }
    }
});

test('Shift rises and Ctrl descends at base speed; Space does not move the camera', () => {
    const { key, root, step, pause } = setup();
    key('keydown', 16); step(.1);
    assert.equal(root.position.y, 2);
    key('keyup', 16); key('keydown', 17); step(.1);
    assert.equal(root.position.y, 0);
    assert.equal(pause(), true);
    key('keyup', 17); key('keydown', 32); step(.1);
    assert.equal(root.position.y, 0);
    key('keydown', 70);
    assert.equal(pause(), false);
});

test('holding WASD accelerates to a cap and release, cancellation or blur resets it', () => {
    for (const reset of ['release', 'opposite', 'canvas', 'window']) {
        const { key, root, step, canvas, window } = setup();
        key('keydown', 87);
        step(1); const first = -root.position.z;
        step(1); const second = -root.position.z - first;
        assert.ok(second > first);
        step(1); const atCap = root.position.z;
        step(1); assert.equal(atCap - root.position.z, 80);
        key('keydown', 16); const height = root.position.y;
        step(.1); assert.equal(root.position.y - height, 2);
        key('keyup', 16);
        if (reset === 'release') { key('keyup', 87); key('keydown', 87); }
        if (reset === 'opposite') { key('keydown', 83); step(.1); key('keyup', 83); }
        if (reset === 'canvas' || reset === 'window') {
            (reset === 'canvas' ? canvas : window).dispatchEvent(new Event('blur'));
            const stopped = root.position.clone(); step(.1);
            assert.deepEqual(root.position, stopped);
            canvas.dispatchEvent(new Event('focusin')); key('keydown', 87);
        }
        const before = root.position.z; step(.1);
        assert.ok(Math.abs(before - root.position.z - 2.1) < 1e-9, reset);
    }
});

test('transport handles Space inside and outside the canvas', () => {
    let handler, paused = true, overlays = [], time = 10000;
    class Element {
        constructor(kind) { this.kind = kind; }
        closest(selector) { return selector === '.transport' ? this.kind === 'transport' : this.kind === 'input'; }
    }
    const mod = { exports: {} };
    const window = { addEventListener: (_, callback) => { handler = callback; } };
    new Function('require', 'module', 'exports', 'window', 'document', 'Element', compile('Viewer/interface/src/features/playback/Transport.tsx'))(id => {
        if (id === 'react') return { useEffect: callback => callback(), useRef: () => ({ current: null }) };
        if (id === 'react-i18next') return { useTranslation: () => ({ t: value => value }) };
        if (id === 'react/jsx-runtime') return { jsx() {}, jsxs() {} };
        if (id.endsWith('/time')) return { formatTime: () => '' };
        return {};
    }, mod, mod.exports, window, { querySelectorAll: () => overlays }, Element);
    mod.exports.Transport({ state: { players: [] }, adapter: { state: () => ({ paused,time,startTime:0,loadedUntil:60000 }), pause: value => { paused = value; },seek:value=>time=value }, events: [] });
    const event = canvas => ({ code: 'Space', target: new Element(canvas), preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} });
    const cameraSpace = event(true); handler(cameraSpace);
    assert.equal(paused, false);
    assert.equal(cameraSpace.defaultPrevented, true);
    const pageSpace = event(false); handler(pageSpace);
    assert.equal(paused, true);
    assert.equal(pageSpace.defaultPrevented, true);
    handler({...event(true),code:'',key:' '});assert.equal(paused,false,'character-only Space resumes');
    handler({...event(true),code:'Unidentified',key:' '});assert.equal(paused,true,'unidentified physical code still pauses');
    overlays=[{checkVisibility:()=>false}];handler(event(true));assert.equal(paused,false,'hidden menus cannot consume Space');
    overlays=[{checkVisibility:()=>true}];handler(event(true));assert.equal(paused,false,'visible menus own Space');
    overlays=[];
    for(const extra of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true},{defaultPrevented:true},{target:new Element('input')}]) {
        handler({...event(true),...extra});assert.equal(paused,false);
    }
    handler({...event(true),target:new Element('transport')});assert.equal(paused,true);
    handler({...event(true),code:'ArrowRight'});assert.equal(time,15000);
    handler({...event(true),code:'ArrowLeft'});assert.equal(time,10000);
});


test('event focus waits for the requested frame, follows stable player identity and preserves world pose on release', () => {
    const { controls, players, root, time, step, key, renderer } = setup();
    controls.followPlayer();
    controls.fakeCamera.position.set(0,2,-6);
    const alice = { id:20, slot:1, nickname:'Alice', position:{x:10,y:0,z:10}, dimension:0, rotation:new three.Quaternion() };
    players.set(20,alice);
    controls.focusEvent({...alice,key:'player:20',type:'player',name:'Alice'}, 1000);
    time(1000); step(.1);
    assert.equal(controls.targetSlot(),1);
    assert.equal(controls.autoCamera(),false);
    assert.ok(root.position.x > 0 && root.position.x < 10);
    step(.65); assert.equal(root.position.x,10);
    alice.position = {x:12,y:0,z:10}; step(.1); assert.equal(root.position.x,12);
    controls.focusEvent({...alice,key:'player:20',type:'player',name:'Alice'},1000); step(.1);
    assert.equal(controls.transition,undefined, 'same subject must not restart the move');
    players.delete(20); players.set(30,{...alice,id:30,nickname:'Replacement',position:{x:500,y:0,z:0}});
    step(.1); assert.equal(root.position.x,12); assert.equal(controls.targetSlot(),undefined);
    const before = root.position.clone(), rotation = root.quaternion.clone();
    controls.followPlayer(); step(0);
    assert.deepEqual(root.position,before); assert.ok(root.quaternion.equals(rotation));
    assert.equal(root.parent,renderer.scene);
    controls.enableAutoCamera(); key('keydown',87);
    assert.equal(controls.autoCamera(),false);
});

test('enemy framing tracks the event subject and large/dimension jumps cut without crossing the map', () => {
    const { controls, enemies, root, time, step, renderer } = setup();
    controls.followPlayer();
    controls.fakeCamera.position.set(0,2,-6);
    const enemy = {id:10,position:{x:100,y:0,z:0},dimension:1,rotation:new three.Quaternion()};
    enemies.set(10,enemy); time(500);
    controls.focusEvent({...enemy,type:'enemy',key:'enemy:10',name:'Scout'},500); step(.01);
    assert.equal(root.position.x,100); assert.equal(renderer.get('Dimension'),1);
    assert.equal(controls.targetName(),'Scout');
    enemy.position = {x:101,y:0,z:0}; step(.01); assert.equal(root.position.x,101);
    controls.focusEvent({...enemy,key:'enemy:11',type:'enemy'},1000);
    time(1200); step(.01); assert.equal(controls.pendingFocus,undefined, 'a later seek cancels pending focus');
});

test('automatic coverage keeps mode separate from its player, survives clicks and clears vanished subjects', () => {
    const {controls,players,step,time,pause,canvas,window,key}=setup();
    for(const id of [1,2])players.set(id,{id,slot:id-1,nickname:String(id),position:new three.Vector3(id,0,0),dimension:0,rotation:new three.Quaternion()});
    pause(false);step(0);
    assert.equal(controls.slot,0);assert.equal(controls.targetSlot(),undefined);assert.equal(controls.autoCamera(),true);
    for(let t=1000;t<=12000;t+=1000){time(t);step(1);}
    assert.equal(controls.slot,1);assert.equal(controls.targetSlot(),undefined);assert.equal(controls.autoCamera(),true);
    controls.saveState();controls.followPlayer(0);controls.loadState();step(0);
    assert.equal(controls.autoCamera(),true);assert.equal(controls.targetSlot(),undefined);
    const mouse=(surface,type,x=0)=>{const e=new Event(type);Object.defineProperties(e,{button:{value:0},clientX:{value:x},clientY:{value:0}});surface.dispatchEvent(e);};
    mouse(canvas,'mousedown');mouse(window,'mouseup');step(0);
    assert.equal(controls.autoCamera(),true,'a plain focus click cannot select a permanent player');
    mouse(canvas,'mousedown');mouse(window,'mousemove',10);mouse(window,'mouseup');
    assert.equal(controls.autoCamera(),true,'orbit adjustments retain the selected automatic mode');assert.equal(controls.targetSlot(),undefined);
    key('keydown',87);controls.enableAutoCamera();time(13000);step(1);
    assert.equal(controls.autoCamera(),true,'stale movement cannot cancel a newly selected auto mode');
    players.clear();time(14000);step(1);
    assert.equal(controls.subject,undefined);assert.equal(controls.targetSlot(),undefined);assert.equal(controls.autoCamera(),true);
    pause(true);time(60000);step(1);assert.equal(controls.autoCamera(),true);
});

test('automatic coverage changes the shot angle when it changes subjects', () => {
    const {controls,players,time,pause,step,root}=setup();
    const first={id:1,slot:0,nickname:'One',position:new three.Vector3(),dimension:0,rotation:new three.Quaternion()};
    const second={id:2,slot:1,nickname:'Two',position:new three.Vector3(10,0,0),dimension:0,rotation:new three.Quaternion()};
    players.set(1,first);players.set(2,second);pause(false);step(.7);
    const firstOffset=root.position.clone().sub(first.position);
    for(let t=1000;t<=12000;t+=1000){time(t);step(1);}
    const secondOffset=root.position.clone().sub(second.position);
    assert.equal(controls.slot,1);
    assert.ok(firstOffset.x>0&&secondOffset.x<0,'successive subjects kept the same camera side');
    assert.ok(firstOffset.distanceTo(secondOffset)>2,'successive subjects kept the same framing angle');
});

test('event inspection and wheel retain auto mode through event retirement and continuation', () => {
    const {controls,players,enemies,time,pause,step}=setup();
    const player={id:1,slot:0,nickname:'Player',position:new three.Vector3(),dimension:0,rotation:new three.Quaternion()};
    players.set(1,player);
    const enemy={id:2,position:new three.Vector3(3,0,0),dimension:0,health:10};enemies.set(2,enemy);
    controls.enableAutoCamera();
    controls.focusEvent({...enemy,type:'enemy',key:'enemy:2',name:'Nightmare Striker'},1000);
    time(1000);step(.1);
    controls.wheel({deltaY:1,preventDefault(){}});
    assert.equal(controls.autoCamera(),true);assert.equal(controls.targetSlot(),undefined);
    enemies.delete(2);pause(false);time(2000);step(1);
    assert.equal(controls.subject.type,'player');assert.equal(controls.autoCamera(),true);assert.equal(controls.targetSlot(),undefined);
});

test('automatic camera stays on the subject side of a wall during transitions and limits orbit distance', () => {
    const {controls,players,time,pause,step,root,renderer}=setup();
    const wall=new three.Mesh(new three.BoxGeometry(30,30,.2),new three.MeshBasicMaterial({side:three.DoubleSide}));
    wall.position.set(0,1,-2);wall.updateMatrixWorld(true);
    renderer.set('NativeSurfaces',{cameraDistance(ray,dimension){assert.equal(dimension,0);return ray.intersectObject(wall)[0]?.distance??ray.far;}});
    players.set(1,{id:1,slot:0,nickname:'P',position:new three.Vector3(),dimension:0,rotation:new three.Quaternion()});
    controls.fakeCamera.position.set(0,2,-30);controls.enableAutoCamera();root.position.set(0,1,-10);pause(false);
    for(let i=0;i<20;i++){time(i*100);step(.1);assert.ok(root.position.z> -1.8,'camera crossed the wall');assert.ok(root.position.distanceTo(new three.Vector3(0,1.2,0))<=5.001);}
});

test('first person follows recorded aim and stance immediately through pause, seeking and dimension changes', () => {
    const { controls, players, animations, root, step, time, renderer } = setup();
    const player = { id: 20, slot: 1, nickname: 'Alice', position: new three.Vector3(10, 2, 3), dimension: 0, rotation: new three.Quaternion() };
    const anim = { crouch: 0, state: 'stand', targetLookDir: new three.Vector3(1, .5, 0) };
    players.set(20, player); animations.set(20, anim);
    controls.followPlayer(1); controls.setFirstPerson(true); step(0);
    assert.equal(controls.firstPersonPlayer, 20);
    assert.equal(controls.orbitControls.enabled, false);
    assert.equal(controls.transition, undefined);
    assert.ok(root.position.distanceTo(new three.Vector3(10, 3.65, 3)) < 1e-9);
    assert.ok(root.getWorldDirection(new three.Vector3()).distanceTo(anim.targetLookDir.clone().normalize()) < 1e-9);
    anim.crouch = 1; time(8000); step(0);
    assert.ok(Math.abs(root.position.y - 3.1) < 1e-9);
    anim.state = 'downed'; time(2000); player.dimension = 2; player.position.x = 100; step(0);
    assert.ok(Math.abs(root.position.y - 2.55) < 1e-9);
    assert.equal(root.position.x, 100); assert.equal(renderer.get('Dimension'), 2);
    controls.saveState(); controls.followPlayer(); controls.loadState(); step(0);
    assert.equal(controls.firstPerson(), true); assert.equal(controls.firstPersonPlayer, 20);
});

test('first-person release, player switches, missing subjects and automatic/event modes restore camera control', () => {
    const { controls, players, animations, root, step, key } = setup();
    controls.setFirstPerson(true); assert.equal(controls.firstPerson(), false);
    const a = { id: 20, slot: 0, nickname: 'Alice', position: new three.Vector3(), dimension: 0, rotation: new three.Quaternion() };
    const b = { ...a, id: 30, slot: 1, nickname: 'Bob', position: new three.Vector3(10, 0, 0) };
    const anim = { crouch: 0, state: 'stand', targetLookDir: new three.Vector3(0, 0, 1) };
    players.set(20, a); players.set(30, b); animations.set(20, anim); animations.set(30, anim);
    controls.fakeCamera.position.set(0, 2, -6);
    controls.followPlayer(0); controls.setFirstPerson(true); step(0);
    controls.followPlayer(1); step(0); assert.equal(controls.firstPersonPlayer, 30); assert.equal(root.position.x, 10);
    const position = root.position.clone(), rotation = root.quaternion.clone();
    players.delete(30); players.set(40, { ...b, id: 40, position: new three.Vector3(500, 0, 0) }); step(0);
    assert.deepEqual(root.position, position); assert.equal(controls.firstPersonPlayer, undefined);
    controls.followPlayer(); step(0);
    assert.deepEqual(root.position, position); assert.ok(root.quaternion.equals(rotation));
    assert.equal(controls.firstPerson(), false);
    controls.followPlayer(0); controls.setFirstPerson(true); step(0);
    controls.setFirstPerson(false); step(0);
    assert.equal(controls.orbitControls.enabled, true); assert.equal(root.position.z, -6);
    for (const release of [() => controls.enableAutoCamera(), () => controls.focusEvent({ ...a, key: 'player:20', type: 'player', name: 'Alice' }, 0), () => key('keydown', 87)]) {
        controls.setFirstPerson(true); step(0); release(); assert.equal(controls.firstPerson(), false);
    }
});
