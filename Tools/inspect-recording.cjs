// Machine-readable diagnostics without opening the desktop UI. Build Viewer/electron first.
const { ReplayContainerReader } = require('../Viewer/electron/build/replay/container.cjs');
async function main() {
    if (process.argv.length !== 3) throw new Error('Usage: node Tools/inspect-recording.cjs <recording.gtfo>');
    const reader = await ReplayContainerReader.open(process.argv[2]);
    if (!reader) throw new Error('This file is not a replay container.');
    try {
        const recorder = await reader.readDiagnostics();
        console.log(JSON.stringify({ schemaVersion: 1, container: reader.info, recorder: recorder ?? null }, null, 2));
        if (!reader.info.complete || reader.info.warning || recorder?.Failure) process.exitCode = 1;
    } finally { await reader.close(); }
}
main().catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 2; });
