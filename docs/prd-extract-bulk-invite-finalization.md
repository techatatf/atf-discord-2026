# PRD: Extract Bulk Invite Finalization Module

**Status:** needs-triage

---

## Problem Statement

The `/invite-create-bulk` command handler is a 120-line monolith that interleaves eight distinct responsibilities: permission checking, CSV fetching, parsing, channel resolution, cancel/progress UI, the invite creation loop, post-loop persistence (DB writes + invite cache updates), and result distribution (CSV build, UploadThing upload, Discord reply, DM receipt).

The invite creation loop itself (`runBulkInviteLoop`) was already extracted into a testable module with an `InviteCreator` seam. But everything that happens *after* the loop — persisting role assignments, building the output CSV, uploading to UploadThing, and recording the request in the database — remains tangled inside the command handler. This post-loop work contains real bug surface (upload timeouts, partial persistence, CSV assembly from mixed success/failure/skip results) that cannot be tested without constructing a full Discord `ChatInputCommandInteraction`.

## Solution

Extract a **bulk invite finalization** module that takes the results of a bulk invite run and handles all post-loop work: persist role assignments to the database, update the invite cache, build the output CSV, upload it to UploadThing, and record the invite request. The command handler shrinks to Discord interaction orchestration (UI, cancel button, replies) and delegates results handling to this new module.

The module's interface accepts typed inputs (the `BulkInviteRunResult`, parsed CSV data, requester metadata, request ID) and returns a typed output (the output CSV content, the upload URL or null, summary counts). Everything behind the interface — DB writes, cache updates, UploadThing upload with timeout — is implementation detail that callers don't need to know.

## User Stories

1. As a developer, I want the post-loop bulk invite logic (persist + upload + CSV build) behind a single function interface, so that I can test it without mocking Discord interactions.
2. As a developer, I want UploadThing upload failures to be testable in isolation, so that I can verify the bot handles timeouts and errors gracefully without relying on a live UploadThing token.
3. As a developer, I want the bulk invite command handler to be short enough to read in one screen, so that I can quickly understand the Discord interaction flow without wading through persistence logic.
4. As a developer, I want role assignment persistence to live behind a seam, so that I can verify the correct role mappings are written for mixed success/failure/skip batches.
5. As a developer, I want the output CSV assembly to be testable given a known `BulkInviteRunResult`, so that I can verify edge cases (all failed, all skipped, partial success, cancelled mid-run).
6. As a staff member using `/invite-create-bulk`, I want the same behavior I have today — nothing user-facing changes.
7. As a developer, I want the finalization module to be reusable if we ever add a non-Discord trigger for bulk invite creation (e.g., a CLI or API), so that the same persist+upload logic doesn't need to be re-implemented.

## Implementation Decisions

### New module: bulk invite finalization

A new module (in `src/invite/`) that exports a single function with this shape:

- **Inputs:** the `BulkInviteRunResult` (from `runBulkInviteLoop`), the `CsvParseResult` (from `parseCsv`), requester metadata (display name, username, roles), request ID, timestamp, and a guild ID (for cache updates).
- **Outputs:** a result object containing the output CSV string, the UploadThing URL (or null on failure), and summary counts.
- **Side effects:** writes invite role assignments to the DB, updates the invite cache, uploads to UploadThing.

The UploadThing upload should accept an uploader function as a parameter (a seam), so tests can inject a fake. The DB writes should go through the data-access layer (currently `queries.*` — or typed wrapper functions if candidate #2 is tackled later).

### What stays in the command handler

The command handler retains:
- Permission check + defer
- CSV fetch from Discord attachment
- Parse + validation error reply
- Channel resolution
- Cancel button + progress UI wiring
- Calling `runBulkInviteLoop`
- Calling the new finalization function
- Assembling the Discord reply (summary message, file attachment) from the finalization result
- Sending the DM receipt

### What does NOT change

- `runBulkInviteLoop` interface and implementation — already clean
- `parseCsv` / `buildOutputCsv` — already tested, stay as-is
- All other command handlers
- Database schema
- User-facing behavior (slash command responses, DM receipts, CSV output format)

### The `withTimeout` utility

The `withTimeout` helper currently lives inside `inviteCreateBulk.ts`. It moves into the finalization module (or a shared utility) since it's used for the UploadThing upload.

## Testing Decisions

### What makes a good test here

Tests should exercise the finalization module through its function interface — pass in a `BulkInviteRunResult` and assert on outputs (CSV content, upload URL) and observable side effects (DB rows written, cache updated). Tests should NOT mock internal implementation details; they test the module's external behavior.

### Modules to test

1. **Bulk invite finalization function** — the new module. Test cases:
   - Happy path: all invites created successfully → correct DB rows, correct CSV, upload succeeds
   - Partial failure: some invites failed → correct links array in CSV, failed rows have empty link cells
   - All skipped (re-upload of complete CSV) → no DB writes, CSV unchanged
   - Upload failure → function still returns CSV content and null URL, DB writes still committed
   - Cancelled run (partial results) → only created invites are persisted

2. **The uploader seam** — verify that when the injected uploader throws or times out, the finalization function degrades gracefully.

### Prior art

The existing `tests/bulkInvite.test.ts` follows the same pattern: a `makeFakeChannel` function injects a fake `InviteCreator` into `runBulkInviteLoop`. The finalization tests should follow this exact pattern — a `makeFakeUploader` that injects a fake UploadThing client.

Test runner: the project uses raw `node:assert/strict` with a custom `test()` wrapper (no framework). New tests should follow the same convention.

## Out of Scope

- **Deepening `db.ts`** (candidate #2 from the architecture review) — typed wrapper functions around prepared statements. Valuable but separate work. The finalization module will use `queries.*` directly for now.
- **Deepening `createSingleInvite`** (candidate #3) — same pattern, separate work.
- **Making `InviteTracker` testable** (candidate #4) — separate work.
- **Any user-facing changes** — this is a pure internal refactor.
- **Changing the UploadThing dependency or upload strategy.**

## Further Notes

- The existing design doc (`docs/invite-links-feature.md`) describes the intended architecture with a "core function" that both single and bulk flows call. The finalization module is a step toward that: it extracts the post-creation pipeline that's specific to bulk mode but could eventually serve single mode too (if single invites ever need file output or external upload).
- On deploy, `data/mentor.db` should be renamed to `data/bot.db` to match the hygiene cleanup done alongside this PRD.
