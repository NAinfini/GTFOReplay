// Read-only source comparison using the production C# writer and desktop reader.
// Usage: node Tools/benchmark-replay-container.cjs extract|verify source.gtfo output-directory
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { ReplayContainerReader } = require('../Viewer/electron/build/replay/container.cjs');

async function main() {
    if (process.argv.length !== 5 || !['extract', 'verify'].includes(process.argv[2])) throw new Error('Expected extract|verify, source replay and output directory.');
    const mode = process.argv[2];
    const source = path.resolve(process.argv[3]);
    const directory = path.resolve(process.argv[4]);
    await fs.mkdir(directory, { recursive: true });
    const rawPath = path.join(directory, 'decoded.raw');
    const outputPath = path.join(directory, 'grouped.gtfo');
    const reportPath = path.join(directory, 'comparison.json');
    const sourceReportPath = path.join(directory, 'source.json');
    const before = performance.now();
    const original = await ReplayContainerReader.open(source);
    if (!original) throw new Error('Expected a replay container.');
    let grouped;
    try {
        if (!original.info.complete || original.info.warning) throw new Error('Source recording is not complete.');
        const sourceIndexMs = performance.now() - before;
        if (mode === 'extract') {
            const rawFile = await fs.open(rawPath, 'wx');
            const hash = createHash('sha256');
            const decodeStart = performance.now();
            try {
                for (let offset = 0; offset < original.info.rawBytes; offset += 1024 * 1024) {
                    const bytes = await original.read(offset, Math.min(1024 * 1024, original.info.rawBytes - offset));
                    hash.update(bytes);
                    await rawFile.writeFile(bytes);
                }
            } finally { await rawFile.close(); }
            const report = { source, sourceInfo: original.info, sourceIndexMs, sourceDecodeMs: performance.now() - decodeStart, rawSha256: hash.digest('hex') };
            await fs.writeFile(sourceReportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
            console.log(JSON.stringify(report, null, 2));
            return;
        }
        const sourceReport = JSON.parse(await fs.readFile(sourceReportPath, 'utf8'));
        if (sourceReport.source !== source || sourceReport.sourceInfo.physicalBytes !== original.info.physicalBytes) throw new Error('Source changed since extraction.');
        const indexStart = performance.now();
        grouped = await ReplayContainerReader.open(outputPath);
        const groupedIndexMs = performance.now() - indexStart;
        if (!grouped.info.complete || grouped.info.warning || grouped.info.duration !== original.info.duration || grouped.info.rawBytes !== original.info.rawBytes) throw new Error('Repacked metadata mismatch.');
        const groupedHash = createHash('sha256');
        const groupedDecodeStart = performance.now();
        for (let offset = 0; offset < grouped.info.rawBytes; offset += 1024 * 1024) {
            groupedHash.update(await grouped.read(offset, Math.min(1024 * 1024, grouped.info.rawBytes - offset)));
        }
        const groupedDecodeMs = performance.now() - groupedDecodeStart;
        const rawSha256 = sourceReport.rawSha256;
        if (groupedHash.digest('hex') !== rawSha256) throw new Error('Decoded replay data changed.');
        const reads = [];
        let seed = 123456;
        for (let i = 0; i < 200; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const offset = seed % (original.info.rawBytes - 4096);
            const expected = await original.read(offset, 4096);
            const start = performance.now();
            const actual = await grouped.read(offset, 4096);
            reads.push(performance.now() - start);
            if (!actual.equals(expected)) throw new Error(`Random range mismatch at ${offset}.`);
        }
        reads.sort((a, b) => a - b);
        const report = {
            source, output: outputPath, sourceInfo: original.info, groupedInfo: grouped.info,
            reductionPercent: 100 * (1 - grouped.info.physicalBytes / original.info.physicalBytes),
            sourceIndexMs: sourceReport.sourceIndexMs, groupedIndexMs, sourceDecodeMs: sourceReport.sourceDecodeMs, groupedDecodeMs,
            randomReads: reads.length, randomReadMedianMs: reads[100], randomReadP95Ms: reads[190],
            rawSha256, note: 'Single local run with warm OS cache; range-read timings exclude scene reconstruction.'
        };
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(JSON.stringify(report, null, 2));
    } finally { await original.close(); await grouped?.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
