# ATF Discord Bot

Discord bot for managing invite links with auto-role assignment on join.

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

On first run the bot will create `data/bot.db` automatically.

---

## Configuration

Copy `.env.example` to `.env` and fill in each value:

```env
DISCORD_TOKEN=                # Your bot token from discord.com/developers
GENERAL_RULES_CHANNEL_ID=    # Rules channel ID (invites point here)
INVITE_GEN_ALLOWLIST_CHANNELS= # Comma-separated channel IDs where invite commands are allowed
MENTOR_ROLE_ID=               # Mentor role ID (auto-assigned via invites)
ADMIN_ROLE_ID=                # Admin role ID (can use invite commands)
MOD_ROLE_ID=                  # Mod role ID (can use invite commands)
STUDENT_ROLE_ID=              # Student role ID (auto-assigned via invites)
UPLOADTHING_TOKEN=            # UploadThing token for bulk invite CSV storage
```

**How to get IDs:** Enable Developer Mode in Discord (Settings → Advanced → Developer Mode), then right-click any channel or role and select **Copy ID**.

---

## Bot Permissions & OAuth2 Setup

### OAuth2 URL Generator (Discord Developer Portal > your app > OAuth2 > URL Generator)

**Scopes** (check both):

- `bot`
- `applications.commands`

**Bot permissions** (checkboxes that appear after selecting `bot`):

| Permission | Why |
| --- | --- |
| Manage Server | Fetch all server invites for invite tracking (`guild.invites.fetch()`) |
| Create Instant Invite | Create invite links via `/invite-create` and `/invite-create-bulk` |
| Manage Roles | Auto-assign roles when members join via tracked invites |
| Send Messages | Reply to slash commands |
| Embed Links | Send rich embeds in command responses |
| Read Message History | Read channel messages |
| View Channels | Access the channels the bot operates in |
| Attach Files | Send CSV output files for `/invite-get` |

### Privileged Gateway Intents (Discord Developer Portal > your app > Bot > Privileged Gateway Intents)

| Intent | Why |
| --- | --- |
| Server Members Intent | Bot listens to `guildMemberAdd` for invite tracking and auto-role assignment |

Message Content Intent and Presence Intent are **not** needed.

### Generating the invite URL

Copy the generated URL from the OAuth2 URL Generator page and open it in a browser to invite the bot.

If you need to update permissions later, kick the bot from Server Settings > Members, then re-invite with a new URL.

---

## Discord Server Setup

The following roles must exist before running the bot:

### Roles

- `Student` — auto-assigned when a member joins via an invite with role=student
- `Mentor` — auto-assigned when a member joins via an invite with role=mentor
- `Admin` — can use invite commands
- `Mod` — can use invite commands

The bot's role must be **above** Student and Mentor in the role hierarchy (Server Settings > Roles) to assign them.

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
rm -rf data/bot.db.lock/   # clear stale DB lock if present
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

## Commands

### `/invite-capacity`

Shows how many invite slots are left on the server and how many the bot owns.

### `/invite-cleanup`

Deletes dead (expired or fully-used) bot invites to free up slots.

| Mode | What it deletes |
|------|----------------|
| `All dead bot invites` (default) | Bot invites that are expired or fully used |
| `All bot invites` | Every bot invite, live or dead |
| `All dead invites` | Any dead invite, including ones humans created |
| `All invites` | Nuclear option — everything |

Non-default modes require the `confirm` parameter: `i-know-what-im-doing-atf-bot`

---

## Database

SQLite database is stored at `data/bot.db` (auto-created on first run, gitignored).

### Schema

---

## Project Structure

```text
src/
├── index.ts                  Entry point — creates Discord client
├── logger.ts                 Patches console.* to append to data/bot.log
├── config.ts                 Loads and validates .env variables
├── db.ts                     SQLite setup and all prepared queries
├── commands/
│   ├── inviteCreate.ts       /invite-create slash command
│   ├── inviteCreateBulk.ts   /invite-create-bulk slash command
│   └── inviteGet.ts          /invite-get slash command
├── events/
│   ├── ready.ts              Registers commands and primes invite cache on startup
│   ├── interactionCreate.ts  Routes slash commands to handlers
│   └── guildMemberAdd.ts     Auto-assigns roles when members join via tracked invites
└── invite/
    ├── core.ts               Invite creation and validation logic
    ├── csv.ts                CSV parsing and output for bulk invites
    ├── bulk.ts               Bulk invite runner
    ├── tracking.ts           Invite cache and use-detection
    └── permissions.ts        Permission checks for invite commands
data/
├── bot.db                   SQLite database (auto-created, gitignored)
└── bot.log                  Append-only log file (survives restarts, auto-created)
```
