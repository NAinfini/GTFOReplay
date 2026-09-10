const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { brotliCompressSync } = require("node:zlib");
const { ReplayContainerReader, crc32 } = require("../../Viewer/electron/build/replay/container.cjs");

const fixture = path.resolve(__dirname, "../../artifacts/fixtures/container.gtfo");

test("concurrent refresh and reads cannot duplicate chunks or cache accounting", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gtfo-container-race-"));
    const file = path.join(dir, "growing.gtfo");
    const bytes = await fs.readFile(fixture);
    const firstEnd = 8 + 32 + bytes.readUInt32LE(12);
    await fs.writeFile(file, bytes.subarray(0, firstEnd));
    const reader = await ReplayContainerReader.open(file);
    try {
        await fs.appendFile(file, bytes.subarray(firstEnd));
        await Promise.all(Array.from({ length: 8 }, () => reader.refresh()));
        assert.equal(reader.info.chunks, 2);
        assert.equal(reader.info.warning, undefined);
        const expected = await fs.readFile(fixture + ".raw");
        const results = await Promise.all(Array.from({ length: 12 }, () => reader.read(0, expected.length)));
        for (const result of results) assert.deepEqual(result, expected);
        assert.equal(reader.cacheBytes, [...reader.cache.values()].reduce((n, b) => n + b.length, 0));
    } finally {
        await reader.close();
        await fs.rm(dir, { recursive: true, force: true });
    }
});

function frame(time) {
    const bytes = Buffer.alloc(24, 42);
    bytes.writeInt32LE(20);
    bytes.writeUInt32LE(time, 4);
    return bytes;
}

function encodedContainer(version, blocks, times, complete = true) {
    const result = [Buffer.from(`GTRPLY0${version}`)];
    let offset = 0;
    for (let i = 0; i < blocks.length + (complete ? 1 : 0); i++) {
        const raw = blocks[i];
        const encoded = raw ? brotliCompressSync(raw) : Buffer.alloc(0);
        const header = Buffer.alloc(32);
        header.writeUInt32LE(version === 2 ? 0x324b4843 : 0x334b4843);
        header.writeUInt32LE(encoded.length, 4);
        header.writeUInt32LE(raw?.length ?? 0, 8);
        header.writeBigUInt64LE(BigInt(offset), 12);
        header.writeUInt32LE(times[i] ?? times.at(-1), 20);
        header.writeUInt32LE(raw ? crc32(raw) : 0, 24);
        header.writeUInt32LE(raw ? (i === 0 ? 1 : 0) : 2, 28);
        result.push(header, encoded);
        offset += raw?.length ?? 0;
    }
    return Buffer.concat(result);
}

test("reads persisted v2 and v3 blocks, rejects invalid frames even with valid CRC", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gtfo-container-format-"));
    const file = path.join(dir, "test.gtfo");
    const header = frame(0), one = frame(100), two = frame(200), three = frame(2200);
    const raw = Buffer.concat([header, one, two, three]);
    try {
        for (const version of [2, 3]) {
            const blocks = version === 2 ? [header, one, two, three] : [header, Buffer.concat([one, two]), three];
            const times = version === 2 ? [0, 100, 200, 2200] : [0, 200, 2200];
            await fs.writeFile(file, encodedContainer(version, blocks, times));
            const reader = await ReplayContainerReader.open(file);
            try {
                assert.equal(reader.info.format, `GTRPLY0${version}`);
                assert.equal(reader.info.complete, true);
                // Arbitrary forward/backward ranges include frame and physical block boundaries.
                for (const [offset, length] of [[70, 12], [0, 96], [22, 54], [48, 8], [24, 24]]) {
                    assert.deepEqual(await reader.read(offset, length), raw.subarray(offset, offset + length));
                }
            } finally { await reader.close(); }
        }
        const invalidLength = Buffer.from(two);
        invalidLength.writeInt32LE(200);
        const cases = [
            { blocks: [header, Buffer.concat([one, invalidLength])], times: [0, 200] },
            { blocks: [header, Buffer.concat([two, one])], times: [0, 100] },
            { blocks: [header, Buffer.concat([one, two])], times: [0, 199] },
            { blocks: [header, two, one], times: [0, 200, 300] },
            { blocks: [Buffer.concat([header, one])], times: [0] },
            { blocks: [header, Buffer.concat([one, two.subarray(0, 3)])], times: [0, 200] }
        ];
        for (const { blocks, times } of cases) {
            await fs.writeFile(file, encodedContainer(3, blocks, times));
            const reader = await ReplayContainerReader.open(file);
            try { await assert.rejects(() => reader.read(0, reader.info.rawBytes), /integrity/); }
            finally { await reader.close(); }
        }
        await fs.writeFile(file, encodedContainer(3, [header, Buffer.concat([one, two])], [0, 200], false));
        const unfinished = await ReplayContainerReader.open(file);
        try {
            assert.equal(unfinished.info.recovered, true);
            assert.equal(unfinished.info.duration, 200);
            assert.deepEqual(await unfinished.read(0, 72), raw.subarray(0, 72));
        } finally { await unfinished.close(); }
        await fs.writeFile(file, Buffer.from("GTRPLY04"));
        await assert.rejects(() => ReplayContainerReader.open(file), /Unsupported/);
    } finally {
        await fs.unlink(file);
        await fs.rmdir(dir);
    }
});

test("reads C#-written Brotli chunks by logical range", async () => {
    const reader = await ReplayContainerReader.open(fixture);
    try {
        const raw = await fs.readFile(fixture + ".raw");
        assert.equal(reader.info.complete, true);
        assert.equal(reader.info.format, "GTRPLY03");
        assert.equal(reader.info.chunks, 2);
        assert.equal(reader.info.duration, 2500);
        assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
        assert.deepEqual(await reader.read(0, raw.length), raw);
        assert.deepEqual(await reader.read(130, 20), raw.subarray(130, 150));
        assert.deepEqual(await reader.read(270, 20), raw.subarray(270, 290));
        assert.equal(await reader.read(raw.length, 1), undefined);
        await assert.rejects(() => reader.read(-1, 5), /range/);
    } finally { await reader.close(); }
});

test("recovers complete prefix and detects corruption without trusting sizes", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gtfo-container-"));
    const bytes = await fs.readFile(fixture);
    const firstEnd = 8 + 32 + bytes.readUInt32LE(12);
    try {
        const file = path.join(dir, "partial.gtfo");
        await fs.writeFile(file, bytes.subarray(0, firstEnd + 10));
        const reader = await ReplayContainerReader.open(file);
        assert.equal(reader.info.complete, false);
        assert.equal(reader.info.recovered, true);
        assert.equal(reader.info.chunks, 1);
        assert.equal((await reader.read(0, reader.info.rawBytes)).length, 136);
        await fs.writeFile(file, bytes);
        await reader.refresh();
        assert.equal(reader.info.complete, true);
        assert.equal(reader.info.chunks, 2);
        await reader.close();

        const badCrc = Buffer.from(bytes);
        badCrc[32] ^= 1;
        await fs.writeFile(file, badCrc);
        const corrupt = await ReplayContainerReader.open(file);
        await assert.rejects(() => corrupt.read(0, 8), /integrity/);
        await corrupt.close();

        const oversized = Buffer.from(bytes);
        oversized.writeUInt32LE(0xffffffff, 16);
        await fs.writeFile(file, oversized);
        const invalid = await ReplayContainerReader.open(file);
        assert.match(invalid.info.warning, /size/);
        assert.equal(invalid.info.rawBytes, 0);
        await invalid.close();
    } finally {
        assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(dir).startsWith("gtfo-container-"));
        await fs.rm(dir, { recursive: true, force: true });
    }
});
