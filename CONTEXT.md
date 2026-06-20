# ATF Discord Invite Management

A Discord bot that creates tracked invite links and auto-assigns roles when people join through them.

## Language

**Invite**:
A Discord invite link created by the bot, tracked in the local DB, and tied to a role assignment.
_Avoid_: Link, URL

**Invite Code**:
The unique alphanumeric identifier Discord assigns to an invite (e.g. `7uvFvmWFt`).
_Avoid_: Invite ID

**Role Assignment**:
The mapping from an invite code to the Discord role that should be auto-assigned when a member joins via that invite.
_Avoid_: Role mapping

**Request**:
A recorded act of creating one or more invites. Has a human-readable ID (e.g. `2026-04-30-abc`), a mode (single or bulk), and an audit trail of who requested it and why.
_Avoid_: Job, task

**Invite Role**:
The role an invite assigns on join. Currently either `student` or `mentor`.
_Avoid_: Member type, user type

### Invite lifecycle states

**Live Invite**:
An invite that can still be used — not expired and not fully used.

**Dead Invite**:
An invite that can no longer be used — either fully used (uses ≥ maxUses) or expired.

**Phantom Invite**:
An invite code that exists in the local DB but no longer exists on Discord. Indicates stale data — Discord deleted it (expiry, manual deletion) but the DB was never cleaned up.

**Orphaned Invite**:
An invite that exists on Discord and was created by the bot, but has no record in the local DB. Caused by the bot creating the invite successfully but failing to persist the role assignment. These consume server capacity and won't trigger role assignment on join.

### Capacity

**Invite Capacity**:
The number of additional invites that can be created on the server. Discord nominally limits servers to ~1000 invites, though this can be exceeded by small amounts.

**Nominal Limit**:
Discord's approximate invite ceiling (~1000). Not a hard cap — can be exceeded due to race conditions during rapid creation.

### Tracking

**Member Join**:
A recorded event capturing that a member joined the server. Stores the member's Discord ID, the detected invite code (or null if detection failed), and the join timestamp. Forward-only — no backfill for members who joined before tracking was enabled. Append-only — rejoins create new records rather than updating existing ones.
_Avoid_: Join event, join record

## Relationships

- A **Request** produces one or more **Invites** (one for single mode, many for bulk mode)
- Each **Invite** has exactly one **Role Assignment**
- A **Live Invite** transitions to **Dead Invite** when it expires or reaches max uses
- A **Dead Invite** can be cleaned up (deleted from Discord) to reclaim **Invite Capacity**
- A **Member Join** references an **Invite Code** (or null if detection failed) — no foreign key; the invite may be non-tracked or unknown

## Example dialogue

> **Dev:** "A user ran `/invite-capacity` and it shows -1 available. How?"
> **Domain expert:** "The server has more invites than the nominal limit. Check for **Orphaned Invites** — the bot probably created some during a bulk run that crashed before persisting the **Role Assignments**."
>
> **Dev:** "Can we just clean those up with `/invite-cleanup`?"
> **Domain expert:** "No — cleanup only knows about invites in the DB. **Orphaned Invites** aren't in the DB by definition. You need the diagnostic script."

## Flagged ambiguities

- "bot invite" vs "bot-created invite": resolved — both mean an invite where the creator is the bot user. But operationally, only those *also* in the DB are considered tracked. Orphaned invites are bot-created but untracked.
- "dead" in cleanup context: an invite can be dead (expired/fully-used) but still exist on Discord until explicitly deleted. Death is a logical state, not deletion.
