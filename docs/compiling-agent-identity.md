# Compiling agent identity

## A design for keeping standing instruction inside a budget that will not grow

Every agent you deploy carries standing instruction: who it is, how it speaks, rules it must never break, tools it may use, facts it can assume, examples of good behaviour. All of it must be present on *every* turn, so all of it lives in files the runtime loads at startup — `CLAUDE.md`, `AGENTS.md`, Cursor rules, `copilot-instructions.md`, an Assistants `instructions` field.

Two facts about those files put them on a collision course.

**They only grow.** Every incident adds a rule. Every new tool adds usage notes. Every misunderstanding adds a clarification. Nobody ever deletes anything, because deleting a rule feels like inviting the failure it prevents.

**They are capped.** Every runtime enforces a limit, and most truncate silently past it. Your agent does not get an error. It gets a slightly shorter set of instructions and no idea that anything is missing.

Put those together and you get a specific, nasty failure: an agent that loses its guard rails and cannot tell you, because the rule that would have made it careful is the thing that got cut. We hit exactly this — an agent whose anti-fabrication rule was truncated away produced a confident answer with an invented date, invented legislation and invented vote counts, no source and no fetch.

The usual response is to trim. That works once. It does not address why the file grew, and it makes you the adversary of your own safety rules.

Soul Compiler exists because there is a missing step in how everyone writes these files. No part of the workflow ever asks: **what does not belong in here?**

---

## The core idea: BEING and KNOWING

Standing instruction looks homogeneous — it is all just text in one file — but it is two different kinds of thing with opposite growth behaviour.

|  | **BEING** | **KNOWING** |
|---|---|---|
| Content | identity, voice, iron rules, the character's shape | shared team rules, tool discipline, reference facts, procedures, worked examples |
| Growth | stable, bounded | unbounded |
| Ownership | unique to this agent | usually identical across a fleet |
| Question it answers | *who am I* | *what do I know / refer to* |

BEING is small and stays small. A character does not need more identity next month than it had last month.

KNOWING is everything that grows, and here is the important part: **it does not need to be in the identity file at all.** It needs to be *loaded*, which is a different requirement.

Split them, and the file stops trending toward the cap — not because you trimmed it, but because the part that grows now lives somewhere else.

This reframes the whole problem. You are not managing a budget. You are correcting a category error: content with unbounded growth was placed in a container with a fixed size, and it never belonged there.

### The discriminator that actually works

"Identity versus knowledge" is intuitive but too soft to route on. In practice the question that decides correctly is:

> **Does the agent need this on every single turn, or only sometimes?**

- Needed every turn, but bloating the identity file → a **separate always-loaded file** (most runtimes load several, each with its own budget)
- Needed only sometimes → **retrieval or a load-on-trigger skill**
- Pure identity → **stays inline**

That question is answerable by looking at the content. "Is this who the agent is?" invites debate; "does it fire every turn?" does not.

---

## The pipeline

```
COMPOSE      trait cards + config            → assembled draft
REVIEW       an LLM reads the WHOLE draft    → judgment
CLASSIFY     each chunk gets exactly one class → deterministic taxonomy
MAP + INJECT route by class to a destination  → identity file keeps a pointer
```

### The division of labour is the design

**The model reviews and labels. Ordinary code routes and writes.**

The model reads the assembled soul and answers one question per chunk: what kind of thing is this? That is a judgment call requiring language understanding, and it is exactly what models are good at.

Everything downstream — which file a class maps to, what path it lands on, what gets written — is a lookup table. The model never picks a file path and never touches disk.

This matters more than it sounds. The moment a model chooses destinations, your output stops being reproducible, your review surface becomes unbounded, and a hallucinated path becomes a deployment. Keeping the model on the judgment side and code on the mechanical side means the whole thing is auditable: every routing decision traces to a class, and every class traces to a rule you wrote.

### Review the whole soul, not section by section

The review step reads the entire assembled draft in one pass, deliberately. Per-section review cannot see that the same rule appears in three sections, or that a section is a junk drawer holding four unrelated kinds of content.

That second one turned out to be real. When we ran classification across several agents, one section classified three different ways on three different agents. The instinct is to call that model inconsistency. It was not — the section genuinely mixed four classes under one heading, and each agent's copy leaned a different way. The classifier was reporting a defect in our source material that per-section review had hidden for months.

Whole-soul review earns its cost by finding those.

---

## Design decisions worth stealing

These are the parts that generalise past our particular runtime.

### Content-hash locked routing

Every chunk's routing decision is pinned to a hash of its text and stored in a lock file:

```json
{
  "version": "route/v1",
  "agent": "example",
  "entries": {
    "3f9a2c1d8b04": { "heading": "Iron rules", "class": "core-rules", "approved": true }
  }
}
```

Re-running the compiler on unchanged content calls no model at all — every chunk is pinned, so the run is fully deterministic and free. When text changes, its hash changes, the decision unpins, and it goes back for review.

The `approved` flag is the safety interlock: **only approved entries actually extract.** A fresh classification that wants to move content out of the identity file stays inline until a human signs off. Nothing leaves quietly.

### Ambiguity fails toward inline

```ts
export const EXTRACT_CONFIDENCE_FLOOR = 0.6;
```

Below that confidence, the chunk stays inline regardless of what the model labelled it.

The asymmetry is deliberate. Wrongly keeping content inline costs some budget. Wrongly extracting it can silently delete a safety rule. Those are not comparable errors, so uncertainty resolves toward the survivable one. Unclassified chunks default to inline for the same reason.

Any system that moves content around should decide, explicitly, which direction its mistakes fall in.

### Fleet deduplication through byte-identical files

Shared rules — team conventions, tool discipline — are usually identical across every agent. Rather than compiling seven copies, identical chunks resolve to one canonical file that every agent links to.

The invariant is strict: a fleet-shared file contains **nothing agent-specific**. When we added per-agent version stamps to generated files, the shared ones had to be excluded, because a single agent-specific byte would fork the file seven ways and silently destroy the deduplication.

Fleet-wide, this is the difference between updating a shared rule once and updating it seven times and missing one.

### Lossless mode: fold back rather than drop

Not every destination is loadable at runtime. If your runtime only reads five specific filenames, then "extract this to `examples/`" means the content is *gone* at runtime, not relocated.

So extraction has two modes. In lossless mode, anything whose destination is not actually loaded gets folded back into a file that is, and the compiler then verifies line by line that every substantive line of the input appears somewhere in the output.

This produces less impressive numbers than aggressive extraction. That is the correct trade: we lost real content to an over-eager regeneration once — operational procedures dropped from seven entries to zero, an entire discipline section vanished — and no budget win is worth repeating it.

### Version the prism, not the light

Compiled identities get a stable, content-addressed version:

```
example-soul-v2+3f9a2c1d8b04
```

Deterministic — same content, same taxonomy, same version. It changes when and only when the identity changes.

**It deliberately excludes the model identifier.** The soul is the prism; the model is the light passing through it. Move an agent from one model to another and its identity has not changed, so its version must not change either. Fold the model into the version and you can no longer answer the question the version exists to answer: was that behavioural difference the character, or the engine?

Keep them as two orthogonal fields and every combination stays legible — including the honest labelling of "model X interpreting character Y's specification", which is a useful thing to run and a dishonest thing to leave ambiguous.

### Verify the direction you are not looking at

Our compiler proved *input ⊆ output* — nothing in the source got lost on the way to deployment. Reasonable, and insufficient.

It never checked the other direction. Content hand-edited directly onto the live host, after the source was captured, was invisible to that check. A regeneration would overwrite it without a word.

When we finally built the reverse gate — *live ⊆ source* — it found 124 lines existing only in production across the fleet. Among them: a fleet-wide anti-fabrication rule added weeks earlier, and a scoping fix whose own comment read *"not yet flowed back to source, a recompile will wipe this."* Someone had written down the exact failure and it happened anyway, because nothing was checking.

**If you generate deployed artifacts, you need both directions.** Source-to-live catches lost content. Live-to-source catches content you were about to destroy.

### A check that verifies nothing must not pass

While building the headroom monitor, it reported `✅ every file fits` — after measuring zero files. A path had resolved to the wrong home directory on the remote host and matched nothing. It summed an empty set and passed.

It now exits non-zero on zero coverage. Worth a general rule: **any monitoring you have never seen fail deserves a check that it still can.**

---

## Measuring correctly

One implementation detail deserves its own section, because it cost us two months.

Runtime caps are enforced in the runtime's language. Ours checks `content.length` in JavaScript — **UTF-16 code units**. We were checking with `wc -c` — **UTF-8 bytes**.

For ASCII these are identical, which is precisely why the bug survives review: everyone's intuition is calibrated on English, where it is invisible. Our files are Chinese, where a character costs 1 UTF-16 unit and 3 UTF-8 bytes.

```bash
wc -c SOUL.md
# 18717  → 156% of a 12,000 cap. Emergency.

node -e "console.log(require('fs').readFileSync('SOUL.md','utf8').length)"
# 9931   → 83%. No emergency, and none for weeks.
```

Every size we tracked for two months was inflated ~2×. We believed five of seven agents were losing content every turn; none were. We planned an emergency config change that would have solved nothing.

**Run both numbers against your own instruction files.** If they differ, one of them is not what your runtime uses.

Two adjacent lessons:

**Check the truncation geometry, do not assume it.** We assumed the tail was cut, and had a rule placing safety content last so it would be lost first — pointing the wrong way. The runtime actually keeps the first 75% and the last 25% and drops the **middle**. The end of the file is comparatively safe; the vulnerable region is the middle, which is where nobody puts anything deliberately.

**Consensus is not corroboration when everyone shares an input.** We convened a review board on this — an independent implementer, two models from different labs, a chair — and all four agreed on a conclusion built on the bad number. Four independent derivations from one poisoned premise is one mistake counted four times. If a decision rests on a measurement, make it somebody's explicit job to re-derive that measurement from source rather than re-argue the logic on top of it. ([Longer write-up.](four-reviewers-one-bad-number.md))

---

## How to apply this

You do not need this compiler. The design ports; here is the sequence.

**1. Find your real cap, in your runtime's unit.** Read the source or the docs — do not guess, and do not measure in bytes. You need three numbers: per-file cap, total cap across all loaded files, and what happens when you exceed them (truncate? error? drop the file?).

**2. Find every file your runtime actually loads.** Most load more than one, and most people use only the obvious one. Each additional recognised file typically carries its own independent budget. Distributing across files the runtime *already reads* is enormously cheaper than building a loader.

**3. Sort your existing instruction file by the every-turn question.** Go chunk by chunk. Every turn, or only sometimes? Unique to this agent, or shared? That gives you four buckets, and the routing follows: unique+always → inline; shared+always → a second always-loaded file, shared across agents; sometimes → retrieval or a triggered skill; and the fourth (unique+sometimes) is usually procedures, which is what skills are for.

**4. Move the shared bucket first.** It is the biggest, the easiest, and the highest-leverage, because one canonical copy replaces N copies. It also requires no judgment about character.

**5. Make ambiguity fall toward inline.** Whatever mechanism you use, decide which way mistakes fall, and make it the survivable direction.

**6. Verify both directions, then monitor.** After deployment, check that nothing from source went missing *and* that nothing live is absent from source. Then add a size check that runs against **deployed** files in the **runtime's unit**, and set the alarm at ~80% of cap, not 100% — you want to hear about it while you still have room.

Step 6 is the one people skip, and it is the one that turns this from a cleanup into something that stays fixed.

---

## What this does not solve

**It does not make your agent smarter.** It decides what your agent is carrying and proves nothing fell out. Those are different problems and this only addresses the second.

**Source structure limits everything downstream.** A classifier can route a section that is one clean thing. Faced with a heading holding four unrelated kinds of content, it can only pick the dominant flavour. The real fix is upstream — write mono-purpose sections — and no amount of clever routing substitutes for it.

**The current implementation is shaped around one runtime.** Filenames, the 12,000-unit cap, the workspace layout follow one set of conventions. The concepts above port cleanly; the code needs a pluggable target profile first. Until that lands, this is more useful to read than to install.

---

The implementation is MIT-licensed at [github.com/kojiltd/soul-compiler](https://github.com/kojiltd/soul-compiler) — including the three tools that came out of the failures above: a headroom check that measures in the runtime's own unit, a gate that refuses to deploy when production holds content your source does not, and content-addressed versioning for compiled identities.
