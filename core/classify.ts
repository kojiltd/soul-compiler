/**
 * Soul Compiler 2.0 — Review & Classify engine (SC2.0 §2-3, the new heart).
 *
 * Takes an assembled soul, holistically reviews it via the LLM, and classifies
 * each chunk into the BEING-vs-KNOWING taxonomy. Deterministic code then routes
 * each class to a destination and emits a `soul.map.json` routing manifest.
 *
 * Division of labour: the LLM REVIEWS and LABELS (judgment); this
 * module ROUTES and EMITS (logistics). The model never picks physical paths.
 *
 * Heterogeneous sections: a single `##` "junk-drawer" section can mix classes
 * (e.g. `運行細節` = ops + lifestyle + boundaries + voice). Pass 1 lets the LLM
 * flag such a chunk `heterogeneous`; pass 2 splits it into bullet sub-chunks and
 * reclassifies each so a mixed section is not forced into one wrong class. (§12)
 *
 * Safety invariant: a chunk the LLM omits or marks low-confidence defaults to
 * `core-being` (stays inline). Extraction = removal from the soul = risk, so the
 * uncertain case keeps content IN the soul, never silently drops it (doc §8).
 *
 * Design write-up: docs/compiling-agent-identity.md
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMCallFn } from "./compile.ts";

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

/** What the LLM labels each chunk as. Maps deterministically to a Destination. */
export const SOUL_CLASSES = [
  "core-being", // BEING: identity, voice, cognition, 軟肋, 屋企人 → SOUL.md (inline)
  "core-rules", // iron/critical/safety rules → AGENTS.md (survives compaction)
  "shared-guardrail", // 六人群 rules / tool discipline → shared bootstrap file
  "model-calibration", // qwen 代詞消歧 etc. → already §3-injected; flag, do not re-extract
  "reference-grounding", // always-true 現實錨 → USER.md (every-turn)
  "reference-lookup", // topic-gated facts (portfolio, milestones) → L4 (retrieval)
  "ops-skill", // operational procedures → runtime skill (load-on-trigger)
  "example", // dialogues → keep best N inline, rest external
] as const;

export type SoulClass = (typeof SOUL_CLASSES)[number];

export type Destination =
  | { kind: "soul-inline" }
  | { kind: "agents-inline" }
  | { kind: "bootstrap-file"; basename: "IDENTITY.md" | "TOOLS.md" | "USER.md"; shared: boolean; canonical?: boolean }
  | { kind: "calibration" }
  | { kind: "l4"; collection: string }
  | { kind: "skill"; id: string }
  | { kind: "example-store"; keepInline: number };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SoulChunk = {
  id: string; // stable slug-N; bullet sub-chunks are "<parentId>::<n>"
  heading: string;
  level: number; // markdown heading depth (2 = ##, 3 = ###); 0 for sub-bullets
  body: string; // chunk text WITHOUT the heading line
  chars: number; // full chunk length incl. heading
  parent?: string; // set on bullet sub-chunks → originating section id
};

export type ChunkClassification = {
  id: string;
  class: SoulClass;
  confidence: number; // 0..1
  rationale: string;
  sharedKey?: string; // e.g. "six-group-hard-rules", "qwen-tool-discipline"
  heterogeneous?: boolean; // LLM: this chunk mixes classes → split to bullets
  altClass?: SoulClass; // second-most-likely class when torn → flags review
  canonical?: boolean; // resolved from the shared registry (fleet-identical source)
};

export type MappedChunk = ChunkClassification & {
  heading: string;
  chars: number;
  dest: Destination;
  parent?: string; // bullet sub-chunk → originating section id
  review?: boolean; // torn classification (altClass differs) — human glance
};

export type SoulMap = {
  agent: string;
  generatedAt: string | null; // stamped by caller (Date unavailable in some runtimes)
  totalChars: number;
  soulInlineChars: number; // projected lean SOUL.md size (core-being + low-confidence)
  agentsInlineChars: number; // projected AGENTS.md size (core-rules)
  byClass: Record<SoulClass, number>; // chunk count per class
  extractedChars: number; // chars leaving the soul/agents files
  heterogeneousSections: string[]; // section ids that were bullet-split in pass 2
  reviewCount: number; // chunks flagged for human review
  chunks: MappedChunk[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

/** Default number of example dialogues kept inline; the rest are externalized. */
export const DEFAULT_EXAMPLES_KEPT_INLINE = 6;

const L4_REFERENCE_COLLECTION = "reference";

/**
 * Confidence below this keeps the chunk inline regardless of the LLM's label —
 * uncertain extraction is the dangerous direction (silent content loss).
 */
export const EXTRACT_CONFIDENCE_FLOOR = 0.6;

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/** Slugify a heading into a short ascii-ish id stem. */
function slugifyHeading(heading: string): string {
  const ascii = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // CJK headings yield empty ascii — fall back to a stable hash of the heading.
  if (ascii.length > 0) return ascii.slice(0, 32);
  let h = 0;
  for (const ch of heading) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `h${h.toString(36)}`;
}

/**
 * Split an assembled soul into chunks at `##`/`###` markdown headings.
 * Preamble before the first heading (header/metadata) becomes one chunk so no
 * content is dropped. Chunk ids are unique (slug, then slug-2, slug-3, ...).
 */
export function chunkSoul(content: string): SoulChunk[] {
  const lines = content.split("\n");
  const chunks: SoulChunk[] = [];
  const seen = new Map<string, number>();

  let heading = "(preamble)";
  let level = 0;
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    const headingLine = level > 0 ? `${"#".repeat(level)} ${heading}\n` : "";
    const full = (headingLine + body).trim();
    if (full.length === 0) return;
    const stem = slugifyHeading(heading);
    const n = (seen.get(stem) ?? 0) + 1;
    seen.set(stem, n);
    chunks.push({
      id: n === 1 ? stem : `${stem}-${n}`,
      heading,
      level,
      body,
      chars: full.length,
    });
  };

  for (const line of lines) {
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      flush();
      level = m[1].length;
      heading = m[2];
      buf = [];
    } else {
      buf.push(line);
    }
  }
  flush();
  return chunks;
}

/**
 * Strip distill-toolchain noise that the layered fused-distill scatters through a
 * live soul: HTML comments (`<!-- soul.lock … -->`, `<!-- section: XX -->`),
 * provenance/marker h1 lines (`# END OF SOUL`, `# Fresh distill …`, `# WARNING …`),
 * and bare `---` separators. Keeps real titles and prose. Applied to EVERY chunk
 * body so scattered cruft is removed wherever it sits, not only in the preamble.
 * NB: "chunked from" is intentionally NOT a marker — it appears in real titles.
 */
export function stripGeneratedNoise(text: string, opts?: { stripTitles?: boolean }): string {
  const noComments = text.replace(/<!--[\s\S]*?-->/g, "");
  const isProvenanceH1 = (l: string) =>
    /^#{1,6}\s/.test(l) &&
    /(distill|auto[- ]?generated|WARNING|sources?:|generated by|DO NOT EDIT|呢份係身份|credential-stripped|END OF SOUL)/i.test(l);
  // In section bodies (not the preamble), a `# … SOUL 2.0` h1 is a stray layered-
  // distill title, not content — drop it. The preamble keeps its real title.
  const isStrayTitle = (l: string) => opts?.stripTitles === true && /^#{1,3}\s.*(SOUL\s*2\.0|—\s*SOUL)/i.test(l);
  return noComments
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !isProvenanceH1(t) && !isStrayTitle(t) && !/^-{3,}$/.test(t);
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Clean the preamble for the lean SOUL.md: strip generated noise, then keep only
 * the FIRST title line (the layered distill repeats `# <Agent> — SOUL 2.0`).
 */
export function cleanPreamble(body: string): string {
  const cleaned = stripGeneratedNoise(body);
  const kept: string[] = [];
  let titleKept = false;
  for (const l of cleaned.split("\n")) {
    if (/^#{1,6}\s+\S/.test(l)) {
      if (titleKept) continue; // drop duplicate titles
      titleKept = true;
    }
    kept.push(l);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A line that starts a new bullet: `- `, `* `, or a bold label `**x**：`/`**x**:`. */
function isBulletStart(line: string): boolean {
  return /^\s*[-*]\s+\S/.test(line) || /^\s*\*\*.+?\*\*\s*[：:]/.test(line);
}

/** Derive a short heading label from a bullet line. */
function bulletLabel(line: string): string {
  const cleaned = line.replace(/^\s*[-*]\s+/, "").replace(/\*\*/g, "").trim();
  const cut = cleaned.split(/[：:（(]/)[0].trim();
  return (cut || cleaned).slice(0, 40);
}

/**
 * Split a heterogeneous section into bullet-level sub-chunks. Continuation lines
 * attach to the current bullet. Text before the first bullet becomes a "lead"
 * sub-chunk so nothing is dropped. Returns [chunk] unchanged when the body has
 * fewer than 2 bullets (prose — cannot meaningfully sub-split).
 */
export function splitChunkBullets(chunk: SoulChunk): SoulChunk[] {
  const lines = chunk.body.split("\n");
  const groups: { label: string; lines: string[] }[] = [];
  let lead: string[] = [];
  let cur: { label: string; lines: string[] } | null = null;

  for (const line of lines) {
    if (isBulletStart(line)) {
      if (cur) groups.push(cur);
      cur = { label: bulletLabel(line), lines: [line] };
    } else if (cur) {
      cur.lines.push(line);
    } else {
      lead.push(line);
    }
  }
  if (cur) groups.push(cur);

  if (groups.length < 2) return [chunk];

  const sub: SoulChunk[] = [];
  let n = 0;
  const pushSub = (label: string, text: string) => {
    const body = text.trim();
    if (body.length === 0) return;
    n += 1;
    sub.push({ id: `${chunk.id}::${n}`, heading: label, level: 0, body, chars: body.length, parent: chunk.id });
  };
  const leadText = lead.join("\n").trim();
  if (leadText.length > 0) pushSub(`${chunk.heading} (lead)`, leadText);
  for (const g of groups) pushSub(g.label, g.lines.join("\n"));
  return sub;
}

// ---------------------------------------------------------------------------
// LLM contract
// ---------------------------------------------------------------------------

/**
 * Build the holistic review+classify prompt. The model sees ALL chunks at once.
 * `atomic` (pass 2) suppresses the heterogeneous instruction — bullet sub-chunks
 * are already atomic and should not be flagged for further splitting.
 */
export function buildClassifyPrompt(
  agentName: string,
  chunks: SoulChunk[],
  opts?: { atomic?: boolean },
): string {
  const atomic = opts?.atomic ?? false;
  const parts: string[] = [];
  parts.push(`# Holistically review and classify agent soul: ${agentName}`);
  parts.push("");
  parts.push(
    "You are the Review & Classify stage of a soul compiler. The agent's soul is" +
      " assembled below as numbered chunks. The soul file is loaded EVERY turn and" +
      " is truncated past a hard size cap, so growing/shared/reference content must" +
      " be EXTRACTED out, leaving only the bounded identity core inline.",
  );
  parts.push("");
  parts.push("Classify EACH chunk into exactly one class:");
  parts.push(
    [
      "- core-being: identity, voice, cognition, 軟肋, 屋企人 — who the agent IS. Stays inline.",
      "- core-rules: iron / safety / never-do rules specific to THIS agent. Must survive compaction.",
      "- shared-guardrail: rules identical across the agent FLEET — 六人群 group rules, model tool-discipline, 共享記憶 etiquette. Set sharedKey (e.g. six-group-hard-rules, qwen-tool-discipline, shared-memory-etiquette).",
      "- model-calibration: model-family quirks (referent disambiguation, reasoning leakage). Already injected elsewhere — label it so it is NOT duplicated.",
      "- reference-grounding: facts that must hold on EVERY turn regardless of topic (e.g. owner is pre-revenue; never fabricate numbers).",
      "- reference-lookup: facts needed ONLY when topically relevant (portfolio specifics, dated milestones, lookup data). Retrieved on demand.",
      "- ops-skill: step-by-step operational procedures used only when doing that task.",
      "- example: example dialogues / sample exchanges demonstrating voice.",
    ].join("\n"),
  );
  parts.push("");
  parts.push(
    "Discriminator for reference-grounding vs reference-lookup: ground = needed" +
      " every turn (always-on); lookup = topic-gated (only when relevant).",
  );
  if (!atomic) {
    parts.push("");
    parts.push(
      "If a chunk genuinely MIXES multiple classes (a catch-all / junk-drawer" +
        ' section), set "heterogeneous": true and pick the dominant class — it will' +
        " be split into bullets and reclassified. Do NOT force a clean single class" +
        " onto a clearly mixed section.",
    );
  }
  parts.push(
    'When torn between two classes, put the runner-up in "altClass" so it can be reviewed.',
  );
  parts.push("");
  parts.push("## Chunks");
  for (const c of chunks) {
    parts.push(`### [chunk:${c.id}] ${c.heading} (${c.chars} chars)`);
    parts.push(c.body.slice(0, 1200));
    parts.push("");
  }
  parts.push("## Output");
  parts.push("Return ONLY a JSON array, one object per chunk, no prose, no code fence:");
  parts.push(
    '[{"id":"<chunk id>","class":"<one class>","confidence":<0..1>,"rationale":"<short>","sharedKey":"<optional>","heterogeneous":<optional bool>,"altClass":"<optional>"}]',
  );
  return parts.join("\n");
}

/**
 * Defensively parse the LLM's JSON classification. Tolerates code fences and
 * surrounding prose by extracting the outermost [...] array. Drops malformed
 * entries; the caller backfills omitted chunks with the safe default.
 */
export function parseClassification(raw: string): ChunkClassification[] {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const isClass = (v: unknown): v is SoulClass =>
    typeof v === "string" && (SOUL_CLASSES as readonly string[]).includes(v);
  const out: ChunkClassification[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id : null;
    if (!id || !isClass(rec.class)) continue;
    const confidence =
      typeof rec.confidence === "number" && Number.isFinite(rec.confidence)
        ? Math.max(0, Math.min(1, rec.confidence))
        : 0.5;
    out.push({
      id,
      class: rec.class,
      confidence,
      rationale: typeof rec.rationale === "string" ? rec.rationale : "",
      sharedKey: typeof rec.sharedKey === "string" && rec.sharedKey ? rec.sharedKey : undefined,
      heterogeneous: rec.heterogeneous === true ? true : undefined,
      altClass: isClass(rec.altClass) ? rec.altClass : undefined,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic routing (class + sharedKey -> Destination)
// ---------------------------------------------------------------------------

/** Map a shared-guardrail sharedKey to its canonical bootstrap basename. */
function sharedBasename(sharedKey?: string): "IDENTITY.md" | "TOOLS.md" {
  const k = (sharedKey ?? "").toLowerCase();
  if (k.includes("tool")) return "TOOLS.md";
  // six-group / 六人群 group rules, shared-memory etiquette, any shared identity guardrail.
  return "IDENTITY.md";
}

/** Route a classification to a physical destination. Pure + deterministic. */
export function routeChunk(c: ChunkClassification, keepInlineExamples: number): Destination {
  switch (c.class) {
    case "core-being":
      return { kind: "soul-inline" };
    case "core-rules":
      return { kind: "agents-inline" };
    case "shared-guardrail":
      return { kind: "bootstrap-file", basename: sharedBasename(c.sharedKey), shared: true, canonical: c.canonical };
    case "model-calibration":
      return { kind: "calibration" };
    case "reference-grounding":
      return { kind: "bootstrap-file", basename: "USER.md", shared: true };
    case "reference-lookup":
      return { kind: "l4", collection: L4_REFERENCE_COLLECTION };
    case "ops-skill":
      return { kind: "skill", id: c.sharedKey ?? "ops" };
    case "example":
      return { kind: "example-store", keepInline: keepInlineExamples };
  }
}

function emptyByClass(): Record<SoulClass, number> {
  return Object.fromEntries(SOUL_CLASSES.map((c) => [c, 0])) as Record<SoulClass, number>;
}

/** True for destinations that LEAVE the always-loaded SOUL.md/AGENTS.md files. */
function isExtracted(dest: Destination): boolean {
  return dest.kind !== "soul-inline" && dest.kind !== "agents-inline";
}

/**
 * Merge chunks + classifications into a routing manifest. Chunks the LLM omitted,
 * or classified below the confidence floor for an extracting class, are coerced to
 * core-being (stay inline) — the safe direction.
 */
export function buildSoulMap(
  agent: string,
  chunks: SoulChunk[],
  classifications: ChunkClassification[],
  opts?: { keepInlineExamples?: number; heterogeneousSections?: string[] },
): SoulMap {
  const keepInline = opts?.keepInlineExamples ?? DEFAULT_EXAMPLES_KEPT_INLINE;
  const byId = new Map(classifications.map((c) => [c.id, c]));
  const byClass = emptyByClass();
  const mapped: MappedChunk[] = [];

  let soulInlineChars = 0;
  let agentsInlineChars = 0;
  let extractedChars = 0;
  let totalChars = 0;
  let reviewCount = 0;

  for (const chunk of chunks) {
    totalChars += chunk.chars;
    const raw = byId.get(chunk.id);
    // Safety coercion: missing label, or low-confidence extraction → keep inline.
    let c: ChunkClassification =
      raw ?? { id: chunk.id, class: "core-being", confidence: 0, rationale: "unclassified — kept inline (safe default)" };
    let dest = routeChunk(c, keepInline);
    if (isExtracted(dest) && c.confidence < EXTRACT_CONFIDENCE_FLOOR) {
      c = { ...c, class: "core-being", rationale: `low confidence (${c.confidence}) — kept inline; LLM said ${c.class}` };
      dest = { kind: "soul-inline" };
    }

    const review = c.altClass !== undefined && c.altClass !== c.class;
    if (review) reviewCount += 1;

    byClass[c.class] += 1;
    if (dest.kind === "soul-inline") soulInlineChars += chunk.chars;
    else if (dest.kind === "agents-inline") agentsInlineChars += chunk.chars;
    else extractedChars += chunk.chars;

    mapped.push({ ...c, heading: chunk.heading, chars: chunk.chars, dest, parent: chunk.parent, review: review || undefined });
  }

  return {
    agent,
    generatedAt: null,
    totalChars,
    soulInlineChars,
    agentsInlineChars,
    byClass,
    extractedChars,
    heterogeneousSections: opts?.heterogeneousSections ?? [],
    reviewCount,
    chunks: mapped,
  };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export type ClassifyResult = {
  map: SoulMap;
  outputPath: string;
  report: string;
  ok: boolean;
  errors: string[];
};

/** Path where an agent's routing manifest is written. */
export function soulMapPath(agent: string): string {
  return resolve(DATA_DIR, "4_compiled", `${agent}.soul.map.json`);
}

/**
 * Review + classify an already-assembled soul, write `<agent>.soul.map.json`.
 *
 * Two passes: (1) section-level holistic classify; (2) for any section the LLM
 * flags heterogeneous, bullet-split and reclassify those sub-chunks in ONE extra
 * call. The parent section is replaced by its sub-chunks in the manifest.
 *
 * @param agent    agent id
 * @param content  the assembled soul markdown (live soul or fresh compile output)
 * @param llmCall  prompt -> response
 */
export async function classify(
  agent: string,
  content: string,
  llmCall: LLMCallFn,
  opts?: { keepInlineExamples?: number; write?: boolean },
): Promise<ClassifyResult> {
  const errors: string[] = [];
  const chunks = chunkSoul(content);
  if (chunks.length === 0) {
    return { map: buildSoulMap(agent, [], []), outputPath: "", report: "empty soul", ok: false, errors: ["no chunks"] };
  }

  // Pass 1 — section-level holistic classify.
  let pass1: ChunkClassification[] = [];
  try {
    pass1 = parseClassification(await llmCall(buildClassifyPrompt(agent, chunks)));
    if (pass1.length === 0) errors.push("pass 1 returned no parseable classifications — all chunks kept inline");
  } catch (e) {
    errors.push(`pass 1 LLM call failed: ${e instanceof Error ? e.message : String(e)} — all chunks kept inline`);
  }
  const p1 = new Map(pass1.map((c) => [c.id, c]));

  // Expand heterogeneous sections into bullet sub-chunks.
  const expanded: SoulChunk[] = [];
  const heteroSections: string[] = [];
  for (const chunk of chunks) {
    if (p1.get(chunk.id)?.heterogeneous) {
      const sub = splitChunkBullets(chunk);
      if (sub.length > 1) {
        expanded.push(...sub);
        heteroSections.push(chunk.id);
        continue;
      }
    }
    expanded.push(chunk);
  }

  // Pass 2 — reclassify only the new bullet sub-chunks (single batched call).
  const subChunks = expanded.filter((c) => c.parent);
  let pass2: ChunkClassification[] = [];
  if (subChunks.length > 0) {
    try {
      pass2 = parseClassification(await llmCall(buildClassifyPrompt(agent, subChunks, { atomic: true })));
      if (pass2.length === 0) errors.push("pass 2 returned no parseable classifications — sub-chunks kept inline");
    } catch (e) {
      errors.push(`pass 2 LLM call failed: ${e instanceof Error ? e.message : String(e)} — sub-chunks kept inline`);
    }
  }

  // Merge: pass-1 labels for unsplit sections, pass-2 labels for sub-chunks.
  const merged = [...pass1.filter((c) => !heteroSections.includes(c.id)), ...pass2];
  const map = buildSoulMap(agent, expanded, merged, {
    keepInlineExamples: opts?.keepInlineExamples,
    heterogeneousSections: heteroSections,
  });
  const report = formatSoulMapReport(map);

  let outputPath = "";
  if (opts?.write !== false) {
    outputPath = soulMapPath(agent);
    try {
      await Bun.write(outputPath, JSON.stringify(map, null, 2) + "\n");
    } catch (e) {
      errors.push(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { map, outputPath, report, ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const PER_FILE_CAP = 12_000; // OpenClaw DEFAULT_BOOTSTRAP_MAX_CHARS

/** Human-readable summary: where each chunk goes + projected lean-file sizes. */
export function formatSoulMapReport(map: SoulMap): string {
  const lines: string[] = [];
  lines.push(`Soul map — ${map.agent}`);
  lines.push(`  total ${map.totalChars} chars → SOUL.md ${map.soulInlineChars} | AGENTS.md ${map.agentsInlineChars} | extracted ${map.extractedChars}`);
  const soulFlag = map.soulInlineChars > PER_FILE_CAP ? " ⚠️ OVER 12K" : " ✅";
  lines.push(`  projected SOUL.md vs ${PER_FILE_CAP} cap:${soulFlag}`);
  if (map.heterogeneousSections.length > 0) {
    lines.push(`  heterogeneous (bullet-split): ${map.heterogeneousSections.join(", ")}`);
  }
  if (map.reviewCount > 0) lines.push(`  ⚑ ${map.reviewCount} chunk(s) flagged for review (torn class)`);
  lines.push(`  by class: ${SOUL_CLASSES.filter((c) => map.byClass[c] > 0).map((c) => `${c}=${map.byClass[c]}`).join(" ")}`);
  for (const c of map.chunks) {
    const d = c.dest;
    const target =
      d.kind === "bootstrap-file" ? `${d.basename}${d.shared ? " (shared)" : ""}`
      : d.kind === "l4" ? `L4:${d.collection}`
      : d.kind === "skill" ? `skill:${d.id}`
      : d.kind === "example-store" ? `examples(keep ${d.keepInline})`
      : d.kind;
    const flags = `${c.parent ? " ↳" : ""}${c.review ? " ⚑" : ""}`;
    lines.push(`    [${c.class}] ${c.heading} (${c.chars}c) → ${target}${flags}`);
  }
  return lines.join("\n");
}
