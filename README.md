<div align="center">

# Soul Compiler

**Agent identity, compiled — and kept inside the budget it actually has.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-229%20passing-brightgreen.svg)]()

[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

</div>

---

## Check this before you read anything else

Every agent runtime that loads instruction files — `CLAUDE.md`, `AGENTS.md`, Cursor rules, `copilot-instructions.md`, an Assistants `instructions` field — enforces a size limit. Most truncate silently when you cross it.

Measure yours the way the runtime measures it:

```bash
# what the runtime counts (UTF-16 code units)
node -e "console.log(require('fs').readFileSync('CLAUDE.md','utf8').length)"

# what you probably checked instead (UTF-8 bytes)
wc -c CLAUDE.md
```

If those two numbers are far apart, your file is not written in ASCII, and **one of the two measurements you have been trusting is wrong.** For Chinese, Japanese or Korean text the gap is 1.8–2.1×: a CJK character costs 1 UTF-16 unit but 3 UTF-8 bytes.

We got this wrong for two months. It cost us a fictional emergency and a four-model review board that unanimously reached the wrong conclusion. Summary [below](#what-we-got-wrong).

📄 **The full design write-up — concepts, decisions and how to apply them to any runtime — is [Compiling agent identity](docs/compiling-agent-identity.md).**

---

## The problem

A capable agent needs a lot of standing instruction: who it is, how it speaks, the rules it must never break, the tools it may use, the facts it can assume, worked examples of good behaviour. All of it has to be present *every turn*, so all of it goes into files the runtime loads at startup.

Those files only grow. Nobody deletes a rule. And no step in anyone's workflow asks **"what does not belong in this file?"**

So you drift toward the cap. Then you cross it. Then the runtime quietly drops part of your agent's instructions — and the agent never knows. It cannot tell you its anti-fabrication rule went missing, because the rule that would have made it careful is the thing that got cut.

Not hypothetical. That is how we lost an agent's guard rails and got a confidently fabricated answer: invented date, invented legislation, invented vote counts, no source, no fetch.

## What Soul Compiler does

It compiles a verbose, human-written character specification into the lean runtime identity an agent actually loads, and decides — explicitly, with a record — what stays inline and what moves out.

```
COMPOSE     trait cards + config          → assembled draft
REVIEW      an LLM reads the whole soul   → judgment
CLASSIFY    each chunk gets one class     → deterministic taxonomy
MAP+INJECT  route by class to a file      → soul keeps a pointer
```

The division of labour is deliberate: **the model reviews and labels, ordinary code routes and writes.** The model never picks a file path and never touches disk. Judgment where judgment is needed; determinism everywhere else.

## The 2.0 architecture — BEING vs KNOWING

The insight that makes the budget tractable: standing instruction is two different kinds of thing.

|  | BEING | KNOWING |
|---|---|---|
| Content | identity, voice, iron rules — what makes this agent *this* agent | shared rules, tool discipline, reference facts, procedures, examples |
| Property | stable, bounded, unique per agent | grows without limit, usually shared across a fleet |
| Routing | **stays inline** | **extracted** — the identity file keeps a pointer |

BEING is small and stays small. KNOWING is what actually grows, and it does not need to live in the identity file at all. Split them and the file stops trending toward the cap, because the part that grows now lives elsewhere.

The mechanism is unglamorous, which is the point: most runtimes already load several instruction files, each with its own budget. Distributing content across files the runtime *already reads* beats inventing a new loader.

Classification is content-hash locked. Every chunk's routing decision is pinned to a hash of its text, so re-running the compiler is deterministic, and a human approves any decision that moves content out of the identity file. Uncertain classifications fail toward keeping content inline — silent content loss is the dangerous direction, so ambiguity resolves against extraction.

## What we got wrong

Two months ago we recorded every soul file's size with `wc -c` and compared it against a cap counting UTF-16 code units. Every number tracked after that was inflated 1.8–2.1×.

The consequences were not subtle:

- We believed one agent sat at **161% of cap, actively truncating**. It was at 83%.
- We believed 5 of 7 agents were losing content every turn. None were.
- We planned an emergency config change to raise the limit. It would have solved nothing.
- We convened a review board — an independent implementer, two independent models from different labs, and a chair — to choose between an incremental release and re-founding the architecture. **All four agreed. All four were wrong**, because all four read the same brief, and the brief carried the unit error.

Only an adversarial checker caught it, and only because it re-measured against disk instead of reasoning from the document.

Three things worth taking from that:

**Consensus is not corroboration when everyone shares an input.** Independence at the reasoning layer bought nothing while the input layer had one shared defect. If a conclusion rests on a measurement, one reviewer's job should be re-deriving that measurement — not re-arguing the logic on top of it.

**We also had the truncation geometry backwards.** The runtime we target keeps the **first 75% and the last 25%**, and drops the middle. We had assumed it cut the tail. Whatever sits at the very end of a file is comparatively safe; the vulnerable region is the middle.

**The problem was already solved.** The multi-file split shipped weeks before the panic. Of 6,417 session logs, exactly 2 contained a truncation warning — both from before the split, zero after. We were reading stale numbers in the wrong unit and mistaking them for a live fire.

Measured correctly, across a seven-agent fleet against a 12,000-unit cap:

| Agent | Identity file | % of cap |
|---|---|---|
| A | 10,656 | 89% |
| B | 9,931 | 83% |
| C | 8,026 | 67% |
| D | 7,764 | 65% |
| E | 6,168 | 51% |
| F | 5,605 | 47% |
| G | 5,010 | 42% |

Every file fits. One is worth watching. Nothing is on fire.

## Tools

Three small utilities came out of the post-mortem, useful whether or not you compile anything:

| Tool | What it does |
|---|---|
| `bootstrap-headroom` | Measures the instruction files a runtime actually loaded, in the runtime's own unit, and warns before you hit the cap rather than after. |
| `deploy-diff-gate` | Refuses to deploy when the live target holds content your source does not — catching hand-edits made in production that a regeneration would silently destroy. |
| `soul-version` | Mints a stable, content-addressed version for a compiled identity, so you can tell which prism produced which behaviour. |

`deploy-diff-gate` earned its keep immediately: 124 lines living only in production across the fleet, including a fleet-wide anti-fabrication rule the next deploy would have erased — the same class of guard whose loss caused the incident above.

`soul-version` deliberately excludes the model identifier. **The soul is the prism; the model is the light.** Moving an agent to a different model must not change its identity, or you can no longer attribute a behavioural difference to the character rather than the engine.

## Honest scope

- **Working and in production:** the compile pipeline, classification with hash-locked routing, fleet-wide deduplication of shared content, the multi-file split, and the three tools above. 229 tests passing.
- **Currently shaped around one runtime.** File names, the 12,000-unit cap and the workspace layout follow OpenClaw's conventions. The concepts port cleanly; the code does not yet. A pluggable target profile is the next piece of work — until it lands, this is more useful to read than to install.
- **Not a prompt optimizer.** It does not make your agent smarter. It decides what your agent is carrying, and proves nothing fell out.

## Measure before you trust

If you take one thing from this repository, take the check at the top. Run it against your own instruction files.

The failure mode is not that the limit is harsh. It is that crossing it is *silent*, and that the obvious way to check whether you crossed it returns the wrong number in the wrong unit.

---

<div align="center">

Built by [Koji Limited](https://koji.ltd) · Hong Kong

</div>
