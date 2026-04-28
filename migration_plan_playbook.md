# Migration Playbook: PM2 → Docker Compose on New Server

## Prerequisites

- [ ] New server has Docker and Docker Compose installed
- [ ] SSH access to both old and new servers
- [ ] Git repo is accessible from the new server (clone or deploy key set up)

---

## Phase 1: Prepare the Code (local)

- [ ] Swap `node-sqlite3-wasm` → `better-sqlite3` (and `@types/better-sqlite3`)
- [ ] Remove `dotenv` dependency
- [ ] Update `config.ts` to read `process.env` directly (no `dotenv.config()`)
- [ ] Update `db.ts` for `better-sqlite3` API
- [ ] Add `Dockerfile` (Node 22 Alpine, multi-stage build)
- [ ] Add `docker-compose.yml` (single service, `env_file: .env`, volume mount for `./data:/app/data`)
- [ ] Add `.dockerignore`
- [ ] Update `Makefile` (replace pm2 commands with docker compose commands)
- [ ] Run tests locally — `npm test`
- [ ] Test locally — `docker compose up --build` with a test `.env`
- [ ] Push to git

---

## Phase 2: Set Up the New Server

```bash
# 1. Clone the repo
git clone <repo-url> ~/atf-discord-2026
cd ~/atf-discord-2026

# 2. Create the .env file
cp .env.example .env
# Fill in all values — copy from old server's .env
```

---

## Phase 3: Copy the Database from Old Server

```bash
# On the OLD server — stop the bot first to avoid writes during copy
pm2 stop atf-discord-2026

# On your LOCAL machine (or direct scp between servers)
scp old-server:~/atf-discord-2026/data/mentor.db /tmp/bot.db

# Copy to new server
scp /tmp/bot.db new-server:~/atf-discord-2026/data/bot.db
```

> **Note:** The DB was renamed from `mentor.db` → `bot.db` in the code.
> If the old server was already running the renamed code, copy `bot.db` instead.

---

## Phase 4: Cut Over

```bash
# On the NEW server
cd ~/atf-discord-2026
docker compose up --build -d

# Verify it's running
docker compose logs -f
# Look for: "Logged in as <bot-tag>"
# Look for: "Registered slash commands"
# Ctrl+C to exit logs (container keeps running)
```

```bash
# Test: run /invite-status or /invite-get in Discord to confirm the bot responds
```

---

## Phase 5: Decommission Old Server

```bash
# On the OLD server — only after confirming new server works
pm2 stop atf-discord-2026
pm2 delete atf-discord-2026

# Optional: keep the old server around for a day or two as a fallback
# Then shut it down when you're confident
```

---

## Rollback Plan

If something goes wrong on the new server:

```bash
# On the OLD server
pm2 start atf-discord-2026
```

The old server still has the code and DB. It will pick up right where it left off.
The only data you'd lose is any invite requests created on the new server
during the brief window. Given the traffic level, this is effectively zero risk.

---

## Post-Migration Checklist

- [ ] Bot responds to `/invite-create` in Discord
- [ ] Bot responds to `/invite-get` with an existing request ID from the old DB
- [ ] New member join triggers auto-role assignment (test with a test invite if possible)
- [ ] `docker compose logs` shows no errors
- [ ] Old server is stopped
- [ ] Delete `/tmp/bot.db` from your local machine (if used as intermediary)

---

## Ongoing Operations (New Server)

```bash
# View logs
docker compose logs -f

# Restart the bot
docker compose restart

# Deploy an update
git pull
docker compose up --build -d

# Stop for maintenance
docker compose stop

# Start after maintenance
docker compose up -d

# Back up the database
cp data/bot.db data/bot.db.backup.$(date +%Y%m%d)
```
