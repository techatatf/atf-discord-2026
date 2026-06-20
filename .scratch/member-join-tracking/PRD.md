# PRD: Persist Invite-Source Tracking in the Database

**Status:** ready-for-agent

**Depends on:** None (standalone; must be completed before `.scratch/export-invite-metadata/`)

---

## Problem Statement

The bot already detects which invite a new member used when they join (via the use-count comparison in `detectUsedInvite`), but it discards this information after auto-assigning the role. There is no persistent record of which invite brought in which member. This means:

- The `/all-member-export` CSV cannot include invite-source metadata.
- There is no way to answer questions like "how many people joined through the Spring 2026 cohort invites?" without manually cross-referencing Discord's UI.
- If the bot restarts or the in-memory invite cache is lost, the detection result is gone forever.

## Solution

Create a new `member_joins` table in the SQLite database that records every detected join event. Modify the `guildMemberAdd` handler to insert a record after calling `detectUsedInvite`, regardless of whether detection succeeded (null invite code is recorded as-is). The table is append-only — records are never updated or deleted — preserving a full history including rejoins.

This is forward-only tracking. Members who were already on the server before this change will have no records in the table.

## User Stories

1. As a staff member, I want the bot to remember which invite each new member used so that I can later query or export this information.
2. As a staff member, I want rejoin events tracked separately so that I can see the full history of a member who left and came back (possibly through a different invite).
3. As a staff member, I want joins recorded even when the bot can't determine the invite so that I have a complete timeline of join events with honest gaps rather than missing entries.
4. As a developer, I want the join tracking to be a simple append-only insert so that it doesn't complicate the existing `guildMemberAdd` flow or introduce failure modes that could block role assignment.
5. As a developer, I want the new table to reference invite codes (not foreign-keyed) so that joins from non-tracked invites or unknown sources can still be stored.

## Implementation Decisions

### New table: `member_joins`

Added to the `db.exec(...)` block in `db.ts`:

```sql
CREATE TABLE IF NOT EXISTS member_joins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL,
  invite_code TEXT,
  joined_at TEXT NOT NULL
);
```

- `id`: auto-incrementing primary key (supports multiple rows per member)
- `member_id`: Discord user ID
- `invite_code`: the invite code detected by `detectUsedInvite`, or NULL if detection failed
- `joined_at`: ISO 8601 timestamp of `member.joinedAt`, falling back to the current time if null

No foreign key to `invite_role_assignments` — the invite code may refer to a non-tracked invite or be null. The join is done at query time when enriching exports.

### Index

```sql
CREATE INDEX IF NOT EXISTS idx_member_joins_member_id ON member_joins(member_id);
```

The server expects up to 15k accounts. Downstream queries (export enrichment, future per-member lookups) filter or group by `member_id`.

### New prepared statements

Add to the `queries` object in `db.ts`:

- `insertMemberJoin`: inserts a row into `member_joins`

Query statements (`getMemberJoinsByMember`, `getLatestMemberJoin`) are deferred to the export PRD (`.scratch/export-invite-metadata/`), which will define its own joined query across `member_joins`, `invite_role_assignments`, and `invite_requests`.

### Modification to `guildMemberAdd`

After calling `detectUsedInvite` and before the early-return checks, insert a row into `member_joins`. The insert must happen regardless of whether:
- The invite code is null (detection failed)
- The invite code has no matching `invite_role_assignments` row (non-tracked invite)
- The role assignment succeeds or fails

The insert should be in its own try/catch — if the DB write fails, log at `error` level but do not prevent role assignment from proceeding.

### No backfill

There is no mechanism to retroactively populate `member_joins` for existing server members. The table only reflects joins that happen after this change is deployed.

## Testing Decisions

### What makes a good test here

Tests should verify that the correct data is written to the database for various join scenarios. The `guildMemberAdd` handler is tightly coupled to Discord, so the testable surface is the DB layer — verify that the prepared statements work correctly with various inputs.

### Modules to test

1. **`insertMemberJoin` prepared statement** — verify correct row insertion for: normal join with invite code, join with null invite code, multiple joins for the same member (rejoin).
2. **`getLatestMemberJoin` query** — verify it returns the most recent join for a member with multiple records, and returns nothing for a member with no records.

### Prior art

The project currently tests pure functions (CSV building, invite loop). DB-level tests would be new territory. If the team prefers, these can be tested through the higher-level export function once PRD #04 integrates the data. Alternatively, a test can instantiate an in-memory SQLite database and run the statements directly.

## Out of Scope

- Exposing join records through a standalone slash command (e.g., `/member-joins @user`)
- Backfilling historical join data for existing members
- Tracking member leave events
- Adding invite-source columns to the CSV export (that's PRD #04 in `.scratch/export-invite-metadata/`)
- Modifying the `detectUsedInvite` algorithm to improve detection accuracy

## Further Notes

- The insert in `guildMemberAdd` should be placed early — after `detectUsedInvite` but before the `if (!code) return` check — so that joins with null invite codes are still recorded.
- The `member_joins` table intentionally does not store role assignment information. The role can be derived by joining `member_joins.invite_code` → `invite_role_assignments.invite_code` → `invite_role_assignments.role_id` at query time.
- This table could later support a `/member-lookup` command or a dashboard, but those are future features and not part of this PRD.
