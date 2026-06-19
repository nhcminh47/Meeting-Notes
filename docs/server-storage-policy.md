# Server Storage Policy

The ASR server is an ephemeral processor, not a meeting archive.

Temporary audio, transcript fragments, completed results, and job metadata may exist only as long
as processing and result delivery require. A cleanup path must run after success and terminal
failure, with a TTL sweeper as a backstop for interrupted jobs. Deployment defaults should use the
shortest practical TTL and document it.

Cleanup must be scoped to managed temporary directories, safe to retry, and observable without
logging meeting content. Durable meeting data remains exclusively on the Electron client.
