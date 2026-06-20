# PRD: Add Invite-Source Metadata to CSV Export

**Status:** ready-for-agent

**Depends on:** `.scratch/member-join-tracking/` (must be implemented first), `.scratch/all-member-export-sorting-filtering/` (must be implemented first)

---

## Problem Statement

After implementing join tracking (PRD #03), the bot has persistent records of which invite each member used. But the `/all-member-export` CSV still only includes the original five columns (`username`, `displayName`, `userId`, `joinedAt`, `roles`). Staff who want to see invite-source information alongside the member roster must manually cross-reference the database — the export doesn't surface the tracked data.

## Solution

Add four new columns to the CSV export: `inviteCode`, `inviteRole`, `requestedBy`, and `reason`. These are populated by joining the `member_joins` table through `invite_role_assignments` and `invite_requests`. For members with multiple join records, use the most recent. For members with no join record (pre-tracking) or a null invite code, all four columns are blank.

## User Stories

1. As a staff member, I want to see which invite code each member used so that I can track the effectiveness of specific invite links.
2. As a staff member, I want to see the invite role (student/mentor) in the export so that I can verify role assignments at a glance without checking Discord.
3. As a staff member, I want to see who requested the invite so that I can trace member onboarding back to the staff member who initiated it.
4. As a staff member, I want to see the reason for the invite so that I can associate members with specific cohorts, events, or campaigns.
5. As a staff member, I want pre-tracking members to have blank metadata columns rather than confusing placeholder values so that the data is honest about what is and isn't known.
6. As a staff member, I want the filtered export to also include invite metadata so that I can see both "who joined recently" and "how they got here" in one file.
7. As a developer, I want the metadata enrichment to be a separate function from CSV generation so that it can be tested independently.

## Implementation Decisions

### Extended `MemberRecord` interface

Add four optional fields to `MemberRecord`:

- `inviteCode`: string or undefined
- `inviteRole`: string or undefined (the role name resolved from `invite_role_assignments.role_id` via the guild's role cache)
- `requestedBy`: string or undefined (from `invite_requests.requested_by_username`)
- `reason`: string or undefined (from `invite_requests.reason`)

### New query: join enrichment

A new prepared statement (or a composed query function) that, given a member ID, returns the most recent join record enriched with invite request metadata. The query joins:

```
member_joins (most recent per member_id)
  → invite_role_assignments (on invite_code)
    → invite_requests (on request_id)
```

Returns null fields at each level if the join is missing (no tracking, null invite code, non-tracked invite, no matching request).

### Enrichment step in the export handler

After fetching and mapping members into `MemberRecord[]`, enrich each record by looking up their latest join data. This happens before sorting/filtering — the metadata is attached to the record and flows through to CSV generation.

For performance, consider a single batch query that fetches latest join + metadata for all member IDs at once, rather than N individual lookups.

### Updated CSV header

```
username,displayName,userId,joinedAt,roles,inviteCode,inviteRole,requestedBy,reason
```

The four new columns appear after `roles`. Empty values produce empty CSV cells (no placeholder text).

### Updated `buildMemberCsv`

The CSV builder adds the four new fields to each row, applying `escapeCsvField` to `requestedBy` and `reason` (which may contain commas, quotes, or freeform text). `inviteCode` and `inviteRole` are unlikely to need escaping but should be escaped defensively.

### Role name resolution

`invite_role_assignments` stores a `role_id` (Discord snowflake), not a role name. The export needs to resolve this to a human-readable name. This can be done by looking up `guild.roles.cache.get(roleId)?.name` during the enrichment step. If the role no longer exists on the server, fall back to the raw role ID.

## Testing Decisions

### What makes a good test here

Tests should exercise the enrichment logic and the updated CSV generation through their function interfaces. Pass in `MemberRecord[]` with various combinations of metadata presence and assert on CSV output.

### Modules to test

1. **Updated `buildMemberCsv`** — existing tests updated to include the four new fields. New test cases:
   - Member with full metadata (all four fields populated)
   - Member with no metadata (all four fields undefined/empty)
   - Member with partial metadata (invite code present but no matching request — `requestedBy` and `reason` blank)
   - `reason` field containing commas and quotes (CSV escaping)
2. **Enrichment function** — given a set of member IDs and a mock DB state, verify correct join → assignment → request resolution. Test cases:
   - Member with one join record and a tracked invite
   - Member with multiple join records (verify most recent is used)
   - Member with a join record but null invite code
   - Member with a join record but an invite code not in `invite_role_assignments`
   - Member with no join record at all

### Prior art

`tests/allMemberExport.test.ts` tests `buildMemberCsv` with the custom `test()` wrapper and `node:assert/strict`. The updated tests extend that file.

## Out of Scope

- Adding new metadata beyond the four specified columns
- Changing the invite tracking detection algorithm
- Backfilling join records for existing members
- Exposing invite metadata through any channel other than the CSV export
- Aggregation or summary statistics (e.g., "10 members joined via invite X")

## Further Notes

- The batch query approach for enrichment is recommended over per-member lookups. With a 1000-member server, N individual queries would be noticeably slow during export generation. A single query that returns the latest join for all members, joined with assignment and request data, keeps the export responsive.
- The `inviteRole` column shows the human-readable role name (e.g., "Student", "Mentor"), not the Discord role ID. This is consistent with how the `roles` column already works.
- If a member's most recent join used a non-tracked invite (one not created by the bot), `inviteCode` will be populated but `inviteRole`, `requestedBy`, and `reason` will be blank — the bot only has metadata for invites it created.
