# Build and validation

Use matching Recorder, Vanilla, extensions and Viewer builds. A supported outer
container does not imply that every historical profile schema is supported.
Record a new session when a profile format changes.

## Build

Recorder projects require the installed game's BepInEx interop assemblies and
project reference paths. Configure these for the target installation; build
outputs and local test artifacts belong outside tracked source directories.

Use Node 24 with the repository lockfiles for Viewer packaging. After installing
dependencies in `Viewer/assets`, `Viewer/interface` and `Viewer/electron`:

```sh
npm --prefix Viewer/assets run build
npm --prefix Viewer/assets run copy-js3party
npm --prefix Viewer/assets run offload
npm --prefix Viewer/assets run offload-js3party
npm --prefix Viewer/electron run build
npm --prefix Viewer/electron run package
```

The assets build also builds the interface. Forge packages production dependencies
from the installed lockfile tree. The upstream updater remains enabled; its
release source is the original repository. Use `--skip-launcher` when testing
a local build without downloading an upstream release.

## Automated checks

```sh
dotnet run --project Tests/Recorder/Recorder.Tests.csproj
dotnet run --project Tests/ClientStats/ClientStats.Tests.csproj
node --test --test-isolation=none Tests/Viewer/*.test.cjs
```

Run `Tests/Viewer/electron-smoke.cjs` with Electron, passing the packaged
`resources/app` directory as its first argument. It exercises the actual
preload, IPC, profile and renderer. `Tests/Viewer/statistics-smoke.cjs` checks
statistics layouts and localization. Test outputs remain under `artifacts/`.

These tests cover storage failures, corruption, lifecycle, transport framing,
parsing, seeking, dialogs and rendering. They do not establish native Unity-hook
stability, Steam relay reliability, mod compatibility or a minimum frame rate.

`Tests/Viewer/static-prop-performance.cjs <recording.gtfo>` runs in Electron at a
1920 x 1080 window size. It compares the same paused replay with and without 328
synthetically placed instances of the 82 selected props, then compares previous
and current lighting. Synthetic scales keep the fixture readable; production
always uses the recorded native matrices. The report records GPU identity,
actual canvas dimensions, synchronized render time, draw calls and triangles.
This isolates added rendering cost; it does not establish actual scene density,
full playback FPS, older-GPU performance, or Unity capture correctness.

`Tests/Viewer/first-person-smoke.cjs` exercises all four player slots with firearm,
tool and melee actions, including charge, swing, shove and reload. It checks Low
mesh budgets, all 30 finger mappings, finite skinned vertices, textured hands,
weapon-to-wrist alignment, and restoration of third-person meshes. Its images
remain in `artifacts/tests/first-person/` for visual review. First person is an
approximation for every player and requires no additional Recorder pose stream.

Run `Tests/Viewer/first-person-composite-smoke.cjs <recording.gtfo>` with Electron
to verify first-person playback through the complete scene compositor. It checks
that world pixels and hands coexist for every recorded player, restores third
person between switches, and sends native Space keydown/keyup events from the
canvas and playback controls. The desktop smoke test also covers closed playback
selectors retaining focus after a selection; open menus retain their own input.

## Native-session verification

1. Install matching binaries in a test profile and enable recording status.
2. Start a run. Verify preparing, recording and saved states; add an F8 marker.
   Exercise movement, weapon changes, damage, deaths, doors and dimension changes.
3. End the run, return to the lobby and start another. A recording failure must
   report failure without claiming a successful save.
4. Preserve the recording (including its embedded diagnostics) and BepInEx log. Open the
   recording and compare marker timing, entity state and camera following while
   seeking backward and forward.
5. As a non-host, test cancelled and completed pack uses, final charges and uses
   on teammates. Cancellation must not count; remote consumption stays unavailable.
   Repeat with a modded host to check that host events do not double-count local use.
6. Distinguish an observed enemy death from a scripted removal. Check stable counts
   after seeking and reopening. Disconnect/reconnect live spectating and confirm
   local recording continues independently.

The diagnostic export supplements the BepInEx log; it does not replace it.
For the optional model integration, also verify native placements, dimensions,
door/container state and missing-resource substitutes using a new modded run.

## Recording-start plugin API

The Recorder includes the Thunderstore 0.9.6 recording-start API:
`Replay.OnStartRecording` is a public `Action<string>` field. Plugins may subscribe
directly or mark a static `void Started(string path)` method with
`[ReplayOnStartRecording]` and register it through `Replay.RegisterAll()`.
The notification receives the actual recording file path once after the file and
session initialize, before header completion. A failed file creation does not
notify subscribers. Callback exceptions use the existing Recorder failure report
and stop the recording; remaining subscribers are still invoked. This addition
does not change the recording format or require a Viewer update.

In the next native session, verify that a plugin receives one existing file path
for each new recording, including when returning to the lobby and starting again.

## Late join and dense native scenes

Recorder starts before `GS_Generating.StartBuilding`, including late joins that
skip the elevator. The elevator hook shares that start operation. Scene headers
are published once, from elevator stop or entry into `GS_InLevel`; leaving the
session clears that state. Generation and replication callbacks populate the
same recording, so Viewer uses the normal format with a local recording timeline.
No events from before joining can be recovered.

Run `dotnet run --project Tests/RecorderCallbacks -c Release` to exercise the
production callbacks for ordinary starts, late joins, repeated state entry,
leaving/rejoining, untracked/nested mine detonation and foam without a player.
This substitutes native boundaries and does not replace a multiplayer session.
Join an active expedition, inspect existing doors/items/enemies, leave and rejoin,
then open both recordings and test seeking and first-person following.

`Tests/Viewer/r8d1-runtime-smoke.cjs` accepts a recording path and optional packaged
app directory. It checks dense native scene loading, terminal textures, seeking,
first-person activation, native Space input and GPU floor occlusion. R8D1 previously
blocked inside unindexed CPU polygon subtraction. The default floor now uses a
spatial index and convex support prisms, splitting boundary triangles instead of
retaining an entire triangle when one corner lies outside a native floor.
Processing yields to the UI and respects dimensions and support height bands.
Full navigation geometry remains separate for picking. Missing native resources
retain default ground. `navigation-fallback.test.cjs` verifies partially covered
triangles, separate storeys/dimensions, missing resources and overlapping masks.

Gardens acceptance also checks that concrete no longer uses MLS vertex layer
indices as RGB and that soil loads the native surface map. The unit regression
decodes the packaged soil albedo and ORM pixels: opaque non-black RGB, spatial
roughness, and nonmetallic soil. Inspect the captured R8D1 scene for visible soil
and moss rather than black surfaces with white specular flecks. Shader layer
blending remains an approximation; this is not a pixel-exact Unity rendering test.

`Tests/Viewer/hammer-framing-smoke.cjs` runs with Electron against built assets.
It samples 105 hammer idle, charge, hit, release and push poses, compares GPU
pixel coverage with the former overlay viewpoint, and checks that switching to
a firearm restores its original camera position. It uses only the shared rig
fixture bootstrap, independently of the third-person grip acceptance suite.

The native weapon-view reconstruction is checked by
`Tests/Viewer/native-weapon-view.test.cjs` and `Tests/Viewer/actor-rig.test.cjs`:
resource receipt, controller references, datablock lookup, seek-stable sampling,
shared torso reach and native shoulder offsets. The first-person Electron suite
samples 4 players × 12 equipment types × 11 actions (528 poses), including six
reload points. It checks native size, both corrected FPS wrist contacts, actual
garment wrists, finger presence, idle framing and item-parent restoration.
Reload trajectories may cross the idle framing limits; rotating the gun is part
of the native action. Projection checks exclude geometry behind the near plane,
where perspective division reverses screen coordinates. Screenshots remain
necessary to assess posture: passing contact tests alone does not establish a
natural first-person pose.

`Tests/Viewer/ground-catalog-smoke.cjs` draws every delivered native scene model
with the actual Viewer GLTF loader and GPU texture decoders. `ground-coverage.test.cjs`
compares the source catalog to the checked-in coverage decisions and installed
resource identities. `native-floor-replays.cjs <recording.gtfo>` checks individual
recordings and reports native capture, resource availability and default floor
triangle counts separately. Fragment counts can exceed input counts after clipping.
