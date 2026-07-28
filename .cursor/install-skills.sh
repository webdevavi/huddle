#!/usr/bin/env bash
# Install agent-skills into Cloud Agent user skill dirs on every boot.
# Cloud Agents discover skills from:
#   - repo: .agents/skills, .cursor/skills (committed on the starting branch)
#   - VM:   ~/.agents/skills, ~/.cursor/skills (populated by this script)
# Laptop ~/.cursor/skills is NOT synced to Cloud Agents.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${AGENT_SKILLS_SOURCE:-webdevavi/agent-skills}"

mkdir -p "$HOME/.cursor/skills" "$HOME/.agents/skills"

installed=0
if npx --yes skills add "$SOURCE" --skill '*' -g --agent cursor -y --copy; then
  echo "Installed $SOURCE into ~/.agents/skills"
  installed=1
else
  echo "Warning: npx skills add failed; falling back to project skill copy" >&2
fi

if [[ "$installed" -ne 1 ]]; then
  for src in "$ROOT/.agents/skills" "$ROOT/.cursor/skills"; do
    if [[ -d "$src" ]]; then
      cp -a "$src"/. "$HOME/.agents/skills/"
    fi
  done
fi

# Mirror into ~/.cursor/skills (Cloud Agents read both roots).
# Do not write back into the repo — that would dirty the working tree.
cp -a "$HOME/.agents/skills"/. "$HOME/.cursor/skills/"

echo "Synced skills to ~/.cursor/skills and ~/.agents/skills:"
ls -1 "$HOME/.cursor/skills" 2>/dev/null || true
