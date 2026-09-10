# Runtime model resources

The Viewer supplies Low geometry for characters, enemies, items,
weapon components, fixtures and floors. There is no detail selector or
distance-based mesh replacement. Original, Medium and High assets stay in the
separate model project. Recorder stores identities, transforms and states;
recordings do not embed the shared mesh and texture files.

Additional extraction, model preparation and the preview website live in
[Infini GTFO Model Site](https://github.com/NAinfini/Infini-GTFO-Model-Site).
The original upstream Unity exporter remains here unchanged; its future location
is the maintainer's decision. See [exporter retention](exporter-retention.md).
Normal Recorder and Viewer builds do not run a model authoring tool.

## Import and ownership

Prepared runtime resources are tracked as ordinary Git files, so a normal clone
includes the models and animations without Git LFS. Resources are installed under
`Viewer/assets/assets/`. From the model repository, run `npm run export:viewer`,
then run these commands in GTFOReplay:

```sh
node Tools/import-model-resources.cjs --source ../Infini-GTFO-Model-Site --check
node Tools/import-model-resources.cjs --source ../Infini-GTFO-Model-Site
```

The importer validates source paths, sizes and SHA-256 hashes before installation.
Only Low geometry is delivered; repeated image bytes are shared without re-encoding.
The source must also contain a completed, hash-bound native rebuild validation in
`artifacts/rebuilt-models/completion.json`. Runtime v2 catalogs supply replay IDs
and attachment metadata; actual meshes come from the validated Low rebuild of
each native Original. Original geometry is never installed. The Viewer decodes
Meshopt geometry and KTX2 textures using bundled
decoders. It does not require the model website or a decoder CDN.
The installed receipt is `Viewer/assets/assets/model-resources.json` and is the
source of truth for the current file inventory and byte sizes. Disk sizes are
not GPU memory estimates or compressed download sizes.

`Tools/data/native-floors.json` and `Tools/data/native-props.json` are the reviewed inputs to
`Tools/runtime-architecture-package.cjs`. Each entry pins a native asset ID
and source revision. The packager resolves its validated Low rebuild and verifies static geometry, native identity,
source hashes and textures, then generates the catalog shared by Recorder and
Viewer. It does not choose pending candidates from a planning document.
The scene catalog includes 233 floor meshes and 229 static prop meshes: railings,
storage shelves, server racks, liquid containers, covered cargo, tanks,
generator housings and rocks. Unfinished tropical trees, detached foliage and garden rock wall/ceiling enclosures are explicitly excluded in the ground review. They are not packaged or captured; the generated catalog also lists these exclusions so existing recordings skip them without missing-floor warnings. Supporting rock floors remain selected. Models use the validated native Low rebuild budgets. Only exact recorded mesh/material identities load;
they are not scattered procedurally or inferred from the floor theme.

Static props share the existing native surface capture and spatial instancing
path. Both use their source geometry and game materials; native supporting
floors clip the default navigation floor from their footprints. A new recording is needed to capture their actual
placements. Moving machinery, full reactors/HSU assemblies, decorative lighting
and signage are not part of this static selection. Spitters use their prepared
Low model through the separate dynamic hazard renderer, with shared model data
and visibility culling. Their native shader displacement is not reproduced;
recorded appearance/state drives a lightweight visual approximation.

## Playback boundaries

Instances share cached geometry/textures but retain independent rigs and poses.
Disposal and late loads are managed by the runtime asset owners. Missing or failed
appearance resources produce diagnostics. Actors and interactive objects retain
basic shapes; unmatched native floors retain default navigation ground. Static
props with missing resources are omitted. Full navigation also remains available
for interaction queries. This does not enable unsupported recording
schemas or custom gameplay protocols.

Doors and containers support recorded state and native mechanical clips. Source
availability does not reconstruct hit-driven deformation, flying debris,
dynamic terminal screens or the game's full shader behavior.
Known native `service` and `tech` weak-door variants use the corresponding
4x4 or 8x4 native weak-door family model. The service variant's distinct surface
decoration is not reproduced by that shared model. Unknown modded door prefabs
retain basic geometry.
Ladders assemble native Low base, body and top pieces using the recorded top,
rotation and height and the game's segment placement rules. Rungs are not stretched.
The current ladder header does not identify alternate prefab styles, so ladders
use the generic native appearance.
First person uses prepared Low first-person arms and replay-driven approximate
poses for all four players. It does not record the local game's first-person
camera or animation system. Walls and ceilings are excluded.

Third-person hand poses are a finger-only layer over the replay body animations.
`Tools/data/player-hand-animations.json` maps weapon reloads and melee grips to
the native controller's left/right hand states. `Tools/runtime-hand-package.cjs`
verifies native inputs and Unity sampling, then retains only finger rotations
in `player-animations/hands.json`. It can refresh that bundle independently with
`node Tools/runtime-hand-package.cjs <model-source-project>`; the full resource
import also includes it. Idle grips keep one frame; reloads follow recorded
reload progress. This finger bundle is separate from the prepared Low first-person
arms. Native camera, ladder and terminal transitions are not imported. Unknown
custom weapons retain their existing replay pose.

See [environment recording](environment-recording.md) for the wire format and
[build and validation](session-validation.md) for testing. Runtime tests cover
asset loading, rigs, attachments, cancellation, mechanical motion and seeking.
Native placements and performance still require a new in-game recording.

World lighting uses ambient intensity 0.85 and a camera-facing directional fill
at intensity 0.65 instead of the previous attenuating point light. This keeps
shaded surfaces readable at a distance without extra lights, environment textures
or shadow passes. It is a viewing aid, not a reconstruction of game lighting.

Grounded player poses use the actual skinned shoe vertices to prevent animation
retargeting from putting soles below the recorded player support position. The
visual body and equipment move together; recorded coordinates are unchanged.
Jump, fall, ladder, grabbed and ragdoll poses retain their original motion. This
does not recover Unity foot IK or reconstruct stairs from a navigation mesh:
accurate terrain silhouettes and materials require recorded native floor identities.

CyberDeck terminals assemble three prepared Low parts (case, lid and cable) from
`Tools/data/native-cyberdeck.json`, retaining the native active graphics transforms.
The runtime does not reproduce the terminal's interactive screen UI. The ordinary
resource importer includes this assembly; `Tools/runtime-terminal-package.cjs` can
refresh it independently. Runtime terminal names discard game-generated serial,
UID and clone suffixes before exact prefab lookup; unknown modded prefabs still
use basic geometry.

MLS architecture materials encode layer controls in vertex channels rather than
albedo tint. Runtime packaging omits `COLOR_0` for verified `GTFO/Standard (MLS)`
materials, preventing layer index values from blackening concrete floors and stairs.
Original and prepared Low source files remain unchanged; native albedo, normal maps,
UVs and geometry are retained. The runtime manifest records this conversion.

MLS albedo alpha is a layer mask, not transparency. `runtime-mls-material.cjs`
reads hash-verified native PNGs, separates RGB before any resizing, and prepares
opaque 512 px Low textures. Filtering the RGBA source first destroys the RGB in
zero-mask pixels, which made Gardens soil black. The native MSO surface map is
repacked as glTF ORM (occlusion, 1 - smoothness, metalness); omitting it had made
the entire soil surface mirror-smooth. The converter uses Sharp from the model
project's installed Optimization dependencies. It changes no source assets and
adds no runtime image conversion. Native layered shader blending is not reproduced.

`Tools/native-ground-coverage.cjs` scans all 5,939 native sources across architecture,
native-gap, remaining-static, remaining-auxiliary and remaining-skinned manifests.
`Tools/data/native-ground-coverage.json` records the decisions for 973 ground-related
candidates using mesh names, complete prefab hierarchies and material names,
independently of website category or generic names such as `g_main`, `g_mesh` and
`g_main008`. Each decision pins a fingerprint of its source evidence. 421 candidates
are delivered (233 supporting floors and 188 decorative structures); 552 are explicitly
excluded as collisions, non-ground props/effects, walls/ceilings, distant scenery,
markers, moving machinery or redundant LODs. All 38 excluded LODs have a selected
base-model reference. Other selected props bring the shared scene catalog to 462 models.

The architecture importer runs this check before packaging. New/unreviewed candidates,
changed evidence, excluded selections and missing reviewed capture identities fail the
import rather than silently omitting a floor. Website categories do not gate reviewed
runtime roles. Decorations do not cut holes in navigation support. This is source
catalog coverage, not proof that every game room's live capture hooks work perfectly.

New catalog entries require the updated Vanilla DLL and a new game recording;
old recordings cannot recover omitted source identities and transforms.


R1B1 2026-09-09 13:49 confirmed that source-category-only selection omitted
`g_main` concrete/gravel floors. Runtime floor/prop role is assigned by reviewed
pins, independently of the model site's generic props classification. The two
confirmed floor signatures are g_main/141/BuildingPart_StorageGround_Conc_4x4_a
and g_main/2621/BuildingPart_StorageGroundGravel_Rock_2x2x2_a. Ground coverage tests
include generic ground-family material identities and those exact signatures.
Raw mismatch samples remain in recording diagnostics, the sidebar log console and the developer console;
they no longer generate one toast per sample. Capture/load failures still warn.
This recording retained only eight unmatched samples, without omitted transforms;
it does not support an exhaustive missing-instance inventory or retroactive placement.
