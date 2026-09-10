const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("../../Viewer/assets/node_modules/typescript");
const { ReplayBlockStore } = require("../../Viewer/electron/build/replay/blockstore.cjs");

test("concurrent cache appends retain distinct blocks and close drains writes", async () => {
    const store = await ReplayBlockStore.create();
    const values = Array.from({ length: 12 }, (_, id) => ({ id, payload: "x".repeat(100000 + id) }));
    try {
        const ids = await Promise.all(values.map(value => store.append(value)));
        assert.equal(new Set(ids).size, values.length);
        for (let i = 0; i < ids.length; i++) assert.deepEqual(await store.read(ids[i]), values[i]);
        const pending = store.append({ final: true });
        const closing = store.close();
        await pending;
        await closing;
        await assert.rejects(store.append({ late: true }), /closed/);
    } finally { await store.close(); }
});

// Load the actual engine code without its browser import-map; header UI signals are unused here.
const modules = new Map();
function source(name) {
    if (modules.has(name)) return modules.get(name).exports;
    const mod = { exports: {} };
    modules.set(name, mod);
    const filename = path.resolve(__dirname, "../../Viewer/assets/src/replay", name + ".ts");
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS }
    }).outputText;
    new Function("require", "module", "exports", code)(id => {
        if (id === "@/rhu/signal.js") return { signal: () => { throw new Error("Unexpected UI signal in engine test"); } };
        return source(id.replace(/^\.\//, "").replace(/\.js$/, ""));
    }, mod, mod.exports);
    return mod.exports;
}

test("A-B looping preserves overshoot, reverse playback and interval bounds", () => {
    const { validateRange, advanceTime } = source("transport");
    const range = { start: 1000, end: 2000 };
    validateRange(range, 3000);
    assert.equal(advanceTime(1900, 250, 3000, range), 1150);
    assert.equal(advanceTime(1100, -250, 3000, range), 1850);
    assert.equal(advanceTime(1900, 4250, 3000, range), 1150);
    assert.equal(advanceTime(2900, 500, 3000), 3000);
    assert.throws(() => validateRange({ start: 1000, end: 1000 }, 3000));
    assert.throws(() => validateRange({ start: 0, end: 4000 }, 3000));
});

test("recording duration stays fixed while the playable prefix grows", async () => {
    const { Replay } = source("replay");
    const replay = new Replay();
    replay.endTime = 1000;
    assert.equal(replay.length(), 1000);
    assert.equal(replay.loadedLength(), 0);
    replay.preview = { state: { time: 0, tick: 0, typedTime: new Map(), data: new Map() }, timeline: [{ time: 250, tick: 1, events: [], dynamics: new Map() }] };
    assert.equal(replay.loadedLength(), 250);
    assert.equal(await replay.getSnapshot(500), undefined, "unparsed times must not manufacture a snapshot");
    assert.equal(await replay.step(250, 1), 250);
    replay.preview.timeline.push({ time: 800, tick: 2, events: [], dynamics: new Map() });
    assert.equal(replay.length(), 1000);
    assert.equal(replay.loadedLength(), 800);
    replay.complete = true;
    assert.equal(replay.loadedLength(), 1000);
    assert.equal((await replay.getSnapshot(1000)).time, 1000);
    replay.error = new Error("Interrupted parsing");
    assert.equal(replay.loadedLength(), 800, "failed parsing must not mark the remainder loaded");
    assert.equal(replay.length(), 1000);
    replay.endTime = undefined;
    assert.equal(replay.length(), 800, "live streams retain their growing duration");
});

test("IPC rejects handler failures and releases settled calls", async () => {
    const { IpcInterface } = source("ipc");
    let receiveA, receiveB;
    const a = new IpcInterface({ on: cb => receiveA = cb, send: m => queueMicrotask(() => receiveB(m)) });
    const b = new IpcInterface({ on: cb => receiveB = cb, send: m => queueMicrotask(() => receiveA(m)) });
    b.resp("ok", async value => ({ data: value }));
    b.resp("fail", async () => { throw new Error("CRC failed"); });
    assert.equal(await a.invoke("ok", 42), 42);
    await assert.rejects(a.invoke("fail"), /CRC failed/);
    await assert.rejects(a.invoke("missing"), /No response/);
    for (const collection of a.promises.values()) assert.equal(collection.size, 0);
});

test("disk blocks preserve Maps/BigInts and playback seeks across boundaries with bounded cache", async () => {
    const store = await ReplayBlockStore.create();
    const { Replay } = source("replay");
    const { ModuleLoader } = source("moduleloader");
    ModuleLoader.registerEvent("Test.Counter", "1", {
        parse: async () => 0,
        exec: (data, api) => api.set("counter", data)
    });
    const replay = new Replay();
    const description = ["Test.Counter", "1"];
    description.typename = description[0]; description.version = description[1];
    replay.typemap.set(1, description);
    let reads = 0;
    replay.loadBlock = async id => { ++reads; return store.read(id); };
    try {
        for (let i = 0; i < 4; ++i) {
            const state = { time: i * 100, tick: i * 2, typedTime: new Map(), data: new Map([["counter", i * 2], ["steam", 76561190000000000n]]) };
            const timeline = [1, 2].map(n => ({ tick: i * 2 + n, time: i * 100 + n * 50, events: [{ type: 1, delta: 0, data: i * 2 + n }], dynamics: new Map() }));
            const id = await store.append({ state, timeline });
            replay.blocks.push({ id, start: state.time, end: state.time + 100 });
        }
        assert.equal(replay.length(), 400);
        for (const time of [0, 25, 50, 99, 100, 101, 250, 400, 60, 350]) {
            const snapshot = await replay.getSnapshot(time);
            assert.equal(snapshot.time, time);
            assert.equal(snapshot.data.get("counter"), Math.floor(time / 50));
            assert.equal(snapshot.data.get("steam"), 76561190000000000n);
            assert.ok(replay.loadedBlocks.size <= 2);
        }
        assert.ok(reads > 4, "backward seeks did not reload evicted blocks");
        await assert.rejects(store.read(-1), /Invalid/);
    } finally { await store.close(); }
    await assert.rejects(store.read(0), /closed/);
});

test("standalone clips retain the checkpoint, seek without the source cache, and reject corruption", async () => {
    const { writeClip, readClip, isClip } = require('../../Viewer/electron/build/replay/clip.cjs');
    const fsp = require('node:fs/promises');
    const { randomUUID } = require('node:crypto');
    const sourceStore = await ReplayBlockStore.create(), clipStore = await ReplayBlockStore.create();
    const target = path.resolve(__dirname, '../../artifacts/tests/clip-' + randomUUID() + '.gtfoclip');
    await fsp.mkdir(path.dirname(target), { recursive: true });
    const { Replay } = source('replay'), { ModuleLoader } = source('moduleloader');
    ModuleLoader.registerEvent('Test.ClipCounter', '1', { parse: async () => 0, exec: (data, api) => api.set('counter', data) });
    const original = new Replay();
    const type = ['Test.ClipCounter', '1']; type.typename = type[0]; type.version = type[1];
    original.typemap.set(1, type); original.types.set(type[0], 1);
    original.header.set('test', { steam: 76561190000000000n });
    original.loadBlock = id => sourceStore.read(id);
    try {
        for (let i = 0; i < 10; ++i) {
            const state = { time: i * 100, tick: i * 2, typedTime: new Map(), data: new Map([['counter', i * 2]]) };
            const timeline = [1, 2].map(n => ({ tick: i * 2 + n, time: i * 100 + n * 50, events: [{ type: 1, delta: 0, data: i * 2 + n }], dynamics: new Map() }));
            const id = await sourceStore.append({ state, timeline });
            original.blocks.push({ id, start: state.time, end: state.time + 100 });
        }
        original.complete = true;
        const selection = original.clipSelection(250, 650);
        await writeClip(target, selection, id => sourceStore.read(id));
        assert.equal(await isClip(target), true);
        await sourceStore.close();
        const loaded = await readClip(target, block => clipStore.append(block));
        const replay = new Replay();
        replay.typemap = loaded.manifest.typemap; replay.types = loaded.manifest.types; replay.header = loaded.manifest.header;
        replay.blocks.push(...loaded.blocks); replay.startTime = loaded.manifest.start; replay.endTime = loaded.manifest.end;
        replay.loadBlock = id => clipStore.read(id); replay.complete = true;
        assert.equal(replay.length(), 650);
        assert.equal(replay.header.get('test').steam, 76561190000000000n);
        for (const time of [250, 249.999, 450, 650, 550, 251]) assert.equal((await replay.getSnapshot(time)).data.get('counter'), Math.floor(time / 50));
        assert.equal(await replay.step(250, -1), 250);
        assert.equal(await replay.step(650, 1), 650);
        assert.throws(() => replay.setRange({ start: 0, end: 500 }));
        const good = await fsp.readFile(target), damaged = Buffer.from(good); damaged[16] ^= 1;
        await fsp.writeFile(target, damaged);
        await assert.rejects(readClip(target, block => clipStore.append(block)), /integrity/);
        await fsp.writeFile(target, good.subarray(0, good.length - 2));
        await assert.rejects(readClip(target, block => clipStore.append(block)), /truncated/);
        await fsp.writeFile(target, good);
        await assert.rejects(writeClip(target, selection, async () => { throw new Error('injected cache failure'); }), /injected/);
        assert.deepEqual(await fsp.readFile(target), good, 'failed export overwrote an existing file');
    } finally { await sourceStore.close(); await clipStore.close(); await fsp.unlink(target); }
});

test('committed cursor preserves interpolation, event timing and immutable returned frames across seeks', async()=>{
 const {Replay}=source('replay'),{ModuleLoader}=source('moduleloader');let executions=0;
 ModuleLoader.registerEvent('Test.CursorEvent','1',{parse:async()=>0,exec:(_,api)=>{executions++;api.set('events',api.get('events')+1)}});
 ModuleLoader.registerDynamic('Test.CursorMotion','1',{main:{parse:async()=>0,exec:(id,value,api,lerp)=>{const entity=api.get('entities').get(id);entity.x+=(value-entity.x)*lerp}},spawn:{parse:async()=>0,exec(){}},despawn:{parse:async()=>{},exec(){}}});
 const create=()=>{const r=new Replay();for(const [id,name] of [[1,'Test.CursorEvent'],[2,'Test.CursorMotion']]){const type=[name,'1'];type.typename=name;type.version='1';r.typemap.set(id,type)}
 r.preview={state:{time:0,tick:0,typedTime:new Map(),data:new Map([['events',0],['entities',new Map([[1,{x:0}]])]])},timeline:Array.from({length:10},(_,i)=>({time:(i+1)*100,tick:i+1,events:[{type:1,delta:25,data:null}],dynamics:new Map([[2,[{id:1,data:(i+1)*10}]]])}))};return r};
 const r=create(),held=[];
 for(let time=0;time<=1000;time+=10){const frame=await r.getSnapshot(time);assert.equal(frame.data.get('events'),Math.min(10,Math.floor((time+25)/100)));assert.ok(Math.abs(frame.data.get('entities').get(1).x-time/10)<1e-8);held.push({frame,copy:structuredClone(frame)})}
 assert.ok(executions<80,'completed history is not replayed for every display frame');
 for(const {frame,copy} of held)assert.deepEqual(frame,copy,'later frames must not mutate an earlier snapshot');
 for(const time of [75,799,301,999,0,450,450,760])assert.deepEqual(await r.getSnapshot(time),await create().getSnapshot(time),'seek '+time);
 const original=r.preview;r.preview=structuredClone(original);r.preview.state.data.set('events',50);
 assert.equal((await r.getSnapshot(150)).data.get('events'),51,'a replaced live preview invalidates the cursor');
});
