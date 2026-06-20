# Implement `/all-member-export` slash command

Status: ready-for-agent

## Context

The bot needs a way for staff to export a roster of all Discord server members as a CSV file. All existing slash commands live in `src/commands/` and are wired up in `src/events/ready.ts` (registration) and `src/events/interactionCreate.ts` (dispatch).

## Behaviour

- Command name: `all-member-export`
- Permission check: reuse `checkInvitePermissions` from `src/invite/permissions.ts` (admin+mod only, channel allowlist respected)
- Fetches all guild members via `guild.members.fetch()`
- Excludes bots (`member.user.bot === true`)
- Builds a CSV with these columns in order:
  - `username` — `member.user.username`
  - `displayName` — `member.displayName`
  - `userId` — `member.user.id`
  - `joinedAt` — ISO 8601 string of `member.joinedAt`, empty string if null
  - `roles` — semicolon-separated list of role names (excluding `@everyone`)
- Sends the CSV as an ephemeral file attachment named `members.csv` using `AttachmentBuilder`
- Uses the standard `deferReply({ ephemeral: true })` + `editReply` pattern

## Files to create

- `src/commands/allMemberExport.ts` — new command (exports `data` and `execute`, same shape as all other commands in `src/commands/`)

## Files to modify

- `src/events/ready.ts` — import `data as allMemberExportCommand` and add it to the `guild.commands.set([...])` array
- `src/events/interactionCreate.ts` — import `execute as executeAllMemberExport` and add `'all-member-export': executeAllMemberExport` to `commandHandlers`

## Notes

- `GatewayIntentBits.GuildMembers` is already declared in `src/index.ts` but requires the **privileged intent** to be enabled in the Discord Developer Portal under the bot's settings. Mention this in a comment in the command file or the PR description — it's a deployment step, not a code step.
- Use the existing `escapeCsvField` helper pattern from `src/invite/csv.ts` (or inline the same logic) to handle commas/quotes in display names and role names.
- Roles with semicolons in their name: wrap the individual role name in double quotes within the roles cell, doubling any internal quotes (CSV-inside-CSV). Example: a member with roles `Mentor` and `Q;A Lead` produces `Mentor;"Q;A Lead"` in the roles cell. The outer `escapeCsvField` then handles the whole field for the CSV row as usual.
