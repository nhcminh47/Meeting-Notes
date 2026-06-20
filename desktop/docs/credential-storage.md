# Credential Storage

The **Remote Server** settings UI accepts a user-provided server URL and API key. Neither value is
hardcoded, and the API key is never logged.

## Storage

- The normalized server URL is non-secret configuration stored in
  `<userData>/remote-settings.json`.
- The API key is encrypted through Electron `safeStorage`, which uses the operating system's
  protected credential facilities, and stored as ciphertext in `<userData>/remote-api-key.bin`.
- If OS encryption is unavailable, the API key is retained in memory for the current process only.
  It is never silently persisted as plaintext.
- Clearing the API key removes both the encrypted file and any memory fallback. **Clear All** also
  removes the server URL configuration.

The renderer receives only `{ serverUrl, hasApiKey }`; it cannot read the raw key or access the
credential store. After a save, the password field is emptied and its saved state is represented
as `********`/“API key saved securely.” `redactApiKey` always returns a fixed mask for non-empty
values and never returns part of the key.

## Connection test

The Electron main process validates and normalizes the URL, obtains either the newly entered key
or the saved key, and sends `GET <serverUrl>/health/private` with an `Authorization: Bearer` header.
The request has a 10-second timeout. Only safe connected, unauthorized, unreachable, timeout,
invalid URL, or generic error status is returned through preload; headers and keys are not returned
or logged.
