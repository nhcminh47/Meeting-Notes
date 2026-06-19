# Desktop Integration Notes

The Electron main process will eventually coordinate recording, optional remote processing, and
local persistence. The renderer should request operations through a narrow IPC boundary rather
than receiving unrestricted filesystem access.

## Remote processing boundary

Remote ASR is an ephemeral processor. The desktop may send audio with a temporary session or job
ID, receive ordered speaker turns, validate and normalize them, and then persist them under the
local meeting ID. A remote response must not choose the durable meeting folder or become the only
copy of a transcript.

`serverSessionId` and any future remote job ID are retry/correlation metadata only. They may expire,
change between attempts, or be removed after processing. Local meeting, speaker, and turn IDs
remain stable independently of server lifecycle.

## Transcript flow

1. Create local metadata and speaker files before recording.
2. Append each finalized live turn to `live-transcript.jsonl`; keep interim hypotheses outside the
   durable model.
3. Preserve the recording and live log if processing fails so the desktop can retry or recover.
4. Normalize a successful final result into ordered `TranscriptTurn` objects, retaining stable
   speaker IDs and optional display names.
5. Atomically commit `final-transcript.json`, then mark the local meeting finalized.
6. Render dialogue, notes, summaries, and exports from canonical turns. Derived files never replace
   those turns.

Speaker renames update `speakers.json`. Renderers resolve the current name from that file while the
turn's nullable `speakerName` remains a historical snapshot. Diarization, summary generation,
export UI, credential storage, and language-mode behavior are intentionally deferred to later
issues.
