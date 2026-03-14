---
name: soul-compiler-v2
description: |
  AI Agent Character Creation System. Commands:
  /soul-ingest <name|url>, /soul-distill <name>, /soul-trait <name>,
  /soul-compile <agent>, /soul-deploy <agent>, /soul-status, /soul-evaluate <agent>
user-invocable: true
---

# Soul Compiler v2 — Advanced Mode (Claude Code)

Full pipeline for creating, compiling, and deploying AI agent personalities.
Each command maps to a step in the Soul Compiler pipeline.

## Commands

| Command | Description | Skill File |
|---------|-------------|------------|
| `/soul-ingest <name\|url>` | Collect raw source material into `1_sources/` | `soul-ingest.md` |
| `/soul-distill <name>` | Distill `org.md` into structured `reference.md` | `soul-distill.md` |
| `/soul-trait <name>` | Extract trait card from reference | `soul-trait.md` |
| `/soul-compile <agent>` | Compile `agent.yaml` + `input.d/` into `TRUE_SOUL.md` | `soul-compile.md` |
| `/soul-deploy <agent>` | Deploy compiled SOUL to workspace | `soul-deploy.md` |
| `/soul-status` | Show pipeline status for all agents | `soul-status.md` |
| `/soul-evaluate <agent>` | Evaluate deployed agent quality | `soul-evaluate.md` |

## Pipeline Flow

```
/soul-ingest → 1_sources/{name}/org.md
     ↓
/soul-distill → 2_references/{name}.md
     ↓
/soul-trait → 3_trait_cards/{name}.trait.md
     ↓
/soul-compile → 4_compiled/{agent}.TRUE_SOUL.md
     ↓
/soul-deploy → ~/neru-workspace/{agent}-workspace/SOUL.md + AGENTS.md
     ↓
/soul-evaluate → quality report
```

## Data Paths

All paths relative to `~/.openclaw/soul-configs/` (symlinked as `data/` in repo):

- `1_sources/{name}/org.md` — raw collected material
- `2_references/{name}.md` — distilled reference (6 sections)
- `3_trait_cards/{name}.trait.md` — compressed trait card (~2K chars)
- `agent.{agent}/{agent}.yaml` — agent DNA config
- `agent.{agent}/input.d/*.md` — verbatim inject files
- `4_compiled/{agent}.TRUE_SOUL.md` — compiled output (never hand-edit)

## Black Cop Review Points

At every stage, challenge the user on quality:

- **Ingest:** Is this source actually useful? Or just noise?
- **Distill:** Did it capture the right frameworks, or just surface-level facts?
- **Trait:** Are the trait scores backed by evidence, or vibes?
- **Compile:** Does the budget fit? Are sections balanced?
- **Deploy:** Did you diff before deploying? What changed?
- **Evaluate:** Is the agent actually different from a generic chatbot?

## Rules

- `TRUE_SOUL.md` is ALWAYS generated output — never hand-edit
- Budget hard limit: 15,000 chars
- Section I (Safety/Ops) always LAST
- `input.d/` content is VERBATIM — never LLM-process
- Trait dimensions: exactly 10
- Domain icon weights must sum <= 1.0, max 3 per section
- Agent identity floor: 10% minimum in every section
- Always run `bun test` after `core/` changes
