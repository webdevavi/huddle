#!/usr/bin/env bash
# Sync project skills into the cloud VM user skill dirs.
# Cloud Agents discover skills from ~/.cursor/skills and ~/.agents/skills
# in addition to repo paths (.cursor/skills, .agents/skills).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$HOME/.cursor/skills" "$HOME/.agents/skills"

for src in "$ROOT/.cursor/skills" "$ROOT/.agents/skills"; do
  if [[ -d "$src" ]]; then
    cp -a "$src"/. "$HOME/.cursor/skills/"
    cp -a "$src"/. "$HOME/.agents/skills/"
  fi
done

echo "Synced project skills to ~/.cursor/skills and ~/.agents/skills"
ls -1 "$HOME/.cursor/skills" 2>/dev/null || true
