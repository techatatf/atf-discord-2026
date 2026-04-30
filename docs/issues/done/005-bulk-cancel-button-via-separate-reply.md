# Restore bulk cancel button using separate ephemeral reply

## What to build

Re-add the Cancel button to the `/invite-create-bulk` progress message, but fix the race condition that caused the original removal (issue #4).

### Root cause of the original bug

`ButtonInteraction#update()` (button handler) and `interaction.editReply()` (progress callback) both edited the same ephemeral message through different API paths. Whichever arrived last won, causing "Cancelling..." to be immediately overwritten by a progress update.

### Fix

Acknowledge the button press with `i.reply({ ephemeral: true })` instead of `i.update()`. This sends a **new** ephemeral message ("✅ Cancelling...") rather than editing the progress message. The two write paths now target different messages — no race.

### Flow

1. Progress message shows a Cancel button, updated via `interaction.editReply()` every 25 rows (unchanged)
2. User clicks Cancel → handler calls `i.reply({ ephemeral: true, content: '✅ Cancelling after current row...' })`
3. In-memory flag is set (shared via closure or a module-level `Map<requestId, { cancelled: boolean }>`)
4. Loop checks the flag at the top of each iteration; breaks if set
5. Final `interaction.editReply()` shows completion summary with "Cancelled" state: "Created: 73/500 (cancelled)"
6. Invites already created are **kept** — not revoked

### Implementation notes

- The cancel flag can live as a simple `let cancelled = false` in the command's `execute()` closure — no need for a shared module-level map since the collector and loop share the same scope
- The collector should be created on the fetched reply (`interaction.fetchReply()`) as before
- Remove the progress `components: [cancelRow]` pattern from `editReply` — the button is already on the message from the initial reply. Only remove it in the final summary edit
- `runBulkInviteLoop` needs the `shouldCancel` parameter back (was removed in issue #4), but this time the race is gone because the button handler doesn't touch the progress message

### Interaction with issue #003 (circuit breaker)

`runBulkInviteLoop` will return `stoppedReason` which should support both `'cancelled'` and `'consecutive-errors'`. Design the field to accommodate both stop reasons.

## Acceptance criteria

- [ ] Cancel button appears on the progress message during bulk creation
- [ ] Clicking Cancel sends a separate ephemeral confirmation ("Cancelling after current row...")
- [ ] Loop stops within one iteration of the button press
- [ ] Progress message is NOT edited by the button handler (no race)
- [ ] Final summary shows cancelled state with count of what was created
- [ ] Already-created invites are kept (not revoked)
- [ ] Completion DM reflects cancellation
- [ ] Works correctly alongside the consecutive-error circuit breaker from issue #003

## Blocked by

- Issue #003 (adds `stoppedReason` to `runBulkInviteLoop` — this issue extends it with `'cancelled'`)
