const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../../Viewer/assets/node_modules/typescript');
const root = path.resolve(__dirname, '../..'), src = path.join(root, 'Viewer/assets/src');
const cache = new Map();
const joints = ['hip', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'spine1',
    'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'neck', 'head'];
function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = {exports: {}, src: filename}; cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}
    }).outputText;
    new Function('require', 'module', 'exports', code)(id => {
        if (id === '@esm/three') return require('../../Viewer/assets/node_modules/three');
        if (id.endsWith('/renderer/animations/human.js')) return {HumanJoints: joints};
        if (id === './animation.js' && filename.includes(path.join('parser', 'enemy'))) return {AnimHandles: {FlagMap: new Map([[1, 'Regular']])}};
        if (id.endsWith('/deathcross.js')) return {DeathCross: {spawn() {}}};
        if (id.endsWith('/stattracker/stattracker.js')) return {StatTracker: {}};
        if (id.endsWith('/eventParticipants.js')) return {describeParticipants: () => []};
        if (id.endsWith('/actorCatalog.js')) return {enemyNames: new Map()};
        if (id.startsWith('@esm/@root/')) return load(path.join(src, id.slice('@esm/@root/'.length).replace(/\.js$/, '.ts')));
        if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id.replace(/\.js$/, '.ts')));
        throw Error('Unexpected parser dependency: ' + id);
    }, mod, mod.exports);
    return mod.exports;
}
const {ModuleLoader} = load(path.join(src, 'replay/moduleloader.ts'));
const bit = load(path.join(src, 'replay/bithelper.ts'));
const {ByteStream} = load(path.join(src, 'replay/stream.ts'));
for (const name of ['header', 'metadata', 'enemy/enemy', 'enemy/enemyRagdoll', 'enemy/limbCustom',
    'player/player', 'player/backpack', 'player/stats', 'player/sentry', 'player/mine', 'player/gunshot']) {
    load(path.join(src, 'profiles/vanilla/parser', name + '.ts'));
}
function snapshot() {
    const data = new Map();
    data.getOrDefault = (key, create) => {if (!data.has(key)) data.set(key, create()); return data.get(key);};
    data.time = () => 500; data.header = data;
    return data;
}
function writer() {
    const stream = new ByteStream();
    const result = {stream() {return new ByteStream(stream.bytes.slice(0, stream.index));},
        vector(x = 3, y = 4, z = 5) {return this.float(x).float(y).float(z);},
        halfVector(x = 1, y = 2, z = 3) {return this.half(x).half(y).half(z);},
        quaternion() {return this.byte(3).half(0).half(0).half(0);},
        spawn() {return this.byte(2).vector().quaternion();},
        update() {return this.byte(2).byte(1).vector().quaternion();},
        identifier(type, id) {return this.byte(type).ushort(id);}};
    for (const [name, fn] of Object.entries({byte: 'writeByte', ushort: 'writeUShort', int: 'writeInt', long: 'writeLong',
        float: 'writeFloat', half: 'writeHalf', string: 'writeString'})) result[name] = value => {bit[fn](value, stream); return result;};
    return result;
}
async function parsed(handler, builder, snap = snapshot()) {
    const stream = builder.byte(123).stream(), value = await handler(stream, snap);
    assert.equal(await bit.readByte(stream), 123, 'The following record remains aligned');
    assert.equal(stream.index, stream.bytes.length);
    return value;
}

test('current Recorder versions are the only registered versions; removed versions fail exact lookup', () => {
    const expected = {header: {'ReplayRecorder.Header': '0.0.2', 'ReplayRecorder.Session': '0.0.1', 'Vanilla.Metadata': '0.0.4'},
        dynamic: {'Vanilla.Enemy': '0.0.5', 'Vanilla.Enemy.Ragdoll': '0.0.2', 'Vanilla.Enemy.LimbCustom': '0.0.2',
            'Vanilla.Player': '0.0.2', 'Vanilla.Player.Backpack': '0.0.2', 'Vanilla.Player.Stats': '0.0.3', 'Vanilla.Sentry': '0.0.2', 'Vanilla.Mine': '0.0.2'},
        event: {'Vanilla.Player.Gunshots': '0.0.2', 'Vanilla.Mine.Detonate': '0.0.1'}};
    for (const [kind, entries] of Object.entries(expected)) for (const [name, current] of Object.entries(entries)) {
        assert.deepEqual([...ModuleLoader.library[kind].get(name).keys()], [current]);
        const get = ModuleLoader['get' + {header: 'Header', dynamic: 'Dynamic', event: 'Event'}[kind]];
        assert(get([name, current]));
        for (let old = 1; old < Number(current.split('.').at(-1)); ++old) assert.throws(() => get([name, '0.0.' + old]), /No module of type/);
    }
    assert.throws(() => ModuleLoader.getDynamic(['Vanilla.Enemy.Stats', '0.0.1']), /No module of type/);
});

test('parser registration versions match the current C# ReplayData attributes', () => {
    function files(directory, extension) {return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const name = path.join(directory, entry.name); return entry.isDirectory() ? files(name, extension) : name.endsWith(extension) ? [name] : [];
    });}
    const current = new Map();
    for (const directory of ['Vanilla/Vanilla', 'ReplayRecorder/ReplayRecorder']) for (const file of files(path.join(root, directory), '.cs')) {
        for (const [, name, version] of fs.readFileSync(file, 'utf8').matchAll(/\[ReplayData\("([^"]+)", "([^"]+)"\)\]/g)) current.set(name, version);
    }
    for (const file of files(path.join(src, 'profiles/vanilla/parser'), '.ts')) {
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        function visit(node) {
            if (ts.isCallExpression(node) && /^ModuleLoader\.register(Header|Dynamic|Event)$/.test(node.expression.getText(source))) {
                const [name, version] = node.arguments;
                assert(ts.isStringLiteral(name) && ts.isStringLiteral(version), 'Each current parser has a concrete version');
                // Saved navigation-only recordings remain readable; map-support.test.cjs
                // checks both byte layouts. Every other registration must be current.
                if (name.text === 'Vanilla.Map.Geometry' && version.text === '0.0.3') {
                    assert.equal(current.get(name.text), '0.0.4');
                } else assert.equal(version.text, current.get(name.text), `${path.relative(root, file)}: ${name.text}`);
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
    }
});

test('current headers consume complete Recorder and metadata fields, including current plugin flags', async () => {
    const header = snapshot();
    const recorder = writer().string('current').byte(1).long(123456789n).byte(123).stream();
    await ModuleLoader.getHeader(['ReplayRecorder.Header', '0.0.2']).parse(recorder, header, header);
    assert.equal(header.get('ReplayRecorder.Header').recorder, 123456789n); assert.equal(await bit.readByte(recorder), 123);
    const metadata = writer().string('0.1.8').byte(1).byte(0).byte(1).byte(123).stream();
    await ModuleLoader.getHeader(['Vanilla.Metadata', '0.0.4']).parse(metadata, header, header);
    assert.deepEqual(header.get('Vanilla.Metadata'), {version: '0.1.8', compatibility_OldBulkheadSound: true, compatibility_NoArtifact: false, recordEnemyRagdolls: true});
    assert.equal(await bit.readByte(metadata), 123);
    const session = writer(); for (const value of ['id', 'utc', 'expedition', 'level', 'rundown', 'game']) session.string(value);
    const stream = session.byte(10).byte(30).ushort(1).string('mod').string('1.2.3').byte(123).stream();
    await ModuleLoader.getHeader(['ReplayRecorder.Session', '0.0.1']).parse(stream, header, header);
    assert.deepEqual(header.get('ReplayRecorder.Session').plugins, [{id: 'mod', version: '1.2.3'}]); assert.equal(await bit.readByte(stream), 123);
});

test('enemy 0.0.5 preserves optional delta fields and uses the recorded maximum health', async () => {
    const handler = ModuleLoader.getDynamic(['Vanilla.Enemy', '0.0.5']), snap = snapshot();
    const spawn = await parsed(handler.spawn.parse, writer().spawn().ushort(1).half(1.5).identifier(4, 26).half(42.5), snap);
    handler.spawn.exec(7, spawn, snap); assert.equal(snap.get('Vanilla.Enemy').get(7).health, 42.5);
    const full = await parsed(handler.main.parse, writer().update().byte(31).byte(1).byte(2).byte(128), snap);
    handler.main.exec(7, full, snap, 1);
    const delta = await parsed(handler.main.parse, writer().update().byte(1), snap);
    assert.equal(delta.targetPlayerSlotIndex, undefined); handler.main.exec(7, delta, snap, 1);
    const enemy = snap.get('Vanilla.Enemy').get(7);
    assert.equal(enemy.consumedPlayerSlotIndex, 1); assert.equal(enemy.targetPlayerSlotIndex, 2);
    assert.equal(enemy.stagger, 128 / 255); assert.equal(enemy.canStagger, false);
    await assert.rejects(() => handler.main.parse(writer().update().byte(224).stream(), snap), /Invalid enemy state mask/);
});

test('player, backpack, stats and sentry parse only the complete current layouts', async () => {
    const player = ModuleLoader.getDynamic(['Vanilla.Player', '0.0.2']);
    const value = await parsed(player.main.parse, writer().update().identifier(3, 125).byte(1).half(24));
    assert.equal(value.flashlight, true); assert.equal(value.flashlightRange, 24);
    const backpack = ModuleLoader.getDynamic(['Vanilla.Player.Backpack', '0.0.2']);
    for (const parse of [backpack.main.parse, backpack.spawn.parse]) {
        const bytes = writer(); for (let i = 0; i < 8; ++i) bytes.identifier(3, 100 + i); for (let i = 0; i < 5; ++i) bytes.identifier(5, 200 + i);
        const result = await parsed(parse, bytes); assert.equal(result.slots.length, 8); assert.equal(result.vanity[4].id, 204);
    }
    const stats = ModuleLoader.getDynamic(['Vanilla.Player.Stats', '0.0.3']);
    for (const parse of [stats.main.parse, stats.spawn.parse]) {
        const bytes = writer(); for (const value of [255, 0, 1, 2, 3, 4, 5, 128]) bytes.byte(value);
        assert.equal((await parsed(parse, bytes)).stamina, 128 / 255);
    }
    const sentry = ModuleLoader.getDynamic(['Vanilla.Sentry', '0.0.2']);
    assert.equal((await parsed(sentry.spawn.parse, writer().spawn().byte(1).ushort(42))).owner, 42);
    assert.equal((await parsed(sentry.spawn.parse, writer().spawn().byte(0))).owner, undefined);
});

test('current mine, gunshot, limb and ragdoll payloads retain their actual fields', async () => {
    const mine = ModuleLoader.getDynamic(['Vanilla.Mine', '0.0.2']);
    const value = await parsed(mine.spawn.parse, writer().spawn().identifier(3, 144).ushort(42));
    assert.equal(value.item.id, 144); assert.equal(value.owner, 42);
    const shot = ModuleLoader.getEvent(['Vanilla.Player.Gunshots', '0.0.2']);
    assert.equal((await parsed(shot.parse, writer().int(42).byte(2).half(10).byte(0).vector().vector().byte(1))).silent, true);
    const limb = ModuleLoader.getDynamic(['Vanilla.Enemy.LimbCustom', '0.0.2']), snap = snapshot();
    const limbData = await parsed(limb.spawn.parse, writer().ushort(42).byte(0).halfVector().half(2), snap);
    limb.spawn.exec(1, limbData, snap); assert.equal('fixScale' in snap.get('Vanilla.Enemy.LimbCustom').get(1), false);
    const ragdoll = ModuleLoader.getDynamic(['Vanilla.Enemy.Ragdoll', '0.0.2']);
    const bytes = writer().spawn().ushort(1).half(1).identifier(4, 26).half(42.5).byte(0);
    for (let i = 0; i < 18; ++i) bytes.halfVector();
    const body = await parsed(ragdoll.spawn.parse, bytes); assert.equal(body.head, false); assert.equal(Object.keys(body.avatar).length, 18);
});
