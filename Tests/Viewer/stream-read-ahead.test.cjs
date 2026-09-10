const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const ts = require('../../Viewer/assets/node_modules/typescript');
const source = ts.transpileModule(fs.readFileSync('Viewer/assets/src/replay/stream.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;
const mod = { exports: {} };
new Function('module', 'exports', source)(mod, mod.exports);
const { FileStream } = mod.exports;
const windowSize = 1024 * 1024;

test('disk parsing caches bounded ranges, preserves peeks and boundary-spanning reads, and stops at EOF', async () => {
    const data = Uint8Array.from({ length: windowSize * 2 + 31 }, (_, i) => i % 251);
    const calls = [];
    const stream = new FileStream({ invoke: async (name, index, count, wait, readAhead) => {
        calls.push({ name, index, count, wait, readAhead });
        assert.equal(name, 'getBytes');
        assert.equal(wait, false);
        assert.equal(readAhead, windowSize);
        return index + count <= data.length ? data.slice(index, index + Math.max(count, readAhead)) : undefined;
    } }, { path: 'recording.gtfo', finite: true });
    for (let i = 0; i < 1000; i++) {
        assert.equal(await stream.cacheNetworkBuffer(), false);
        const peek = await stream.peekBytes(4);
        assert.deepEqual((await stream.getBytes(4)).bytes, peek.bytes);
        assert.deepEqual(peek.bytes, data.slice(i * 4, i * 4 + 4));
    }
    assert.equal(calls.length, 1, 'Small frame reads must not each cross IPC.');
    let offset = 4000;
    for (const count of [windowSize - offset - 2, 7, windowSize, 26]) {
        assert.deepEqual((await stream.getBytes(count)).bytes, data.slice(offset, offset + count));
        offset += count;
    }
    assert.equal(offset, data.length);
    assert.equal((await stream.getBytes(4)).bytes.length, 0);
    assert.ok(calls.length <= 5);
});

test('live streams request exact bytes and keep using the network buffer', async () => {
    const calls = [];
    const stream = new FileStream({ invoke: async (name, ...args) => {
        calls.push([name, ...args]);
        return name === 'getNetBytes' ? undefined : new Uint8Array(args[1]);
    } }, { finite: false });
    await stream.cacheNetworkBuffer();
    await stream.getBytes(4);
    assert.deepEqual(calls, [['getNetBytes', 0], ['getBytes', 0, 4, true, 0]]);
});

test('main process read-ahead handles compressed and raw replay tails and limits buffer size', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtfo-read-ahead-'));
    const sourcePath = path.resolve('Viewer/electron/build/replay/filemanager.cjs');
    const localRequire = createRequire(sourcePath);
    const main = { exports: {} };
    new Function('require', 'module', 'exports', fs.readFileSync(sourcePath, 'utf8'))(name => {
        if (name === 'electron') return { app: { getPath: () => dir } };
        if (name === '../main.cjs') return { default: { post() {} } };
        return localRequire(name);
    }, main, main.exports);
    const manager = new main.exports.FileManager();
    const handlers = new Map();
    manager.setupIPC({ handle: (name, callback) => handlers.set(name, callback), on() {} });
    const read = (...args) => handlers.get('getBytes')(undefined, ...args);
    const raw = fs.readFileSync('artifacts/fixtures/container.gtfo.raw');
    const rawPath = path.join(dir, 'raw.gtfo');
    fs.writeFileSync(rawPath, raw);
    try {
        for (const file of ['artifacts/fixtures/container.gtfo', rawPath]) {
            await manager.open(path.resolve(file));
            assert.deepEqual(await read(0, 4, false, windowSize), raw);
            assert.deepEqual(await read(raw.length - 4, 4, false, windowSize), raw.subarray(-4));
            assert.equal(await read(raw.length, 4, false, windowSize), undefined);
            assert.equal((await read(0, 4, true, windowSize)).length, 4, 'Live reads must not wait for a cache window.');
            await assert.rejects(() => read(0, 4, false, windowSize + 1), /read-ahead/);
        }
    } finally {
        await manager.dispose();
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
