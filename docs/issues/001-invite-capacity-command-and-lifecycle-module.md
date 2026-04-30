# `/invite-capacity` command + invite lifecycle module

## What to build

Create a deep `invite/lifecycle` module that fetches all server invites, categorizes them (bot-created vs external, live vs dead), and computes available capacity against Discord's 1000-invite hard limit. Expose this through a new `/invite-capacity` slash command.

The lifecycle module determines "bot-created" by cross-referencing invite codes with the `invite_role_assignments` table. An invite is "dead" if it is fully used (`uses >= maxUses` where `maxUses > 0`) or time-expired (`expiresAt` in the past).

**`/invite-capacity` reply (ephemeral, staff-only):**

```
Invite Capacity
Total server invites: 427/1000
Bot-created: 312 (198 live, 114 dead)
Available capacity: 573
```

The lifecycle module interface should support:
- Fetching and categorizing all invites (bot vs non-bot, live vs dead)
- Computing available slots
- Filtering invites by category (for cleanup/deletion by consumers)

## Acceptance criteria

- [ ] `invite/lifecycle` module exists with a clean interface for categorizing and querying server invites
- [ ] `/invite-capacity` command registered and staff-only
- [ ] Reply shows total server invites, bot-created breakdown (live/dead), and available capacity
- [ ] Ephemeral reply
- [ ] Existing tests still pass; new module is unit-testable without Discord connection (accepts fetched invite data as input)

## Blocked by

None — can start immediately.
