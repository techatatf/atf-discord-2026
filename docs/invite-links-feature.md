# Invite Links Feature — Design Doc

## Overview

A set of Discord slash commands for generating unique, trackable invite links that direct new users to the server's Rules/Guidelines channel. Admin and Mod roles can create invite links (single or bulk) and retrieve past requests by ID.

---

## Slash Commands

### `/invite-create`

Creates a single invite link.

| Option | Type | Required | Default | Notes |
|--------|------|----------|---------|-------|
| `reason` | string | yes | — | Cannot be empty |
| `max-uses` | integer | no | 1 | Must be a positive integer |
| `max-age` | integer | no | 7 | In **days**. Must be a positive integer (0 is rejected) |

**Response:** Ephemeral reply containing the generated invite link + request ID. Also DMs the user a receipt (request ID + reason).

### `/invite-create-bulk`

Creates invite links in bulk from a CSV upload.

| Option | Type | Required | Notes |
|--------|------|----------|-------|
| `file` | attachment | yes | CSV file (see format below) |

**Response:** Ephemeral reply containing the output CSV as a Discord attachment + request ID. Also DMs the user a receipt (request ID + submitted file name or similar context).

### `/invite-get`

Retrieves a previous request's output by request ID.

| Option | Type | Required |
|--------|------|----------|
| `request-id` | string | yes |

**Response:** Ephemeral reply. For single-mode requests, re-displays the invite link. For bulk-mode requests, re-attaches the output CSV. No DM is sent.

### Permissions

All three commands require **Admin** or **Mod** role and can only be used in channels listed in `INVITE_GEN_ALLOWLIST_CHANNELS`. Any admin/mod can retrieve any request (not just their own).

---

## Request ID Format

`yyyy-mm-dd-xxx` where `xxx` is 3 random lowercase letters.

Example: `2026-04-13-epf`

Collision detection: if the generated ID already exists in the database, regenerate until unique.

---

## CSV Format (Bulk Input)

Header row is required. `reason` is the only required column.

| Column | Required | Default if column missing | Cell-level rules |
|--------|----------|--------------------------|------------------|
| `reason` | yes | — | Must not be empty |
| `max-uses` | no | 1 | If column is present, every cell must be a positive integer or `-1` (meaning use default). Empty cells are a validation error. |
| `max-age` | no | 7 (days) | Same rules as max-uses. Value is in days. `0` is rejected. |

### Re-upload support (partial results)

If the CSV contains an `invite-link` column (from a previous partial run), rows that already have a value in that column are **skipped** — invites are only created for rows without an existing link.

### Validation

Validation runs **before** any invite creation. If any row fails validation, the **entire batch is rejected** with a message indicating which rows failed and why.

### Example input CSV

```csv
reason,max-uses,max-age
Spring onboarding,1,7
VIP guest access,3,14
Workshop attendee,-1,-1
```

### Example output CSV

Same as input with an appended `invite-link` column:

```csv
reason,max-uses,max-age,invite-link
Spring onboarding,1,7,https://discord.gg/abc123
VIP guest access,3,14,https://discord.gg/def456
Workshop attendee,1,7,https://discord.gg/ghi789
```

---

## Invite Link Creation

All invite links are created against the channel identified by `GENERAL_RULES_CHANNEL_ID` (a Rules/Guidelines community channel). New users who join via the link see the rules screening popup.

Discord API call: `channel.createInvite({ maxUses, maxAge, unique: true })`

- `maxAge` is converted from days to seconds before calling the API (`days * 86400`).
- `unique: true` ensures Discord generates a fresh, unique code each time.

### Bulk runtime failures

If invite creation fails partway through a bulk request (rate limit, API error), the result is **partial**: successful rows get their `invite-link` populated, failed rows do not. The output CSV is still generated and returned. The user can re-upload the output CSV to retry — existing links are preserved and only empty rows are retried.

---

## Database Schema

New table: `invite_requests`

| Column | Type | Notes |
|--------|------|-------|
| `request_id` | TEXT, PK | Format: `yyyy-mm-dd-xxx` |
| `mode` | TEXT | `single` or `bulk` |
| `requested_by_display_name` | TEXT | Discord display name |
| `requested_by_username` | TEXT | Discord handle |
| `requested_by_roles` | TEXT | Comma-separated list of role names |
| `reason` | TEXT | For single mode: the reason. For bulk: null or the file name. |
| `output` | TEXT | For single mode: the invite link. For bulk: the UploadThing file URL. |
| `requested_at` | TEXT | ISO 8601 timestamp |

---

## File Storage (Bulk Mode)

Output CSVs are uploaded to **UploadThing** via `UTApi` (server-side, no HTTP server needed).

- `UPLOADTHING_TOKEN` env var required.
- After upload, the returned URL is stored in `invite_requests.output`.
- The same file is also attached directly to the ephemeral Discord reply.
- On `/invite-get` for bulk requests, the file is fetched from the UploadThing URL and re-attached to the ephemeral reply.

---

## DM Receipts

On `/invite-create` and `/invite-create-bulk`, after the ephemeral reply, the bot DMs the requesting user:

> **Invite Request Receipt**
> Request ID: `2026-04-13-epf`
> Reason: Spring onboarding
> (for bulk: file name or "Bulk invite request")

No DM is sent for `/invite-get`.

---

## Environment Variables (new)

Add to `.env.example`:

```
GENERAL_RULES_CHANNEL_ID=
INVITE_GEN_ALLOWLIST_CHANNELS=
UPLOADTHING_TOKEN=
```

`GENERAL_RULES_CHANNEL_ID` and `INVITE_GEN_ALLOWLIST_CHANNELS` are required for Phase 1. `UPLOADTHING_TOKEN` is required for Phase 2.

`INVITE_GEN_ALLOWLIST_CHANNELS` is a comma-separated list of channel IDs where the invite commands can be used (e.g. `123456789,987654321`).

---

## Phasing

### Phase 1

- `/invite-create` (single invite)
- `/invite-get` (retrieve by request ID)
- Database table + recording
- DM receipts
- `GENERAL_RULES_CHANNEL_ID` and `INVITE_GEN_ALLOWLIST_CHANNELS` env vars
- Slash command registration + permission checks (admin/mod + channel allowlist)

### Phase 2

- `/invite-create-bulk` (CSV upload)
- CSV parsing + validation (including re-upload/partial result support)
- UploadThing integration (`UTApi`)
- Output CSV generation + upload
- `UPLOADTHING_TOKEN` env var

---

## Core Function

Both single and bulk interfaces call the same core function that:

1. **Validates** parameters (reason not empty, max-uses is positive int or absent, max-age is positive int or absent and not 0)
2. **Generates a request ID** (`yyyy-mm-dd-xxx`, with collision retry)
3. **Creates the invite(s)** via Discord API
4. **Records** the request in the database
5. **Returns** the result (link + request ID for single; output CSV + request ID for bulk)
