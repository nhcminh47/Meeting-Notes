# Codex Guidelines

Before implementing roadmap issues:

1. Work on one GitHub issue per branch and keep its scope isolated.
2. Preserve the Electron app as owner of all durable meeting data.
3. Treat the server as an authenticated, ephemeral GPU processor.
4. Model canonical transcripts as ordered speaker turns, not bullets.
5. Prioritize English live meetings; do not expose Vietnamese realtime.
6. Treat Vietnamese batch transcription as later work.
7. Never commit secrets, real API keys, real server URLs, or user meeting data.
8. Ensure temporary server files are removed after processing or TTL.
9. Verify relevant checks, commit clearly, and link the pull request to its issue.
