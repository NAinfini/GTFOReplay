const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');

test('overlapping parser caches keep their owners when an old session closes', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gtfo-cache-owner-'));
    const source = path.resolve('Viewer/electron/build/replay/filemanager.cjs');
    const localRequire = createRequire(source);
    const mod = { exports: {} };
    new Function('require','module','exports',fs.readFileSync(source,'utf8'))(name => {
        if (name === 'electron') return { app: { getPath: () => dir } };
        if (name === '../main.cjs') return { default: { post() {} } };
        return localRequire(name);
    }, mod, mod.exports);
    const manager = new mod.exports.FileManager();
    const handlers = new Map();
    manager.setupIPC({ handle: (name, callback) => handlers.set(name, callback), on() {} });
    const invoke = (name, ...args) => handlers.get(name)(undefined, ...args);
    try {
        const [old, current] = await Promise.all([invoke('replayCacheCreate'), invoke('replayCacheCreate')]);
        assert.notEqual(old, current);
        await invoke('replayCacheAppend', old, { owner: 'old' });
        await invoke('replayCacheAppend', current, { owner: 'current' });
        await invoke('replayCacheClose', old);
        assert.deepEqual(await invoke('replayCacheRead', current, 0), { owner: 'current' });
        assert.throws(() => invoke('replayCacheRead', old, 0), /expired/);
        await invoke('replayCacheClose', old);
        assert.deepEqual(await invoke('replayCacheRead', current, 0), { owner: 'current' });
    } finally { await manager.dispose(); await fsp.rm(dir, { recursive: true, force: true }); }
});
