# `/invite-cleanup` command

## What to build

Create a `/invite-cleanup` slash command that deletes dead bot-created invites by default, freeing up invite slots on the server.

**Parameters:**
- `mode` (optional, string choices): `all-dead-bot-invites`, `all-bot-invites`, `all-dead-invites`, `all-invites`
- `confirm` (optional, string): required when `mode` is set — must be exactly `"i-know-what-im-doing-atf-bot"` or the command rejects

**Default behavior (no params):** delete dead bot-created invites only (fully used + time-expired).

**Reply (ephemeral):**

```
Cleanup Complete
Deleted: 347 invites (212 fully used, 135 expired)
Available capacity: 573/1000
```

Uses the `invite/lifecycle` module from issue #1 to categorize invites and compute results.

## Acceptance criteria

- [ ] `/invite-cleanup` command registered and staff-only
- [ ] Default mode deletes only dead bot-created invites (fully used OR time-expired)
- [ ] Non-default modes require `confirm` param with exact value `"i-know-what-im-doing-atf-bot"` — rejects otherwise with a clear error
- [ ] All four non-default modes work correctly (`all-dead-bot-invites`, `all-bot-invites`, `all-dead-invites`, `all-invites`)
- [ ] Ephemeral reply with deleted count (breakdown by fully used vs expired) and available capacity
- [ ] Does NOT delete invites created outside the bot unless mode explicitly includes non-bot invites

## Blocked by

- Issue #1 (`/invite-capacity` command + invite lifecycle module)
