# Investigate and fix/remove bulk cancel button

## What to build

The cancel button on `/invite-create-bulk` has been reported as non-functional. Investigate why, then either fix it or remove it.

### Investigation areas

- The `collector` is created on the ephemeral reply — verify that message component collectors work on ephemeral deferred replies
- The `cancelled` flag is checked via `shouldCancel?.()` inside the loop — verify the timing (does the collector's `collect` event fire while the async loop is awaiting `createInvite`?)
- Check if `i.update()` inside the collector conflicts with `interaction.editReply()` being called from the progress callback

### Decision

If the cancel button can be fixed reliably, fix it. If Discord's interaction model makes it fundamentally unreliable for this use case (ephemeral + long-running loop + progress edits), remove the button and the cancellation machinery entirely.

## Acceptance criteria

- [ ] Root cause identified and documented (in a code comment or this issue)
- [ ] Either: button works reliably and cancels within one iteration of the loop
- [ ] Or: button and all cancellation code removed cleanly, completion summary no longer references "Cancelled" state

## Blocked by

None — can start immediately.
