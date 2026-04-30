# Persist invite role assignments inline during bulk loop (not after)

## What to build

Currently `inviteCreateBulk.ts` runs the entire `runBulkInviteLoop`, collecting role assignments in memory, then persists them all to the DB *after* the loop completes. If the process crashes, times out, or hits an unhandled exception between those two phases, invites exist on Discord but have no DB record ("orphaned invites"). These consume server capacity, can't be cleaned up by `/invite-cleanup`, and won't trigger role assignment on use.

Fix this by persisting each role assignment immediately after each successful invite creation, inside the loop.

### Implementation

1. Add an optional `onInviteCreated` callback to `runBulkInviteLoop`'s options:

```typescript
onInviteCreated?: (inviteCode: string, role: InviteRole) => void;
```

2. Call it inside the loop immediately after `channel.createInvite` succeeds (before pushing to `roleAssignments`).

3. In `inviteCreateBulk.ts`, pass a callback that does:
   - `queries.insertInviteRoleAssignment.run(...)`
   - `addInviteToCache(...)`

4. Remove the post-loop `for (const a of roleAssignments)` persistence block. The `roleAssignments` array is still collected and returned for CSV output — just not used for DB writes anymore.

### Notes

- `requestId` is already generated before the loop starts, so it's available in the callback closure.
- Partial results in the DB for a cancelled run are acceptable — better than zero results for a crashed run.
- `runBulkInviteLoop` remains unit-testable: the callback is optional, tests don't provide one.

## Acceptance criteria

- [ ] Each invite role assignment is persisted to the DB immediately after the Discord invite is created (not batched after the loop)
- [ ] If the process dies after creating N invites, all N are present in `invite_role_assignments`
- [ ] `runBulkInviteLoop` signature adds optional `onInviteCreated` callback; existing tests pass without providing it
- [ ] The post-loop batch persistence is removed from `inviteCreateBulk.ts`
- [ ] Bulk invite end-to-end behavior (CSV output, progress updates, cancel, DM) remains unchanged
- [ ] Invite cache is updated inline (via the callback) rather than after the loop

## Blocked by

None — can start immediately.
