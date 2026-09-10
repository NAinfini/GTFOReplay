const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('../../Viewer/assets/node_modules/typescript');

test('opening recordings and clips ignores saved positions and starts at the retained beginning', async () => {
    const source = ts.transpileModule(fs.readFileSync('Viewer/assets/src/main/routes/player/index.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText;
    const signal = initial => function (value) { if (arguments.length) initial = value; return initial; };
    const calls = [];
    let clipStart;
    const view = {
        replay: signal(), time: signal(123456), pause: signal(true), live: signal(false),
        ready() { this.time(0); }, clearLogs() {}, addLog() {},
        renderer: { dispose() {} }
    };
    class Replay { constructor() { this.blocks = []; } length() { return 300000; } setRange() {} }
    class Parser {
        constructor() { this.events = {}; }
        addEventListener(name, callback) { this.events[name] = callback; }
        parse() { return new Replay(); }
        terminate() {}
    }
    const html = arg => Array.isArray(arg) ? {} : { box() {} };
    const css = () => {}; css.class = () => '';
    const window = { api: {
        invoke: async (name, ...args) => {
            calls.push([name, ...args]);
            if (name === 'replayProgress') return { resume: 123456 };
            if (name === 'open' && clipStart !== undefined) return {
                token: 'clip', manifest: { start: clipStart, end: 300000, identity: 'test' }, blocks: []
            };
        }, send() {}
    } };
    const exports = {};
    new Function('require', 'exports', 'window', source)(() => ({
        html, Style: callback => callback({ css }), View: () => view, Replay, Parser,
        DataStore: { clear() {} }, app: { load() {}, nav: { linkedStatus() {} } }
    }), exports, window);
    const player = exports.Player();
    await player.open('recording.gtfo');
    player.parser.events.eoh();
    assert.equal(view.time(), 0);
    view.time(123456);
    await player.open('recording.gtfo');
    player.parser.events.eoh();
    assert.equal(view.time(), 0, 'reopening must reset the previous session position');
    clipStart = 15000;
    await player.open('clip.gtfo');
    assert.equal(view.time(), 15000, 'clips start at their first retained frame');
    assert.equal(calls.some(([name]) => name === 'replayProgress' || name === 'saveReplayProgress'), false);
    assert.deepEqual(calls.find(([name]) => name === 'recordReplayViewing'), ['recordReplayViewing', 'clip.gtfo', 'test', 300000]);
});
