# Request acceptance review - 2026-09-07

Model extraction commands, source manifests and Tests/Models paths in this document belong to the separate Infini-GTFO-Model-Site repository. This repository imports its prepared runtime resources; see [the resource contract](model-resources.md).

The latest user decision takes precedence. Cancelled proposals are not outstanding features.

| Request | Implementation and verification scope |
| --- | --- |
| Recording failures, error logs, Temp profile installation | Matching Recorder/Vanilla binaries (b63359e1) were deployed. The actual R2B1 recording reports `Failure: null` and 10,252 ticks, and opens in the viewer. This does not guarantee every Unity, Steam or mod combination is fault-free. |
| New character and enemy models | All 32 models are integrated. Three.js and the playback engine remain independent of React. Instances share model resources but retain independent skins. Existing runtime model tests pass. |
| Woods/Hackett, enemy appearance, triangle budgets | Original game assets were converted with material corrections and budgets of roughly 2K-8K triangles based on size and complexity. See `model-resources.md` and the model repository catalogue. |
| Shared poses, clothing rigs, character colors, Squid zoom, soft tentacles | Preview and playback share rig, color and tentacle code. Tests cover 32 models, six preview poses and clipping. Tentacle motion supports pause and rewind; it is not a frame-by-frame recording of the game's procedural animation. |
| Ground, doors, ceilings | The approved scope uses readable navigation ground and door states. It does not reconstruct rooms, ceilings or complete environment materials. Door destruction and rewind tests pass. |
| Library, tracked folders, default import location | Implemented, including nested directory changes, favorites, progress and bookmarks. Library tests pass. |
| Layout, side panels, source organization | Left navigation groups analysis and workspace tools, with one panel open at a time. Settings are grouped and source files follow feature/component responsibilities. The replaced navigation and native dropdown implementations were removed. |
| Original branding and landing page | The original SVG icon, red GTFO load button and website video are restored. Recordings are accessible from the top bar. The video pauses outside the landing page and requires network access. |
| Custom dialogs, tooltips, notifications | Base UI dialogs, selects, switches and toasts; custom file browsing, save, overwrite and recycle confirmation. Desktop tests replace native dialog APIs with throwing functions for the exercised flows. |
| Top bar, player statistics selector, panel close icon | The profile selector and statistics selector have explicit labels. The SVG close icon passes a center-coordinate assertion. Screenshots cover 1440/960 window widths. |
| English/Chinese localization and language placement | Both interfaces share persistent language state. Language selection lives in settings, not the transport bar. Desktop language-switch tests pass. |
| Event noise | Shots are excluded from event lists, counts, filters and timeline marks. Heartbeat and technical traffic are hidden by default. Important events such as downed players and Scout screams remain visible. Raw data still drives playback and statistics. |
| Event names and grouping | Parsing captures participant names at event time, with name search. Alert/wakeup events group within two seconds and expand for individual seeking and locating. Groups do not cross distinct alert targets or other important events. No recorder change is required. |
| Transport, following, shortcut hints | Play/pause, five-second skips, tick stepping, start/end, speed and player/free-camera selection. Actual R2B1 checks cover four players, following and left/right five-second skips. |
| Remove milliseconds, jump form, A-B and volume | The corresponding UI and replaced call paths were removed. Display uses whole seconds while playback retains source precision. Audio recording, volume controls and volume shortcuts are omitted. Existing persisted clip files remain readable. |
| Portable release layout | The release script produces `Open Viewer.lnk`, `README.txt` and `app/`, verifies every runtime file with SHA-256 and does not move a running release. |

Validation entry points: `Tests/Viewer/*.test.cjs`, `Tests/Viewer/electron-smoke.cjs` and `Docs/session-validation.md`. Local screenshots/results are under `artifacts/tests/electron/`; deployment paths and verification records are in `artifacts/deployment.json`.

Remaining game-session coverage includes special enemy attacks, detailed limb destruction, large-crowd frame rates, Steam disconnect/reconnect and different map/mod combinations. Successful parsing and playback of one recording does not establish all of these. That recording averaged 0.93 ms per recorder tick with a 49.72 ms maximum. Initial indexing is still slow; future optimization should measure this rather than treating triangle count as proof of acceptable performance.

Subsequent user decision: retain the four existing character appearances without recording or adding actual clothing assets. The latest feature work adds participant names and event grouping only. LODs and original procedural tentacle attack animations are outside that implementation scope.
