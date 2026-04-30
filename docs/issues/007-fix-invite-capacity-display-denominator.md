# Fix `/invite-capacity` display: remove hard "/1000" denominator

## What to build

The `/invite-capacity` command currently displays "Total server invites: 1001/1000", implying 1000 is a hard ceiling. In practice Discord can exceed 1000 (observed: 1001), likely due to race conditions during bulk creation or soft enforcement of the limit.

Change the display so it doesn't present 1000 as an absolute hard cap.

### Proposed new format

```
Invite Capacity
Total server invites: 1001
Nominal Discord limit: 1000
Bot-created: 902 (902 live, 0 dead)
Available capacity: -1 (at or over limit)
```

Alternatively, keep the `total/limit` format but add "(nominal)" or similar qualifier so it's clear this isn't a guaranteed hard ceiling.

### Files to change

- `src/commands/inviteCapacity.ts` — output formatting
- `src/invite/lifecycle.ts` — optionally rename `limit` field or add a comment clarifying it's nominal

## Acceptance criteria

- [ ] The capacity display no longer implies 1000 is a hard ceiling that can never be exceeded
- [ ] The nominal limit is still shown for context (users need to know the approximate boundary)
- [ ] Negative available capacity is displayed clearly (not confusing)
- [ ] No logic changes to how capacity is calculated — only display/labeling

## Blocked by

None — can start immediately.
