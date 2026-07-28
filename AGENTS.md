## Skill routing

When a request matches an available skill, use that skill's instructions. When in doubt, use the matching skill.

### Installed project skills (from webdevavi/agent-skills)

These are committed under `.agents/skills/` and `.cursor/skills/`, and synced to the Cloud Agent VM via `.cursor/install-skills.sh`:

| Skill | Use when |
|---|---|
| `brainstorm` | Parallel ideation / alternatives |
| `validate-before-build` | Feasibility spikes / MVP experiments |
| `manager-of-the-month` | Multi-workstream orchestration to one PR |

### How to invoke on Cloud Agents

The Cloud Agents `/` slash menu often does **not** list project skills when you create a new chat (Cursor UI limitation). Skills are still loaded for the agent after checkout.

**Start the agent with an explicit invoke in the first message**, for example:

```text
use the brainstorm skill: explore options for <brief>
use the validate-before-build skill: test whether <hypothesis>
use the manager-of-the-month skill: <engineering brief>
```

Do not wait for the slash picker. Prose invoke is the reliable path.

### Local IDE slash menu (optional)

Project skills appear in local Agent chat after you pull this repo. To also show them in the `/` picker across all local chats on your machine:

```sh
npx skills add webdevavi/agent-skills -g --agent cursor -y
```

Laptop global skills do **not** sync to Cloud Agent VMs; Cloud relies on the repo + install script above.

### Key routing rules

- Product ideas/brainstorming → use /office-hours or /brainstorm
- Parallel ideation/alternatives → use /brainstorm
- Feasibility spikes/MVP experiments → use /validate-before-build
- Multi-workstream orchestration to one PR → use /manager-of-the-month
- Strategy/scope → use /plan-ceo-review
- Architecture → use /plan-eng-review
- Design system/plan review → use /design-consultation or /plan-design-review
- Full review pipeline → use /autoplan
- Bugs/errors → use /investigate
- QA/testing site behavior → use /qa or /qa-only
- Code review/diff check → use /review
- Visual polish → use /design-review
- Ship/deploy/PR → use /ship or /land-and-deploy
- Save progress → use /context-save
- Resume context → use /context-restore
- Author a backlog-ready spec/issue → use /spec
