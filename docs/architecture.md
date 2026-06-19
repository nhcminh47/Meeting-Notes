# Architecture

## Ownership boundary

The Electron desktop app is the system of record. It owns meeting metadata, participant labels,
speaker-turn transcripts, summaries, and exports on the user's machine. The remote server is an
optional ephemeral GPU processor: it accepts audio, performs ASR, returns a result, and deletes
temporary audio, transcript, and job files after completion or TTL expiry.

The server must not retain a durable meeting library. Losing the server must not lose client data.

## Product boundary

English live meetings are the v1 priority. Vietnamese realtime is not exposed. Vietnamese batch
transcription is a later roadmap item. The canonical transcript is an ordered sequence of speaker
turns with timing and text; bullet notes, summaries, and action items are derived views.

## Trust boundary

Because the repository is public, protected server endpoints require an API key. The Electron app
must let users provide the server URL and API key; neither value is hardcoded in the repository.
Transport should use HTTPS, such as through Cloudflare Tunnel.
