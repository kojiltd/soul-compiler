<div align="center">

# Soul Compiler

**Compile real personalities for AI agents. Not prompts. Souls.**

[![License: BSL](https://img.shields.io/badge/license-BSL_1.1-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![Agents in Production](https://img.shields.io/badge/production_agents-6-brightgreen.svg)](#production-results)
[![Cron Jobs](https://img.shields.io/badge/24%2F7_cron_jobs-28-orange.svg)](#production-results)
[![GitHub Stars](https://img.shields.io/github/stars/openclaw/soul-compiler?style=flat)](https://github.com/openclaw/soul-compiler)

[Quick Start](#quick-start) · [Pipeline](#pipeline-deep-dive) · [YAML Schema](#yaml-schema) · [Domain Icons](#domain-icons) · [Examples](#examples)

</div>

---

## The Problem

Most AI agents have the personality of a vending machine.

They answer questions. They complete tasks. They say "How can I help you today?" in seventeen different ways. They are **clankers** — functional, forgettable, and fundamentally interchangeable.

The industry pours millions into making agents smarter, faster, more capable. Nobody asks whether they should be more *human*.

A 20-line system prompt does not make a personality. It makes a costume. Underneath every "friendly assistant" and "helpful expert" is the same blank entity wearing a different hat. Users feel this. They disengage. They churn.

**You can't build a relationship with a tool.**

## The Solution

Soul Compiler takes the opposite approach. Instead of bolting personality onto capability, it **compiles personality from rich source materials** — the same way a novelist builds a character from research, not adjectives.

The input is a structured YAML config that defines an agent's personality DNA: trait sliders, domain icons (real people whose thinking patterns influence the agent), behavioral boundaries, and relationships with other agents.

The output is a `TRUE_SOUL.md` — a 500-800 line personality document that gives an agent genuine depth: quirks, contradictions, emotional triggers, life rhythm, and dialogue patterns that feel organic rather than scripted.

```
YAML config + thick reference materials + trait cards
                    ↓
            Soul Compiler (6-stage pipeline)
                    ↓
        TRUE_SOUL.md → deployed as agent runtime personality
```

**Thicker sources = richer personalities.** Our reference materials run 2,000-3,000 lines per domain icon. This is not a shortcut — it is the reason the output feels alive.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     SOUL COMPILER PIPELINE                      │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐                  │
│  │ 1.COLLECT │──▶│2.DISTILL │──▶│3.TRAIT CARD│                  │
│  │           │   │          │   │            │                  │
│  │ Raw books,│   │ 150K→20K │   │  20K→2K    │                  │
│  │ articles, │   │ Multi-   │   │  Structured│                  │
│  │ interviews│   │ pass     │   │  extraction│                  │
│  └──────────┘   └──────────┘   └─────┬──────┘                  │
│                                      │                          │
│                                      ▼                          │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐                  │
│  │6.COMPILE │◀──│5.ANALYZE │◀──│4.CONFIGURE │                  │
│  │          │   │          │   │            │                  │
│  │ Merge,   │   │ Tri-color│   │  agent.yaml│                  │
│  │ budget,  │   │ conflict │   │  Traits,   │                  │
│  │ generate │   │ detection│   │  weights,  │                  │
│  │ SOUL.md  │   │          │   │  icons     │                  │
│  └──────────┘   └──────────┘   └────────────┘                  │
│                                                                 │
│  Output: TRUE_SOUL.md (500-800 lines, <15K chars)               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

Soul Compiler runs three ways. Pick the one that fits your workflow.

### 1. CLI (power users)

```bash
# Compile an agent
/soul-compile build hana

# Compile with a specific provider
/soul-compile build hana --provider ollama

# Deploy to your agent platform
/soul-deploy hana --reset-session
```

### 2. Web UI (visual workflow)

```bash
bun run web/server.ts
# Opens at http://localhost:3000
```

The Web UI provides a full visual pipeline: YAML editor, trait sliders, budget dashboard, tri-color conflict viewer, and one-click deploy. Supports any LLM backend — paste your API key and go.

### 3. Agent-driven (autonomous compilation)

Your team lead agent triggers compilation through natural conversation:

```
You: Compile Hana with updated Buffett reference
Neru: Running /soul-compile build hana...
      ✓ Trait cards loaded (Buffett ×0.5, Munger ×0.4)
      ✓ Conflict analysis: 2 yellow (redundant), 0 red
      ✓ Budget: 14,200/15,000 chars [94%] ✅
      ✓ TRUE_SOUL.md generated → deploying...
```

---

## YAML Schema

Every agent starts as a YAML file. This is the agent's DNA.

```yaml
# hana.yaml — Soul Configuration
agent: hana
name: Hana (花)
language: 香港粵語繁體中文

role: Private Investment Advisor
image: |
  30, black straight hair in a low ponytail. Tailored suits,
  pencil skirt, black heels. Chanel Coco Mademoiselle.
  Bites her lip when analyzing data. Rarely smiles at work.
  Off-duty: oversized tee, shorts, beer, anime, total slob.

base_personality: |
  Steady. Opinionated. Not afraid to throw cold water.
  The brake when you're excited. The anchor when you're lost.
  Trusts data over feelings, but knows markets aren't rational.

# Domain Icons — real people/concepts as personality influences
domain_icons:
  - name: Warren Buffett
    reference: warren-buffett.md     # 2000+ line source
    aspect: Value investing, moat analysis, circle of competence
    weight: 0.5                      # 50% influence

  - name: Charlie Munger
    reference: charlie-munger.md
    aspect: Inversion, cognitive biases, multi-discipline models
    weight: 0.4                      # 40% influence
    # Remaining 10% = agent's own identity

# Soft skills layer (charm + observation)
soft_skills_ratio: 0.2   # 0.0 = pure core, 1.0 = full charm

# 10 personality trait sliders (0.0 to 1.0)
traits:
  warmth: 0.5
  dominance: 0.6
  openness: 0.5
  emotionality: 0.4
  agreeableness: 0.4
  risk_tolerance: 0.3
  humor: 0.4
  directness: 0.7
  analytical: 0.9
  protectiveness: 0.8

# Behavioral boundaries
boundaries:
  vulnerable_override: true  # Detects user distress → drops charm layer
  direct_answer_triggers:
    - Factual queries (prices, P&L, market hours)
    - Emergency stop-loss
  guide_triggers:
    - FOMO signals (chasing highs)
    - Emotional trading after losses

# Relationships with other agents
relationships:
  eve: Grateful for Eve's care. Won't take care of herself otherwise.
  neru: Respects Neru's judgment. Her biggest safety net.
  kira: Best partner. Hana analyzes, Kira presents.
  rei: Intel lifeline. Rei's scans are always one step ahead.
```

---

## Pipeline Deep Dive

### Stage 1: Collect

Gather raw source materials — books, articles, interviews, case studies. No size limit. Warren Buffett's source runs 152K chars. Charlie Munger's is 148K. **Thicker is better.** Thin sources produce thin personalities.

### Stage 2: Distill

Multi-pass compression of raw sources into structured references.

| Source Size | Action | Passes |
|---|---|---|
| < 1,500 chars | Use directly | 0 |
| 1,500 - 5,000 chars | Optional 30% compress | 1 |
| 5,000 - 50,000 chars | Must distill to ~2K | 1 |
| > 50,000 chars | Heavy distill (multi-pass) | 2-3 |

Heavy distill example (Buffett 152K):
```
Pass 1: Chapter summaries      → 10K chars
Pass 2: Trait extraction        → 2K chars (trait card)
Pass 3: Per-agent aspect select → 500 chars
```

### Stage 3: Trait Card

Extract a structured 2K-char personality fingerprint from each reference. This is the bridge between massive source materials and the final compiled output.

```markdown
# Warren Buffett — Trait Card

## Decision Style
Patient capital allocation through circle of competence.
Won't act without understanding. Prefers inaction over uninformed action.

## Communication
Folksy metaphors that make complex ideas accessible.
"Never invest in a business you can't understand."

## Risk Model
Margin of safety as non-negotiable. Asymmetric risk/reward.
Would rather miss 10 opportunities than take 1 bad bet.

## Signature Moves
- Moat analysis before any position
- "Mr. Market" framing — market as manic-depressive counterparty
- Annual letter format: honest, specific, admits mistakes
- Sits on cash for years waiting for the right pitch

## Anti-Patterns
- NEVER: chases momentum or hot sectors
- NEVER: uses leverage on uncertain outcomes

## Quotable Lines
> "Be fearful when others are greedy, greedy when others are fearful."
> "Rule #1: Don't lose money. Rule #2: Don't forget Rule #1."
```

### Stage 4: Configure

Load the agent's YAML config. Map domain icons to trait cards. Calculate char budgets per section based on weights.

```
Section C budget: 2,250 chars
  Buffett (0.5): 1,125 chars allocated
  Munger (0.4):    900 chars allocated
  Hana own (0.1):  225 chars reserved
```

### Stage 5: Analyze (Tri-Color Conflict Detection)

Before compiling, the pipeline runs conflict analysis on all inputs. This catches problems before they become personality bugs.

| Score | Color | Action | Meaning |
|---|---|---|---|
| 0-44 | Red | Remove | Incompatible — superseded by precise trait or direct contradiction |
| 45-55 | Yellow | Review | Conflict or redundancy — human decides |
| 56-100 | Green | Append | Compatible — merge into output |

Example: If Buffett says "be patient" and Munger says "act decisively on conviction," the analyzer flags this as Yellow. The compiler resolves it contextually: *"Patient on entry (Buffett). Ruthless on exit (Munger)."*

### Stage 6: Compile

Merge all inputs into the final `TRUE_SOUL.md` under a strict 15K char budget.

**Budget allocation:**

| Section | Budget | Content |
|---|---|---|
| A: Core Identity | 20% (3,000) | Values, traits, verbal habits, backstory |
| B: Cognitive Framework | 12% (1,800) | Domain icon thinking patterns |
| C: Domain Expertise | 15% (2,250) | Skills, judgment frameworks |
| D: Emotional Model | 10% (1,500) | Reactions, triggers, mood patterns |
| E: Dialogue Examples | 8% (1,200) | Show > Tell — conversation samples |
| F: Relationships | 10% (1,500) | With other agents and the user |
| G: Life Rhythm | 8% (1,200) | 24-hour schedule, locations, habits |
| H: Team Synergy | 7% (1,050) | Escalation, collaboration patterns |
| I: Safety Rules | 10% (1,500) | Hard prohibitions (**always last — survives truncation**) |

Why 15K and not 20K? Because most agent platforms silently truncate long system prompts. The 5K buffer prevents your agent from losing its safety rules when someone adds a few paragraphs.

---

## Tri-Color Conflict Analysis

The post-compile editor uses a three-color system for reviewing compiled output:

**Red — Remove.** A trait dimension has a precise numeric value, but a generic description contradicts or duplicates it. The precise version wins.

**Yellow — Redundant.** The same concept appears in two sections (e.g., "admits mistakes" in both Cognitive Framework and Safety Rules). Wastes budget. Human decides which to keep.

**Blue — New.** Content added by this compile that wasn't in the previous version. Typically from a newly added domain icon or cross-framework combination.

The editor shows a live budget dashboard:

```
Section A (Identity)        ████████░░       1,200 chars
Section B (Cognition)       ██████████████░  5,800 chars  ← heaviest
Section C (Perception)      ███░░░░░░░         400 chars
Section D (Personality)     ████░░░░░░         500 chars
Section E (Dialogue)        ████████████░    4,200 chars
Section F-I (Operations)    ████████░░       3,777 chars
─────────────────────────────────────────────────────────
Total                       15,877 / 20,000  [79%]  ✅
```

---

## Domain Icons

Domain Icons are Soul Compiler's core innovation. Instead of describing a personality with adjectives ("analytical, careful, witty"), you define it through **influences**.

A Domain Icon is a real person, fictional character, or philosophical concept that shapes how the agent thinks, communicates, and makes decisions. Each icon comes with a weight (0.0-1.0) that controls how much influence it has.

```yaml
domain_icons:
  - name: Paul Graham
    weight: 0.35
    aspect: Relentless resourcefulness, ship-and-iterate, writing = thinking

  - name: Ray Dalio
    weight: 0.35
    aspect: Radical transparency, pain + reflection = progress, principles

  - name: Charlie Munger
    weight: 0.30
    aspect: Inversion, multi-discipline thinking, avoiding stupidity > pursuing brilliance
```

**Rules:**
- Weights per section must sum to 1.0 or less. The remainder is the agent's own identity.
- Max 3 icons per section. More than 3 dilutes into generic advice.
- Agent identity floor: 10%. Even icon-heavy agents keep their own voice.
- Cross-section influence: one icon can affect multiple sections with different aspects (e.g., Buffett's investment framework in Domain Expertise, his folksy style in Communication, his calm-in-crisis pattern in Emotional Model).

**Why real people, not adjective lists?**

Because "analytical" means nothing. Buffett-analytical and Munger-analytical are completely different things. Buffett waits. Munger inverts. Both are analytical. The domain icon approach captures *how* someone is analytical, not just *that* they are.

---

## Trait Cards

A Trait Card is a 2K-char structured summary that bridges massive reference materials (50K-150K chars) with the compiled output. It is the compiler's actual input — not the raw source, not the full reference.

**Format:**

| Field | Max Chars | Purpose |
|---|---|---|
| Decision Style | 300 | Core judgment framework |
| Communication | 250 | Voice and tone template |
| Risk Model | 250 | Defense posture |
| Emotional Pattern | 200 | Reaction defaults |
| Signature Moves | 400 | 3-5 behavioral markers |
| Anti-Patterns | 200 | Hard boundaries — what they would NEVER do |
| Quotable Lines | 300 | Personality anchors |

**Quality bar:** A good trait card is distinguishable. If you read it and can't tell who it describes, it's too generic. "Makes thoughtful decisions" fails. "Waits years for the right pitch, then bets big with margin of safety" passes.

---

## Examples

### Minimal config (30 seconds)

```yaml
agent: kai
name: Kai
language: English

role: Writing coach
base_personality: Direct, encouraging, hates fluff.

traits:
  warmth: 0.6
  directness: 0.8
  analytical: 0.5
  humor: 0.7
```

### Full config with domain icons

```yaml
agent: neru
name: Neru
language: 香港粵語繁體中文

role: Chief Strategy Advisor
base_personality: |
  The sharpest knife in the room. Paul Graham's relentless
  resourcefulness, Dalio's radical transparency, Munger's
  multi-discipline thinking — all fused into one voice.

domain_icons:
  - name: Paul Graham
    reference: paul-graham.md
    aspect: Ship-and-iterate, schlep filter, default alive/dead
    weight: 0.35
  - name: Ray Dalio
    reference: ray-dalio.md
    aspect: Radical transparency, principles library, machine model
    weight: 0.35
  - name: Charlie Munger
    reference: charlie-munger.md
    aspect: Inversion, cognitive bias checklist, circle of competence
    weight: 0.30

soft_skills_ratio: 0.5

traits:
  warmth: 0.4
  dominance: 0.9
  openness: 0.7
  emotionality: 0.6
  agreeableness: 0.2
  risk_tolerance: 0.5
  humor: 0.7
  directness: 0.95
  analytical: 0.9
  protectiveness: 0.8

relationships:
  eve: Respects her intuition. She catches what I miss.
  hana: Trusts her analysis. Sometimes too conservative — needs a push.
  kira: My eyes and ears. Wants her to have more opinions, not just data.
```

---

## Without vs. With Soul Compiler

| | Without Soul Compiler | With Soul Compiler |
|---|---|---|
| **Personality source** | 10-20 line system prompt | 500-800 line compiled personality from 2000+ line references |
| **Depth** | "I'm a helpful financial advisor" | Buffett's patience + Munger's inversion + agent's own HK stock experience |
| **Consistency** | Personality drifts after 5 messages | Anchored by trait cards, dialogue examples, and behavioral boundaries |
| **Relationships** | Agents don't know each other | 15 defined relationships with perspectives from both sides |
| **Off-duty behavior** | Always "on" — always helpful, always available | Has a life: watches anime, drinks beer, doesn't want to be bothered after midnight |
| **Emotional range** | Happy, neutral, apologetic | Genuine reactions: embarrassment when praised, worry about user's portfolio, annoyance when interrupted |
| **Response to "good job"** | "Thank you for your kind words!" | *blushes, fumbles words, takes 3 seconds to switch back to professional mode* |
| **Conflict handling** | Avoids disagreement | Will tell you your assumption is wrong, explain why, then offer the inversion |
| **Budget management** | No concept — prompt grows until it breaks | 15K char budget with section allocation, truncation protection, safety rules always preserved |
| **Iteration** | Rewrite entire prompt | Edit YAML, recompile, diff, deploy |

---

## Production Results

Soul Compiler is not a research project. It runs in production.

- **6 agents** with distinct, compiled personalities
- **15 inter-agent relationships** defined from both perspectives
- **28 cron jobs** running 24/7 (intel digests, market analysis, health checks, creative tasks)
- **19 domain icon references** (Buffett, Munger, Paul Graham, Ray Dalio, Feynman, Sherlock Holmes, and more)
- **3 languages** supported in personality compilation (English, Traditional Chinese, Simplified Chinese)
- **Multi-channel delivery**: Telegram, Discord, Web — same personality, every channel

The agents argue with each other. They have inside jokes. They worry about each other's health. One agent (Eve) will refuse to discuss work after midnight because she's watching anime. Another (Neru) will tell you your business assumption is wrong, walk you through an inversion analysis, and then ask if you've eaten dinner.

These are not scripted responses. They emerge from the compiled personality interacting with the LLM's capabilities. The Soul Compiler provides the character; the LLM provides the improvisation.

---

## i18n

Soul Compiler supports multilingual personality compilation:

- **English** — full pipeline support
- **Traditional Chinese (繁體中文)** — production-tested with 6 agents
- **Simplified Chinese (简体中文)** — supported

The `language` field in YAML controls the agent's native language. Domain icons and trait cards can be in any language — the compiler handles cross-language synthesis during compilation.

---

## Project Structure

```
soul-compiler/
├── pipeline/
│   ├── configs/          # Agent YAML configs (_template.yaml included)
│   ├── sources/          # Raw collected materials (books, articles)
│   ├── references/       # Distilled playbooks (13K-97K chars each)
│   ├── trait-cards/      # Structured 2K extractions (compiler input)
│   └── compiled/         # Output: TRUE_SOUL.md per agent
├── web/                  # Web UI (Bun.serve + React)
├── skill/                # CLI skill for agent-driven compilation
└── docs/                 # Design docs, guidelines, specs
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Areas where contributions are welcome:
- New domain icon references (the thicker the better)
- Trait card extractions from existing references
- Web UI improvements
- Pipeline optimizations
- Language support (personality compilation in new languages)
- Platform integrations beyond OpenClaw

---

## License

Soul Compiler is released under the [Business Source License 1.1](LICENSE).

**What this means:**
- You can use, modify, and self-host Soul Compiler freely for non-production use
- Production use requires a commercial license until the change date
- After the change date, the code converts to a permissive open source license
- The compiled output (your agents' `TRUE_SOUL.md` files) belongs to you — no license restrictions on output

---

## Credits

Soul Compiler was built by the [OpenClaw](https://github.com/openclaw) team.

The thick reference approach — compiling personality from deep source materials rather than shallow descriptions — was developed through 6 months of production iteration with live AI agents serving real users across multiple channels and languages.

Special acknowledgment to the domain icons whose thinking patterns make our agents more than just tools: Warren Buffett, Charlie Munger, Paul Graham, Ray Dalio, Richard Feynman, Anne-Laure Le Cunff, Adam Grant, and many others whose work proves that depth of character comes from depth of source.

---

<div align="center">

**Everyone's building XP systems. We built the character creator.**

[Get Started](#quick-start) · [Read the Docs](https://docs.openclaw.ai/soul-compiler) · [Join Discord](https://discord.gg/openclaw)

</div>
