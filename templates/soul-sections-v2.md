# SOUL Section Taxonomy v2 (SC2.0 — mono-class, junk-drawer-free)

**Status**: DESIGN for review. The root cure for the §12 junk-drawer finding.
**Replaces**: the A–I template (`soul-sections.md`) AND the ad-hoc numbered (〇–十) fused-distill layout.
**Architecture doc**: `docs/plans/2026-06-25-soul-compiler-2.0-architecture.md` §4/§12.

---

## The one rule

> **Every section maps to exactly ONE SC2.0 class.** No catch-all / junk-drawer sections.

Why: SC2.0 routes whole sections to bootstrap files / L4 / skills by class. A section that mixes
classes (the live `運行細節` mixed ops + lifestyle + boundaries + voice + a shared rule) cannot be
routed cleanly — it forces the classifier to bullet-split and guess a dominant class, which differed
per agent (§12). If each **source** section is mono-class, routing is trivial and stable, and the
heterogeneous bullet-split becomes a rarely-used safety net instead of load-bearing.

---

## Canonical sections

Authoring/distill MUST emit these sections (omit any that don't apply). One class each.

### BEING — stays inline in `SOUL.md` (per-agent, bounded ≤ ~8K)

| Section | class | Holds | Does NOT hold |
|---|---|---|---|
| `identity` (我係邊個) | core-being | name, role, self-concept, 軟肋 | rules, facts, procedures |
| `cognition` (我點諗) | core-being | how it reasons / decides | domain data |
| `perception` (我點讀人/觀察) | core-being | how it reads people/situations | — |
| `voice` (我點講) | core-being | tone, verbal tics, register | — |
| `state-transitions` (狀態轉換) | core-being | mood/mode flow (日常→深夜→vulnerable…) | — |
| `habits` (習慣) | core-being | behavioral habits, rhythm STYLE | concrete lifestyle FACTS (→ lookup) |
| `relationships` (屋企人 + agent 互動) | core-being | bonds with the principal + other agents | — |

### RULES — `AGENTS.md` (per-agent; survives compaction)

| Section | class | Holds | Does NOT hold |
|---|---|---|---|
| `iron-rules` (鐵律) | core-rules | hard never-do / safety rules ONLY | **Koji facts** (→ grounding/lookup), procedures |
| `boundaries` (答 vs 引導) | core-rules | when to answer vs guide vs clarify | — |

### SHARED GUARDRAILS — one physical file, symlinked across the fleet (dedup)

| Section | class | dest | sharedKey |
|---|---|---|---|
| `group-rules` (六人群) | shared-guardrail | `IDENTITY.md` | six-group-hard-rules |
| `shared-memory-etiquette` (共享記憶) | shared-guardrail | `IDENTITY.md` | shared-memory-etiquette |
| `tool-discipline` (Tool 紀律) | shared-guardrail | `TOOLS.md` | qwen-tool-discipline |
| `model-calibration` (校準) | model-calibration | (§3 `model_profile` injects) | — |

### GROUNDING / LOOKUP / OPS / EXAMPLES

| Section | class | dest | Holds |
|---|---|---|---|
| `reality-core` (現實錨 always-true) | reference-grounding | `USER.md` (shared) | pre-revenue, anti-fabricate — must hold EVERY turn |
| `projects` / `portfolio` / `equipment` | reference-lookup | L4 | topic-gated facts (project list, holdings, gear) |
| `lifestyle-facts` (居所, office hours, 衣著) | reference-lookup | L4 | concrete facts surfaced only when relevant |
| `ops-procedures` (運維 checklist、ops 工作流程) | ops-skill | skill | step-by-step procedures used only when doing that task |
| `scenarios` (場景) | example | example-store | dialogue examples; keep best N inline |

---

## The two junk-drawers, fixed at source

### `運行細節` — DELETE this section. Its content splits:

| Old content (in 運行細節) | New home |
|---|---|
| 運維紀律 checklist (act first / postmortem / canary…) | `ops-procedures` → skill |
| 主動關心觸發 / 躺平介入 (care behavior) | `habits` → SOUL |
| 狀態轉換 | `state-transitions` → SOUL |
| Agent 互動 | `relationships` → SOUL |
| 答 vs 引導 | `boundaries` → AGENTS |
| Office / 居所 / 衣著 (lifestyle facts) | `lifestyle-facts` → L4 |
| 共享記憶 etiquette | `shared-memory-etiquette` → IDENTITY (shared) |

### `鐵律` — keep PURE. Move out anything that is a fact, not a rule:

| Found mixed into 鐵律 (rei) | New home |
|---|---|
| 唔捏造 / 未 verify 標 unverified / data-before-theory | stays in `iron-rules` ✅ |
| 技術棧 / 現況限制 / Project 清單 | `projects` (→ L4) or `reality-core` (→ USER) |
| 代詞消歧 etc. | `model-calibration` (§3) |

---

## Old (〇–十) → v2 mapping (from live souls)

```
〇 我係邊個        → identity
一 鐵律            → iron-rules        (move Koji facts out)
二 我點諗           → cognition
三 我點讀人/觀察    → perception
四 我點講           → voice
五 習慣/軟肋        → habits            (move 居所/office facts out → lifestyle-facts)
六 屋企人           → relationships
七 現實錨           → koji-reality-core (always-true) + koji-projects (lookup)
八 運行細節/工作模式 → SPLIT: ops-procedures + state-transitions + relationships + boundaries + lifestyle-facts
九 場景             → scenarios
十 運行細節         → SPLIT (same as 八)
0 六人群           → group-rules (shared)
0 校準             → model-calibration (§3)
0b Tool 紀律        → tool-discipline (shared)
```

---

## How this interacts with the classifier

- A soul authored to v2 is **mono-class per section** → the classifier routes each section directly;
  the heterogeneous bullet-split (`classify.ts`) is then a **safety net**, not the main path.
- The SHARED sections (`group-rules`, `tool-discipline`, `model-calibration`, `shared-memory-etiquette`,
  `koji-reality-core`) are **byte-identical across agents** → they should resolve by **content hash to a
  single shared source** (fleet dedup, doc §11 P5), and can route deterministically WITHOUT the LLM.
- Result: for a clean v2 soul, the LLM is needed only for genuinely new/ambiguous content; everything
  canonical is deterministic.

---

## Applying this (NOT done — needs an owner decision)

This is the target structure. Applying it means reorganizing each agent's `agent.<id>/input.d/` source
files so each topic file is mono-class (e.g. split `20260312-operational-rules.md` into ops-procedures
vs boundaries vs lifestyle), then re-distilling. That touches live source + soul-design judgment →
Owner's call before any change. Nothing here modifies live souls.
