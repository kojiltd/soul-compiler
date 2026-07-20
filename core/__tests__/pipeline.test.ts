import { test, expect, describe, afterAll } from "bun:test";
import { resolve } from "node:path";
import { rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runPipeline, type Soul } from "../pipeline";

const SHARED = `## 六人群 HARD RULES
唔好洗版。

## Tool 紀律
唔好用 built-in 取代真 tool。`;

const soul = (a: string, u: string) => `# ${a}
pre ${a}

${SHARED}

## 〇、我係邊個
${u}

## 一、鐵律
唔捏造數字。
`;

const souls: Soul[] = [
  { agent: "example", content: soul("example", "我係 Agent。") },
  { agent: "eve", content: soul("eve", "我係 Eve。") },
];

function respond(prompt: string): string {
  const out: Record<string, unknown>[] = [];
  const re = /### \[chunk:([^\]]+)\] (.+?) \(\d+ chars\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    const [, id, heading] = m;
    let cls = "core-being";
    const x: Record<string, unknown> = {};
    if (heading.includes("六人群")) (cls = "shared-guardrail"), (x.sharedKey = "six-group-hard-rules");
    else if (heading.includes("Tool")) (cls = "shared-guardrail"), (x.sharedKey = "qwen-tool-discipline");
    else if (heading.includes("鐵律")) cls = "core-rules";
    out.push({ id, class: cls, confidence: 0.95, ...x });
  }
  return JSON.stringify(out);
}
const llm = async (p: string) => respond(p);

const OUT = resolve(tmpdir(), `sc2-pipeline-${process.pid}`);
afterAll(async () => {
  await rm(OUT, { recursive: true, force: true });
});

describe("runPipeline — review mode (default)", () => {
  test("proposes + pins but extracts/deploys nothing", async () => {
    const res = await runPipeline(souls, llm, { write: false });
    expect(res.applied).toBe(false);
    expect(res.registryPending).toBeGreaterThan(0); // registry not approved in review
    for (const a of res.agents) {
      expect(a.inject).toBeUndefined(); // nothing written
      expect(a.map.extractedChars).toBe(0); // nothing leaves the soul
      expect(a.map.soulInlineChars).toBeLessThanOrEqual(12_000);
    }
  });
});

describe("runPipeline — apply mode", () => {
  test("approves registry + locks, injects, dedups shared across agents", async () => {
    const res = await runPipeline(souls, llm, { apply: true, write: false, outRoot: OUT });
    expect(res.applied).toBe(true);
    expect(res.registryPending).toBe(0); // approved
    for (const a of res.agents) {
      expect(a.inject).toBeDefined();
      expect(a.map.extractedChars).toBeGreaterThan(0); // now extracts
    }
    // Shared file written once under _shared/, identical across agents.
    const shared = await readdir(resolve(OUT, "_shared"));
    expect(shared).toContain("IDENTITY.md");
    const id = await Bun.file(resolve(OUT, "_shared", "IDENTITY.md")).text();
    expect(id).toContain("fleet-shared");
    expect(id).not.toContain("— example —");
    expect(id).not.toContain("— eve —");
  });

  test("shared content routed by registry, not re-judged per agent", async () => {
    const res = await runPipeline(souls, llm, { apply: true, write: false, outRoot: OUT });
    for (const a of res.agents) expect(a.sharedCount).toBeGreaterThan(0);
  });
});
