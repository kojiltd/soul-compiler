import { test, expect } from "bun:test";
import {
  TAXONOMY_VERSION,
  normalizeForHash,
  hashSoulContent,
  formatSoulVersion,
  parseSoulVersion,
  mintSoulVersion,
  diffLineage,
  lineageBanner,
} from "../soul-version";
import type { SoulMap } from "../classify";

const mapWith = (chunks: Array<{ id: string; body: string }>): SoulMap =>
  ({
    agent: "example",
    generatedAt: null,
    totalChars: 0,
    soulInlineChars: 0,
    agentsInlineChars: 0,
    byClass: {} as SoulMap["byClass"],
    extractedChars: 0,
    heterogeneousSections: [],
    reviewCount: 0,
    chunks: chunks.map((c) => ({ ...c, heading: c.id, class: "core-being", confidence: 1 })),
  }) as unknown as SoulMap;

test("version is deterministic — same content mints the same id", () => {
  const content = "## 一、鐵律\n唔准捏造。";
  const map = mapWith([{ id: "a", body: content }]);
  const a = mintSoulVersion("example", content, map, { compilerCommit: "deadbeef" });
  const b = mintSoulVersion("example", content, map, { compilerCommit: "deadbeef" });
  expect(a.soulVersion).toBe(b.soulVersion);
});

test("version changes when soul content changes", () => {
  const map = mapWith([{ id: "a", body: "x" }]);
  const a = mintSoulVersion("example", "## 鐵律\n唔准捏造。", map, { compilerCommit: null });
  const b = mintSoulVersion("example", "## 鐵律\n唔准捏造。加一句。", map, { compilerCommit: null });
  expect(a.soulVersion).not.toBe(b.soulVersion);
});

test("generated banners and fold markers do not change identity", () => {
  const bare = "## 鐵律\n唔准捏造。";
  const banner = "<!-- SC2.0 generated — example — SOUL.md. DO NOT hand-edit; recompile. -->\n\n" + bare;
  const folded = bare + "\n<!-- FOLDED-FROM-LIVE 2026-07-19: recovered from live AGENTS.md -->";
  expect(hashSoulContent(banner)).toBe(hashSoulContent(bare));
  expect(hashSoulContent(folded)).toBe(hashSoulContent(bare));
});

test("trailing whitespace does not change identity", () => {
  expect(hashSoulContent("## 鐵律   \n唔准捏造。  \n")).toBe(hashSoulContent("## 鐵律\n唔准捏造。"));
});

test("normalizeForHash strips generated lines but keeps real content", () => {
  const out = normalizeForHash("<!-- SC2.0 generated — x -->\n## 鐵律\n唔准捏造。");
  expect(out).not.toContain("SC2.0 generated");
  expect(out).toContain("唔准捏造。");
});

test("different agents with identical text mint different versions", () => {
  const content = "## 鐵律\n唔准捏造。";
  const map = mapWith([{ id: "a", body: content }]);
  const s = mintSoulVersion("example", content, map, { compilerCommit: null });
  const k = mintSoulVersion("kira", content, map, { compilerCommit: null });
  expect(s.soulVersion).not.toBe(k.soulVersion);
  expect(s.contentHash).toBe(k.contentHash); // same text, different identity
});

test("format and parse round-trip", () => {
  const v = formatSoulVersion("example", "v2", "3f9a2c1d8b04");
  expect(v).toBe("example-soul-v2+3f9a2c1d8b04");
  expect(parseSoulVersion(v)).toEqual({ agent: "example", taxonomyVersion: "v2", contentHash: "3f9a2c1d8b04" });
});

test("parse rejects malformed versions", () => {
  expect(parseSoulVersion("not-a-version")).toBeNull();
  expect(parseSoulVersion("example-soul-v2+xyz")).toBeNull();
});

test("model is not part of soul identity — re-platforming must not change the prism", () => {
  // Refractive-memory SETTLED §7: soul_version and model_id are separate axes.
  const content = "## 鐵律\n唔准捏造。";
  const map = mapWith([{ id: "a", body: content }]);
  const onQwen = mintSoulVersion("example", content, map, { compilerCommit: "aaa" });
  const onClaude = mintSoulVersion("example", content, map, { compilerCommit: "aaa" });
  expect(onQwen.soulVersion).toBe(onClaude.soulVersion);
  expect(JSON.stringify(onQwen)).not.toContain("model");
});

test("compiler commit is recorded but does not affect identity", () => {
  const content = "## 鐵律\n唔准捏造。";
  const map = mapWith([{ id: "a", body: content }]);
  const a = mintSoulVersion("example", content, map, { compilerCommit: "aaaaaaaa" });
  const b = mintSoulVersion("example", content, map, { compilerCommit: "bbbbbbbb" });
  expect(a.soulVersion).toBe(b.soulVersion);
  expect(a.compilerCommit).toBe("aaaaaaaa");
  expect(b.compilerCommit).toBe("bbbbbbbb");
});

test("timestamp is recorded but does not affect identity", () => {
  const content = "## 鐵律\n唔准捏造。";
  const map = mapWith([{ id: "a", body: content }]);
  const a = mintSoulVersion("example", content, map, { compilerCommit: null, stampedAt: "2026-07-19" });
  const b = mintSoulVersion("example", content, map, { compilerCommit: null, stampedAt: "2026-08-01" });
  expect(a.soulVersion).toBe(b.soulVersion);
});

test("diffLineage reports unchanged for an identical recompile", () => {
  const content = "## 鐵律\n唔准捏造。";
  const map = mapWith([{ id: "a", body: "x" }, { id: "b", body: "y" }]);
  const prev = mintSoulVersion("example", content, map, { compilerCommit: null });
  const next = mintSoulVersion("example", content, map, { compilerCommit: null });
  const d = diffLineage(prev, next);
  expect(d.unchanged).toBe(true);
  expect(d.added).toEqual([]);
  expect(d.removed).toEqual([]);
  expect(d.modified).toEqual([]);
});

test("diffLineage pinpoints which chunk moved", () => {
  const prev = mintSoulVersion("example", "v1", mapWith([{ id: "a", body: "x" }, { id: "b", body: "y" }]), {
    compilerCommit: null,
  });
  const next = mintSoulVersion("example", "v2", mapWith([{ id: "a", body: "x" }, { id: "b", body: "CHANGED" }, { id: "c", body: "z" }]), {
    compilerCommit: null,
  });
  const d = diffLineage(prev, next);
  expect(d.unchanged).toBe(false);
  expect(d.modified).toEqual(["b"]);
  expect(d.added).toEqual(["c"]);
  expect(d.removed).toEqual([]);
});

test("lineage records chunk hashes and parent", () => {
  const map = mapWith([{ id: "a", body: "x" }]);
  const l = mintSoulVersion("example", "content", map, { parent: "example-soul-v2+000000000000", compilerCommit: null });
  expect(l.parent).toBe("example-soul-v2+000000000000");
  expect(Object.keys(l.chunkHashes)).toEqual(["a"]);
  expect(l.taxonomyVersion).toBe(TAXONOMY_VERSION);
  expect(l.chunkCount).toBe(1);
});

test("banner embeds the version so the live artifact self-identifies", () => {
  const map = mapWith([{ id: "a", body: "x" }]);
  const l = mintSoulVersion("example", "content", map, { compilerCommit: "abc123def456" });
  const b = lineageBanner(l);
  expect(b).toContain(l.soulVersion);
  expect(b).toContain("compiler=abc123def456");
});
