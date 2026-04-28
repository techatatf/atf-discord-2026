# PRD: Dockerize Bot and Swap to better-sqlite3

**Status:** needs-triage

---

## Problem Statement

The bot runs on a server managed by pm2 with no containerization. Deploying, restarting, and maintaining the process is manual and fragile. The current SQLite driver (`node-sqlite3-wasm`) uses a directory-based file lock that can become stale on hard crashes, leaving the database inaccessible until the lock is manually deleted. There is no reproducible build environment — the Node version, OS dependencies, and build output all depend on whatever is installed on the server.

## Solution

Containerize the bot with Docker Compose (single service) and swap the SQLite driver from `node-sqlite3-wasm` to `better-sqlite3`. The database file is persisted via a volume mount. Environment variables are injected by Docker Compose via `env_file`, eliminating the `dotenv` dependency. The Makefile is updated with docker compose commands for deploy, restart, logs, and stop. A migration playbook documents the step-by-step cutover from the old server to the new one.

## User Stories

1. As the bot operator, I want to deploy updates with a single command (`git pull && docker compose up --build -d`), so that I don't have to remember multiple pm2 commands.
2. As the bot operator, I want to restart the bot with `docker compose restart`, so that restarts are simple and reliable.
3. As the bot operator, I want to stop the bot for maintenance with `docker compose stop` and start it again with `docker compose up -d`, so that I have clear control over the process lifecycle.
4. As the bot operator, I want the database file to survive container restarts, rebuilds, and stops, so that I never lose invite request data.
5. As the bot operator, I want to back up the database by copying a single file from the host filesystem, so that backups are trivial.
6. As the bot operator, I want the SQLite driver to use native OS file locking instead of a directory-based lock, so that stale lock files never block the bot from starting.
7. As the bot operator, I want the bot's Node version pinned in the Dockerfile, so that builds are reproducible regardless of what's installed on the server.
8. As the bot operator, I want environment variables injected by Docker Compose, so that I don't need a runtime dependency on dotenv.
9. As the bot operator, I want to view logs with `docker compose logs -f`, so that I have a single way to monitor the bot.
10. As the bot operator, I want a `restart: unless-stopped` policy on the container, so that the bot restarts automatically after crashes or server reboots.
11. As the bot operator, I want a migration playbook that documents every step of the cutover, so that I don't miss anything during the server move.
12. As a developer, I want the database module to use `better-sqlite3` with proper TypeScript types, so that query results are typed without `as unknown as X` casts at every call site.
13. As a developer, I want the database module to have tests that verify insert and query round-trips, so that the driver swap is validated and future schema changes are caught.
14. As a developer, I want the Docker image to use a multi-stage build, so that the final image contains only the compiled JavaScript and production dependencies.
15. As a developer, I want a `.dockerignore` file, so that `node_modules`, `.env`, `data/`, and `.git` are not sent to the Docker build context.

## Implementation Decisions

### Docker setup

- **Base image:** `node:22-alpine` (current LTS, supported through April 2027).
- **Multi-stage Dockerfile:** Stage 1 installs all dependencies and compiles TypeScript. Stage 2 copies the compiled output and production dependencies into a slim runtime image. `better-sqlite3` is a native module and must be compiled in the build stage against the same architecture as the runtime stage.
- **docker-compose.yml:** Single service. `env_file: .env` for environment variables. Volume mount `./data:/app/data` for database persistence. Restart policy `unless-stopped`.
- **.dockerignore:** Excludes `node_modules`, `dist`, `data`, `.env`, `.git`, and `*.md`.

### better-sqlite3 swap

- Replace `node-sqlite3-wasm` with `better-sqlite3` (and `@types/better-sqlite3` as a dev dependency).
- `better-sqlite3` uses synchronous APIs and native OS file locking. No `.db.lock` directory. No stale lock problem.
- **db.ts changes:** New import, `new Database(path)` constructor is similar. Prepared statement API differs: `.run()` takes spread args instead of an array. `.get()` returns typed results directly.
- **Call site changes (mechanical):** All files that import `queries` and call `.run([...])` change to `.run(...)`. All `as unknown as X` casts on `.get()` and `.all()` results are removed — `better-sqlite3` supports generics on prepared statements.
- **Shutdown handler:** The `SIGINT`/`SIGTERM` handler simplifies. `better-sqlite3` uses WAL mode with proper OS locking, so even a hard crash doesn't leave stale locks.

### Drop dotenv

- Remove the `dotenv` package from dependencies.
- Remove `dotenv.config()` from `config.ts`. The `process.env` reads remain unchanged — Docker Compose injects the variables.
- `.env` file format stays the same. `.env.example` stays the same.

### Makefile update

- Replace `prod_pm2_restart` and `prod_pm2_logs` with docker compose equivalents: `deploy` (git pull + docker compose up --build -d), `logs`, `restart`, `stop`.

### Migration

- A migration playbook already exists at `migration_plan_playbook.md` in the project root, covering the full cutover sequence from old server (pm2) to new server (Docker Compose), including database copy and rollback plan.

## Testing Decisions

### What makes a good test here

Tests should exercise the database module through its public interface — prepare statements, insert rows, query them back — and assert on the returned data. Tests should NOT test `better-sqlite3` internals or mock the SQLite engine. The goal is to verify that the prepared statements work correctly with the new driver and that the schema is created properly.

### Module to test: db

- **In-memory database:** Tests create a `better-sqlite3` database with `:memory:` instead of a file path, run the same schema creation SQL, and exercise the prepared statements. No file system side effects.
- **Test cases:**
  - Insert an invite request and retrieve it by request ID — verify all fields round-trip correctly.
  - Insert a role assignment and retrieve it by invite code — verify all fields round-trip.
  - Retrieve role assignments by request ID — verify multiple assignments for one request are returned.
  - Query a non-existent request ID — verify it returns undefined.
  - `inviteRequestExists` returns truthy for existing, falsy for missing.

### Prior art

The existing `tests/bulkInvite.test.ts` uses raw `node:assert/strict` with a custom `test()` wrapper (no framework). New tests follow the same convention.

## Out of Scope

- **Extracting the bulk invite finalization module** — covered by a separate PRD (`docs/prd-extract-bulk-invite-finalization.md`).
- **Deepening `createSingleInvite`** or other architecture candidates from the codebase review.
- **CI/CD pipeline** — builds happen on the server for now. CI-built images are a future enhancement.
- **Postgres migration** — `better-sqlite3` resolves the lock file issue. Postgres is not needed at this scale.
- **Any user-facing changes** — slash commands, responses, and behavior are unchanged.
- **Monitoring or alerting** — Docker's restart policy handles crashes. Structured logging or health checks are future work.

## Further Notes

- On the old server the database file is named `mentor.db` (a stale name from before the hygiene cleanup). During migration, it must be copied as `bot.db` on the new server to match the updated code.
- The `better-sqlite3` swap and the Docker setup are independent changes that can be committed separately, but they should both land before the server cutover. The swap can be tested locally with `npm test` before Dockerizing.
