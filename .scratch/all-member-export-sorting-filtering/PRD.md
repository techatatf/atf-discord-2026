# PRD: Sorting and Filtered Export via Subcommands

**Status:** ready-for-agent

**Depends on:** `.scratch/all-member-export` (issue #01, already done)

---

## Problem Statement

The `/all-member-export` command dumps all server members in an undefined order with no way to narrow the result set. Staff who want to see recent joins (e.g., "who joined in the last week?") must export the full roster and manually filter in a spreadsheet. The lack of sorting also makes the CSV harder to scan — members appear in whatever order Discord's API returns them.

## Solution

Refactor `/all-member-export` from a flat command into two subcommands:

- **`/all-member-export full`** — Exports all non-bot members, sorted by `joinedAt` ascending (earliest first). Members with null `joinedAt` appear at the top, before the earliest known join. No additional parameters.
- **`/all-member-export filtered unit:<hour|day|week|month> [amount:<int>]`** — Exports only members who joined within `amount × unit` of the current time. `unit` is required (string choice: `hour`, `day`, `week`, `month`). `amount` is optional (integer, minimum 1, no maximum, defaults to 1). Members with null `joinedAt` are excluded from filtered results. Results sorted by `joinedAt` ascending.

When no subcommand arguments make sense (e.g., someone provides `amount` without `unit`), the Discord UI itself prevents this — subcommand parameter definitions enforce the structure.

## User Stories

1. As a staff member, I want the full export sorted by join date so that I can scan the CSV chronologically without re-sorting in a spreadsheet.
2. As a staff member, I want to export only members who joined in the last day so that I can quickly review new arrivals after an event or announcement.
3. As a staff member, I want to export members who joined in the last month so that I can compile onboarding reports for a specific period.
4. As a staff member, I want to specify a custom amount (e.g., 3 weeks, 48 hours) so that I'm not limited to fixed window sizes.
5. As a staff member, I want members with unknown join dates excluded from filtered exports so that the results only contain members who definitively joined within my window.
6. As a staff member, I want members with unknown join dates to still appear in the full export so that no one is silently dropped from a complete roster dump.
7. As a staff member, I want the `amount` parameter to default to 1 when I only specify a unit so that the common case ("last 1 hour") requires minimal input.
8. As a staff member, I want the command to clearly show "full" vs "filtered" as subcommands so that I know which path I'm choosing before I fill in parameters.

## Implementation Decisions

### Subcommand structure

The `SlashCommandBuilder` registers two subcommands using `.addSubcommand()`:

- `full` — no options
- `filtered` — one required string option (`unit`, with choices `hour`/`day`/`week`/`month`) and one optional integer option (`amount`, min value 1)

The handler reads `interaction.options.getSubcommand()` to branch.

### Sorting

After mapping fetched members into `MemberRecord[]`, sort the array by `joinedAt` ascending. Null `joinedAt` values sort before all non-null values.

### Filtering

For the `filtered` subcommand, compute a cutoff timestamp: `new Date(Date.now() - amount * unitToMs(unit))`. Filter the sorted array to members whose `joinedAt` is non-null and >= the cutoff.

### CSV filename

Include context in the attachment filename:
- Full export: `members-full.csv`
- Filtered export: `members-last-3-weeks.csv` (interpolating the amount and unit)

### No changes to CSV columns or content

The CSV format (header, escaping, columns) remains identical to issue #01. This PRD only changes sorting, filtering, and command structure.

### Breaking change

This replaces the flat `/all-member-export` with a subcommand-based version. Since the command was just implemented and has no established user base, this is acceptable without deprecation.

## Testing Decisions

### What makes a good test here

Tests should exercise the sorting and filtering logic through exported pure functions — pass in an array of `MemberRecord[]` and assert on the output order and inclusion. Tests should NOT mock Discord interactions or test subcommand routing.

### Modules to test

1. **Sorting function** — verify null-first ordering and ascending `joinedAt` sort across a variety of cases (all nulls, no nulls, mixed, identical timestamps).
2. **Filtering function** — verify that members outside the time window are excluded, null `joinedAt` members are excluded, and members exactly on the boundary are included.
3. **`buildMemberCsv` still works** — existing tests remain valid; sorting/filtering happens before CSV generation.

### Prior art

`tests/allMemberExport.test.ts` uses `node:assert/strict` with a custom `test()` wrapper. New tests follow the same convention.

## Out of Scope

- Adding new CSV columns (that's PRD #04 in `.scratch/export-invite-metadata/`)
- Persisting join tracking (that's PRD #03 in `.scratch/member-join-tracking/`)
- Pagination or streaming for very large guilds
- Caching or rate-limiting the export

## Further Notes

- The existing `buildMemberCsv` function does not need to change — sorting and filtering happen upstream in the `execute` handler, and the CSV builder receives an already-ordered, already-filtered array.
- The `GatewayIntentBits.GuildMembers` privileged intent is already enabled (from issue #01).
