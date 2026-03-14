# /soul-distill <name>

Distill raw `org.md` into a structured `reference.md` with 6 required sections.

## What It Does

Takes the raw source material from `/soul-ingest` and compresses it into a
structured reference document that can later be converted into a trait card.
Uses LLM for intelligent extraction — this is where noise becomes signal.

## Inputs

- `name` — the reference person's identifier (matches `1_sources/{name}/org.md`)

## Outputs

- `~/.openclaw/soul-configs/2_references/{name}.md` — structured reference
- Validation report: which of the 6 required sections are present

## Required Sections

The output MUST contain all 6 sections (## headings):

1. **Identity** — who they are, background, credentials
2. **Core Frameworks** — their 3-5 key mental models/methodologies
3. **Behavioral Patterns** — how they act, decide, communicate
4. **Signature Phrases** — 5-10 actual quotes with context
5. **Application Scenarios** — 3-5 situations where their approach applies
6. **Anti-Patterns** — what they would NEVER do (critical for character consistency)

## Steps

1. **Read source:** `data/1_sources/{name}/org.md`
2. **Check size:**
   - < 1,500 chars → warn "Source too thin for quality distill"
   - 1,500 - 50,000 chars → standard single-pass distill via `distill()`
   - > 50,000 chars → multi-pass via `heavyDistill()`
3. **Run distillation:** call `core/distill.ts` functions
4. **Validate output:** call `validateReference()` to check all 6 sections
5. **Report:** show section coverage, total chars, any missing sections

## Black Cop Review Points

- After distill, read the output and challenge quality:
  - 「Core Frameworks 得兩個？呢個人唔可能只有兩套思維框架。再搵。」
  - 「Signature Phrases 全部都係 paraphrased。我要原文。」
  - 「Anti-Patterns 太 generic。『不會說謊』唔算——每個人都唔會話自己會說謊。畀啲有 teeth 嘅 anti-patterns。」
- If Identity section is just a job title: 「『Author and professor』唔係 identity。佢點解做呢行？佢嘅 origin story 係乜？」
- If total output < 2,000 chars: 「太薄。你 distill 咗等於冇 distill。重做。」

## Functions Used

- `distill(name, llmCall)` from `core/distill.ts` — standard single-pass
- `heavyDistill(name, llmCall)` from `core/distill.ts` — multi-pass for >50K
- `validateReference(content)` from `core/distill.ts` — section validation

## Example Usage

```
/soul-distill adam-grant
/soul-distill anne-laure-le-cunff
```
