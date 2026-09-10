# Viewer workspace

The desktop interface uses React and Base UI components. Three.js rendering and
the replay engine remain independent of the interface.

## Navigation and playback

Opening a recording always starts at its beginning (zero for full recordings,
the retained start timestamp for exported clips). The library offers one Open action;
playback positions are neither saved nor restored. Duration and last-viewed metadata
remain available for the library.

The top bar provides recordings on the left, with live connection, language and
window controls on the right. Settings opens from the recording library or the
playback sidebar and contains the replay profile selector, its purpose and
profile-specific guidance. It remains available after a profile load error.
Camera and display settings appear in
that dialog when a replay workspace is loaded. The left navigation opens one panel at a time for events, bookmarks,
statistics, item finding, capture, chat, diagnostics, the log console or settings. Language is
selected from the top-right dropdown; English and Chinese share the same persistent preference.

The transport provides play/pause, five-second skips, tick stepping, start/end,
speed, whole-second timestamps and camera following. Source timestamps retain
their recorded precision. The timeline distinguishes loaded data from pending
data; seeking cannot exceed the loaded boundary. Live duration grows as data arrives.
The time display is current position / total duration. While loading, a separate
"Loaded to" timestamp appears beside playback speed; it disappears when loading
finishes. Completed recordings do not repeat their total duration in a status label.

| Shortcut | Action |
| --- | --- |
| Space | Play/pause |
| Left / Right | Seek backward/forward five seconds |
| Shift + Left / Right | Previous/next tick |
| Home / End | Recording start/end |
| WASD, with canvas focused | Move free camera horizontally |
| Shift / Ctrl, with canvas focused | Raise/lower free camera |
| F, with canvas focused | Play/pause |

Controls, inputs and dialogs retain their own keyboard behavior. Tooltips expose
available shortcuts. Audio is not recorded or played.

Clicking the 3D scene explicitly focuses its canvas. Playback shortcuts share one
handler; hidden menus do not block it. Space is recognized by either its physical
key code or its space character, including input paths without a physical code.
Text entry and visible modal/select menus retain their own keyboard behavior.

## Events, statistics and cameras

The tactical HUD displays individual bioscan progress bars in the current camera dimension,
alongside the number of distinct alerted enemies in the current dimension. This count
excludes dead entities and does not include future spawns or imply membership of one
alarm wave. Existing recordings use their original
scan progress; scan type, occupancy, required items, alarm labels and mission text are never
inferred when metadata is absent.

Scans occupy the stage's upper-left safe area as unframed text and a three-pixel
progress line, with the percentage aligned opposite the scan title. The HUD has
no panel background, border, rounded corners or box shadow; text shadows preserve
legibility over the scene. Mission and terminal messages occupy a separate lower-left
area above playback controls. Missing progress is labeled "Progress not recorded"
without an animated indeterminate bar, and empty HUDs are hidden.

New Recorder builds emit `Vanilla.Bioscan.Info` for scan status/occupancy changes, including
the game's extraction flag and player requirement. `Vanilla.Gameplay.Info` carries mission,
Warden intel, objective timer, alarm and observed wave messages plus terminal commands/output.
The Viewer maintains their state through normal snapshots and exposes useful text in event
search. Timer text updates are hidden from the default event timeline. Intel and terminal
HUD messages expire after 12 replay seconds; persistent objectives and active alarms remain.
Terminal history stays in the event list. Text is rendered with `textContent`.

HUD text comes from the recording client's game UI; terminal output is captured after a
received command, not from every teammate's private screen. Wave starts are recorded where
the game invokes `SurvivalWave.StartWave`; this is an observed count per wave event, not a
predicted total. New capture hooks are checked against installed game assembly signatures
and the plugin build. They still require a fresh in-game recording for live validation.

Biotracker tags use the recorded `Enemy.tagged` state. A small red triangle
follows the animated head, or the model's display height for custom enemies
without a head attachment. Tags disappear when the recorded tag expires or the
enemy is no longer rendered. Vanilla, template and mindcontrol share this renderer;
displaying the marker requires no additional Recorder fields.

Shot events are excluded from the event list and timeline. Heartbeats and other
technical traffic are opt-in. Filtering does not remove data used by playback or
statistics. Alert/wakeup events within two seconds of the first event group into
an expandable row; distinct targets and intervening important events end a group.
Each child keeps its timestamp and location action.

Participant names resolve from event-time identities rather than current player
slots. Missing identities remain labeled by type and ID. Locate pauses three
seconds before the event and follows its historical subject when available.

Auto events remains the selected camera mode while its internal subject changes. A plain canvas
click does not leave this mode; a camera drag, wheel, movement or explicit target selection does.
During forward playback the director looks three replay seconds ahead in the indexed events,
resolving participants in the current scene. Live playback uses whatever events have arrived.
Shots normally hold for six viewing seconds; more urgent events can interrupt after three.
Anticipated incidents retain coverage through one replay second after the event, unless a
more urgent incident interrupts. Repeated damage does not restart the shot timer.
Enemy death (health or death animation) and despawn retire automatic subjects immediately.
Enemy and point shots normally end after six viewing seconds, player shots after twelve.
Continuity favors less recently shown players in the same dimension, then nearby combat.
Automatic coverage starts
with a player when no event is available; if no player remains, stale tracking is cleared.
Manual event inspection retains its last frame. Seeking, pause and
reverse playback do not replay a backlog of camera cuts. Manual movement or target
selection takes control until Auto events is selected again. First person uses
recorded look direction and estimated eye height for all four players. A separate
camera-space rig displays prepared Low arm garments and gloves, driven by sampled
native FPS poses, recorded melee actions, weapon reloads and wrist IK. Firearms
resolve ItemFPSSettings through schematic component 4. Their hip transforms,
body offsets, wrist corrections and elbow goals come from native data; the
shoulders retain the sampled body's hierarchy and source arm lengths. The body
origin follows GetFPSArmsLocalPos: negative camPosDefault.y plus FPSArmsOffset
and the equipped ItemFPSSettings.bodyOffsetLocal, rather than the head bone.
WeaponMovementController tracks move the whole gun during reload, while existing
part and finger tracks supply local motion. ReloadSequence events select native
controller states by part IDs, with sampling driven by recorded progress so seeks
are deterministic. Geometry no longer moves individual shoulders or changes zoom
during reload. Native clips are normalized to their recorded action segment;
the replay does not contain the game's individual Animator speed values. When
retargeted contacts exceed arm reach, the nearest shared torso translation fits
both wrist targets while retaining bone lengths and the weapon trajectory.
Presentation translates the completed rig together to the right
of its left shoulder and below the idle gun ceiling. It shares the world camera's
FOV instead of copying the game's separately authored item-camera FOV. Firearms
undo the world model's 0.8 shrink for geometry and grip markers together; no
per-firearm size multipliers are applied. Stocks and sleeves may extend beyond
the viewport. Release restores the original item parent and local transform.

The model repository's `Tools/Models/export-fps-view.py` samples the installed
game's WeaponMovementController and FPSBody wrist/pole data. Its settings and
PlayerDataBlock input are pinned to the existing OriginalDataBlocks source
revision; the exporter checks the PlayerDataBlock byte hash. Import this resource
independently with `node Tools/runtime-first-person-package.cjs <model-source-project> --weapon-view`.
This updates `player-animations/weapon-view.json` and its runtime receipt. The
exported transforms are native data, but the overlay remains a reconstruction,
not an exact recording of the game's camera inertia or animation blending.
Grip and finger changes should first be checked against the installed game's
GripAlign targets, FPSBody rig and native hand-layer clips; a zero driver-wrist
error alone does not prove that the rendered glove actually grips the weapon.
The first-person smoke suite also captures side views for contact inspection.
The assembly is placed within support-arm reach before wrist IK, with two-handed
melee grips for hammer and spear. Melee wrist framing limits central occlusion.
The overlay eye, world camera and recorded actions stay fixed. The view
model packages the decimated character Low submeshes (408 sleeve triangles and
1,262 glove triangles), rather than the separate clothing exports whose Low
labels currently reduce textures only. All 30 finger joints remain mapped. The view
model shares the equipped weapon and existing game clothing textures. It does not
display the followed player's third-person body or add recording data. Camera
framing, recoil and action timing are reconstructed; this is not an exact capture
of the game's FPS camera, ADS or procedural weapon motion.

Summary and detailed statistics use the same tracker. Missing capture is shown as
unavailable, not zero. Host damage/resource-effect events and owner shot data have
different capture scopes. Confirmed enemy deaths require a completed death
transition, not an ordinary despawn. Local pack consumption counts actual charge
decreases during ApplyPack, excluding cancellation and remote owners; it does not
claim confirmed remote receipt. These observations are separate from attributed
kills and packs received.

## Implementation boundaries

All app file operations use in-app dialogs. Electron owns directory enumeration,
path validation and the requesting WebContents lifecycle. Transient results use
toasts; persistent failures remain in diagnostics or folder health information.

- `Viewer/interface/src/features/`: playback, library, bookmarks and statistics.
- `Viewer/interface/src/components/`: layout, dialogs, feedback and shared controls.
- `Viewer/interface/src/locales/`: localized interface strings.
- `Viewer/electron/src/replay/dialogs.cts`: desktop dialog ownership and validation.
- `Viewer/assets/src/profiles/`: profile parsing, state and rendering.

See [build and validation](session-validation.md) for test and package commands.

Replay profiles select parsing, datablocks and rendering behavior; they are not
quality presets. `vanilla` is the normal GTFO profile. `template` is a developer
starting point that inherits vanilla and supplies overridable datablocks.
`mindcontrol` adds live input hooks that send enemy-control commands to the
companion MindControl mod. Template and MindControl share the native item table
to retain new items such as Artifact 152 without maintaining duplicate copies.
Switching profiles disconnects live viewing and reloads the current recording.

## Rendering visibility and frame budget

The Viewer renders with `requestAnimationFrame`, not a fixed 30 Hz playback cap.
Rendering FPS and completed replay snapshots are separate measurements: snapshot
promises can include time spent rendering on the same thread, so their elapsed
times must not be added together as independent CPU costs.

Camera matrices and the cached world position are refreshed after controls and
before visibility tests. Players, enemies, ragdolls and native 32 m environment
batches use the camera's render-distance setting and sphere/frustum intersection.
Distance tests include the sphere radius so an overlapping floor does not pop out
at its center's distance. Native batches retain world-space instance matrices;
their static world matrices need no automatic recomputation. Scout feelers use
their recorded segment bounds independently of their owner's visibility.

Culling suppresses drawing and pose work; it does not delete replay state or
unload resources. Turning, seeking or cutting the director camera therefore
restores visibility on the same frame. This is distance/frustum culling, not
wall-occlusion culling. The first-person owner still updates its equipment but
skips the hidden full-body skin and foot-placement pass. Native garments are
posed parent-first, including undriven intermediate bones; driver and native
hierarchies each update once instead of recursively revisiting every ancestor.
ActorRig owns native world matrices, so the renderer does not recompute them.
Native actors also bypass the unused stick-figure cylinder/sphere transforms.

Rendering and animation now have separate traversal responsibilities. ActorRig
owns native world matrices and attached skin inverses. Its scene does not repeat
that world update during submission; branches containing only bones are excluded
from drawing while their poses remain available to skins. The followed first-person
player updates equipment without posing a hidden third-person body. The complete
world-body hierarchy is hidden before submission; changing camera mode restores it.
Backpack items retain their parent and resting pose until their slot/ownership changes.
Reload parts resolve their authored local basis with matrices instead of detaching
and reattaching the weapon, while retaining native wrist and magazine transforms.

Native surfaces retain 32 m visibility cells, but pack all visible cells of one
asset primitive, dimension and reflection parity into one instance draw. The GPU
matrix buffer changes only when cell visibility changes. Immutable source matrices
are kept separately for navigation support classification, so changing the camera
while that asynchronous loading work runs cannot remove floor support.
Holopath meshes only rebuild when their progress or spline coordinates change;
hidden dimensions defer geometry work until they become visible again.

Replay sampling retains a cursor at the last fully committed tick. Each displayed
snapshot owns its interpolated copy and future events; those never mutate the
committed cursor or previously returned snapshots. Backward seeks, data-block
changes and replaced live previews reset the cursor from a source checkpoint.
The disk-block cache remains bounded. Tests cover event timing, interpolation,
seeks, live-preview replacement and returned-state isolation.

Focused checks: `Tests/Viewer/native-surfaces.test.cjs`,
`Tests/Viewer/actor-resources.test.cjs`, `Tests/Viewer/actor-rig.test.cjs`, and
the 528-pose `Tests/Viewer/first-person-smoke.cjs`. Real recording performance
measurements must record viewport dimensions, hardware, scheduling ceiling,
camera/recording time, frame percentiles and individual render-pass costs.

## Log console

The sidebar log console collects the current Viewer session's console log/info/warn/error/debug output, notifications, uncaught errors and unhandled promise rejections. This includes native mesh identity diagnostics stored in recordings and parser warnings forwarded to the Viewer. Collection starts before the replay app loads and continues while the panel is closed. It does not read the separate game/BepInEx log file.

The panel provides text and level filters, timestamped selectable messages, copying of the filtered entries and explicit clearing. Scrolling up pauses following; the checkbox resumes it. The latest 2,000 entries are retained in memory, with an explicit count when older entries are removed. Closing the Viewer ends the session. Original developer-console output is preserved.

Validation: `node --test --test-isolation=none Tests/Viewer/log-console.test.cjs`; real Electron replay integration: `Tests/Viewer/log-console-smoke.cjs <recording.gtfo>`.

## Explosive damage attribution

Mine ownership is stored from the recorded spawn in snapshot state and survives
mine despawn and explosion-effect expiry. Host-synchronized damage may arrive
before the client-local detonation, or the latter may never be recorded. Damage,
kill credit and event participant names therefore use the recorded owner, not the
short-lived explosion effect. Missing mine ownership remains an explicit error;
no player or missing explosion animation is fabricated. Shooter assists use the
recorded shot-trigger data when available at the damage event.

Regression validation uses both R8D2 recordings from 2026-09-09 (19:08 and 19:33):
three mines have damage 3–5 ms before local detonation, and one mine has five damage
events with no detonation record. Tests cover early damage, missing detonation,
despawn, effect expiry, reused IDs, owner credit and recorded shooter assists.

Enemy type identities likewise survive despawn, so late explosive, bullet and melee
amounts still enter the appropriate damage totals. This does not resurrect enemies
or infer a kill solely from a post-despawn hit. The 19:33 R8D2 includes an 18-point
hit arriving after the local target despawn; the integration test reconciles the
complete explosion totals against recorded events instead of only checking logs.
