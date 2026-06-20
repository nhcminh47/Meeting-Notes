# Server Storage Policy

The ASR server is an ephemeral processor, not a meeting archive.

Temporary audio, transcript fragments, completed results, and job metadata may exist only as long
as processing and result delivery require. A cleanup path must run after success and terminal
failure, with a TTL sweeper as a backstop for interrupted jobs. Deployment defaults should use the
shortest practical TTL and document it.

Cleanup must be scoped to managed temporary directories, safe to retry, and observable without
logging meeting content. Durable meeting data remains exclusively on the Electron client.

## Managed workspace policy

The configurable `ASR_TMP_DIR` contains manager-owned `sessions`, `jobs`, and `chunks`
directories. Session and job workspaces use metadata timestamps and statuses for deterministic
cleanup. Running work uses session/job TTLs, completed and failed jobs use terminal-state TTLs,
and cancelled jobs are immediately eligible for cleanup. Direct child folders with missing or
invalid metadata are treated as safe-to-delete orphans; cleanup does not follow workspace symlinks
or delete outside the managed roots.

Storage usage is measured across the temporary root and compared with `MAX_TMP_STORAGE_GB`.
Expired work is removed before evaluating this guard. Active, non-expired sessions and jobs are not
silently evicted to make room. Protected admin endpoints provide aggregate usage and cleanup
results only, without exposing meeting content or credentials.
