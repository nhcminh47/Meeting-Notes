# Security

- Never commit API keys, `.env` files, credentials, tokens, private tunnel URLs, or meeting audio.
- Commit `.env.example` with unmistakably synthetic placeholders only.
- Require API-key authentication on every protected server endpoint.
- Let users enter the server URL and API key in Electron; do not hardcode either value.
- Store credentials using an operating-system-backed secret facility when implemented.
- Use HTTPS, validate inputs, limit upload size and duration, and avoid logging secrets or audio.
- Keep server access narrow and rotate credentials after suspected exposure.

Public source code is not a security boundary. Deployments must supply their own secrets.
