const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../../Viewer/assets/node_modules/typescript');
const source = ts.transpileModule(fs.readFileSync('Viewer/assets/src/replay/parser.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText;

test('parser preserves open live source, rejects fatal worker errors, and ignores disposed events', async t => {
    const calls = [], workers = [], bridges = [];
    class Worker extends EventTarget { postMessage() {} }
    class ShimWorker {
        constructor(path, ready) { this.worker = new Worker(); workers.push(this); this.ready = () => ready(this.worker); }
        terminate() { this.terminated = true; }
    }
    class IpcInterface {
        constructor(api) { this.events = {}; this.responses = {}; bridges.push(this); api.on(() => {}); }
        on(name, cb) { this.events[name] = cb; }
        resp(name, cb) { this.responses[name] = cb; }
        send() {}
    }
    const window = { api: { invoke: async (name, ...args) => { calls.push([name, ...args]); return 'cache-1'; }, send: (...args) => calls.push(args) } };
    const document = { baseURI: 'file:///viewer/' };
    class Replay { constructor() { this.header = new Map(); } }
    const mod = { exports: {} };
    new Function('require','module','exports','Worker','window','document',source)(name => ({ ShimWorker, IpcInterface, Replay, ModuleLoader: { links: new Map() } }), mod, mod.exports, Worker, window, document);
    const parser = new mod.exports.Parser();
    const replay = parser.parse({ finite: false });
    workers[0].ready();
    await new Promise(resolve => setImmediate(resolve));
    await bridges[0].responses.open();
    assert.equal(calls.some(([name]) => name === 'open'), false);
    let errors = 0;
    const callback = () => errors++;
    parser.addEventListener('error', callback);
    parser.removeEventListener('error', callback);
    bridges[0].events.error({ message: 'warning', verbose: 'details', type: 'warning' });
    assert.equal(errors, 0);
    assert.equal(replay.error, undefined);
    parser.addEventListener('error', callback, { once: true });
    bridges[0].events.error({ message: 'bad bytes', verbose: 'stack' });
    assert.match(replay.error.message, /bad bytes/);
    assert.equal(errors, 1);
    parser.addEventListener('error', callback, { once: true });
    bridges[0].events.error({ message: 'another error', verbose: 'stack' });
    assert.equal(errors, 2);
    parser.terminate(); parser.terminate();
    bridges[0].events.error({ message: 'late error', verbose: 'stack' });
    assert.equal(errors, 2);
    assert.equal(calls.filter(([name]) => name === 'close').length, 1);
    assert.equal(calls.filter(([name]) => name === 'replayCacheClose').length, 1);
});
