# Runbook: Diagnose Invite Sync

## When to use

Run this when the invite capacity numbers look wrong — e.g., total exceeds 1000, bot-created count doesn't match expectations, or you suspect the local DB is out of sync with Discord's actual invite list.

## What it does

Compares every invite code in the local SQLite DB (`invite_role_assignments` table) against the live invite list fetched from Discord's API. Reports:

| Category | Meaning |
|----------|---------|
| **Phantom** | Code exists in DB but Discord doesn't have it. DB is stale — invite was deleted externally or expired and Discord removed it. |
| **Orphaned** | Invite exists on Discord, was created by the bot user, but has no DB record. The bot created it but failed to persist (crash, timeout, etc.). These take real capacity and won't trigger role assignment on use. |
| **External** | Invite exists on Discord, created by a human or another bot. Not the bot's concern. |

## How to run

```bash
npm run diagnose:invites -- <GUILD_ID>
```

Or directly:

```bash
npx ts-node scripts/diagnose-invite-sync.ts <GUILD_ID>
```

### Prerequisites

- `.env` file with `DISCORD_TOKEN` set
- Bot must be a member of the target guild with **Manage Guild** permission
- `data/bot.db` must exist (the bot's SQLite database)

## Interpreting results

### Phantom codes > 0

The DB has entries for invites that Discord no longer knows about. This means:
- `invite-capacity` over-reports `bot-created` count (it only counts codes present on both, so actually this is fine — but it means the DB is dirty)
- No operational impact on capacity, but indicates invites were deleted outside the bot (manual deletion, Discord expiry cleanup, etc.)

**Action:** Optionally clean up the DB rows. No urgency.

### Orphaned codes > 0

The bot created invites on Discord that never made it into the DB. This means:
- These invites consume real server capacity
- If someone uses one, `guildMemberAdd` won't match it to a role assignment — no auto-role
- `invite-capacity` counts them as "external" rather than "bot-created"

**Action:** Either delete them from Discord (they're untracked anyway), or manually insert DB records if you can determine which request they belong to.

## Example output

```
Local DB invite codes: 902
Discord invite codes: 1001

=== Phantom codes (in DB, not on Discord): 3 ===
  abc123
  def456
  ghi789

=== Orphaned codes (on Discord by bot, not in DB): 2 ===
  jkl012  uses=0/1  expires=2026-05-07T00:00:00.000Z
  mno345  uses=0/1  expires=2026-05-07T00:00:00.000Z

=== External codes (on Discord, not by bot, not in DB): 99 ===
  pqr678  creator=123456789  uses=15/0
  ...

=== Summary ===
Discord total:          1001
DB total:               902
DB ∩ Discord (matched): 899
Phantom (DB only):      3
Orphaned (bot, no DB):  2
External (not bot):     99
```
