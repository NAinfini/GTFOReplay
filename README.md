https://randomuserhi.github.io/GTFOReplay/

Docs: https://randomuserhi.gitbook.io/gtfo-replay

Contributor references: [build and validation](Docs/session-validation.md),
[Viewer workspace](Docs/viewer-workspace.md), [recording container](Docs/replay-container.md)
and [standalone clips](Docs/replay-clips.md).

Repository documentation, source comments, development tools, build messages and release filenames use English. Viewer translations belong in `Viewer/interface/src/locales/`; keep localized UI strings and language switching intact. Unicode test inputs use escaped literals so the source remains readable in English while still testing multilingual names, paths and notes.

This repository owns Recorder, Viewer and the resources needed to run them.
Additional model extraction, model creation, Original assets and the model website belong to
[Infini GTFO Model Site](https://github.com/NAinfini/Infini-GTFO-Model-Site).
The original `GTFO Anim Exporter/` project remains unchanged in this repository.
Its future migration or removal is the upstream maintainer's decision; see
[exporter retention](Docs/exporter-retention.md).
See [runtime model resources](Docs/model-resources.md) for the import contract.
