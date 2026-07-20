# Four AI reviewers agreed with each other. All four were wrong.

We ran a review board to decide the future of a tool we maintain: an independent implementer, two models from different labs, and a chair to synthesise. They worked separately. They reached the same conclusion. We very nearly acted on it.

Then an adversarial checker re-measured a number from disk and the whole thing collapsed. The emergency we had convened to solve did not exist and had not existed for weeks.

The root cause is one line long, and it is probably in your codebase too.

## The bug

Agent runtimes cap the instruction files they load — `CLAUDE.md`, `AGENTS.md`, Cursor rules, `copilot-instructions.md`, an Assistants `instructions` field. Cross the cap and most of them truncate silently.

The cap in ours is 12,000. We had been checking our files like this:

```bash
wc -c SOUL.md
# 18717
```

18,717 against a limit of 12,000. That is 156% of budget, so we had a fire.

Except the runtime's check is JavaScript:

```js
if (content.length > maxChars) { /* truncate */ }
```

`String.prototype.length` counts **UTF-16 code units**. `wc -c` counts **UTF-8 bytes**. For ASCII those numbers are identical, which is exactly why this survives review — everyone's mental model is calibrated on English text where the bug is invisible.

Our files are in Chinese. A CJK character is 1 UTF-16 unit and 3 UTF-8 bytes.

```bash
node -e "console.log(require('fs').readFileSync('SOUL.md','utf8').length)"
# 9931
```

9,931. Eighty-three percent. No fire, and no fire for the last three weeks.

**Try it on your own agent instructions right now.** If the two numbers differ, one of them is not the number your runtime uses, and it is worth knowing which.

## How four reviewers missed it

Here is the part that bothered me more than the bug.

We were choosing between an incremental release and re-founding the architecture on a different substrate — a real decision, so we followed our own rule for load-bearing calls: don't decide alone. One implementer did deep analysis with filesystem access. Two models from different labs reviewed independently, without seeing each other's answers. A chair synthesised. Then a separate adversarial checker was told to attack the result.

The first four converged. Different training, different vendors, different prompts, same conclusion, delivered with well-structured reasoning and specific evidence.

**They were reading the same brief, and the brief contained the bad number.**

Every one of them reasoned impeccably from `156% of cap` to `this is urgent` to `here is what to do about it`. Independence at the reasoning layer bought us exactly nothing, because the defect was one layer below where any of them were looking. Four independent derivations from one poisoned premise is not four pieces of evidence. It is one mistake, counted four times, wearing the costume of consensus.

Worse: the chair wrote the brief. That was me. I had copied the figures out of our own architecture document without measuring anything, and then used the false conclusion to set the board's agenda — actively directing reviewers to investigate a sub-problem that did not exist. The process was designed to catch a lone reviewer's blind spot. It has no defence against the person framing the question.

The checker caught it for one reason: it ignored the document and measured the files.

## What we changed

**One seat re-derives the inputs, not the argument.** If a conclusion rests on a measurement, somebody's explicit job is to reproduce that measurement from source. Not to re-examine the logic built on top of it — to go get the number again. This is now a standing rule for us, and it is cheap: it is one reviewer, doing something mechanical.

**Provenance markers in the brief.** Every figure is now tagged as measured-just-now or copied-from-a-document. Copied figures are hypotheses. Ours had been rotting quietly for two months.

**Unanimity is a prompt to check the input.** Fast convergence across diverse models is weak evidence of correctness and decent evidence of a shared premise. When every seat agrees immediately, the interesting question is what they all read.

## Two other things we had backwards

**Truncation geometry.** We assumed the runtime cut the tail, and had written a rule to put safety-critical content last so it would be "the first thing lost" — pointing the wrong way entirely. It actually keeps the first 75% and the last 25% and drops the **middle**:

```js
const BOOTSTRAP_HEAD_RATIO = 0.75;
const BOOTSTRAP_TAIL_RATIO = 0.25;
```

So the end of the file is comparatively safe. The vulnerable region is the middle, which is where nobody puts anything deliberately, which is why nobody thinks about it.

**The silent-success failure.** While fixing this, our new size-checking tool reported `✅ every file fits` — after measuring zero files. A path had resolved to the wrong home directory on the remote host and matched nothing, and the tool cheerfully summed an empty set and passed.

A check that verifies nothing reports success exactly as loudly as one that verifies everything. It now exits non-zero when coverage is zero. If you have monitoring you have never seen fail, consider whether it *can*.

## Why any of this matters

The failure mode here is not that a limit is harsh. It is that **crossing it is silent, and the obvious way to check gives you a plausible wrong answer.**

That combination is nastier than it sounds. A loud failure gets fixed. A silent failure with a confident-looking measurement gets *institutionalised* — written into a doc, quoted in a review, inherited by the next person, and eventually defended by four independent reviewers who all read the doc.

Our agent could not tell us its anti-fabrication rule had gone missing, because the rule that would have made it careful was the thing that got cut. That is the shape of the whole problem: the system that would have caught the error is inside the region the error destroys.

---

The tooling we built afterwards — a headroom check that measures in the runtime's own unit, a gate that refuses to deploy when production holds content your source does not, and content-addressed versioning for compiled agent identities — is MIT-licensed at [github.com/kojiltd/soul-compiler](https://github.com/kojiltd/soul-compiler).

Fair warning: it is currently shaped around one runtime's conventions. The concepts port cleanly; the code does not yet. Right now it is more useful to read than to install — but the two-line check at the top of this post works anywhere, and takes ten seconds.
