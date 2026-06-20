# CLAUDE.md

This file is read by Claude Code to understand how to work in this repository.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo — one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Published bot command docs

The generated command reference in `docs/bot-commands.html` is published to justhtml.sh. After updating that file, update the existing published document instead of creating a new one. See `docs/agents/justhtml-bot-commands.md`.
