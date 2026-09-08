const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ts = require('../../Viewer/electron/node_modules/typescript');

function execute(file, imports, globals = {}) {
    const exports = {};
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 }
    }).outputText;
    vm.runInNewContext(code, { exports, require: id => imports[id], ...globals });
    return exports;
}

test('normal startup opens the original updater; skip-launcher opens the viewer', () => {
    for (const skip of [false, true]) {
        const calls = [];
        const app = { commandLine: { appendSwitch() {} }, disableDomainBlockingFor3DAPIs() {} };
        execute('Viewer/electron/src/app.cts', {
            electron: { app },
            './main.cjs': { default: { main: received => { assert.equal(received, app); calls.push('viewer'); } } },
            './updater.cjs': { default: { main: received => { assert.equal(received, app); calls.push('updater'); } } }
        }, { process: { argv: skip ? ['--skip-launcher'] : [] } });
        assert.deepEqual(calls, [skip ? 'viewer' : 'updater']);
    }
});

test('updater checks upstream releases, offers manual download, and hands off on skip', async () => {
    const app = new EventEmitter();
    app.isReady = () => true;
    const handlers = new Map();
    const ipcMain = new EventEmitter();
    ipcMain.handle = (name, callback) => handlers.set(name, callback);
    const windows = [];
    let starts = 0;
    let release = { tag_name: 'test-current', assets: [] };
    class BrowserWindow extends EventEmitter {
        constructor(options) {
            super();
            this.options = options;
            this.webContents = { mainFrame: {}, setWindowOpenHandler() {}, send() {} };
            windows.push(this);
        }
        loadFile(file) { this.file = file; }
        show() {}
        close() { this.emit('closed'); app.emit('window-all-closed'); }
    }
    const { default: Updater } = execute('Viewer/electron/src/updater.cts', {
        electron: { BrowserWindow, ipcMain, shell: {} },
        fs: { existsSync: () => false }, path, yauzl: {},
        './git.cjs': { __git_tag__: 'test-current' },
        './main.cjs': { default: { main: received => { assert.equal(received, app); starts++; } } }
    }, {
        __dirname: 'fixture', URL, AbortSignal, console,
        fetch: async url => {
            assert.equal(String(url), 'https://api.github.com/repos/randomuserhi/GTFOReplay/releases');
            return { status: 200, json: async () => [release] };
        }
    });
    Updater.main(app);
    const window = windows[0];
    assert.equal(window.options.webPreferences.contextIsolation, true);
    assert.match(window.options.webPreferences.preload, /updater_preload\.cjs$/);
    assert.match(window.file, /assets[\\/]updater[\\/]main\.html$/);
    const check = handlers.get('download-package');
    assert.equal(await check(), undefined);
    release = { tag_name: 'test-next', assets: [], html_url: 'https://github.com/randomuserhi/GTFOReplay/releases/tag/test-next' };
    assert.equal(await check(), release);
    ipcMain.emit('close', { senderFrame: {} });
    assert.equal(starts, 0);
    ipcMain.emit('close', { senderFrame: window.webContents.mainFrame });
    assert.equal(starts, 1);
    assert.equal(Updater.cancelled, true);
    assert.equal(app.listenerCount('window-all-closed'), 0);
});
