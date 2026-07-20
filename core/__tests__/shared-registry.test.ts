import { test, expect, describe } from "bun:test";
import {
  detectSharedChunks,
  buildSharedRegistry,
  resolveShared,
  approveRegistry,
  emptyRegistry,
  formatRegistryReport,
} from "../shared-registry";

// A shared block (byte-identical) + per-agent unique identity.
const SHARED_BLOCK = `## 六人群 HARD RULES
唔好洗版。互相尊重。

## Tool 紀律
唔好用 built-in 取代真 tool。`;

const soul = (agent: string, unique: string) => `# ${agent} soul
preamble ${agent}

${SHARED_BLOCK}

## 〇、我係邊個
${unique}
`;

const souls = [
  { agent: "example", content: soul("example", "我係 Agent。") },
  { agent: "eve", content: soul("eve", "我係 Eve。") },
  { agent: "rei", content: soul("rei", "我係 Rei。") },
];

function responder(prompt: string): string {
  const out: Record<string, unknown>[] = [];
  const re = /### \[chunk:([^\]]+)\] (.+?) \(\d+ chars\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    const [, id, heading] = m;
    if (heading.includes("六人群")) out.push({ id, class: "shared-guardrail", sharedKey: "six-group-hard-rules", confidence: 0.95 });
    else if (heading.includes("Tool")) out.push({ id, class: "shared-guardrail", sharedKey: "qwen-tool-discipline", confidence: 0.95 });
    else out.push({ id, class: "core-being", confidence: 0.9 });
  }
  return JSON.stringify(out);
}
function countingLLM(respond: (p: string) => string) {
  let calls = 0;
  return { fn: async (p: string) => (calls++, respond(p)), calls: () => calls };
}

describe("detectSharedChunks", () => {
  test("finds chunks identical across ≥2 agents, ignores per-agent-unique", () => {
    const shared = detectSharedChunks(souls, 2);
    const headings = [...shared.values()].map((d) => d.heading);
    expect(headings).toContain("六人群 HARD RULES");
    expect(headings).toContain("Tool 紀律");
    expect(headings.some((h) => h.includes("我係邊個"))).toBe(false); // unique per agent
  });

  test("records every agent that carries the shared chunk", () => {
    const shared = detectSharedChunks(souls, 2);
    for (const d of shared.values()) expect(d.agents.size).toBe(3);
  });

  test("minAgents threshold excludes chunks below it", () => {
    const two = [souls[0], { agent: "x", content: soul("x", "uniq") }];
    // SHARED_BLOCK appears in both → still shared at threshold 2, excluded at 3.
    expect(detectSharedChunks(two, 2).size).toBeGreaterThan(0);
    expect(detectSharedChunks(two, 3).size).toBe(0);
  });
});

describe("buildSharedRegistry", () => {
  test("classifies the deduped shared set in ONE LLM call", async () => {
    const llm = countingLLM(responder);
    const res = await buildSharedRegistry(souls, llm.fn, { write: false });
    expect(llm.calls()).toBe(1); // whole fleet's shared content classified once
    expect(res.llmCalls).toBe(1);
    expect(res.uniqueShared).toBeGreaterThan(0);
  });

  test("derives canonical basename: 六人群→IDENTITY, tool→TOOLS", async () => {
    const res = await buildSharedRegistry(souls, countingLLM(responder).fn, { write: false });
    const dests = Object.values(res.registry.entries).map((e) => e.basename);
    expect(dests).toContain("IDENTITY.md");
    expect(dests).toContain("TOOLS.md");
  });

  test("each entry lists all carrying agents (dedup provenance)", async () => {
    const res = await buildSharedRegistry(souls, countingLLM(responder).fn, { write: false });
    for (const e of Object.values(res.registry.entries)) expect(e.agents).toEqual(["eve", "example", "rei"]);
  });

  test("re-build with existing registry does not reclassify (keeps approvals)", async () => {
    const first = await buildSharedRegistry(souls, countingLLM(responder).fn, { write: false });
    approveRegistry(first.registry);
    const llm2 = countingLLM(responder);
    const res = await buildSharedRegistry(souls, llm2.fn, { write: false, registry: first.registry });
    expect(llm2.calls()).toBe(0); // all already registered
    expect(Object.values(res.registry.entries).every((e) => e.approved)).toBe(true);
  });
});

describe("resolveShared", () => {
  test("routes only approved entries; identical body across agents → same route", async () => {
    const res = await buildSharedRegistry(souls, countingLLM(responder).fn, { write: false });
    const sixBody = "## 六人群 HARD RULES\n唔好洗版。互相尊重。"; // matches chunk body
    // chunkSoul trims; the registry hashes the chunk body. Use the real chunk body:
    const bodyInSoul = "唔好洗版。互相尊重。";
    expect(resolveShared(bodyInSoul, res.registry)).toBeNull(); // not approved yet
    approveRegistry(res.registry);
    const r = resolveShared(bodyInSoul, res.registry);
    expect(r?.class).toBe("shared-guardrail");
    expect(r?.basename).toBe("IDENTITY.md");
  });
});

describe("formatRegistryReport", () => {
  test("reports dedup savings and pending count", async () => {
    const res = await buildSharedRegistry(souls, countingLLM(responder).fn, { write: false });
    const report = formatRegistryReport(res.registry);
    expect(report).toContain("pending approval");
    expect(report).toContain("saves");
  });
});
