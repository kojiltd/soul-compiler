# Soul Compiler v1.0 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Soul Compiler engine (core) + Easy (Agent Skill) + Advanced (Claude Code Skill) that transforms structured YAML configs + reference materials into compiled TRUE_SOUL.md agent personalities.

**Architecture:** TypeScript monorepo with shared `core/` engine. Easy version is an OpenClaw Agent Skill (interview → auto-compile). Advanced version is a Claude Code Skill (step-by-step with Claude as co-pilot). Core compile formula is closed-source (future API). Skills + schema + deploy are MIT open source.

**Tech Stack:** TypeScript, Bun, Vitest, YAML (js-yaml), markdown processing

---

## File Structure

```
~/soul-compiler/
├── CLAUDE.md                          ← Repo rules for Claude Code
├── package.json                       ← TypeScript project (Bun)
├── tsconfig.json
├── vitest.config.ts
├── LICENSE                            ← MIT (skills/schema/deploy)
├── README.md
│
├── core/                              ← Shared engine (closed-source future)
│   ├── schema.ts                      ← YAML validation + trait dimensions + types
│   ├── collect.ts                     ← Web search → 1_sources/org.md
│   ├── distill.ts                     ← org.md → 2_references/name.md
│   ├── trait-extract.ts               ← reference → 3_trait_cards/name.trait.md
│   ├── merge.ts                       ← Multi-profile weighted blend
│   ├── budget.ts                      ← 15K char budget check + allocation
│   ├── compile.ts                     ← YAML + traits + input.d → TRUE_SOUL.md
│   ├── deploy.ts                      ← Copy + restart gateway + session reset
│   ├── interview.ts                   ← Black cop Q&A → auto-generate YAML
│   └── evaluate.ts                    ← Score compiled SOUL quality
│
├── core/__tests__/                    ← Unit tests
│   ├── schema.test.ts
│   ├── budget.test.ts
│   ├── merge.test.ts
│   ├── trait-extract.test.ts
│   ├── compile.test.ts
│   ├── evaluate.test.ts
│   └── interview.test.ts
│
├── skills/
│   ├── easy/                          ← OpenClaw Agent Skill
│   │   └── SKILL.md                   ← Interview prompt + auto-compile
│   └── advanced/                      ← Claude Code Skill
│       ├── SKILL.md                   ← Master skill definition
│       ├── soul-ingest.md             ← /soul-ingest command
│       ├── soul-distill.md            ← /soul-distill command
│       ├── soul-trait.md              ← /soul-trait command
│       ├── soul-compile.md            ← /soul-compile command
│       ├── soul-deploy.md             ← /soul-deploy command
│       ├── soul-status.md             ← /soul-status command
│       └── soul-evaluate.md           ← /soul-evaluate command
│
├── templates/
│   ├── _template.yaml                 ← New agent scaffold
│   ├── trait-card.template.md         ← Trait Card format
│   ├── soul-sections.md              ← Section A-I definitions + budget
│   └── interview-questions.md         ← Black cop Q&A bank
│
├── data -> ~/.openclaw/soul-configs   ← Symlink (NOT committed)
│
└── web/                               ← Premium (Phase 2, empty for now)
    └── .gitkeep
```

---

## Chunk 1: Project Setup + Schema + Budget

### Task 1: Project Scaffolding

**Files:**
- Create: `~/soul-compiler/package.json`
- Create: `~/soul-compiler/tsconfig.json`
- Create: `~/soul-compiler/vitest.config.ts`
- Create: `~/soul-compiler/CLAUDE.md`
- Create: `~/soul-compiler/LICENSE`
- Create: `~/soul-compiler/.gitignore`

- [ ] **Step 1: Init project**

```bash
cd ~/soul-compiler
bun init -y
```

- [ ] **Step 2: Install deps**

```bash
bun add js-yaml zod
bun add -d typescript vitest @types/js-yaml @types/node
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": ".",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true
  },
  "include": ["core/**/*.ts", "skills/**/*.ts"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 4: Write vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["core/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: Write CLAUDE.md**

```markdown
# Soul Compiler

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
- Section I (Safety) always LAST (survives OpenClaw truncation)
- input.d/ content is VERBATIM inject — never LLM-process
- Trait dimensions: exactly 10 (warmth, dominance, openness, emotionality, agreeableness, risk_tolerance, humor, directness, analytical, protectiveness)
- Domain icon weights must sum ≤ 1.0, max 3 per section
- Agent identity floor: 10% minimum in every section
```

- [ ] **Step 6: Write .gitignore**

```
node_modules/
dist/
data
*.db
.env
```

- [ ] **Step 7: Write LICENSE (MIT)**

- [ ] **Step 8: Create symlink**

```bash
ln -sf ~/.openclaw/soul-configs ~/soul-compiler/data
```

- [ ] **Step 9: Init git + commit**

```bash
cd ~/soul-compiler && git init && git add -A && git commit -m "chore: project scaffolding"
```

---

### Task 2: Schema + Types (core/schema.ts)

**Files:**
- Create: `core/schema.ts`
- Test: `core/__tests__/schema.test.ts`

- [ ] **Step 1: Write failing tests for schema validation**

Test cases:
- Valid yaml parses without error
- Missing required fields (agent, name, role) → error
- Invalid trait name → error
- Trait value outside 0.0-1.0 → error
- Domain icon weights > 1.0 → error
- jane_ratio outside 0.0-1.0 → error
- Valid template yaml parses

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/soul-compiler && bun test
```

- [ ] **Step 3: Implement schema.ts**

Define with Zod:
- `TraitDimensions` — exactly 10 traits, each 0.0-1.0
- `DomainIcon` — name, reference, aspect, weight
- `AgentConfig` — agent, name, language, role, image, base_personality, backstory?, domain_icons[], jane_ratio, traits, seduction_style?, boundaries?, outfits?, relationships?
- `validateAgentConfig(yamlString)` → parsed config or error
- `loadAgentConfig(agentName)` → reads from `data/agent.{name}/{name}.yaml`

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add core/schema.ts core/__tests__/schema.test.ts
git commit -m "feat: agent yaml schema validation with Zod"
```

---

### Task 3: Budget Engine (core/budget.ts)

**Files:**
- Create: `core/budget.ts`
- Test: `core/__tests__/budget.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- Total budget = 15000 chars
- Section A (Identity) allocation ~2000 chars
- Section B (PJ Layer) scales with jane_ratio
- Section C (Domain Expertise) scales with icon count
- Section D (Traits) fixed ~1500 chars
- Section E (Examples) fixed ~2500 chars
- Section F (Boundaries) fixed ~1000 chars
- Section G (Language) fixed ~1000 chars
- Section H (Relationships) scales with relationship count
- Section I (Safety/Ops) fixed ~1500 chars — ALWAYS LAST
- Over budget → error with breakdown
- `formatBudgetReport()` → readable text output

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement budget.ts**

```typescript
const TOTAL_BUDGET = 15_000;
const SECTION_BUDGETS = { A: 2000, B: 'dynamic', C: 'dynamic', D: 1500, E: 2500, F: 1000, G: 1000, H: 'dynamic', I: 1500 };
```

Functions:
- `allocateBudget(config: AgentConfig)` → `Record<Section, number>`
- `checkBudget(compiled: string, allocation)` → `{ ok, total, remaining, perSection }`
- `formatBudgetReport(check)` → `string` (e.g. "12,400 / 15,000 (83%) ✅")

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add core/budget.ts core/__tests__/budget.test.ts
git commit -m "feat: budget engine with 15K limit and per-section allocation"
```

---

## Chunk 2: Collect + Distill + Trait Extract

### Task 4: Collect (core/collect.ts)

**Files:**
- Create: `core/collect.ts`
- Test: `core/__tests__/collect.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- `collectFromUrl(url)` → markdown content
- `collectFromText(pastedText)` → structured org.md
- `collectFromSearch(name)` → web search results → org.md
- Output path: `data/1_sources/{name}/org.md`
- Dedup: skip if org.md already exists and is >5K chars
- Size thresholds: <1.5K = thin, 1.5-5K = optional compress, 5-50K = must distill, >50K = multi-pass

- [ ] **Step 2: Implement collect.ts**

Functions:
- `collectFromSearch(name: string)` → uses shell `lightpanda fetch` or web search
- `collectFromUrl(url: string)` → fetch + convert to markdown
- `collectFromText(text: string, name: string)` → save as org.md
- `getCollectStatus(name: string)` → `{ exists, charCount, threshold }`

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: collect pipeline — search/url/text → 1_sources/org.md"
```

---

### Task 5: Distill (core/distill.ts)

**Files:**
- Create: `core/distill.ts`
- Test: `core/__tests__/distill.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- Input org.md → output 2_references/name.md
- Output has 6 required sections: Identity, Core Frameworks, Behavioral Patterns, Signature Phrases, Application Scenarios, Anti-Patterns
- Coverage check ≥95% (key concepts from org appear in reference)
- Multi-pass for >50K sources (Buffett 152K, Munger 148K)
- Idempotent: re-distill produces similar output

- [ ] **Step 2: Implement distill.ts**

Functions:
- `distill(name: string, llmCall: LLMCallFn)` → reads org.md, produces reference.md
- `heavyDistill(name: string, llmCall: LLMCallFn)` → multi-pass for >50K
- `validateReference(refPath: string)` → checks 6 sections present
- LLMCallFn type: `(prompt: string) => Promise<string>` — abstracted so any provider works

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: distill pipeline — org.md → 2_references with 6-section structure"
```

---

### Task 6: Trait Extract (core/trait-extract.ts)

**Files:**
- Create: `core/trait-extract.ts`
- Create: `templates/trait-card.template.md`
- Test: `core/__tests__/trait-extract.test.ts`

- [ ] **Step 1: Write trait card template**

```markdown
# {Name} — Trait Card
# Distilled from: 2_references/{name}.md

## Decision Style     (max 300 chars)
{HOW they make decisions}

## Communication      (max 250 chars)
{HOW they talk}

## Risk Model         (max 250 chars)
{How they handle uncertainty}

## Emotional Pattern  (max 200 chars)
{Emotional tendencies}

## Signature Moves    (max 400 chars)
- {Distinctive behavior 1–5}

## Anti-Patterns      (max 200 chars)
- NEVER: {absolute no}

## Quotable Lines     (max 300 chars)
> "{Distilled quote capturing essence}"
```

- [ ] **Step 2: Write failing tests**

Test cases:
- Input reference.md → output trait card ≤2000 chars
- All 7 sections present and non-empty
- Each section within char limit
- Signature Moves are SPECIFIC (not "makes good decisions")
- Anti-Patterns are ACTIONABLE
- Can distinguish this person from anyone else

- [ ] **Step 3: Implement trait-extract.ts**

Functions:
- `extractTraitCard(name: string, llmCall: LLMCallFn)` → reads reference, produces trait card
- `validateTraitCard(cardPath: string)` → checks format, limits, specificity
- `scoreTraitCard(card: string)` → 0-100 quality score (specificity, uniqueness, completeness)

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: trait card extraction — reference → 2K structured summary"
```

---

## Chunk 3: Merge + Compile + Evaluate

### Task 7: Multi-Profile Merge (core/merge.ts)

**Files:**
- Create: `core/merge.ts`
- Test: `core/__tests__/merge.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- Single icon weight 1.0 → 100% of section budget
- Two icons 0.6/0.4 → proportional char allocation
- Three icons max per section
- Weights > 1.0 → error
- Agent identity floor 10% → always at least 10% own voice
- Conflict priority: YAML > higher weight > lower weight
- No phantom references: every icon must have a trait card file

- [ ] **Step 2: Implement merge.ts**

Three merge modes from Design Doc:
- `singleProfile(icon, budget)` → full budget to one reference
- `weightedBlend(icons[], budget)` → proportional allocation
- `aspectPick(icons[], section, budget)` → different aspects per section

Functions:
- `mergeIcons(config: AgentConfig, section: Section, budget: number, llmCall: LLMCallFn)` → merged text for section
- `resolveConflicts(sources: MergeSource[])` → priority-ordered resolution

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: multi-profile merge with weighted blend and conflict resolution"
```

---

### Task 8: Compile Engine (core/compile.ts)

**Files:**
- Create: `core/compile.ts`
- Create: `templates/soul-sections.md`
- Test: `core/__tests__/compile.test.ts`

- [ ] **Step 1: Write section definitions template**

Sections A-I with purpose and budget:
- A: 身份 (Identity) — name, age, role, image, backstory
- B: PJ 觀察層 (Patrick Jane Layer) — scales with jane_ratio
- C: 領域框架 (Domain Expertise) — merged icons
- D: 性格維度 (Traits) — 10 dimensions mapped to behaviors
- E: 示範對話 (Dialogue Examples) — min 8 examples
- F: 行為邊界 (Boundaries) — when to guide vs direct
- G: 語言風格 (Language Style) — dialect, tone, particles
- H: 關係 (Relationships) — with other agents + Cody
- I: 安全/運行指令 (Safety/Ops) — ALWAYS LAST

- [ ] **Step 2: Write failing tests**

Test cases:
- Compile Eve yaml → TRUE_SOUL.md with all 9 sections
- Section I is always the last section
- input.d/ files injected verbatim at tagged sections
- Budget ≤ 15K chars
- Missing trait card → error (no phantom references)
- Output has proper markdown structure with ## headers

- [ ] **Step 3: Implement compile.ts**

```typescript
async function compile(agentName: string, llmCall: LLMCallFn): Promise<CompileResult> {
  // 1. Load + validate YAML
  // 2. Allocate budget per section
  // 3. For each section A-H:
  //    a. Merge domain icons (weighted blend)
  //    b. Apply PJ layer (scaled by jane_ratio)
  //    c. Inject input.d/ content (verbatim, by [Section X] tag)
  //    d. LLM compile section within budget
  // 4. Append Section I (safety) LAST
  // 5. Budget check total
  // 6. Return compiled markdown + budget report
}
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: compile engine — YAML + traits + input.d → TRUE_SOUL.md"
```

---

### Task 9: Evaluate (core/evaluate.ts)

**Files:**
- Create: `core/evaluate.ts`
- Test: `core/__tests__/evaluate.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- Score 0-100 across 5 dimensions:
  - `completeness` — all 9 sections present, min length each
  - `budget_health` — under 15K, balanced allocation
  - `authenticity` — trait card content reflected, not generic
  - `coherence` — no contradictions between sections
  - `distinctiveness` — could distinguish this agent from others
- Overall score = weighted average
- Recommendations: list of specific improvements

- [ ] **Step 2: Implement evaluate.ts**

Functions:
- `evaluateSoul(soulPath: string, config: AgentConfig)` → `EvalResult`
- `EvalResult`: `{ scores: Record<Dimension, number>, overall: number, recommendations: string[] }`

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: evaluate engine — score compiled SOUL across 5 dimensions"
```

---

## Chunk 4: Deploy + Interview (Black Cop)

### Task 10: Deploy (core/deploy.ts)

**Files:**
- Create: `core/deploy.ts`
- Test: `core/__tests__/deploy.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:
- Copy TRUE_SOUL.md → workspace/SOUL.md + AGENTS.md
- Create symlink CLAUDE.md → AGENTS.md
- Verify char count matches
- Gateway restart (mock in tests)
- Session reset (delete session entries)
- Rollback on failure

- [ ] **Step 2: Implement deploy.ts**

```typescript
async function deploy(agentName: string, options?: { dryRun?: boolean }): Promise<DeployResult> {
  // 1. Resolve paths
  const compiled = `data/4_compiled/${agentName}-TRUE_SOUL.md`;
  const workspace = `~/neru-workspace/${agentName}-workspace/`;
  // 2. Backup current SOUL.md
  // 3. Copy to SOUL.md + AGENTS.md
  // 4. Ensure CLAUDE.md symlink
  // 5. Restart gateway (pkill + nohup)
  // 6. Clear session for agent
  // 7. Verify gateway listening on 18789
  // 8. Return deploy result with char count + status
}
```

- [ ] **Step 3: Run tests, verify pass**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: deploy — copy + restart + session reset + verify"
```

---

### Task 11: Interview Engine — Black Cop (core/interview.ts)

**Files:**
- Create: `core/interview.ts`
- Create: `templates/interview-questions.md`
- Test: `core/__tests__/interview.test.ts`

- [ ] **Step 1: Write interview question bank**

Four phases from Design Doc v2:

**Phase 1: Identity Discovery (3-5 questions)**
- "Agent 叫咩名？" → name
- "佢做咩嘅？用一句話講。" → role
- "幾歲？咩背景？" → backstory
- "佢說話像邊個？" → suggests domain_icons

Black cop style:
- "「溫柔善良」唔係性格。佢面對背叛時點反應？"
- "呢個 role 太通用。邊樣嘢係佢做得到但其他 agent 做唔到？"

**Phase 2: Personality Calibration (5-8 scenarios)**
Scenario pairs → maps to trait dimensions:
- 被讚 → warmth / confidence
- 深夜 2am 收到訊息 → boundaries / life-rhythm
- User 心情低落 → empathy / jane_ratio
- 團隊衝突 → dominance / agreeableness
- 被人質疑能力 → risk_tolerance / directness

Black cop style:
- "你揀咗 A 但 trait 矛盾。一個 warmth 0.9 嘅 agent 唔會咁反應。再諗。"
- "太 safe。揀一個會令你唔舒服嘅答案。完美 agent = 悶 agent。"

**Phase 3: Reference Matching**
- Based on Phase 1-2, suggest from existing library
- "你描述嘅分析風格好似 Buffett。加？"
- No match: "冇現成參考。用你嘅描述先生成，之後加 reference 可以提升質素。"

**Phase 4: Auto-Build + Review**
- Generate yaml + input.d skeleton
- Show budget preview
- Confirm → compile → deploy (optional)

- [ ] **Step 2: Write failing tests**

Test cases:
- `generateNextQuestion(answers[])` → returns appropriate next question
- Phase transitions at correct points
- Answers map to correct yaml fields
- Black cop rejects vague answers (returns challenge question)
- Complete interview → valid AgentConfig yaml
- `interviewToYaml(answers[])` → valid yaml string

- [ ] **Step 3: Implement interview.ts**

```typescript
type InterviewPhase = 'identity' | 'calibration' | 'reference' | 'build';
type InterviewState = {
  phase: InterviewPhase;
  answers: Answer[];
  partialConfig: Partial<AgentConfig>;
  questionIndex: number;
};

function generateNextQuestion(state: InterviewState, llmCall: LLMCallFn): Promise<Question>;
function processAnswer(state: InterviewState, answer: string, llmCall: LLMCallFn): Promise<InterviewState>;
function isVagueAnswer(answer: string): boolean;  // Black cop detector
function challengeVague(answer: string, field: string): string;  // "太通用。再具體啲。"
function interviewToYaml(state: InterviewState): string;
```

- [ ] **Step 4: Run tests, verify pass**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: black cop interview engine — 4-phase Q&A → auto-generate YAML"
```

---

## Chunk 5: Skills (Easy + Advanced)

### Task 12: Easy Version — Agent Skill

**Files:**
- Create: `skills/easy/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

OpenClaw Agent Skill that:
1. Starts interview (black cop mode)
2. Asks Phase 1-4 questions
3. Auto-generates yaml + compiles + optionally deploys
4. Output: "你嘅 agent 已經準備好。" + budget report

Key rules in SKILL.md:
- Black cop tone: reject vague answers, push for specificity
- Never accept "溫柔善良" as personality (challenge it)
- Show budget after Phase 4: "12,400 / 15,000 (83%)"
- Ask before deploy: "要即刻部署嗎？"
- If user says agent 太 generic → suggest adding domain icons

- [ ] **Step 2: Install to OpenClaw skills**

```bash
mkdir -p ~/.openclaw/skills/soul-compiler-v2/
cp skills/easy/SKILL.md ~/.openclaw/skills/soul-compiler-v2/SKILL.md
```

- [ ] **Step 3: Test with gateway**

```bash
openclaw agent --agent neru --message "幫我建一個新 agent" --timeout 120
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: Easy version — Agent Skill with black cop interview"
```

---

### Task 13: Advanced Version — Claude Code Skill

**Files:**
- Create: `skills/advanced/SKILL.md`
- Create: `skills/advanced/soul-ingest.md`
- Create: `skills/advanced/soul-distill.md`
- Create: `skills/advanced/soul-trait.md`
- Create: `skills/advanced/soul-compile.md`
- Create: `skills/advanced/soul-deploy.md`
- Create: `skills/advanced/soul-status.md`
- Create: `skills/advanced/soul-evaluate.md`

- [ ] **Step 1: Write master SKILL.md**

```markdown
---
name: soul-compiler-v2
description: |
  AI Agent Character Creation System. Commands:
  /soul-ingest <name|url> — Collect raw material
  /soul-distill <name> — Distill to reference
  /soul-trait <name> — Extract trait card
  /soul-compile <agent> — Compile TRUE_SOUL.md
  /soul-deploy <agent> — Deploy to workspace
  /soul-status — Pipeline status + stale detection
  /soul-evaluate <agent> — Score compiled SOUL
user-invocable: true
---
```

- [ ] **Step 2: Write each command skill file**

Each file defines:
- What it does
- What it reads / writes
- Step-by-step with Claude as co-pilot
- Black cop review at key points (e.g. after trait card: "Signature Moves 太通用。'makes good decisions' 邊個唔係？改做具體行為。")

- [ ] **Step 3: Install to Claude Code skills**

```bash
mkdir -p ~/.claude/skills/soul-compiler-v2/
cp skills/advanced/*.md ~/.claude/skills/soul-compiler-v2/
```

- [ ] **Step 4: Test each command**

```
/soul-status
/soul-ingest miyazaki
/soul-distill miyazaki
/soul-trait miyazaki
/soul-compile eve
/soul-evaluate eve
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: Advanced version — Claude Code Skill with 7 commands"
```

---

## Chunk 6: Templates + Integration Test

### Task 14: Templates

**Files:**
- Create: `templates/_template.yaml`
- Create: `templates/soul-sections.md`

- [ ] **Step 1: Copy existing template yaml from soul-configs**

Use `~/.openclaw/soul-configs/_system/_template.yaml` as base, verify all fields documented.

- [ ] **Step 2: Write soul-sections.md**

Document all 9 sections (A-I) with:
- Purpose
- Default budget allocation
- Required vs optional content
- Compile rules (e.g. Section I always last)

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: templates — yaml scaffold + section definitions"
```

---

### Task 15: Integration Test — Compile Eve

**Files:**
- Create: `core/__tests__/integration.test.ts`

- [ ] **Step 1: Write integration test**

End-to-end: load Eve yaml → merge icons → compile → budget check → evaluate

```typescript
test('compile Eve end-to-end', async () => {
  const config = await loadAgentConfig('eve');
  const result = await compile('eve', mockLlmCall);
  expect(result.budgetCheck.ok).toBe(true);
  expect(result.sections).toHaveLength(9);
  expect(result.sections[8].id).toBe('I'); // Safety always last
  const evaluation = await evaluateSoul(result.outputPath, config);
  expect(evaluation.overall).toBeGreaterThan(60);
});
```

- [ ] **Step 2: Run full test suite**

```bash
cd ~/soul-compiler && bun test
```

- [ ] **Step 3: Commit**

```bash
git commit -m "test: integration test — compile Eve end-to-end"
```

---

### Task 16: README + GitHub Push

**Files:**
- Create: `~/soul-compiler/README.md`

- [ ] **Step 1: Write README**

Sections:
- What is Soul Compiler (one paragraph)
- Quick Start (Easy / Advanced / Premium)
- Architecture diagram (text-based)
- YAML schema reference
- Trait Card format
- Section A-I overview
- License (MIT for skills/schema, core API closed-source)

- [ ] **Step 2: Create GitHub repo + push**

```bash
cd ~/soul-compiler
gh repo create kojiltd/soul-compiler --public --source=. --push
```

- [ ] **Step 3: Verify**

Open `https://github.com/kojiltd/soul-compiler`

---

## Execution Summary

| Chunk | Tasks | Est. |
|---|---|---|
| 1: Setup + Schema + Budget | Task 1-3 | Foundation |
| 2: Collect + Distill + Trait | Task 4-6 | Pipeline layers 1-3 |
| 3: Merge + Compile + Evaluate | Task 7-9 | Core engine |
| 4: Deploy + Interview | Task 10-11 | Deploy + Black cop |
| 5: Skills (Easy + Advanced) | Task 12-13 | User-facing skills |
| 6: Templates + Integration | Task 14-16 | Polish + ship |

**Total: 16 tasks, 6 chunks.**

After completion:
- `~/soul-compiler/` repo with working core engine
- Easy skill installed at `~/.openclaw/skills/soul-compiler-v2/`
- Advanced skill installed at `~/.claude/skills/soul-compiler-v2/`
- Test: re-compile Eve through both Easy and Advanced paths
- GitHub: `kojiltd/soul-compiler` public repo
