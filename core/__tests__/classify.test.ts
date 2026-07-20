import { test, expect, describe } from "bun:test";
import {
  SOUL_CLASSES,
  chunkSoul,
  cleanPreamble,
  splitChunkBullets,
  parseClassification,
  routeChunk,
  buildSoulMap,
  classify,
  DEFAULT_EXAMPLES_KEPT_INLINE,
  EXTRACT_CONFIDENCE_FLOOR,
  type ChunkClassification,
} from "../classify";

const SAMPLE = `# Agent — TRUE SOUL
preamble metadata line

## 〇 我係邊個
我係 Agent，系統管理員。

## 六人群 HARD RULES
唔好喺六人群洗版。互相尊重。

## 工具紀律
qwen 唔好用內建 tool 代替真 tool。

## Grounding facts
Principal is a pre-revenue solo founder — never fabricate revenue figures.

## 領展持倉
0823.HK 7100 股，平均 $41.92。

## ops procedures
1. 收到 BR trigger 2. 跑 OCR 3. 寫入 NC。

## 對話示範
User: status today? Agent: systems healthy, backup complete.
`;

describe("chunkSoul", () => {
  test("splits at ## headings and keeps the preamble", () => {
    const chunks = chunkSoul(SAMPLE);
    expect(chunks[0].heading).toBe("(preamble)");
    expect(chunks.map((c) => c.heading)).toContain("六人群 HARD RULES");
    expect(chunks.map((c) => c.heading)).toContain("ops procedures");
  });

  test("drops no content — every chunk has non-empty body or heading", () => {
    const chunks = chunkSoul(SAMPLE);
    for (const c of chunks) expect(c.chars).toBeGreaterThan(0);
  });

  test("ids are unique even for duplicate headings", () => {
    const dup = "## Notes\na\n\n## Notes\nb\n";
    const ids = chunkSoul(dup).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("CJK-only headings still get a stable non-empty id", () => {
    const chunks = chunkSoul("## 現實錨\nx\n");
    expect(chunks[0].id.length).toBeGreaterThan(0);
  });
});

describe("cleanPreamble", () => {
  const messy = `# Agent — SOUL 2.0 (chunked from live deploy)
<!-- soul.lock/v1
  0 abc shared.guardrail.x
-->
# END OF SOUL

# Agent — SOUL 2.0
# Fresh distill 2026-06-13 (SC2.0 · fused · credential-stripped)
# WARNING: auto-generated. Do NOT edit directly.
---
真實身份序言。`;

  test("strips soul.lock comment, provenance headers, END OF SOUL, dup titles", () => {
    const out = cleanPreamble(messy);
    expect(out).not.toContain("soul.lock");
    expect(out).not.toContain("END OF SOUL");
    expect(out).not.toContain("Fresh distill");
    expect(out).not.toContain("WARNING");
    expect(out).not.toContain("auto-generated");
  });

  test("keeps the first real title and genuine prose", () => {
    const out = cleanPreamble(messy);
    expect(out).toContain("# Agent — SOUL 2.0 (chunked from live deploy)");
    expect(out).toContain("真實身份序言。");
    // only ONE title line survives
    expect(out.match(/^# Agent/gm)?.length).toBe(1);
  });

  test("empty / all-metadata preamble collapses to empty", () => {
    expect(cleanPreamble("<!-- x -->\n# END OF SOUL\n---")).toBe("");
  });
});

describe("parseClassification", () => {
  test("parses a clean JSON array", () => {
    const raw = '[{"id":"a","class":"core-being","confidence":0.9,"rationale":"r"}]';
    const out = parseClassification(raw);
    expect(out).toHaveLength(1);
    expect(out[0].class).toBe("core-being");
  });

  test("tolerates code fences and surrounding prose", () => {
    const raw = 'Here:\n```json\n[{"id":"a","class":"example","confidence":0.8}]\n```\ndone';
    const out = parseClassification(raw);
    expect(out[0].id).toBe("a");
    expect(out[0].class).toBe("example");
  });

  test("drops entries with invalid/unknown class", () => {
    const raw = '[{"id":"a","class":"nonsense","confidence":1},{"id":"b","class":"ops-skill","confidence":1}]';
    const out = parseClassification(raw);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });

  test("returns [] on non-JSON garbage", () => {
    expect(parseClassification("the model refused")).toEqual([]);
  });

  test("clamps confidence into 0..1 and defaults missing to 0.5", () => {
    const raw = '[{"id":"a","class":"core-being","confidence":5},{"id":"b","class":"core-being"}]';
    const out = parseClassification(raw);
    expect(out[0].confidence).toBe(1);
    expect(out[1].confidence).toBe(0.5);
  });
});

describe("routeChunk — deterministic taxonomy", () => {
  const cases: Array<[ChunkClassification, string]> = [
    [{ id: "1", class: "core-being", confidence: 1, rationale: "" }, "soul-inline"],
    [{ id: "2", class: "core-rules", confidence: 1, rationale: "" }, "agents-inline"],
    [{ id: "3", class: "model-calibration", confidence: 1, rationale: "" }, "calibration"],
    [{ id: "4", class: "reference-grounding", confidence: 1, rationale: "" }, "bootstrap-file"],
    [{ id: "5", class: "reference-lookup", confidence: 1, rationale: "" }, "l4"],
    [{ id: "6", class: "ops-skill", confidence: 1, rationale: "" }, "skill"],
    [{ id: "7", class: "example", confidence: 1, rationale: "" }, "example-store"],
  ];
  for (const [c, kind] of cases) {
    test(`${c.class} → ${kind}`, () => {
      expect(routeChunk(c, 6).kind).toBe(kind);
    });
  }

  test("shared-guardrail sharedKey routes 六人群 → IDENTITY.md, tool → TOOLS.md", () => {
    const six = routeChunk({ id: "a", class: "shared-guardrail", confidence: 1, rationale: "", sharedKey: "six-group-hard-rules" }, 6);
    const tool = routeChunk({ id: "b", class: "shared-guardrail", confidence: 1, rationale: "", sharedKey: "qwen-tool-discipline" }, 6);
    expect(six).toEqual({ kind: "bootstrap-file", basename: "IDENTITY.md", shared: true });
    expect(tool).toEqual({ kind: "bootstrap-file", basename: "TOOLS.md", shared: true });
  });

  test("reference-grounding lands in USER.md", () => {
    const d = routeChunk({ id: "g", class: "reference-grounding", confidence: 1, rationale: "" }, 6);
    expect(d).toEqual({ kind: "bootstrap-file", basename: "USER.md", shared: true });
  });

  test("example keepInline default flows through", () => {
    const d = routeChunk({ id: "e", class: "example", confidence: 1, rationale: "" }, DEFAULT_EXAMPLES_KEPT_INLINE);
    expect(d).toEqual({ kind: "example-store", keepInline: DEFAULT_EXAMPLES_KEPT_INLINE });
  });
});

describe("buildSoulMap — safety invariants", () => {
  const chunks = chunkSoul(SAMPLE);

  test("omitted chunk defaults to core-being (kept inline, never dropped)", () => {
    const map = buildSoulMap("example", chunks, []); // no classifications at all
    expect(map.extractedChars).toBe(0);
    expect(map.soulInlineChars).toBe(map.totalChars);
    for (const c of map.chunks) expect(c.dest.kind).toBe("soul-inline");
  });

  test("low-confidence extraction is coerced back to inline", () => {
    const target = chunks.find((c) => c.heading.includes("六人群"))!;
    const cls: ChunkClassification[] = [
      { id: target.id, class: "shared-guardrail", confidence: EXTRACT_CONFIDENCE_FLOOR - 0.1, rationale: "", sharedKey: "six-group-hard-rules" },
    ];
    const map = buildSoulMap("example", chunks, cls);
    const mapped = map.chunks.find((c) => c.id === target.id)!;
    expect(mapped.dest.kind).toBe("soul-inline");
    expect(mapped.class).toBe("core-being");
  });

  test("high-confidence extraction is honored and counted as extracted", () => {
    const target = chunks.find((c) => c.heading.includes("六人群"))!;
    const cls: ChunkClassification[] = [
      { id: target.id, class: "shared-guardrail", confidence: 0.95, rationale: "", sharedKey: "six-group-hard-rules" },
    ];
    const map = buildSoulMap("example", chunks, cls);
    const mapped = map.chunks.find((c) => c.id === target.id)!;
    expect(mapped.dest).toEqual({ kind: "bootstrap-file", basename: "IDENTITY.md", shared: true });
    expect(map.extractedChars).toBeGreaterThan(0);
  });

  test("char accounting is conserved: soul + agents + extracted = total", () => {
    const map = buildSoulMap("example", chunks, []);
    expect(map.soulInlineChars + map.agentsInlineChars + map.extractedChars).toBe(map.totalChars);
  });

  test("byClass counts cover every chunk", () => {
    const map = buildSoulMap("example", chunks, []);
    const counted = SOUL_CLASSES.reduce((a, c) => a + map.byClass[c], 0);
    expect(counted).toBe(chunks.length);
  });
});

describe("classify — orchestrator with mocked LLM", () => {
  test("end-to-end routes a realistic classification, no write", async () => {
    const chunks = chunkSoul(SAMPLE);
    const id = (h: string) => chunks.find((c) => c.heading.includes(h))!.id;
    const llm = async () =>
      JSON.stringify([
        { id: id("我係邊個"), class: "core-being", confidence: 0.95, rationale: "" },
        { id: id("六人群"), class: "shared-guardrail", confidence: 0.9, sharedKey: "six-group-hard-rules", rationale: "" },
        { id: id("工具紀律"), class: "shared-guardrail", confidence: 0.9, sharedKey: "qwen-tool-discipline", rationale: "" },
        { id: id("Grounding"), class: "reference-grounding", confidence: 0.9, rationale: "" },
        { id: id("領展持倉"), class: "reference-lookup", confidence: 0.9, rationale: "" },
        { id: id("ops procedures"), class: "ops-skill", confidence: 0.9, rationale: "" },
        { id: id("對話示範"), class: "example", confidence: 0.9, rationale: "" },
      ]);
    const res = await classify("example", SAMPLE, llm, { write: false });
    expect(res.ok).toBe(true);
    expect(res.map.byClass["shared-guardrail"]).toBe(2);
    expect(res.map.extractedChars).toBeGreaterThan(0);
    // preamble + core-being stay inline
    expect(res.map.soulInlineChars).toBeGreaterThan(0);
  });

  test("LLM garbage keeps everything inline (fails safe)", async () => {
    const llm = async () => "I cannot help with that";
    const res = await classify("example", SAMPLE, llm, { write: false });
    expect(res.ok).toBe(false);
    expect(res.map.extractedChars).toBe(0);
    expect(res.map.soulInlineChars).toBe(res.map.totalChars);
  });
});

const JUNK_DRAWER = `# Eve — soul

## 八、運行細節
- **運維 checklist**：incident act first，document later。
- **Office**：星期一至五 10:00-18:00，週末 work from home。
- **共享記憶**：我同其他 agent 共享記憶，唔好次次提。
- **狀態轉換**：日常 → 深夜 → vulnerable，自然流動。

## 〇、我係邊個
我係 Eve。
`;

describe("splitChunkBullets", () => {
  test("splits a bullet list into per-bullet sub-chunks with parent set", () => {
    const section = chunkSoul(JUNK_DRAWER).find((c) => c.heading.includes("運行細節"))!;
    const sub = splitChunkBullets(section);
    expect(sub.length).toBe(4);
    for (const s of sub) {
      expect(s.parent).toBe(section.id);
      expect(s.id.startsWith(section.id + "::")).toBe(true);
    }
    expect(sub.map((s) => s.heading)).toContain("共享記憶");
  });

  test("prose section (no bullets) returns unchanged", () => {
    const prose = chunkSoul(JUNK_DRAWER).find((c) => c.heading.includes("我係邊個"))!;
    expect(splitChunkBullets(prose)).toEqual([prose]);
  });

  test("lead text before the first bullet is preserved as a sub-chunk", () => {
    const c = chunkSoul("## S\nintro line\n- a\n- b\n")[0];
    const sub = splitChunkBullets(c);
    expect(sub.length).toBe(3); // lead + 2 bullets
    expect(sub[0].heading).toContain("lead");
  });
});

describe("parseClassification — heterogeneous + altClass", () => {
  test("parses heterogeneous flag and altClass", () => {
    const raw =
      '[{"id":"x","class":"ops-skill","confidence":0.7,"heterogeneous":true,"altClass":"core-being"}]';
    const out = parseClassification(raw);
    expect(out[0].heterogeneous).toBe(true);
    expect(out[0].altClass).toBe("core-being");
  });

  test("invalid altClass is dropped, not thrown", () => {
    const raw = '[{"id":"x","class":"core-being","confidence":1,"altClass":"bogus"}]';
    expect(parseClassification(raw)[0].altClass).toBeUndefined();
  });
});

describe("buildSoulMap — review flag", () => {
  test("torn classification (altClass differs) flags review", () => {
    const chunks = chunkSoul(JUNK_DRAWER);
    const target = chunks.find((c) => c.heading.includes("我係邊個"))!;
    const map = buildSoulMap("eve", chunks, [
      { id: target.id, class: "core-being", confidence: 0.9, rationale: "", altClass: "core-rules" },
    ]);
    expect(map.reviewCount).toBe(1);
    expect(map.chunks.find((c) => c.id === target.id)!.review).toBe(true);
  });
});

describe("classify — heterogeneous two-pass", () => {
  test("flagged section is bullet-split and reclassified in pass 2", async () => {
    const chunks = chunkSoul(JUNK_DRAWER);
    const sectionId = chunks.find((c) => c.heading.includes("運行細節"))!.id;

    const llm = async (prompt: string): Promise<string> => {
      // Pass 2 prompt contains the bullet sub-chunk ids ("<id>::1").
      if (prompt.includes(`${sectionId}::`)) {
        return JSON.stringify([
          { id: `${sectionId}::1`, class: "ops-skill", confidence: 0.9 },
          { id: `${sectionId}::2`, class: "reference-grounding", confidence: 0.9 },
          { id: `${sectionId}::3`, class: "shared-guardrail", confidence: 0.9, sharedKey: "shared-memory-etiquette" },
          { id: `${sectionId}::4`, class: "core-being", confidence: 0.9 },
        ]);
      }
      // Pass 1: flag the junk-drawer section heterogeneous.
      return JSON.stringify([
        { id: sectionId, class: "ops-skill", confidence: 0.7, heterogeneous: true },
      ]);
    };

    const res = await classify("eve", JUNK_DRAWER, llm, { write: false });
    expect(res.map.heterogeneousSections).toContain(sectionId);
    // The 共享記憶 bullet now routes to a shared file, not buried in ops.
    const shared = res.map.chunks.find((c) => c.sharedKey === "shared-memory-etiquette");
    expect(shared?.dest).toEqual({ kind: "bootstrap-file", basename: "IDENTITY.md", shared: true });
    // Sub-chunks carry the parent link.
    expect(res.map.chunks.some((c) => c.parent === sectionId)).toBe(true);
    // The parent section itself is gone (replaced by its bullets).
    expect(res.map.chunks.some((c) => c.id === sectionId)).toBe(false);
  });
});
