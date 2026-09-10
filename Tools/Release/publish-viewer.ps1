param([string]$DestinationRoot = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads'))
$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$source = (Resolve-Path (Join-Path $repository 'Viewer/electron/build/out/viewer-win32-x64')).Path
$revision = (git -C $repository rev-parse --short=8 HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the build revision.' }
$root = (Resolve-Path -LiteralPath $DestinationRoot).Path
$destination = [IO.Path]::GetFullPath((Join-Path $root "GTFOReplay-Viewer-$revision"))
if (-not $destination.StartsWith($root.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Release path escapes the destination folder.' }
if (Test-Path -LiteralPath $destination) { throw "Release already exists: $destination" }
if (-not (Test-Path -LiteralPath (Join-Path $source 'viewer.exe'))) { throw 'Build the Windows viewer package first.' }
$runtime = New-Item -ItemType Directory -Path (Join-Path $destination 'app')
Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $runtime.FullName -Recurse -Force
$files = @(Get-ChildItem -LiteralPath $source -File -Recurse -Force)
foreach ($file in $files) {
    $relative = [IO.Path]::GetRelativePath($source, $file.FullName)
    $copy = Join-Path $runtime.FullName $relative
    if ((Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $copy -Algorithm SHA256).Hash) {
        throw "Release verification failed: $relative"
    }
}
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $destination 'Open Viewer.lnk'))
$shortcut.TargetPath = Join-Path $runtime.FullName 'viewer.exe'
$shortcut.WorkingDirectory = $runtime.FullName
$shortcut.IconLocation = "$($shortcut.TargetPath),0"
$shortcut.Description = 'GTFO Replay Viewer'
$shortcut.Save()
@"
GTFO Replay Viewer - $revision

Double-click "Open Viewer" to launch. Keep the app folder intact; it contains runtime dependencies.
Use "Recordings" in the top bar to manage files, and "Replay profile" to select vanilla or a mod profile.
Add a recording folder to track new files automatically. Language selection is in Settings.

Space: play/pause. Left/Right: back/forward five seconds.
Shift + Left/Right: previous/next tick. Home/End: beginning/end.
Hover or focus a button for help and keyboard shortcuts.
Use the sidebar for events, bookmarks, player statistics, items, chat and diagnostics.
Shot events are excluded. Heartbeat and technical events are hidden unless detailed events are enabled.
Repeated alert/wakeup events can be expanded to inspect their individual timestamps and participants.
Recordings do not contain an audio track.
Use the matching current Recorder. Recordings from older formats are not supported.
The Viewer includes Low models only. Missing assets appear as basic shapes with diagnostics.
"@ | Set-Content -LiteralPath (Join-Path $destination 'README.txt') -Encoding utf8
$deploymentFile = Join-Path $repository 'artifacts/deployment.json'
$deployment = Get-Content -LiteralPath $deploymentFile -Raw | ConvertFrom-Json
$deployment.revision = $revision
$deployment.viewer = $destination.Replace('\', '/')
$deployment.utc = [DateTime]::UtcNow.ToString('o')
$deployment.verifiedViewerFiles = $files.Count
$deployment.viewerBytes = ($files | Measure-Object Length -Sum).Sum
$deployment | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $deploymentFile -Encoding utf8
Write-Output "Published $($files.Count) verified runtime files to $destination"
