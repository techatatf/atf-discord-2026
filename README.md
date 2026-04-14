# ATF Discord Bot

Discord bot for managing mentor requests and approvals.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your values (see Configuration below)

# 3. Build and run
npm run build && npm start
```

On first run the bot will post the persistent "Become a Mentor" embed in `#mentor-requests` and create `data/mentor.db` automatically.

---

## How It Works

### Member flow

1. A member sees the embed in `#mentor-requests` and clicks **Request to be a Mentor**
2. They receive a private (ephemeral) confirmation only they can see
3. They wait — the bot will DM them when a decision is made

### Staff flow

1. A new embed appears in `#mentor-approvals` with the member's info
2. Click **Approve** or **Reject** — the embed updates in place (green/red) with your name and timestamp
3. The member is notified via DM automatically
4. If the DM fails (member has DMs disabled), a warning is posted in `#mentor-approvals`

### On approval

The member is assigned the `Mentor` role, which grants access to `#mentor-general`.

---

## Configuration

Copy `.env.example` to `.env` and fill in each value:

```env
DISCORD_TOKEN=          # Your bot token from discord.com/developers
MENTOR_REQUESTS_CHANNEL_ID=   # #mentor-requests channel ID
MENTOR_APPROVALS_CHANNEL_ID=  # #mentor-approvals channel ID
MENTOR_GENERAL_CHANNEL_ID=    # #mentor-general channel ID
MENTOR_ROLE_ID=               # The existing "Mentor" role ID
ADMIN_ROLE_ID=                # Admin role ID (can approve/reject)
MOD_ROLE_ID=                  # Mod role ID (can approve/reject)
```

**How to get IDs:** Enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click any channel or role and select **Copy ID**.

---

## Bot Permissions & OAuth2 Setup

**OAuth2 scopes:** `bot`, `applications.commands`

**Required bot permissions:**

| Permission | Why |
| --- | --- |
| Send Messages | Post embeds and status messages in channels |
| Manage Roles | Assign the Mentor role on approval |
| Read Message History | Recover the persistent embed on restart |
| Create Instant Invite | Generate invite links via `/invite-create` and `/invite-create-bulk` |
| Attach Files | Attach CSV output files for bulk invite requests |

To generate the invite URL: Discord Developer Portal > your app > **OAuth2** > **URL Generator** > check the scopes and permissions above, then copy the URL.

If you need to update permissions later, kick the bot from Server Settings > Members, then re-invite with a new URL.

---

## Discord Server Setup

The following channels and roles must exist before running the bot:

### Channels

- `#mentor-requests` — visible to all members; the bot posts one persistent embed here
- `#mentor-approvals` — staff-only; approval embeds and error logs appear here
- `#mentor-general` — restricted to the `Mentor` role

### Roles

- `Mentor` — already exists; assigned automatically on approval
- `Admin` — can approve/reject requests
- `Mod` — can approve/reject requests

**Channel permissions for `#mentor-approvals`:** deny `View Channel` for `@everyone`, allow it for Admin and Mod roles only.

---

## Deploying to the Server

```bash
# First time setup
npm install
npm run build
npm install -g pm2
pm2 start dist/index.js --name atf-discord-2026
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

```bash
# After pulling new changes
npm install        # in case dependencies changed
npm run build      # recompile TypeScript to dist/
pm2 stop atf-discord-2026
rm -rf data/mentor.db.lock/   # clear stale DB lock if present
pm2 start atf-discord-2026
```

```bash
# Useful pm2 commands
pm2 log atf-discord-2026      # tail logs
pm2 status                     # check if running
pm2 restart atf-discord-2026   # quick restart (no lock cleanup)
```

Or as a systemd service — create `/etc/systemd/system/atf-bot.service`:

```ini
[Unit]
Description=ATF Discord Bot
After=network.target

[Service]
WorkingDirectory=/path/to/atf-discord-2026
ExecStart=/usr/bin/node dist/index.js
Restart=always
EnvironmentFile=/path/to/atf-discord-2026/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable atf-bot
sudo systemctl start atf-bot
```

---

## Development

```bash
npm run dev     # Run with ts-node (no build step)
npm run build   # Compile TypeScript to dist/
npm start       # Run compiled output
```

> `node-sqlite3-wasm` is pure WebAssembly — no native compilation required on any platform.

---

## Database

SQLite database is stored at `data/mentor.db` (auto-created on first run, gitignored).

### Schema

`mentor_requests`

| Column | Type | Description |
| --- | --- | --- |
| `user_id` | TEXT (PK) | Discord user ID |
| `status` | TEXT | `pending`, `approved`, or `rejected` |
| `can_request_again` | INTEGER | `1` = eligible to re-request, `0` = blocked |
| `approval_message_id` | TEXT | Message ID of the embed in `#mentor-approvals` |
| `decided_by` | TEXT | Discord user ID of the mod who decided |
| `requested_at` | TEXT | ISO 8601 timestamp |
| `decided_at` | TEXT | ISO 8601 timestamp |

`bot_state`

| Column | Description |
| --- | --- |
| `mentor_request_message_id` | ID of the persistent embed in `#mentor-requests` |

---

## Project Structure

```text
src/
├── index.ts                  Entry point — creates Discord client
├── config.ts                 Loads and validates .env variables
├── db.ts                     SQLite setup and all prepared queries
├── embeds/
│   ├── requestEmbed.ts       Persistent member-facing embed
│   └── approvalEmbed.ts      Staff approval embeds (pending/decided)
├── events/
│   ├── ready.ts              Posts/recovers the persistent embed on startup
│   └── interactionCreate.ts  Routes button interactions to handlers
└── handlers/
    ├── requestButton.ts      Handles member clicking "Request to be a Mentor"
    ├── approveButton.ts      Handles staff clicking "Approve"
    └── rejectButton.ts       Handles staff clicking "Reject"
data/
└── mentor.db                 SQLite database (auto-created, gitignored)
```

---

## Planned Features

- Slash commands: `/mentor-approve`, `/mentor-reject`, `/mentor-reset-request`, `/mentor-status`, `/mentor-list`
- Member–mentor matching system
