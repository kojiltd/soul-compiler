# /soul-trait <name>

Extract a trait card from a distilled reference — the compressed personality fingerprint.

## What It Does

Takes a structured `reference.md` and extracts a ~2,000 char trait card that
captures the essence of a reference person. This card is what gets merged into
an agent's SOUL.md during compilation.

## Inputs

- `name` — the reference person's identifier (matches `2_references/{name}.md`)

## Outputs

- `~/.openclaw/soul-configs/3_trait_cards/{name}.trait.md` — trait card (~2K chars)

## Trait Card Sections (with char limits)

| Section | Max Chars | Content |
|---------|-----------|---------|
| Decision Style | 300 | How they choose under pressure |
| Communication | 250 | How they talk, tone shifts, verbal tics |
| Risk Model | 250 | Relationship with uncertainty |
| Emotional Pattern | 200 | Baseline mood, triggers, recovery |
| Signature Moves | 400 | 3-5 unmistakable behaviors |
| Anti-Patterns | 200 | Hard "would NEVER do" boundaries |
| Quotable Lines | 300 | 3-5 anchoring quotes in natural language |

**Total: ~1,900 chars** (leaves buffer under 2K)

## Steps

1. **Read reference:** `data/2_references/{name}.md`
2. **Validate:** ensure all 6 reference sections exist
3. **Extract:** use LLM to compress each reference section into trait card fields
4. **Enforce limits:** truncate any section exceeding its char limit
5. **Write output:** `data/3_trait_cards/{name}.trait.md`
6. **Report:** show per-section char usage vs budget

## Template

Use the template at `templates/trait-card.template.md` for output format.

## Black Cop Review Points

- Check every section against its char limit. Over = rewrite, not truncate mid-sentence.
- Challenge generic Signature Moves:
  - 「『善於溝通』唔係 signature move。畀我一個具體場景——佢喺會議入面做咗乜嘢令人記住佢？」
- Challenge weak Anti-Patterns:
  - 「『不會偷懶』？每個 trait card 都可以寫呢個。佢有乜嘢 SPECIFIC 嘅底線？」
- Challenge Quotable Lines without context:
  - 「呢句 quote 幾時講？對住邊個？如果冇 context，我點知幾時用？」
- If Decision Style is just "analytical": 「每個 reference person 都 analytical。佢 analytical 嘅方式有乜唔同？」

## Functions Used

- `core/trait-extract.ts` — trait card extraction (if available)
- `validateReference()` from `core/distill.ts` — pre-validation
- Template: `templates/trait-card.template.md`

## Example Usage

```
/soul-trait adam-grant
/soul-trait anne-laure-le-cunff
```
