# GTRPLY03 container

New recordings start with the eight ASCII bytes `GTRPLY03`. The header is written immediately in its own Brotli block. Subsequent blocks group length-prefixed ticks, using Brotli `CompressionLevel.Fastest`. The logical decoded byte stream remains the replay type map/header followed by length-prefixed ticks; the live spectator protocol and gameplay sampling rates are unchanged.

The recorder flushes a block when an appended tick reaches two seconds from the block's first tick, or when buffering would exceed 1 MiB. A single larger frame is written directly without splitting (64 MiB frame limit). Blocks end on frame boundaries. There is no idle timer: if no ticks are emitted, the pending tail waits for the next tick, a spectator-prefix request, or teardown. These flushes may produce shorter blocks. Ordinary recording never waits for compression on the game thread.

Each chunk starts with a 32-byte little-endian header:

| Offset | Type | Meaning |
| --- | --- | --- |
| 0 | uint32 | `0x334b4843` (`CHK3`) |
| 4 | uint32 | Compressed length |
| 8 | uint32 | Total decoded block length, including each frame's four-byte length prefix |
| 12 | uint64 | Logical byte offset |
| 20 | uint32 | Final tick timestamp in the block, in milliseconds; zero for the header |
| 24 | uint32 | IEEE CRC32 of the entire decoded block |
| 28 | uint32 | 1: first/header block; 0: one or more ticks; 2: completion record |

The completion record has zero lengths and checksum, the final logical offset, and expedition duration. It must be the last physical record. Normal completion flushes the partial block first. A capture failure also drains accepted frames and flushes the tail, but omits completion. A disk-write failure is terminal: the recorder never retries a partially written block or appends a success footer. A process crash can lose the buffered tail and any outstanding disk queue; all physically complete blocks remain recoverable.

Without completion, the reader exposes its complete prefix and reports the condition. Invalid chunk headers stop indexing; payload decoding validates exact decoded length, checksum, every inner frame boundary, monotonically ordered tick timestamps and the final timestamp against the block header. Invalid sizes never cause unbounded allocation (64 MiB decoded block limit). Unknown versions report an error rather than guessing a layout.

The index is reconstructed by reading block headers without decompressing payloads. Logical range reads may cross blocks or start inside one. The desktop decoder retains at most 8 MiB of decoded blocks; larger individual frames are not retained. Late spectators wait for the accepted disk queue prefix and flush pending data under the same writer lock. Prefix transfer can stop at a frame boundary inside a block, without leaking subsequent bytes. Only physically flushed bytes are advertised as the readable disk prefix.

Existing `GTRPLY02` (one frame per `CHK2` record), raw and ZIP files remain importable because they are users' persisted replay files. The desktop uses the same indexed reader for both container versions, validating v2's single-frame constraint. There is no v2 recording path. Older viewers do not understand v3; recorder and viewer releases must be updated together.

Cross-language verification:

1. `dotnet run --project Tests/Recorder/Recorder.Tests.csproj -- artifacts/fixtures/container.gtfo`
2. `npm run transpile` in `Viewer/electron`
3. `node --test --test-isolation=none Tests/Viewer/container.test.cjs` (Node 22+)

Real-session comparison (use a new output directory; source recordings are never overwritten):

1. `node Tools/benchmark-replay-container.cjs extract "source.gtfo" artifacts/tests/replay-compression`
2. Read `source.json` for `sourceInfo.duration`, then run `dotnet run --no-build --project Tests/Recorder/Recorder.Tests.csproj -- --repack artifacts/tests/replay-compression/decoded.raw artifacts/tests/replay-compression/grouped.gtfo DURATION_MS`.
3. `node Tools/benchmark-replay-container.cjs verify "source.gtfo" artifacts/tests/replay-compression`

Measured on 2026-09-07 using the user's 1:41:27 R5C2 recording: 32,337,381 -> 15,966,575 bytes (30.8 -> 15.2 MiB, 50.6% smaller); 75,670 -> 2,840 data blocks. The full 35,537,112 decoded bytes have matching SHA-256 `cf0847daf6220b166b2f22b30bac1b60b665b21f4bf9694e64b8ec3ee9462404`, and 200 random 4 KiB reads matched. One local run measured indexing at 4.17 -> 0.12 seconds and grouped range-read p95 at 0.46 ms. These are container measurements with a warm OS cache, not full scene seek timings or in-game runtime validation. Local results are in `artifacts/tests/replay-compression-2s/comparison.json`.
