# Soul Compiler

Default to using Bun instead of Node.js.
- `bun test` for tests (bun:test, not vitest)
- `bun run <file>` for execution
- `Bun.file` over `node:fs`

## Paths
- Code: ~/soul-compiler/
- Data: ~/.openclaw/soul-configs/ (symlinked as ./data, NEVER move)
- Agent Skill install: ~/.openclaw/skills/soul-compiler-v2/
- Claude Skill install: ~/.claude/skills/soul-compiler-v2/
- Compile output: ~/.openclaw/soul-configs/4_compiled/
- Deploy target: ~/neru-workspace/<agent>-workspace/

## Rules
- core/ changes must pass all tests before commit
- data/ is a symlink — never restructure soul-configs directly
- TRUE_SOUL.md is ALWAYS generated output — never hand-edit
- Budget hard limit: 15,000 chars (not 20K — 25% safety margin)
- Section I (Safety/Ops) always LAST (survives OpenClaw truncation)
- input.d/ content is VERBATIM inject — never LLM-process
- Trait dimensions: exactly 10 (warmth, dominance, openness, emotionality, agreeableness, risk_tolerance, humor, directness, analytical, protectiveness)
- Domain icon weights must sum ≤ 1.0, max 3 per section
- Agent identity floor: 10% minimum in every section

## Testing
```ts
import { test, expect } from "bun:test";
```

## Frontend (Premium Web)
Use Bun.serve() + HTML imports. No vite, no express.
