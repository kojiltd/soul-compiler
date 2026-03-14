# /soul-compile <agent>

Compile `agent.yaml` + `input.d/` files + trait cards into `TRUE_SOUL.md`.

## What It Does

The core compilation step. Takes all inputs and produces the final SOUL.md
that defines the agent's complete personality. This is generated output —
never hand-edit the result.

## Inputs

- `agent` — the agent identifier (e.g. "eve", "kira", "neru")
- Reads from:
  - `data/agent.{agent}/{agent}.yaml` — agent DNA config
  - `data/agent.{agent}/input.d/*.md` — verbatim inject files
  - `data/3_trait_cards/*.trait.md` — referenced domain icon trait cards

## Outputs

- `~/.openclaw/soul-configs/4_compiled/{agent}.TRUE_SOUL.md` — compiled output
- Budget report: per-section usage vs allocation

## Compilation Order

Sections are compiled in order A through H, then I last:

```
A (Identity) → B (PJ Layer) → C (Domain Expertise) → D (Traits) →
E (Examples) → F (Boundaries) → G (Language) → H (Relationships) →
I (Safety/Ops)
```

Section I is ALWAYS last — it survives OpenClaw's 70/20 truncation window.

## Steps

1. **Load config:** parse `{agent}.yaml` via `core/schema.ts` → `validateAgentConfig()`
2. **Allocate budget:** call `core/budget.ts` → `allocateBudget()`
3. **Load input.d/:** read all `*.md` files from `agent.{agent}/input.d/`
4. **Load trait cards:** for each `domain_icons[]` entry, load matching trait card
5. **Compile each section:**
   - A: from yaml `name`, `role`, `image`, `backstory`
   - B: from `jane_ratio` + input.d content (verbatim inject)
   - C: from trait cards, weighted by `domain_icons[].weight`
   - D: from `traits` object (all 10 dimensions)
   - E: from input.d dialogue files (verbatim inject)
   - F: from `boundaries` + anti-patterns from trait cards
   - G: from `language` + interview communication style
   - H: from `relationships`
   - I: from input.d safety files (verbatim inject) — ALWAYS LAST
6. **Enforce budget:** check each section against allocation, compress if over
7. **Assemble:** concatenate sections with `## Section Name` headers
8. **Validate:** run `checkBudget()` — must pass before output
9. **Write:** `4_compiled/{agent}.TRUE_SOUL.md`

## Budget Rules

- Hard limit: 15,000 chars total
- Dynamic sections (B, C, H) shrink proportionally if over budget
- Fixed sections keep their allocation
- Section I NEVER shrinks
- Agent identity floor: 10% minimum in every section (no trait card can dominate)

## Black Cop Review Points

- Before compile, check if `agent.yaml` has been validated recently
- After compile, review the budget report:
  - 「Section C 用咗 3,200 字但 budget 得 2,800。你啲 trait card 太肥。Cut 啲。」
  - 「Section E 得 800 字？三個 dialogue example 唔夠。至少要 cover normal + stress + humor。」
- Check for input.d content that was accidentally LLM-processed:
  - 「呢段 input.d 內容被改過。Verbatim 即係原封不動。重做。」
- Verify Section I is actually last in the output
- Verify total is under 15,000 chars

## Functions Used

- `validateAgentConfig()` from `core/schema.ts`
- `allocateBudget()`, `checkBudget()`, `formatBudgetReport()` from `core/budget.ts`
- `core/merge.ts` — section merging logic (if available)

## Example Usage

```
/soul-compile eve
/soul-compile kira
/soul-compile neru
```
