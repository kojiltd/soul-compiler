# /soul-status

Show pipeline status for all agents and references.

## What It Does

Gives a complete overview of the Soul Compiler pipeline — what has been
ingested, distilled, compiled, and deployed. Surfaces stale artifacts
and missing steps.

## Inputs

None.

## Outputs

Console report with:
- Per-agent pipeline status table
- Per-reference source status
- Warnings for stale/missing artifacts

## Steps

1. **Scan sources:** list all directories in `data/1_sources/`
   - For each: report char count of `org.md`, last modified date
2. **Scan references:** list all files in `data/2_references/`
   - For each: validate sections via `validateReference()`, report completeness
3. **Scan trait cards:** list all files in `data/3_trait_cards/`
   - For each: report char count, check against template compliance
4. **Scan agent configs:** list all `data/agent.*/` directories
   - For each agent:
     - Parse `{agent}.yaml` — report validation status
     - Count `input.d/` files
     - Check for compiled output in `4_compiled/`
     - Check for deployed SOUL.md in workspace
5. **Freshness check:**
   - If `org.md` is newer than `reference.md` → "Reference stale, re-distill"
   - If `reference.md` is newer than `trait.md` → "Trait card stale, re-extract"
   - If `yaml` or `input.d/` newer than compiled → "Compiled output stale, re-compile"
   - If compiled newer than deployed → "Deploy pending"
6. **Budget summary:** for each compiled agent, show total chars / 15K

## Output Format

```
Soul Compiler Pipeline Status
==============================

References:
  adam-grant       org: 12,340 chars  ref: 3,200 chars  trait: 1,890 chars
  anne-laure       org: 8,720 chars   ref: 2,900 chars  trait: MISSING
  tangping         org: 2,100 chars   ref: 1,800 chars  trait: 1,650 chars

Agents:
  eve     yaml: OK  input.d: 4 files  compiled: 12,800/15,000  deployed: YES
  kira    yaml: OK  input.d: 3 files  compiled: STALE          deployed: NO
  neru    yaml: OK  input.d: 5 files  compiled: 14,200/15,000  deployed: YES
  hana    yaml: ERR input.d: 2 files  compiled: MISSING        deployed: NO

Warnings:
  - kira: yaml modified after last compile (2026-03-12). Re-compile needed.
  - anne-laure: trait card missing. Run /soul-trait anne-laure.
  - hana: yaml validation failed: missing required field 'role'.
```

## Black Cop Review Points

- If any agent has STALE compiled output: 「{agent} 嘅 compiled output 過期喇。你改咗 yaml 但冇 re-compile。」
- If trait card is missing for a referenced domain icon: 「{agent} 用緊 {name} 做 domain icon 但冇 trait card。你用乜嘢 compile？空氣？」
- If deployed but compiled is stale: 「{agent} 用緊舊嘅 SOUL。最新嘅改動冇 deploy。」

## Functions Used

- `validateAgentConfig()` from `core/schema.ts`
- `validateReference()` from `core/distill.ts`
- `checkBudget()`, `formatBudgetReport()` from `core/budget.ts`
- `Bun.file()` for file existence and stat checks

## Example Usage

```
/soul-status
```
