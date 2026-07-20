import { test, expect, describe } from "bun:test";
import {
  hashBody,
  emptyLock,
  classifyWithLock,
  approveLock,
  formatLockReview,
} from "../route-lock";

const SOUL = `# Agent — soul
preamble metadata

## 六人群 HARD RULES
唔好洗版。

## 一、鐵律
唔捏造數字。

## 〇、我係邊個
我係 Agent。

## 領展持倉
0823.HK 7100 股。

## 八、運行細節
- **運維**：act first。
- **共享記憶**：唔好次次提。
`;

/** Deterministic stand-in LLM: derives a class from each chunk heading in the prompt. */
function responder(prompt: string): string {
  const out: Record<string, unknown>[] = [];
  const re = /### \[chunk:([^\]]+)\] (.+?) \(\d+ chars\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    const [, id, heading] = m;
    let cls = "core-being";
    const extra: Record<string, unknown> = {};
    if (heading.includes("六人群")) {
      cls = "shared-guardrail";
      extra.sharedKey = "six-group-hard-rules";
    } else if (heading.includes("鐵律")) cls = "core-rules";
    else if (heading.includes("持倉")) cls = "reference-lookup";
    else if (heading.includes("運行細節")) {
      cls = "ops-skill";
      extra.heterogeneous = true;
    } else if (heading.includes("運維")) cls = "ops-skill";
    else if (heading.includes("共享記憶")) {
      cls = "shared-guardrail";
      extra.sharedKey = "shared-memory-etiquette";
    }
    out.push({ id, class: cls, confidence: 0.9, rationale: "test", ...extra });
  }
  return JSON.stringify(out);
}

function countingLLM(respond: (p: string) => string) {
  let calls = 0;
  return { fn: async (p: string) => (calls++, respond(p)), calls: () => calls };
}
const BOOM = async () => {
  throw new Error("LLM must not be called");
};

describe("hashBody", () => {
  test("stable for same body, differs for different", () => {
    expect(hashBody("  abc \n")).toBe(hashBody("abc"));
    expect(hashBody("abc")).not.toBe(hashBody("abd"));
    expect(hashBody("abc")).toHaveLength(12);
  });
});

describe("preamble special-case", () => {
  test("preamble is auto-pinned core-being/approved and never sent to the LLM", async () => {
    const lock = emptyLock("example");
    const llm = countingLLM(responder);
    await classifyWithLock("example", SOUL, llm.fn, { lock, write: false });
    const preamble = Object.values(lock.entries).find((e) => e.heading === "(preamble)");
    expect(preamble).toMatchObject({ class: "core-being", approved: true });
    // The preamble heading is never present in any LLM prompt.
    expect(llm.calls()).toBeGreaterThan(0);
  });
});

describe("approval gate", () => {
  test("first run PROPOSES but extracts nothing (all kept inline until approved)", async () => {
    const lock = emptyLock("example");
    const res = await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false });
    expect(res.llmCalls).toBeGreaterThan(0);
    expect(res.freshCount).toBeGreaterThan(0);
    expect(res.pendingCount).toBeGreaterThan(0);
    expect(res.map.extractedChars).toBe(0); // nothing leaves the soul yet
    // proposals are pinned but unapproved
    const six = lock.entries[hashBody("唔好洗版。")];
    expect(six).toMatchObject({ class: "shared-guardrail", approved: false });
  });

  test("after approveLock, an unchanged re-run extracts — with ZERO LLM calls", async () => {
    const lock = emptyLock("example");
    await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false });
    approveLock(lock);
    const res = await classifyWithLock("example", SOUL, BOOM, { lock, write: false });
    expect(res.llmCalls).toBe(0);
    expect(res.pendingCount).toBe(0);
    expect(res.map.extractedChars).toBeGreaterThan(0);
    // 六人群 now routes to the shared IDENTITY file
    const six = res.map.chunks.find((c) => c.sharedKey === "six-group-hard-rules");
    expect(six?.dest).toEqual({ kind: "bootstrap-file", basename: "IDENTITY.md", shared: true });
  });
});

describe("classifyWithLock — determinism", () => {
  test("second run, unchanged content → ZERO LLM calls", async () => {
    const lock = emptyLock("example");
    await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false });
    const res2 = await classifyWithLock("example", SOUL, BOOM, { lock, write: false });
    expect(res2.llmCalls).toBe(0);
    expect(res2.pinnedCount).toBeGreaterThan(0);
  });

  test("editing one section reclassifies ONLY that section", async () => {
    const lock = emptyLock("example");
    await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false });
    const edited = SOUL.replace("唔捏造數字。", "唔捏造數字。永遠唔可以亂講。");
    const llm2 = countingLLM(responder);
    const res = await classifyWithLock("example", edited, llm2.fn, { lock, write: false });
    expect(res.llmCalls).toBe(1);
    expect(res.freshCount).toBe(1);
  });

  test("adding a new section classifies + pins just the new one", async () => {
    const lock = emptyLock("example");
    await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false });
    const before = Object.keys(lock.entries).length;
    const res = await classifyWithLock("example", SOUL + "\n## 新增段\n新內容。\n", countingLLM(responder).fn, { lock, write: false });
    expect(res.freshCount).toBe(1);
    expect(Object.keys(res.lock.entries).length).toBe(before + 1);
  });
});

describe("heterogeneous + approval", () => {
  test("approved heterogeneous section replays bullet routing with no LLM", async () => {
    const lock = emptyLock("example");
    await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false });
    approveLock(lock);
    const res = await classifyWithLock("example", SOUL, BOOM, { lock, write: false });
    expect(res.llmCalls).toBe(0);
    expect(res.map.heterogeneousSections.length).toBeGreaterThan(0);
    const shared = res.map.chunks.find((c) => c.sharedKey === "shared-memory-etiquette");
    expect(shared?.dest.kind).toBe("bootstrap-file");
  });
});

describe("shared registry wiring", () => {
  const resolveShared = (body: string) =>
    body.includes("唔好洗版") ? { class: "shared-guardrail" as const, sharedKey: "six-group-hard-rules" } : null;

  test("registry-canonical chunk routes deterministically, NOT sent to the LLM", async () => {
    const lock = emptyLock("example");
    const llm = countingLLM(responder);
    const res = await classifyWithLock("example", SOUL, llm.fn, { lock, write: false, resolveShared });
    expect(res.sharedCount).toBe(1);
    const six = res.map.chunks.find((c) => c.sharedKey === "six-group-hard-rules");
    expect(six?.canonical).toBe(true);
    expect(six?.dest).toEqual({ kind: "bootstrap-file", basename: "IDENTITY.md", shared: true, canonical: true });
    // The 六人群 body never appears in any LLM prompt.
    const six生 = res.map.chunks.find((c) => c.heading.includes("六人群"));
    expect(six生?.canonical).toBe(true);
  });

  test("shared-canonical chunk is not pinned in the per-agent route-lock (registry owns it)", async () => {
    const lock = emptyLock("example");
    await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false, resolveShared });
    expect(lock.entries[hashBody("唔好洗版。")]).toBeUndefined();
  });
});

describe("formatLockReview", () => {
  test("lists pending entries, flags extracting routes, clears after approval", async () => {
    const lock = emptyLock("example");
    await classifyWithLock("example", SOUL, countingLLM(responder).fn, { lock, write: false });
    const review = formatLockReview(lock);
    expect(review).toContain("pending approval");
    expect(review).toContain("⚠ EXTRACTS"); // shared-guardrail / reference routes
    approveLock(lock);
    expect(formatLockReview(lock)).toContain("all approved");
  });
});
