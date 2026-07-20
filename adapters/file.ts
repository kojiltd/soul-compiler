/**
 * Soul Compiler 2.0 — File inject adapter (portable, public).
 *
 * Consumes a soul + its routing manifest (soul.map.json) and WRITES the split
 * bootstrap files to `out/<agent>/`. This is the generic "mover": every class
 * lands in a plain file using OpenClaw's native recognized basenames, so any
 * Any user of this runtime benefits without the private overlay. A private
 * inject adapter (vector-store upsert / remote deploy) is a separate layer; this one
 * resolves L4/skill destinations to plain files plus a pointer in SOUL.md.
 *
 * Regrouping: chunks bound for the same file are concatenated in original soul
 * order, so bullet sub-chunks from a split heterogeneous section recombine into
 * one coherent block per destination (fixes the "fine bullet fragments" caveat).
 *
 * Design write-up: docs/compiling-agent-identity.md
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chunkSoul, splitChunkBullets, cleanPreamble, stripGeneratedNoise, type SoulMap, type Destination, type MappedChunk, type SoulChunk } from "../core/classify.ts";
import { lineageBanner, type SoulLineage } from "../core/soul-version.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
/**
 * OpenClaw `DEFAULT_BOOTSTRAP_MAX_CHARS`, verified against the running binary
 * (openclaw v2026.4.29). Two caveats, both bought with real debugging time:
 *
 * 1. UNITS. This counts JS string length (UTF-16 code units), NOT bytes. CJK is
 *    ~1 unit but 3 bytes, so `wc -c` overstates these files by 1.8–2.1×. Reading
 *    bytes as chars produced a fictional "161% of cap" emergency that survived in
 *    our own docs for two months and misled a four-model review board before a
 *    checker caught it. Always compare against `.length`.
 * 2. VERSION-DEPENDENT. A host can carry more than one openclaw install with
 *    different defaults (we found v2026.4.29 at 12,000/60,000 alongside an
 *    extension-bundled v2026.3.13 at 20,000/150,000). Whichever one loads sets
 *    this constant silently. Re-verify after an upgrade.
 */
const PER_FILE_CAP = 12_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InjectFile = {
  path: string; // relative to outDir
  chars: number;
  overCap: boolean; // chars > 12K (would truncate)
  shared: boolean; // belongs in a fleet-shared file (symlink candidate)
};

export type InjectResult = {
  agent: string;
  outDir: string;
  files: InjectFile[];
  pointers: string[]; // human-readable "X → file" lines embedded in SOUL.md
  skippedCalibration: number; // chunks owned by §3, not re-written
  soulVersion: string | null; // stamped into per-agent files when a lineage is supplied
  ok: boolean;
  errors: string[];
};

// ---------------------------------------------------------------------------
// Destination → target file
// ---------------------------------------------------------------------------

type Target = { file: string; shared: boolean; canonical?: boolean; pointer?: string };

/** Resolve a destination to the physical file it writes to under outDir. */
function targetFor(agent: string, dest: Destination, opts?: { lossless?: boolean; standalone?: boolean }): Target | null {
  // Lossless deploy: fold L4/skill/calibration/example into native bootstrap files
  // so OpenClaw actually loads them (skills/reference/examples dirs are NOT bootstrap
  // basenames). Nothing leaves a loadable file → no runtime content loss.
  const lossless = opts?.lossless === true;
  switch (dest.kind) {
    case "soul-inline":
      return { file: "SOUL.md", shared: false };
    case "agents-inline":
      return { file: "AGENTS.md", shared: false };
    case "bootstrap-file": {
      // Canonical (shared-registry) → one fleet source under _shared/, symlinked.
      // standalone (single-agent deploy) keeps it in the agent dir so it merges with
      // any non-canonical shared content into one loadable file.
      const toShared = dest.canonical && !opts?.standalone;
      return {
        file: toShared ? `_shared/${dest.basename}` : dest.basename,
        shared: dest.shared,
        canonical: toShared,
        pointer: toShared ? `fleet-shared → _shared/${dest.basename}` : dest.basename === "USER.md" ? "user grounding → USER.md" : `shared guardrails → ${dest.basename}`,
      };
    }
    case "l4":
      return lossless
        ? { file: "USER.md", shared: false, pointer: "reference (folded) → USER.md" }
        : { file: `reference/${agent}.reference.md`, shared: false, pointer: `topic-gated lookup → reference/${agent}.reference.md (private adapter: L4 ${dest.collection})` };
    case "skill":
      return lossless
        ? { file: "AGENTS.md", shared: false, pointer: "ops procedures (folded) → AGENTS.md" }
        : { file: `skills/${dest.id}.md`, shared: true, pointer: `ops procedures → skill:${dest.id}` };
    case "example-store":
      return lossless
        ? { file: "SOUL.md", shared: false }
        : { file: `examples/${agent}.examples.md`, shared: false, pointer: `example dialogues → examples/${agent}.examples.md` };
    case "calibration":
      // §3 owns this normally; in a lossless deploy (no recompile) keep it loadable.
      return lossless ? { file: "TOOLS.md", shared: true, pointer: "model calibration (folded) → TOOLS.md" } : null;
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Reproduce the manifest's exact chunk list (with the same ids) from the soul. */
export function rebuildChunks(content: string, map: SoulMap): Map<string, SoulChunk> {
  const base = chunkSoul(content);
  const expanded = base.flatMap((c) => (map.heterogeneousSections.includes(c.id) ? splitChunkBullets(c) : [c]));
  return new Map(expanded.map((c) => [c.id, c]));
}

/** Render a chunk back to markdown: heading + body for sections, raw body for bullets, cleaned preamble. */
function renderChunk(chunk: SoulChunk): string {
  if (chunk.heading === "(preamble)") return cleanPreamble(chunk.body); // strip metadata + dup titles
  const body = stripGeneratedNoise(chunk.body, { stripTitles: true }); // scrub cruft + stray titles
  if (chunk.parent) return body; // bullet sub-chunk — already a list item
  return `## ${chunk.heading}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Inject
// ---------------------------------------------------------------------------

/**
 * Write the split bootstrap files for one agent under `out/<agent>/`.
 * Pure-ish: only side effect is Bun.write under outDir (gitignored).
 */
export async function injectToFiles(
  agent: string,
  soulContent: string,
  map: SoulMap,
  opts?: {
    outDir?: string;
    sharedDir?: string;
    lossless?: boolean;
    standalone?: boolean;
    /** When supplied, per-agent files carry a soul_version banner (identity/refraction key). */
    lineage?: SoulLineage;
  },
): Promise<InjectResult> {
  const errors: string[] = [];
  const outDir = opts?.outDir ?? resolve(REPO_ROOT, "out", agent);
  // Canonical fleet-shared files live in ONE place, symlinked per agent — so all
  // agents share a byte-identical source (the actual dedup).
  const sharedDir = opts?.sharedDir ?? resolve(outDir, "..", "_shared");
  const bodyById = rebuildChunks(soulContent, map);

  // Group chunk bodies by target file, in original manifest order (regroup).
  const buckets = new Map<string, { shared: boolean; canonical: boolean; basename: string; parts: string[] }>();
  const pointerSet = new Set<string>();
  let skippedCalibration = 0;

  for (const mc of map.chunks) {
    const target = targetFor(agent, mc.dest, { lossless: opts?.lossless, standalone: opts?.standalone });
    if (!target) {
      skippedCalibration += 1;
      continue;
    }
    const chunk = bodyById.get(mc.id);
    if (!chunk) {
      errors.push(`missing body for chunk ${mc.id} (${mc.heading}) — manifest/soul mismatch`);
      continue;
    }
    let bucket = buckets.get(target.file);
    if (!bucket) {
      bucket = { shared: target.shared, canonical: target.canonical ?? false, basename: target.file.replace(/^_shared\//, ""), parts: [] };
      buckets.set(target.file, bucket);
    }
    bucket.parts.push(renderChunk(chunk));
    if (target.pointer && target.file !== "SOUL.md" && target.file !== "AGENTS.md") {
      pointerSet.add(`${target.pointer}`);
    }
  }

  const pointers = [...pointerSet].sort();

  // Build SOUL.md with a pointer footer so the lean core stays traceable.
  const soulBucket = buckets.get("SOUL.md");
  if (soulBucket && pointers.length > 0) {
    soulBucket.parts.push(
      ["\n---", "<!-- SC2.0 map — extracted out of this soul:", ...pointers.map((p) => `  - ${p}`), "-->"].join("\n"),
    );
  }

  // Write every bucket. Canonical-shared → sharedDir with a FLEET header (no agent
  // name) so the file is byte-identical across all agents; others → per-agent outDir.
  const files: InjectFile[] = [];
  for (const [file, bucket] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // Canonical fleet-shared files must NEVER carry soul_version: it is per-agent,
    // and stamping it would break the byte-identical property the shared registry
    // dedups on — every agent would mint its own copy of the "shared" file.
    const versionLine = !bucket.canonical && opts?.lineage ? lineageBanner(opts.lineage) + "\n" : "";
    const header = bucket.canonical
      ? `<!-- SC2.0 fleet-shared — ${bucket.basename}. Symlinked across agents. DO NOT hand-edit. -->\n\n`
      : `<!-- SC2.0 generated — ${agent} — ${file}. DO NOT hand-edit; recompile. -->\n${versionLine}\n`;
    const content = header + bucket.parts.join("\n\n");
    const path = bucket.canonical ? resolve(sharedDir, bucket.basename) : resolve(outDir, file);
    try {
      await Bun.write(path, content);
    } catch (e) {
      errors.push(`write ${file} failed: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    files.push({ path: file, chars: content.length, overCap: content.length > PER_FILE_CAP, shared: bucket.shared });
  }

  return {
    agent,
    outDir,
    files,
    pointers,
    skippedCalibration,
    soulVersion: opts?.lineage?.soulVersion ?? null,
    ok: errors.length === 0,
    errors,
  };
}

/** Human-readable summary of what was written. */
export function formatInjectReport(r: InjectResult): string {
  const lines: string[] = [];
  lines.push(`Inject — ${r.agent} → ${r.outDir}`);
  for (const f of r.files) {
    const cap = f.overCap ? " ⚠️ OVER 12K" : " ✅";
    lines.push(`  ${f.path.padEnd(28)} ${String(f.chars).padStart(6)}c${cap}${f.shared ? "  (shared)" : ""}`);
  }
  if (r.skippedCalibration > 0) lines.push(`  (skipped ${r.skippedCalibration} calibration chunk(s) — owned by §3 model_profile)`);
  if (r.errors.length > 0) lines.push(`  errors: ${r.errors.join("; ")}`);
  return lines.join("\n");
}
