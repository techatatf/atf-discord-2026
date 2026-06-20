# Published Bot Command Docs

`docs/bot-commands.html` is published as a public justhtml.sh document.

- Public URL: https://justhtml.sh/d/dazzling-moss-72301
- justhtml.sh slug: `dazzling-moss-72301`
- Title: `ATF Discord Bot Commands`

After changing `docs/bot-commands.html`, update the existing justhtml.sh doc with
`PATCH /api/v1/docs/dazzling-moss-72301`. Do not create a replacement doc unless
the user explicitly asks for a new URL.

## Credential

Use the justhtml.sh API key from `~/.justhtml/credentials`:

```json
{
  "api_key": "jh_live_...",
  "created_at": "2026-06-20T00:00:00Z",
  "source": "auth.md"
}
```

Keep the file mode at `0600`. Never print, commit, or paste the API key. If the
credential is missing or invalid, follow https://justhtml.sh/auth.md and register
with `itsjoel31@gmail.com` unless the user gives a different email.

## Update Flow

From the repo root:

```bash
api_key=$(jq -r .api_key "$HOME/.justhtml/credentials")

jq -Rs --arg title "ATF Discord Bot Commands" \
  '{html:., title:$title, public:true}' \
  docs/bot-commands.html > /tmp/justhtml-bot-commands-payload.json

curl -sS -X PATCH \
  https://justhtml.sh/api/v1/docs/dazzling-moss-72301 \
  -H "Authorization: Bearer $api_key" \
  -H "Content-Type: application/json" \
  -d @/tmp/justhtml-bot-commands-payload.json
```

Then verify the public URL:

```bash
curl -sS -o /tmp/justhtml-bot-commands-view.html \
  -w '%{http_code}\n' \
  https://justhtml.sh/d/dazzling-moss-72301
```

Expected status: `200`.
