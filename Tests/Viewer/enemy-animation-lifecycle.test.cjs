const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../Viewer/assets/node_modules/typescript');

const dynamics = new Map(), events = new Map();
const ModuleLoader = {
    registerASLModule() {},
    registerDynamic(name, version, handlers) { dynamics.set(name, handlers); },
    registerEvent(name, version, handlers) { events.set(name, handlers); },
    registerTick() {}
};
for (const name of ['animation', 'scream']) {
    const filename = path.resolve(__dirname, '../../Viewer/assets/src/profiles/vanilla/parser/enemy', name + '.ts');
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText;
    const module = { src: filename, exports: {} };
    new Function('require', 'module', 'exports', source)(dependency => {
        if (dependency.endsWith('/moduleloader.js')) return { ModuleLoader };
        if (dependency.endsWith('/factory.js')) return { Factory: type => () => type === 'Map' ? new Map() : [] };
        if (dependency.endsWith('/bithelper.js') || dependency.endsWith('/pod.js')) return {};
        throw Error('Unexpected parser dependency: ' + dependency);
    }, module, module.exports);
}
const animation = dynamics.get('Vanilla.Enemy.Animation');
const scream = events.get('Vanilla.Enemy.Animation.Scream').exec;
const animationKey = 'Vanilla.Enemy.Animation', enemyKey = 'Vanilla.Enemy';
const retiredKey = 'Vanilla.Enemy.Animation.Despawned', effectKey = 'Vanilla.Enemy.ScreamEffect';
const spawnData = { velocity: { x: 0, y: 0, z: 0 }, state: 'Hibernate', up: false, detect: 0 };
function snapshot(data = new Map()) {
    return {
        data, now: 0,
        time() { return this.now; },
        get(key) { return data.get(key); },
        set(key, value) { data.set(key, value); },
        getOrDefault(key, create) { if (!data.has(key)) data.set(key, create()); return data.get(key); }
    };
}
function spawn(state, id) {
    state.getOrDefault(enemyKey, () => new Map()).set(id, { position: { x: 1, y: 2, z: 3 } });
    animation.spawn.exec(id, structuredClone(spawnData), state);
}
function despawn(state, id) {
    state.get(enemyKey).delete(id);
    animation.despawn.exec(id, undefined, state);
}

test('active screams update the recorded animation and emit the matching effect', () => {
    const state = snapshot(); spawn(state, 10); state.now = 1250;
    scream({ enemy: 10, animIndex: 2, type: 'Scout' }, state);
    const anim = state.get(animationKey).get(10);
    assert.equal(anim.lastScreamTime, 1250);
    assert.equal(anim.screamAnimIndex, 2);
    assert.equal(anim.screamType, 'Scout');
    assert.deepEqual(state.get(effectKey), [{ time: 1250, position: { x: 1, y: 4, z: 3 }, type: 'Scout' }]);
});

test('current hitreact and scout-scream events reject unknown animation IDs', () => {
    const state = snapshot();
    const hitreact = events.get('Vanilla.Enemy.Animation.Hitreact').exec;
    const scout = events.get('Vanilla.Enemy.Animation.ScoutScream').exec;
    assert.throws(() => hitreact({ id: 99, animIndex: 1, direction: 'Forward', type: 'Light' }, state), /EnemyAnim of id '99' was not found/);
    assert.throws(() => scout({ id: 99, start: true }, state), /EnemyAnim of id '99' was not found/);
    spawn(state, 99);
    hitreact({ id: 99, animIndex: 1, direction: 'Forward', type: 'Light' }, state);
    assert.equal(state.get(animationKey).get(99).hitreactAnimIndex, 1);
    scout({ id: 99, start: true }, state);
    assert.equal(state.get(animationKey).get(99).scoutScreamStart, true);
});

test('R5C2 screams one millisecond after despawn or later in the same millisecond cannot animate a despawned enemy', () => {
    for (const [id, time, delay] of [[33240, 4196043, 1], [34123, 5169611, 0]]) {
        const state = snapshot(); spawn(state, id); state.now = time;
        const before = structuredClone(state.data);
        despawn(state, id); state.now += delay;
        scream({ enemy: id, animIndex: 1, type: 'Regular' }, state);
        assert.equal(state.get(animationKey).has(id), false);
        assert.equal(state.get(enemyKey).has(id), false);
        assert.equal(state.get(effectKey), undefined);
        // Replay block caching and backward seeks clone state with structuredClone.
        const after = snapshot(structuredClone(state.data)); after.now = state.now;
        scream({ enemy: id, animIndex: 1, type: 'Regular' }, after);
        assert.equal(after.get(effectKey), undefined);
        const rewound = snapshot(before); rewound.now = time - 1;
        scream({ enemy: id, animIndex: 1, type: 'Regular' }, rewound);
        assert.equal(rewound.get(effectKey).length, 1);
        spawn(state, id);
        assert.equal(state.get(retiredKey).has(id), false);
        scream({ enemy: id, animIndex: 1, type: 'Regular' }, state);
        assert.equal(state.get(effectKey).length, 1);
    }
});

test('unknown IDs and inconsistent live-enemy animation state still fail', () => {
    const state = snapshot();
    assert.throws(() => scream({ enemy: 99, animIndex: 0, type: 'Regular' }, state), /EnemyAnim of id '99' was not found/);
    spawn(state, 99); despawn(state, 99);
    state.get(enemyKey).set(99, { position: { x: 0, y: 0, z: 0 } });
    assert.throws(() => scream({ enemy: 99, animIndex: 0, type: 'Regular' }, state), /EnemyAnim of id '99' was not found/);
    animation.spawn.exec(99, structuredClone(spawnData), state);
    state.get(enemyKey).delete(99);
    assert.throws(() => scream({ enemy: 99, animIndex: 0, type: 'Regular' }, state), /Enemy of id '99' was not found/);
});
