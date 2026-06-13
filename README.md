# Local Whisper Studio

Windows x64 Electron desktop app for private, local audio transcription with FFmpeg and whisper.cpp.

## Development

```powershell
pnpm install
pnpm dev
```

Useful checks:

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm package:win
```

Runtime binaries and models are not included in the installer. The app downloads pinned artifacts into Electron's `userData` directory only after the user clicks **Install Runtime**.

The **Event log** panel at the bottom of the app is collapsed by default. It shows recent download, checksum, extraction, conversion, transcription, and process events while also writing rotating JSONL diagnostics to:

```text
<userData>/logs/events.jsonl
<userData>/logs/events.jsonl.previous
```

Transcription uses explicit **Start**, **Pause**, and **Stop** controls. Progress is phase-based: audio preparation/conversion and local Whisper transcription. Pausing terminates the active child process at a controlled checkpoint; resuming restarts only the interrupted phase and reuses a completed converted WAV.

The **CPU usage** selector controls whisper.cpp's `--threads` value:

- Balanced: approximately 50% of logical CPUs.
- High: approximately 75%.
- Maximum: all logical CPUs and the default selection.

During Whisper execution, the progress bar uses `whisper-cli --print-progress` output rather than a timer. CPU utilization can still vary between model stages and may be limited by memory bandwidth.

## Runtime Cache

```text
<userData>/
  runtime/
    manifest.local.json
    downloads/temp/
    bin/ffmpeg/
    bin/whisper/
    models/
  work/<job-id>/
```

## Windows Manual Acceptance

1. Start with no `runtime` directory and launch the app.
2. Confirm the UI opens, all dependencies show as missing, and transcription is disabled.
3. Click **Install Runtime** and verify progress for FFmpeg, whisper.cpp, and the small model.
4. Confirm the runtime files and `manifest.local.json` are under `userData`, not the install directory.
5. Select a supported audio file and transcribe it with the small model.
6. Confirm the managed WAV and transcript are under `userData/work/<job-id>`.
7. Install the optional medium model and confirm it becomes selectable.
8. Click **Repair Runtime**, confirm the old runtime is removed, and verify required files are reinstalled.
9. Temporarily alter a checksum in development and verify installation fails without promoting the `.tmp` file.

The required initial download is approximately 680 MB. The optional medium model is approximately 1.43 GB.
