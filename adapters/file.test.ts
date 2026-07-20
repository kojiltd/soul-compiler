import { test, expect, describe, afterAll } from "bun:test";
import { resolve } from "node:path";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { chunkSoul, buildSoulMap, type ChunkClassification } from "../core/classify";
import { injectToFiles, rebuildChunks } from "./file";

const SOUL = `# Agent — soul
preamble

## 六人群 HARD RULES
唔好洗版。

## 一、鐵律
唔捏造數字。

## 〇、我係邊個
我係 Agent。

## 二、我點諗嘢
第一原理。

## 七、Koji 現實錨
principal pre-revenue。

## 領展持倉
0823.HK 7100 股。

## 八、運行細節
- **運維**：act first。
- **共享記憶**：唔好次次提。

## 九、場景
User: status? Agent: healthy.
`;

const OUT = resolve(tmpdir(), `sc2-inject-test-${process.pid}`);
afterAll(async () => {
  await rm(OUT, { recursive: true, force: true });
});

function classifySoul(): ReturnType<typeof buildSoulMap> {
  const chunks = chunkSoul(SOUL);
  const id = (h: string) => chunks.find((c) => c.heading.includes(h))!.id;
  const cls: ChunkClassification[] = [
    { id: id("六人群"), class: "shared-guardrail", confidence: 0.95, rationale: "", sharedKey: "six-group-hard-rules" },
    { id: id("鐵律"), class: "core-rules", confidence: 0.95, rationale: "" },
    { id: id("我係邊個"), class: "core-being", confidence: 0.95, rationale: "" },
    { id: id("我點諗嘢"), class: "core-being", confidence: 0.95, rationale: "" },
    { id: id("現實錨"), class: "reference-grounding", confidence: 0.95, rationale: "" },
    { id: id("領展持倉"), class: "reference-lookup", confidence: 0.95, rationale: "" },
    { id: id("運行細節"), class: "ops-skill", confidence: 0.95, rationale: "" },
    { id: id("場景"), class: "example", confidence: 0.95, rationale: "" },
  ];
  return buildSoulMap("example", chunks, cls);
}

describe("rebuildChunks", () => {
  test("reproduces every manifest chunk id with its body", () => {
    const map = classifySoul();
    const bodies = rebuildChunks(SOUL, map);
    for (const mc of map.chunks) expect(bodies.has(mc.id)).toBe(true);
  });
});

describe("injectToFiles", () => {
  test("writes one file per destination, none over the 12K cap", async () => {
    const map = classifySoul();
    const res = await injectToFiles("example", SOUL, map, { outDir: OUT });
    expect(res.ok).toBe(true);
    const names = res.files.map((f) => f.path).sort();
    expect(names).toContain("SOUL.md");
    expect(names).toContain("AGENTS.md");
    expect(names).toContain("IDENTITY.md");
    expect(names).toContain("USER.md");
    expect(names).toContain("reference/example.reference.md");
    expect(names).toContain("examples/example.examples.md");
    for (const f of res.files) expect(f.overCap).toBe(false);
  });

  test("core-being preamble + identity land in SOUL.md; rules in AGENTS.md", async () => {
    const map = classifySoul();
    const res = await injectToFiles("example", SOUL, map, { outDir: OUT });
    const soul = await Bun.file(resolve(OUT, "SOUL.md")).text();
    const agents = await Bun.file(resolve(OUT, "AGENTS.md")).text();
    expect(soul).toContain("我係 Agent");
    expect(soul).toContain("第一原理");
    expect(agents).toContain("唔捏造數字");
    expect(soul).not.toContain("唔捏造數字"); // rule moved out of soul
  });

  test("shared guardrail → IDENTITY.md, grounding → USER.md, lookup → reference file", async () => {
    const map = classifySoul();
    await injectToFiles("example", SOUL, map, { outDir: OUT });
    expect(await Bun.file(resolve(OUT, "IDENTITY.md")).text()).toContain("唔好洗版");
    expect(await Bun.file(resolve(OUT, "USER.md")).text()).toContain("principal pre-revenue");
    expect(await Bun.file(resolve(OUT, "reference/example.reference.md")).text()).toContain("0823.HK");
  });

  test("SOUL.md carries a pointer footer to extracted content", async () => {
    const map = classifySoul();
    await injectToFiles("example", SOUL, map, { outDir: OUT });
    const soul = await Bun.file(resolve(OUT, "SOUL.md")).text();
    expect(soul).toContain("SC2.0 map");
    expect(soul).toContain("IDENTITY.md");
  });

  test("IDENTITY.md is marked shared (symlink candidate)", async () => {
    const map = classifySoul();
    const res = await injectToFiles("example", SOUL, map, { outDir: OUT });
    expect(res.files.find((f) => f.path === "IDENTITY.md")!.shared).toBe(true);
    expect(res.files.find((f) => f.path === "SOUL.md")!.shared).toBe(false);
  });

  test("lossless mode folds skill/l4/calibration/example into native bootstrap files only", async () => {
    const chunks = chunkSoul(SOUL);
    const id = (h: string) => chunks.find((c) => c.heading.includes(h))!.id;
    const cls = [
      { id: id("我係邊個"), class: "core-being" as const, confidence: 1, rationale: "" },
      { id: id("鐵律"), class: "core-rules" as const, confidence: 1, rationale: "" },
      { id: id("運行細節"), class: "ops-skill" as const, confidence: 1, rationale: "" },
      { id: id("領展持倉"), class: "reference-lookup" as const, confidence: 1, rationale: "" },
      { id: id("場景"), class: "example" as const, confidence: 1, rationale: "" },
      { id: id("現實錨"), class: "reference-grounding" as const, confidence: 1, rationale: "" },
    ];
    const map = buildSoulMap("example", chunks, cls);
    const out = resolve(OUT, "lossless");
    const res = await injectToFiles("example", SOUL, map, { outDir: out, lossless: true, standalone: true });
    const NATIVE = new Set(["SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "USER.md"]);
    for (const f of res.files) expect(NATIVE.has(f.path)).toBe(true); // nothing in skills/reference/examples
    // ops folded into AGENTS, lookup + grounding into USER, example into SOUL
    expect((await Bun.file(resolve(out, "AGENTS.md")).text())).toContain("運維"); // ops procedure text
    expect((await Bun.file(resolve(out, "USER.md")).text())).toContain("0823.HK"); // reference folded
    expect((await Bun.file(resolve(out, "SOUL.md")).text())).toContain("Agent: healthy."); // example folded
  });

  test("canonical (registry) shared chunk writes to _shared/ with a fleet header (no agent name)", async () => {
    const chunks = chunkSoul(SOUL);
    const id = (h: string) => chunks.find((c) => c.heading.includes(h))!.id;
    // Mark 六人群 as canonical (as the shared-registry wiring would).
    const cls = [
      { id: id("六人群"), class: "shared-guardrail" as const, confidence: 1, rationale: "", sharedKey: "six-group-hard-rules", canonical: true },
      { id: id("我係邊個"), class: "core-being" as const, confidence: 1, rationale: "" },
    ];
    const map = buildSoulMap("example", chunks, cls);
    const shared = resolve(OUT, "_shared_test");
    const res = await injectToFiles("example", SOUL, map, { outDir: resolve(OUT, "agentdir"), sharedDir: shared });
    const f = res.files.find((x) => x.path === "_shared/IDENTITY.md");
    expect(f).toBeDefined();
    const content = await Bun.file(resolve(shared, "IDENTITY.md")).text();
    expect(content).toContain("fleet-shared");
    expect(content).not.toContain("— example —"); // no agent name → byte-identical across agents
    expect(content).toContain("唔好洗版");
  });
});
