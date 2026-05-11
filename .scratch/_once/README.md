# once-scripts

Scripts for running coding agents against this repo.

## once.sh

Run a single agent session against the current repo state.

```bash
.scratch/_once/once.sh <agent> <model-alias> <feature-slug>
```

### Agents

| Agent    | Description                        |
|----------|------------------------------------|
| `pi`     | Pi coding agent                    |
| `claude` | Claude Code CLI                    |

### Model aliases

| Alias  | pi                                          | claude          |
|--------|---------------------------------------------|-----------------|
| `opus` | `anthropic/claude-opus-4.6`                 | `claude-opus-4-6` |
| `kimi` | `openrouter/kimi-k2.6` + `--thinking high` | ❌ not supported |

### Examples

```bash
.scratch/_once/once.sh pi opus dead-code-strip      # Pi with Opus
.scratch/_once/once.sh pi kimi dead-code-strip       # Pi with Kimi (thinking enabled)
.scratch/_once/once.sh claude opus dead-code-strip   # Claude Code with Opus
```

If you omit the feature-slug, the script lists available features and exits.

### Adding a new model

Add a `case` block under each agent in `once.sh`:

```bash
# Under the pi) case:
newmodel)
    model="provider/model-name"
    extra_flags=""  # or "--thinking high" etc.
    ;;

# Under the claude) case (or add an error if unsupported):
newmodel)
    model="model-name-for-claude"
    extra_flags=""
    ;;
```

Then update the usage message at the top of the script.
