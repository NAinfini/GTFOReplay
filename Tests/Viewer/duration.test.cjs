const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readRawDuration } = require('../../Viewer/electron/build/replay/duration.cjs');

test('file metadata and opening progress are available before payload parsing', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'replay-metadata-'));
    const source = path.resolve(__dirname, '../../Viewer/electron/build/replay/filemanager.cjs');
    const localRequire = require('node:module').createRequire(source);
    const mod = { exports: {} };
    new Function('require', 'module', 'exports', await fs.readFile(source, 'utf8'))(name => {
        if (name === 'electron') return { app: { getPath: () => directory } };
        if (name === '../main.cjs') return { default: { post() {} } };
        return localRequire(name);
    }, mod, mod.exports);
    const manager = new mod.exports.FileManager();
    const handlers = new Map();
    manager.setupIPC({ handle: (name, callback) => handlers.set(name, callback), on() {} });
    const messages = [];
    const event = { sender: { isDestroyed: () => false, send: (...message) => messages.push(message) } };
    try {
        for (const suffix of ['', '.raw']) {
            messages.length = 0;
            await handlers.get('open')(event, { path: path.resolve(__dirname, '../../artifacts/fixtures/container.gtfo' + suffix), finite: true });
            const info = await handlers.get('replayFileInfo')();
            assert.equal(info.duration, suffix ? 2000 : 2500); // Raw files end at their final tick; the container also records its 500 ms tail.
            assert.ok(info.rawBytes > 0);
            assert.ok(messages.some(([name, value]) => name === 'replayOpenProgress' && value.phase === 'readingDuration' && value.loaded === value.total && value.total > 0));
            assert.equal(messages.at(-1)[1].phase, 'loadingScene');
        }
    } finally {
        await manager.dispose();
        await fs.unlink(path.join(directory, 'replay-library.json'));
        await fs.rmdir(directory);
    }
});

test('raw duration scans frame headers and rejects invalid boundaries', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'replay-duration-'));
    const file = path.join(directory, 'test.gtfo');
    const frame = (payload) => { const size = Buffer.alloc(4); size.writeInt32LE(payload.length); return Buffer.concat([size, payload]); };
    const tick = time => { const payload = Buffer.alloc(120); payload.writeUInt32LE(time); return frame(payload); };
    const bytes = Buffer.concat([frame(Buffer.from('header')), tick(100), tick(3600000)]);
    try {
        await fs.writeFile(file, bytes);
        const updates = [];
        assert.deepEqual(await readRawDuration(file, (...value) => updates.push(value)), { duration: 3600000, rawBytes: bytes.length });
        assert.deepEqual(updates[0], [0, bytes.length]);
        assert.deepEqual(updates.at(-1), [bytes.length, bytes.length]);
        await fs.writeFile(file, bytes.subarray(0, bytes.length - 1));
        await assert.rejects(readRawDuration(file), /truncated/);
        await fs.writeFile(file, Buffer.concat([frame(Buffer.from('header')), tick(200), tick(100)]));
        await assert.rejects(readRawDuration(file), /order/);
        await fs.writeFile(file, Buffer.from([255, 255, 255, 127]));
        await assert.rejects(readRawDuration(file), /Invalid/);
    } finally {
        await fs.unlink(file);
        await fs.rmdir(directory);
    }
});
