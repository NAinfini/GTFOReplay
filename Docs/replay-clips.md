# Standalone clips

The playback workspace no longer exposes A–B selection or clip export. Existing `.gtfoclip` recordings still open through the normal library; their persisted format remains supported. It requires the same installed replay profile/assets as its source, but does not require the original recording or temporary playback cache.

The clip carries the parsed scene checkpoint preceding A, the required timeline blocks, event index, and header/module definitions. Playback and stepping are restricted to A–B. Original timestamps are retained for comparison with recorder logs. A small amount of surrounding state is retained to reconstruct the scene and interpolate animation; this is not a privacy redaction format. Earlier cumulative statistics may exist in the checkpoint, while the run summary subtracts the state before the clip start.

`GTRCLP01` stores a V8 serialized metadata record followed by a counted sequence of state/timeline records. Maps and BigInts are preserved. Each record has compressed length, uncompressed length, and CRC32, followed by independently Brotli-compressed bytes. Lengths are bounded; incomplete or corrupted clips fail explicitly. Exports are written to a temporary sibling and renamed only after completion. Source cache failures do not replace an existing output file.

Screenshots save the Three.js scene as PNG; the control panels are excluded. Automated checks verify standalone playback after closing the source cache, forward/backward seeks, interval boundaries, corruption/truncation, and failed-export preservation. A real-session scene/animation comparison is still required after recording in game.
