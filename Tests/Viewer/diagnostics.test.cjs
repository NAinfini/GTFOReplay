const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readRecordingDiagnostics } = require('../../Viewer/electron/build/replay/diagnostics.cjs');

test('recorder report is bounded, session checked, and missing reports stay unknown', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gtfo-diagnostics-'));
    const source = path.join(dir, 'session.gtfo'), file = `${source}.diagnostics.json`;
    try {
        assert.equal(await readRecordingDiagnostics(source), undefined);
        const report = { SessionId: 'session-a', Failure: '\u78c1\u76d8\u5199\u5165\u5931\u8d25', Ticks: 12 };
        await fs.writeFile(file, JSON.stringify(report));
        assert.deepEqual(await readRecordingDiagnostics(source, 'session-a'), report);
        await assert.rejects(readRecordingDiagnostics(source, 'session-b'), /different session/);
        await fs.writeFile(file, '{broken');
        await assert.rejects(readRecordingDiagnostics(source), SyntaxError);
        await fs.writeFile(file, ' '.repeat(1024 * 1024 + 1));
        await assert.rejects(readRecordingDiagnostics(source), /exceed/);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
