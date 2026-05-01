# Tighten bulk cancel button filter to verify user identity

## What to build

Add a user identity check to the cancel button's component collector filter in `/invite-create-bulk`. Currently the filter only matches on `customId` — any user who could somehow interact with the button would trigger cancellation. Add `i.user.id === interaction.user.id` as a defence-in-depth measure.

The message is ephemeral (only visible to the invoking user), so this isn't exploitable today — but it guards against future changes that might make the message visible to others.

### Implementation

In `src/commands/inviteCreateBulk.ts`, change the collector filter from:

```ts
filter: (i) => i.customId === `bulk-cancel-${requestId}`,
```

to:

```ts
filter: (i) => i.customId === `bulk-cancel-${requestId}` && i.user.id === interaction.user.id,
```

## Acceptance criteria

- [ ] Collector filter checks both `customId` and `i.user.id === interaction.user.id`
- [ ] Existing cancel behaviour is unchanged for the invoking user
- [ ] No other code changes needed

## Blocked by

None — can start immediately.
