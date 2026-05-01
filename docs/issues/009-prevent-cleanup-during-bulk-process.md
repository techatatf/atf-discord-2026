# Prevent `/invite-cleanup` from running during an active bulk process

## What to build

Add a per-guild lock that prevents `/invite-cleanup` from executing while `/invite-create-bulk` is in progress on the same guild. This prevents cleanup from deleting invites that the bulk loop just created (or is about to create), which could cause silent failures in role assignment.

### Design

- A module-level `Set<string>` of guild IDs with an active bulk process (e.g. `src/invite/bulkLock.ts` or inline in a shared module)
- `/invite-create-bulk` adds the guild ID before starting the loop and removes it in a `finally` block after the loop completes (regardless of success, cancellation, or error)
- `/invite-cleanup` checks the set before proceeding. If the guild is locked, reply with: "A bulk invite process is currently running. Please wait for it to complete before running cleanup."

### Why only cleanup?

The other commands were analysed for interference:
- `/invite-create` — low risk; consuming one capacity slot may cause a single row failure, which the bulk loop handles gracefully
- `/invite-capacity`, `/invite-status`, `/invite-get` — read-only, no interference

Only `/invite-cleanup` deletes invites from Discord, making it the only command that can meaningfully corrupt an in-progress bulk run.

## Acceptance criteria

- [ ] A shared lock mechanism tracks which guilds have an active bulk process
- [ ] `/invite-create-bulk` acquires the lock before the loop and releases it in a `finally` block
- [ ] `/invite-cleanup` checks the lock and rejects with a clear message if a bulk process is active
- [ ] The lock is released even if the bulk loop throws, is cancelled, or hits the circuit breaker
- [ ] No deadlock possible (lock is always released via `finally`)

## Blocked by

None — can start immediately.
