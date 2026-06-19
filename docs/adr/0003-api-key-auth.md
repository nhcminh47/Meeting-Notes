# 0003: API Key Authentication

## Status

Proposed

## Context

Users need to connect the Electron application to a configurable remote ASR server. Protected server endpoints must not be publicly usable, and this public repository must not contain credentials.

## Decision

The Electron application will allow the user to enter a server URL and API key. The server will require API key authentication for protected endpoints. No real API keys or server URLs will be committed to the repository.

## Consequences

- Client settings need secure credential handling.
- Protected server requests must consistently validate the API key.
- Documentation and examples must use placeholders rather than deployable secrets.

## Notes / Future updates

Future issues should define credential storage, rotation, error handling, and endpoint coverage without weakening the authentication requirement.
