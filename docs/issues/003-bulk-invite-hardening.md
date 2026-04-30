# Bulk invite hardening (row cap, dynamic capacity check, first error in DM)

## What to build

Harden the `/invite-create-bulk` command with three improvements:

### 1. Hard row cap
Reject CSVs with more than 1000 rows immediately after parsing, before any invite creation begins. Clear error message.

### 2. Dynamic capacity check
Before starting the invite loop, use the `invite/lifecycle` module to check available invite slots. If rows-to-create (excluding rows with existing links) exceed available capacity, fail fast with a message like:

> "You need 450 invite slots but only 200 are available. Run `/invite-cleanup` first."

No automatic cleanup — the user must run it themselves.

### 3. First error in completion DM
When the bulk loop completes with failures, include the first error encountered in the completion DM sent to the user:

> **Bulk Invite Complete**
> Request ID: `2026-04-30-abc`
> Created: 45 | Failed: 5
> First error (row 46): "Maximum number of invites to this server reached."

This requires `runBulkInviteLoop` to track and return the first error message (row number + error text).

### 4. Consecutive-error circuit breaker
If the loop encounters N consecutive failures (e.g. 3 in a row), stop immediately — don't keep hammering Discord with requests that will all fail. This covers capacity exhaustion, permission revocation, or any unrecoverable state that manifests as repeated errors.

`runBulkInviteLoop` should return a `stoppedReason` field:
- `'consecutive-errors'` — loop stopped early due to N consecutive failures
- `null` — loop completed normally (or was cancelled via issue #5)

The completion summary and DM should distinguish this from a normal completion:

> **Bulk Invite Stopped**
> Request ID: `2026-04-30-abc`
> Created: 45 | Failed: 3
> Stopped after 3 consecutive errors.
> First error (row 46): "Maximum number of invites to this server reached."

## Acceptance criteria

- [ ] CSVs with >1000 data rows are rejected with a clear error before processing begins
- [ ] Available capacity is checked before the loop starts; fails fast if insufficient with a message referencing `/invite-cleanup`
- [ ] `runBulkInviteLoop` captures and returns the first error encountered (row number + message)
- [ ] Completion DM includes first error details when failures > 0
- [ ] `runBulkInviteLoop` stops after N consecutive failures and returns `stoppedReason: 'consecutive-errors'`
- [ ] Completion summary/DM clearly indicates the loop was stopped early due to repeated errors
- [ ] Existing bulk invite functionality (progress updates, CSV output, upload) remains unchanged

## Blocked by

- Issue #1 (`/invite-capacity` command + invite lifecycle module)
