#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SCRATCH_DIR="${PROJECT_ROOT}/.scratch"

# Usage: once.sh <agent> <model-alias> <feature-slug>
# Agents: pi, claude
# Model aliases: opus, kimi

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: once.sh <agent> <model-alias> <feature-slug>"
    echo "  Agents: pi, claude"
    echo "  Models: opus, kimi"
    exit 1
fi

if [ -z "$3" ]; then
    echo "Error: missing <feature-slug>"
    echo ""
    echo "Available features:"
    for dir in "${SCRATCH_DIR}"/*/; do
        slug="$(basename "${dir}")"
        [[ "${slug}" == _* ]] && continue
        echo "  ${slug}"
    done
    exit 1
fi

agent="$1"
model_alias="$2"
feature_slug="$3"
issue_dir="${SCRATCH_DIR}/${feature_slug}/issues"

if [ ! -d "${issue_dir}" ]; then
    echo "Error: no issues directory at .scratch/${feature_slug}/issues/"
    exit 1
fi

# --- Resolve model alias to agent-specific flags ---

case "${agent}" in
    pi)
        case "${model_alias}" in
            opus)
                model="anthropic/claude-opus-4.6"
                extra_flags=""
                ;;
            kimi)
                model="openrouter/kimi-k2.6"
                extra_flags="--thinking high"
                ;;
            *)
                echo "Error: unknown model alias '${model_alias}'. Known: opus, kimi"
                exit 1
                ;;
        esac
        ;;
    claude)
        case "${model_alias}" in
            opus)
                model="claude-opus-4-6"
                extra_flags=""
                ;;
            kimi)
                echo "Error: '${model_alias}' is not supported with claude agent."
                exit 1
                ;;
            *)
                echo "Error: unknown model alias '${model_alias}'. Known: opus"
                exit 1
                ;;
        esac
        ;;
    *)
        echo "Error: unknown agent '${agent}'. Known: pi, claude"
        exit 1
        ;;
esac

# --- Build context ---

issues=$(cat "${issue_dir}"/*.md 2>/dev/null || echo "No issues found")
commits=$(git -C "${PROJECT_ROOT}" log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
prompt=$(cat "${SCRIPT_DIR}/prompt.md")

# --- Run ---

PI_CMD="${PI_CMD:-pi}"
CLAUDE_CMD="${CLAUDE_CMD:-claude}"

case "${agent}" in
    pi)
        ${PI_CMD} --model "${model}" ${extra_flags} \
            --skill ~/.agents/skills/tdd/SKILL.md \
            "Previous commits: ${commits} Issues: ${issues} ${prompt}"
        ;;
    claude)
        ${CLAUDE_CMD} --permission-mode acceptEdits \
            --model "${model}" ${extra_flags} \
            "Previous commits: ${commits} Issues: ${issues} ${prompt}"
        ;;
esac
