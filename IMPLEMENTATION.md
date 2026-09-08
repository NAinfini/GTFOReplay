# Recorder and Viewer implementation

The Recorder captures game state, markers and diagnostics into recoverable replay
files. It owns bounded writes, completion and failure reporting, and live spectator
transport. The Viewer owns the recording library, playback, event inspection,
bookmarks, statistics, export and display preferences. No background desktop
service or cloud backend is required.

## Runtime behavior

- Recording writes preserve buffer ownership and order, drain asynchronously, and
  report failures without claiming a completed file. Best-effort callbacks after
  session shutdown do not attempt to access a disposed snapshot.
- Finite replay files use bounded read-ahead across worker IPC. Historical replay
  blocks are cached separately from the active render state. Live transport keeps
  its own exact-read framing and bounded send queues.
- The desktop interface uses React and Base UI components with shared tooltips,
  dialogs and notifications. Settings, item search, statistics, bookmarks and
  event inspection live in side panels. Playback exposes whole-second timestamps,
  five-second keyboard seeking, speed and player following. Audio, millisecond
  jump fields and A-B playback controls are outside the current interface.
- Heartbeats and gunshots do not clutter the primary event list. Event participants
  retain historical names, and repeated events can be expanded from grouped rows.
- The software supports English and Chinese. Repository documentation, tools and
  release filenames are English. Recorded player names remain verbatim.

## Model ownership

Model extraction, authoring, Original downloads and the model website belong to
Infini-GTFO-Model-Site. The program branch keeps upstream models. Its optional
model-upgrade branch contains the runtime integration and prepared assets together,
so the two changes can be reviewed independently. Neither branch rebuilds the game
level, walls or ceilings.

## Validation

Run `dotnet run --project Tests/Recorder/Recorder.Tests.csproj --
artifacts/fixtures/container.gtfo` from the repository root to test the Recorder
and generate the compressed/raw interoperability fixture. Build the Viewer assets
and Electron application, then run `node --test Tests/Viewer/*.test.cjs`.
`Tests/Viewer/electron-smoke.cjs` runs under Electron against a built or packaged
application and optionally accepts a real recording as its second argument.

Native Unity hooks, Steam relay behavior and game-session visual fidelity require
a new game recording. Build success and synthetic tests do not establish those
results. See [the session checklist](Docs/session-validation.md).
