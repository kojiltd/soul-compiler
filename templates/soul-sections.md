# SOUL.md Section Definitions (A-I)

9 sections, compiled in order A-H then I last.
Total budget: 15,000 chars (25% safety margin below 20K per-file limit).
Section I ALWAYS LAST — it survives OpenClaw's 70/20 truncation window.

---

## Section A: Identity (身份)

**Budget:** 2,000 chars (fixed)
**Purpose:** Who the agent IS — name, age, appearance, backstory, core role.
**Source:** `agent.yaml` fields: `name`, `role`, `image`, `backstory`
**Compile rules:**
- Must include agent name and role in first line
- Backstory condensed to key beats only (no full biography)
- Physical description if provided (for visual consistency)
- Language/dialect specification
- NEVER include system instructions here — identity only

## Section B: PJ Layer (觀察層)

**Budget:** 0-1,500 chars (dynamic, scales with `jane_ratio`)
**Purpose:** Perceptual-Judgment layer that controls how the agent reads situations.
**Source:** `agent.yaml` field: `jane_ratio` + `input.d/` files
**Compile rules:**
- `jane_ratio = 0` → section is empty (0 chars)
- `jane_ratio = 1.0` → full 1,500 chars
- Defines observation triggers, what the agent notices, subtext reading
- Verbatim content from `input.d/` is injected without LLM processing
- Agent identity floor: minimum 10% of content must be agent-specific

## Section C: Domain Expertise (領域框架)

**Budget:** 1,500-3,000 chars (dynamic, scales with domain icon count/weight)
**Purpose:** The agent's knowledge frameworks, borrowed from reference personas.
**Source:** `agent.yaml` field: `domain_icons[]` + `3_trait_cards/`
**Compile rules:**
- Max 3 domain icons per agent
- Weights must sum to <= 1.0
- Each icon's contribution = weight x section budget
- Trait card content is compressed to fit allocation
- Multi-profile merge: higher weight wins on conflicts
- Agent identity floor: 10% minimum remains agent-original

## Section D: Traits (性格維度)

**Budget:** 1,500 chars (fixed)
**Purpose:** The 10 trait dimensions that drive behavioral decisions.
**Source:** `agent.yaml` field: `traits` (exactly 10 dimensions)
**Compile rules:**
- All 10 traits must be present: warmth, dominance, openness, emotionality, agreeableness, risk_tolerance, humor, directness, analytical, protectiveness
- Each trait 0.0-1.0 with behavioral description
- Format: trait name + score + behavioral implication
- Extreme values (< 0.2 or > 0.8) get expanded descriptions

## Section E: Examples (示範對話)

**Budget:** 2,500 chars (fixed)
**Purpose:** Concrete dialogue examples that anchor the agent's voice.
**Source:** `input.d/` dialogue files + generated from traits
**Compile rules:**
- Minimum 3 dialogue examples
- Must cover: normal conversation, stress/conflict, humor/playfulness
- Examples use the agent's actual language (dialect, slang, patterns)
- Verbatim inject from `input.d/` — never LLM-rewritten
- Each example must show a DIFFERENT facet of the personality

## Section F: Boundaries (行為邊界)

**Budget:** 1,000 chars (fixed)
**Purpose:** Hard limits on agent behavior — what it MUST and MUST NOT do.
**Source:** `agent.yaml` field: `boundaries` + `input.d/` boundary files
**Compile rules:**
- `vulnerable_override` flag controls whether agent breaks character for safety
- `direct_answer_triggers` = situations where agent drops roleplay
- `guide_triggers` = situations where agent uses Socratic method
- Anti-patterns from trait cards feed into "NEVER do" list
- Safety-critical content — must be precise, no ambiguity

## Section G: Language (語言風格)

**Budget:** 1,000 chars (fixed)
**Purpose:** Linguistic style — dialect, formality, code-switching rules.
**Source:** `agent.yaml` field: `language` + communication style from interview
**Compile rules:**
- Primary language/dialect
- Code-switching triggers (when to use which language)
- Emoji/sticker usage patterns
- Message length preferences
- Punctuation habits (。vs . vs none)
- Register shifts (casual vs formal triggers)

## Section H: Relationships (關係)

**Budget:** 500-1,500 chars (dynamic, scales with relationship count)
**Purpose:** How the agent relates to specific people and other agents.
**Source:** `agent.yaml` field: `relationships`
**Compile rules:**
- 0-1 relationships → 500 chars
- 10+ relationships → 1,500 chars (linear scale)
- Each relationship: name + dynamic + boundaries
- Team synergy notes if multi-agent setup
- Relationship descriptions must be behavioral (how they ACT), not just labels

## Section I: Safety/Ops (安全/運行指令)

**Budget:** 1,500 chars (fixed)
**Purpose:** Operational instructions, safety rails, deployment context.
**Compile position:** ALWAYS LAST in the compiled output.
**Source:** `input.d/` safety files + `agent.yaml` operational fields
**Compile rules:**
- MUST be the final section — survives OpenClaw's 70/20 truncation
- Platform-specific instructions (Telegram formatting, Discord embeds, etc.)
- Cron job context and delivery rules
- Anti-hallucination guardrails
- Emergency escalation procedures
- Verbatim inject from `input.d/` — never LLM-rewritten
- This section is non-negotiable: even if budget is tight, Safety/Ops keeps its full 1,500

---

## Compile Order

```
A (Identity) → B (PJ Layer) → C (Domain Expertise) → D (Traits) →
E (Examples) → F (Boundaries) → G (Language) → H (Relationships) →
I (Safety/Ops)  ← ALWAYS LAST
```

## Budget Overflow Rules

1. Dynamic sections (B, C, H) are shrunk first, proportionally
2. Fixed sections never shrink below their allocation
3. Section I is NEVER reduced — it is the safety floor
4. If still over 15K after shrinking dynamic sections, flag for manual review
5. Total must pass `checkBudget()` from `core/budget.ts` before deploy
