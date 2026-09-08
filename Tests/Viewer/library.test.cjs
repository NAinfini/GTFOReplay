const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { ReplayPreferences } = require('../../Viewer/electron/build/replay/preferences.cjs');
const { ReplayLibrary } = require('../../Viewer/electron/build/replay/library.cjs');

test('folder library watches nested additions/changes/deletions and preserves favorites/progress/notes', async () => {
    const directory = path.resolve(__dirname, '../../artifacts/tests/library-' + randomUUID());
    const nested = path.join(directory, '\u5b50\u76ee\u5f55');
    await fs.mkdir(nested, { recursive: true });
    const file = path.join(nested, '\u6d4b\u8bd5.gtfo');
    const imported = path.join(directory, '\u5355\u72ec\u6253\u5f00.zip');
    const settingsPath = path.join(directory, 'settings.json');
    const preferences = new ReplayPreferences(settingsPath);
    const library = new ReplayLibrary(preferences);
    const until = async predicate => {
        for (let n = 0; n < 60; ++n) {
            const state = await library.snapshot();
            if (predicate(state)) return state;
            await delay(100);
        }
        assert.fail('filesystem watcher did not report the expected change');
    };
    try {
        await library.configure([directory], directory);
        await fs.writeFile(file, 'one');
        await until(state => state.files.some(entry => entry.path === file && entry.size === 3));
        await Promise.all([
            preferences.saveFile({ path: file, favorite: true, resume: 123456, duration: 234567, identity: 'session:test' }),
            preferences.saveBookmarks('session:test', [{ id: 'a', time: 123456, label: '\u68c0\u67e5\u4f4d\u7f6e', note: '\u8fd9\u91cc\u6709\u5dee\u5f02' }])
        ]);
        await fs.appendFile(file, 'two');
        let state = await until(state => state.files.some(entry => entry.size === 6));
        assert.equal(state.defaultFolder, await fs.realpath(directory));
        assert.equal(state.files[0].resume, 123456);
        assert.equal(state.files[0].favorite, true);
        await fs.writeFile(imported, 'zip');
        await library.remember(imported);
        await library.configure([]);
        state = await library.snapshot();
        assert.equal(state.files.length, 2, 'explicitly opened or saved files should remain in recent files');
        assert.equal(state.folders.length, 0);
        assert.equal((await new ReplayPreferences(settingsPath).bookmarks('session:test'))[0].label, '\u68c0\u67e5\u4f4d\u7f6e');
        await fs.unlink(file);
        await until(state => !state.files.some(entry => entry.path === file));
        await assert.rejects(library.requireFile(file));
        assert.throws(() => preferences.saveFile({ path: imported, resume: NaN }));
    } finally {
        await library.close();
        for (const entry of [file, imported, settingsPath]) await fs.unlink(entry).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await fs.rmdir(nested); await fs.rmdir(directory);
    }
});
