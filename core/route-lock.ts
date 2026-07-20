/**
 * Soul Compiler 2.0 — Routing lock (deterministic pin).
 *
 * The classify step uses LLM judgment, which is non-deterministic — the same
 * section can be labelled differently across runs. Re-judging a live soul every
 * time would churn every agent's files nightly (cache busting, drift). So we PIN
 * each chunk's routing ONCE, keyed by a content hash, in `<agent>.soul.lock.json`.
 *
 * - First run: LLM classifies every chunk → results written to the lock.
 * - Later runs: a chunk whose content hash matches the lock reuses the pinned
 *   class with ZERO LLM calls. Only NEW or EDITED chunks (hash miss) are sent to
 *   the LLM, and their result is added to the lock.
 *
 * This makes re-inject deterministic and stable; the LLM is paid for only what
 * actually changed: AI judgment once → pinned; logistics deterministic thereafter.
 *
 * Distinct from the distill pipeline's in-soul `<!-- soul.lock/v1 -->` section
 * manifest — that is the old fused-distill's taxonomy; this is the SC2.0 routing
 * source of truth.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { LLMCallFn } from "./compile.ts";
import {
  chunkSoul,
  splitChunkBullets,
  buildClassifyPrompt,
  parseClassification,
  buildSoulMap,
  formatSoulMapReport,
  soulMapPath,
  type SoulClass,
  type SoulChunk,
  type ChunkClassification,
  type SoulMap,
} from "./classify.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BulletRoute = { class: SoulClass; sharedKey?: string };

export type RouteEntry = {
  heading: string; // human-readable, for lock auditing
  class: SoulClass; // PROPOSED section-level class (from LLM/manual)
  sharedKey?: string;
  heterogeneous?: boolean; // section is bullet-split
  bullets?: BulletRoute[]; // per-bullet routes (ordered) when heterogeneous
  approved?: boolean; // human-reviewed: only approved entries actually EXTRACT
  note?: string; // optional provenance / reviewer note
};

export type RouteLock = {
  version: "route/v1";
  agent: string;
  entries: Record<string, RouteEntry>; // keyed by content hash of the chunk body
};

export type LockedClassifyResult = {
  map: SoulMap;
  lock: RouteLock;
  outputPath: string;
  report: string;
  llmCalls: number; // 0 when every chunk was pinned (fully deterministic run)
  pinnedCount: number;
  freshCount: number;
  pendingCount: number; // pinned but not yet approved → kept inline until reviewed
  sharedCount: number; // routed by the shared registry (canonical, no LLM)
  ok: boolean;
  errors: string[];
};

/** Resolver injected by the caller: shared-registry route for a chunk body, or null. */
export type SharedResolver = (body: string) => { class: SoulClass; sharedKey?: string } | null;

// ---------------------------------------------------------------------------
// Hash + persistence
// ---------------------------------------------------------------------------

/** Stable content hash of a chunk body (trimmed) — 12 hex, mirrors soul.lock/v1. */
export function hashBody(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex").slice(0, 12);
}

export function routeLockPath(agent: string): string {
  return resolve(DATA_DIR, "4_compiled", `${agent}.soul.lock.json`);
}

export function emptyLock(agent: string): RouteLock {
  return { version: "route/v1", agent, entries: {} };
}

export async function loadRouteLock(agent: string): Promise<RouteLock> {
  try {
    const file = Bun.file(routeLockPath(agent));
    if (await file.exists()) {
      const raw = JSON.parse(await file.text());
      if (raw && raw.version === "route/v1" && raw.entries) return raw as RouteLock;
    }
  } catch {
    // Corrupt/missing lock → start fresh (everything reclassifies, safe).
  }
  return emptyLock(agent);
}

export async function saveRouteLock(agent: string, lock: RouteLock): Promise<void> {
  await Bun.write(routeLockPath(agent), JSON.stringify(lock, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Locked classify
// ---------------------------------------------------------------------------

/** Preamble = file header/metadata before the first heading. Never classified. */
function isPreamble(chunk: SoulChunk): boolean {
  return chunk.level === 0 && chunk.heading === "(preamble)";
}

/**
 * Effective classification for the MAP. Approval gate: an entry only EXTRACTS
 * once approved; until then it is kept inline (core-being) — the safe direction,
 * same as low confidence. The proposed class still lives in the lock for review.
 */
function effective(id: string, proposed: { class: SoulClass; sharedKey?: string }, approved: boolean): ChunkClassification {
  if (approved) {
    return { id, class: proposed.class, confidence: 1, rationale: "pinned + approved", sharedKey: proposed.sharedKey };
  }
  return { id, class: "core-being", confidence: 1, rationale: `pending review — kept inline (proposed: ${proposed.class})` };
}

/**
 * Classify a soul using the routing lock: pinned chunks reuse their stored route
 * (no LLM); only hash-miss chunks are sent to the LLM and then pinned.
 *
 * Preamble is special-cased (always SOUL.md, auto-approved, never sent to LLM).
 * Approval gate (opts.requireApproval, default true): freshly-proposed routes are
 * pinned `approved:false` and kept INLINE until a human approves — classify only
 * proposes, approval makes extraction take effect.
 *
 * @param opts.lock  inject a lock (tests); defaults to the on-disk lock
 * @param opts.write persist lock + soul.map.json (default true)
 */
export async function classifyWithLock(
  agent: string,
  content: string,
  llmCall: LLMCallFn,
  opts?: { keepInlineExamples?: number; write?: boolean; lock?: RouteLock; requireApproval?: boolean; resolveShared?: SharedResolver },
): Promise<LockedClassifyResult> {
  const errors: string[] = [];
  const requireApproval = opts?.requireApproval ?? true;
  const resolveShared = opts?.resolveShared;
  const lock = opts?.lock ?? (await loadRouteLock(agent));
  const chunks = chunkSoul(content);
  if (chunks.length === 0) {
    const map = buildSoulMap(agent, [], []);
    return { map, lock, outputPath: "", report: "empty soul", llmCalls: 0, pinnedCount: 0, freshCount: 0, pendingCount: 0, sharedCount: 0, ok: false, errors: ["no chunks"] };
  }
  const approved = (e: RouteEntry) => !requireApproval || e.approved === true;
  // A registry-canonical shared chunk is resolved before lock/LLM — fleet-shared,
  // deterministic, identical across agents (the symlink-dedup source).
  const sharedRoute = (body: string) => resolveShared?.(body) ?? null;

  // Repair: preamble is auto-pinned core-being/approved regardless of any prior
  // (possibly wrong) lock entry — it is the file header, not classifiable content.
  for (const chunk of chunks) {
    if (!isPreamble(chunk)) continue;
    const h = hashBody(chunk.body);
    const prev = lock.entries[h];
    if (!prev || prev.class !== "core-being" || prev.approved !== true) {
      lock.entries[h] = { heading: chunk.heading, class: "core-being", approved: true, note: "preamble — file header, auto-pinned" };
    }
  }

  let llmCalls = 0;

  // Pass 1 — LLM only for sections that are not preamble, not shared-canonical,
  // and not already pinned in the lock.
  const unpinnedSections = chunks.filter((c) => !isPreamble(c) && !sharedRoute(c.body) && !lock.entries[hashBody(c.body)]);
  let pass1: ChunkClassification[] = [];
  if (unpinnedSections.length > 0) {
    try {
      pass1 = parseClassification(await llmCall(buildClassifyPrompt(agent, unpinnedSections)));
      llmCalls += 1;
      if (pass1.length === 0) errors.push("pass 1 returned no parseable classifications — unpinned chunks kept inline");
    } catch (e) {
      errors.push(`pass 1 LLM call failed: ${e instanceof Error ? e.message : String(e)} — unpinned chunks kept inline`);
    }
  }
  const p1 = new Map(pass1.map((c) => [c.id, c]));

  // Expand chunks; resolve EFFECTIVE classifications (approval-gated) for the map.
  const expanded: SoulChunk[] = [];
  const classifications: ChunkClassification[] = [];
  const heteroSections: string[] = [];
  const freshHeteroBullets: SoulChunk[] = [];
  let pinnedCount = 0;
  let pendingCount = 0;
  let sharedCount = 0;

  for (const chunk of chunks) {
    // Shared registry (canonical) — fleet-identical, deterministic, no LLM/lock.
    const sr = sharedRoute(chunk.body);
    if (sr) {
      sharedCount += 1;
      expanded.push(chunk);
      classifications.push({ id: chunk.id, class: sr.class, confidence: 1, rationale: "shared registry (canonical)", sharedKey: sr.sharedKey, canonical: true });
      continue;
    }
    const entry = lock.entries[hashBody(chunk.body)];
    if (entry) {
      pinnedCount += 1;
      const ok = approved(entry);
      if (!ok) pendingCount += 1;
      if (entry.heterogeneous && ok) {
        const sub = splitChunkBullets(chunk);
        if (sub.length > 1) {
          heteroSections.push(chunk.id);
          sub.forEach((s, i) => {
            expanded.push(s);
            classifications.push(effective(s.id, entry.bullets?.[i] ?? { class: "core-being" }, true));
          });
          continue;
        }
      }
      // Non-hetero, or unapproved hetero (kept whole + inline until approved).
      expanded.push(chunk);
      classifications.push(effective(chunk.id, entry, ok));
      continue;
    }
    // Fresh — propose via pass 1, but keep inline this run (unapproved).
    const c = p1.get(chunk.id);
    if (c?.heterogeneous) {
      const sub = splitChunkBullets(chunk);
      if (sub.length > 1) {
        heteroSections.push(chunk.id);
        // Fresh hetero bullets are pinned for review; kept inline now.
        expanded.push(...sub);
        freshHeteroBullets.push(...sub);
        continue;
      }
    }
    expanded.push(chunk);
    classifications.push({ id: chunk.id, class: "core-being", confidence: c ? 1 : 0, rationale: c ? `pending review — kept inline (proposed: ${c.class})` : "unclassified — kept inline (safe default)" });
  }

  // Pass 2 — LLM for fresh heterogeneous bullets (proposals only; kept inline).
  const p2 = new Map<string, ChunkClassification>();
  if (freshHeteroBullets.length > 0) {
    try {
      const pass2 = parseClassification(await llmCall(buildClassifyPrompt(agent, freshHeteroBullets, { atomic: true })));
      llmCalls += 1;
      for (const c of pass2) p2.set(c.id, c);
    } catch (e) {
      errors.push(`pass 2 LLM call failed: ${e instanceof Error ? e.message : String(e)} — fresh bullets kept inline`);
    }
    for (const s of freshHeteroBullets) {
      const c = p2.get(s.id);
      classifications.push({ id: s.id, class: "core-being", confidence: c ? 1 : 0, rationale: c ? `pending review — kept inline (proposed: ${c.class})` : "unclassified bullet — kept inline" });
    }
  }

  // Pin freshly classified sections into the lock (proposals, approved:false).
  let freshCount = 0;
  for (const chunk of unpinnedSections) {
    const c = p1.get(chunk.id);
    if (!c) continue; // unclassified → leave unpinned so it retries next run
    const h = hashBody(chunk.body);
    if (c.heterogeneous && heteroSections.includes(chunk.id)) {
      const sub = splitChunkBullets(chunk);
      const bullets: BulletRoute[] = sub.map((s) => {
        const bc = p2.get(s.id);
        return { class: bc?.class ?? "core-being", sharedKey: bc?.sharedKey };
      });
      lock.entries[h] = { heading: chunk.heading, class: c.class, sharedKey: c.sharedKey, heterogeneous: true, bullets, approved: false };
    } else {
      lock.entries[h] = { heading: chunk.heading, class: c.class, sharedKey: c.sharedKey, approved: false };
    }
    freshCount += 1;
    pendingCount += 1;
  }

  const map = buildSoulMap(agent, expanded, classifications, {
    keepInlineExamples: opts?.keepInlineExamples,
    heterogeneousSections: heteroSections,
  });
  const report = formatSoulMapReport(map);

  let outputPath = "";
  if (opts?.write !== false) {
    try {
      await saveRouteLock(agent, lock);
      outputPath = soulMapPath(agent);
      await Bun.write(outputPath, JSON.stringify(map, null, 2) + "\n");
    } catch (e) {
      errors.push(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { map, lock, outputPath, report, llmCalls, pinnedCount, freshCount, pendingCount, sharedCount, ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Review + approval
// ---------------------------------------------------------------------------

/** Approve entries: all, or only those matching a predicate. Returns count approved. */
export function approveLock(lock: RouteLock, predicate?: (e: RouteEntry, hash: string) => boolean): number {
  let n = 0;
  for (const [hash, e] of Object.entries(lock.entries)) {
    if (e.approved === true) continue;
    if (predicate && !predicate(e, hash)) continue;
    e.approved = true;
    n += 1;
  }
  return n;
}

/** A routing that leaves SOUL.md/AGENTS.md — i.e. would actually extract content. */
function extractsClass(cls: SoulClass): boolean {
  return cls !== "core-being" && cls !== "core-rules";
}

/**
 * Human-readable review of pending (unapproved) routes, with a ⚠ on routes that
 * EXTRACT content (the consequential ones to eyeball before approving).
 */
export function formatLockReview(lock: RouteLock): string {
  const entries = Object.entries(lock.entries);
  const pending = entries.filter(([, e]) => e.approved !== true);
  const lines: string[] = [];
  lines.push(`Route-lock review — ${lock.agent}: ${entries.length} entries, ${pending.length} pending approval`);
  if (pending.length === 0) {
    lines.push("  ✅ all approved");
    return lines.join("\n");
  }
  for (const [hash, e] of pending) {
    const warn = extractsClass(e.class) ? " ⚠ EXTRACTS" : "";
    const key = e.sharedKey ? ` [${e.sharedKey}]` : "";
    lines.push(`  ⬜ ${hash}  ${e.class}${key}${warn}  — ${e.heading}`);
    if (e.heterogeneous && e.bullets) {
      for (const b of e.bullets) lines.push(`       ↳ ${b.class}${b.sharedKey ? ` [${b.sharedKey}]` : ""}${extractsClass(b.class) ? " ⚠" : ""}`);
    }
  }
  lines.push(`  → edit ${lock.agent}.soul.lock.json to fix any wrong class, then approve.`);
  return lines.join("\n");
}
