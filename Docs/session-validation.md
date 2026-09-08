# Real-session validation

Client statistics acceptance (not yet performed in the native game): join as a non-host with only the recording client modded. Cancel a pack interaction, then consume one use of each of ammo, tool, health and disinfect packs, including a final charge and a use on a teammate. Compare the local consumption counter with actual charges spent; cancellation must add nothing. Confirm that teammates' consumption stays unavailable and that giving a pack does not claim remote receipt. Repeat with a modded host: host Pack events must not increase the local consumption counter. Observe explicit enemy deaths and a scripted non-death removal; only the former should increment confirmed deaths, once per spawn. Seek backwards and forwards and reopen the completed recording to check stable totals. These counts begin with the new recording and do not retrofit missing events into older files.

Build outputs remain under `artifacts/build/`. Deployment to r2modman’s Temp profile is an explicit release step authorized by the user; it includes matching Recorder, Vanilla and installed extensions.

For a test session, deploy matching `ReplayRecorder.dll` and `Vanilla.dll` together. The enemy state format changed to `Vanilla.Enemy 0.0.5`; use the matching viewer build.

1. In the Temp profile, confirm the configured recorder folder and enable `showRecordingStatus`. Detailed `Debug` tick logging is unnecessary for normal testing: errors always use BepInEx error logging.
2. Start a run. The HUD should progress from preparing to REC. Add an F8 marker during a recognizable action. Check player movement, weapon swaps, damage, enemy deaths, doors, objectives and any dimension transition available in the level.
3. End the run normally; also test leaving a run and starting another. The HUD should show saved. A capture failure should show FAILED while the game remains usable; it must not silently report successful capture.
4. Keep the `.gtfo`, adjacent `.gtfo.diagnostics.json`, and the Temp profile's `BepInEx/LogOutput.log` from that run before another launch overwrites the log. The diagnostic session ID matches the replay session header.
5. In the viewer, compare the marker time and location with the remembered action. Seek forward/backward across it repeatedly; check entity counts, damage, health and camera following. Report the timestamp, expected behavior and observed behavior for each inconsistency.

Automated checks cover queue saturation, failing writes, complete-prefix recovery, corruption, callback faults, field transitions, IPC rejection and seeks across cached blocks. They do not establish Unity/native-hook/Steam runtime stability. Game installation references compile successfully; in-game validation still requires a real session.

Recorder failures preserve previously queued complete chunks. A failed capture does not write a completion footer. Serialization errors stop recording instead of inventing despawns or continuing after a damaged delta baseline. Main-thread callback errors include the callback name and stack trace in BepInEx logs. The diagnostic summary reports tick allocations/time, queue peak, compressed/raw size and failure reason.

Spectator transport failures are logged separately with UTC/session context. Steam retries retain one owned copy per packet, bounded to 256 packets/8 MiB per connection; excessive backlog closes that spectator connection. TCP writes are bounded to 128 packets/8 MiB, and incoming message framing handles split headers/payloads. An interrupted or invalid message is logged. Transport callback failures release native receive batches and close the affected connection; they do not mark the independent local recording successful or failed. Network closure never synchronously waits for a Unity-thread continuation.

When testing live spectating, disconnect/reconnect the viewer during a recording and confirm local REC continues. Keep the same three files listed above if anything fails. Automated loopback TCP checks cover framing, sends, callback faults, subsequent connections and shutdown; they do not substitute for Steam relay testing.

The viewer's **Replay information → Export diagnostic report** action saves a JSON report with replay identity, current time, recording diagnostics and up to 500 viewer errors. Keep the original BepInEx log as well: the viewer report does not replace native/game logs. For live recordings the sidecar may not exist until recording ends; reopen the finished recording to read it.

Portable Windows packaging uses `Viewer/electron`'s existing Forge commands and `prepare-package.cjs` to include production dependencies from the installed lockfile tree. Run the packaging command with Node 24; the system Node 26 caused the old ZIP dependency to exit before completing extraction. Build `Viewer/assets`, offload both assets and third-party resources, then build/package `Viewer/electron`. Validate the produced `resources/app` with `Tests/Viewer/electron-smoke.cjs` under Electron before copying it to Downloads.


## Release acceptance

The Recorder session API ignores late best-effort event/query callbacks once a
session is closing, failed or disposed. Strict spawn/get/configuration calls
still report programming errors. Lifecycle tests cover a second session and
callbacks before header completion; the next native run must additionally end,
return to the lobby and start again without `ReplaySnapshotNotInitialized` errors.

Finite-file playback reads bounded 1 MiB windows across worker IPC. Live streams
retain exact reads and the existing network buffer. Tests cover both compressed
and raw recordings, end-of-file boundaries and the read-ahead limit. A real
101-minute, four-player recording was exercised after repeated synthetic clip
opens: all 757 blocks indexed, event grouping and participant names worked, and
keyboard seeking, following and English/Chinese settings passed. This measures
opening and functional behavior, not a guaranteed gameplay or replay frame rate.

The separate model-upgrade branch supplies game-derived runtime models. The
program branch retains upstream models and can be built without the model
repository or its resource package.
