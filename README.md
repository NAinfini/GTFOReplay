https://randomuserhi.github.io/GTFOReplay/

Docs: https://randomuserhi.gitbook.io/gtfo-replay

Repository documentation, source comments, development tools, build messages and release filenames use English. Viewer translations belong in `Viewer/interface/src/locales/`; keep localized UI strings and language switching intact. Unicode test inputs use escaped literals so the source remains readable in English while still testing multilingual names, paths and notes.

This repository owns Recorder, Viewer and the resources needed to run them.
Additional model extraction, model creation, Original assets and the model website belong to
[Infini GTFO Model Site](https://github.com/NAinfini/Infini-GTFO-Model-Site).
The original `GTFO Anim Exporter/` project remains unchanged in this repository.
Its future migration or removal is the upstream maintainer's decision; see
[exporter retention](Docs/exporter-retention.md).
This program branch retains the original Viewer models. The optional model upgrade
is reviewed separately on `codex/model-upgrade`; it is not required to build or run
this branch. Both branches are maintained in the fork, not pushed to upstream.
