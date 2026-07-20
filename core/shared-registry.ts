/**
 * Soul Compiler 2.0 — Shared-content registry (fleet dedup, doc §11 P5).
 *
 * The all-7 run showed shared sections (六人群 / 校準 / Tool / 共享記憶) do NOT
 * dedup by accident: classify is non-deterministic per agent, so each agent's
 * IDENTITY.md came out different. Real dedup needs a canonical source.
 *
 * Signal: a chunk body that is BYTE-IDENTICAL across ≥2 agents is, by definition,
 * shared. We detect those, classify the deduped shared set ONCE for the whole
 * fleet (one LLM pass, not per-agent), and pin the result in `shared.registry.json`.
 * Then every agent's matching chunk routes deterministically to the SAME shared
 * file (symlink target) — no LLM, identical output, true dedup.
 *
 * Like the route-lock, registration is review-gated: entries are `approved:false`
 * until a human confirms, and `resolveShared` only routes approved entries.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hashBody } from "./route-lock.ts";
import type { LLMCallFn } from "./compile.ts";
import {
  chunkSoul,
  buildClassifyPrompt,
  parseClassification,
  type SoulClass,
  type SoulChunk,
} from "./classify.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SharedBasename = "IDENTITY.md" | "TOOLS.md";

export type SharedEntry = {
  heading: string;
  class: SoulClass; // usually shared-guardrail or model-calibration
  sharedKey?: string;
  basename?: SharedBasename; // canonical shared file (omitted for model-calibration → §3)
  agents: string[]; // which agents carry this chunk (provenance / dedup count)
  approved?: boolean; // human-confirmed shared; resolveShared routes only approved
};

export type SharedRegistry = {
  version: "shared/v1";
  entries: Record<string, SharedEntry>; // content-hash → entry
};

export type BuildSharedResult = {
  registry: SharedRegistry;
  llmCalls: number;
  sharedChunkInstances: number; // total cross-agent occurrences collapsed
  uniqueShared: number; // distinct shared chunks (registry size)
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

type Detected = { heading: string; body: string; agents: Set<string> };

/** Find chunks whose body is byte-identical across at least `minAgents` agents. */
export function detectSharedChunks(
  souls: { agent: string; content: string }[],
  minAgents = 2,
): Map<string, Detected> {
  const all = new Map<string, Detected>();
  for (const { agent, content } of souls) {
    const seenInThisAgent = new Set<string>();
    for (const chunk of chunkSoul(content)) {
      const h = hashBody(chunk.body);
      if (seenInThisAgent.has(h)) continue; // count an agent once per identical body
      seenInThisAgent.add(h);
      const d = all.get(h) ?? { heading: chunk.heading, body: chunk.body, agents: new Set() };
      d.agents.add(agent);
      all.set(h, d);
    }
  }
  const shared = new Map<string, Detected>();
  for (const [h, d] of all) if (d.agents.size >= minAgents) shared.set(h, d);
  return shared;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export function sharedRegistryPath(): string {
  return resolve(DATA_DIR, "4_compiled", "shared.registry.json");
}

export function emptyRegistry(): SharedRegistry {
  return { version: "shared/v1", entries: {} };
}

export async function loadSharedRegistry(): Promise<SharedRegistry> {
  try {
    const file = Bun.file(sharedRegistryPath());
    if (await file.exists()) {
      const raw = JSON.parse(await file.text());
      if (raw && raw.version === "shared/v1" && raw.entries) return raw as SharedRegistry;
    }
  } catch {
    // missing/corrupt → empty (nothing auto-routes as shared; safe)
  }
  return emptyRegistry();
}

export async function saveSharedRegistry(registry: SharedRegistry): Promise<void> {
  await Bun.write(sharedRegistryPath(), JSON.stringify(registry, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/** Canonical shared file for a classified shared chunk (none for model-calibration → §3). */
function sharedBasenameFor(cls: SoulClass, sharedKey?: string): SharedBasename | undefined {
  if (cls !== "shared-guardrail") return undefined; // model-calibration handled by §3
  return (sharedKey ?? "").toLowerCase().includes("tool") ? "TOOLS.md" : "IDENTITY.md";
}

/**
 * Build the shared registry from a set of souls: detect cross-agent-identical
 * chunks, classify the deduped set ONCE, pin as unapproved for review.
 *
 * @param opts.minAgents identity threshold (default 2)
 * @param opts.write     persist registry (default true)
 * @param opts.registry  merge into an existing registry (keeps prior approvals)
 */
export async function buildSharedRegistry(
  souls: { agent: string; content: string }[],
  llmCall: LLMCallFn,
  opts?: { minAgents?: number; write?: boolean; registry?: SharedRegistry },
): Promise<BuildSharedResult> {
  const registry = opts?.registry ?? emptyRegistry();
  const detected = detectSharedChunks(souls, opts?.minAgents ?? 2);

  // Classify only chunks not already registered (registered ones keep their pin).
  const fresh = [...detected.entries()].filter(([h]) => !registry.entries[h]);
  let llmCalls = 0;
  if (fresh.length > 0) {
    const chunks: SoulChunk[] = fresh.map(([h, d]) => ({
      id: h,
      heading: d.heading,
      level: 2,
      body: d.body,
      chars: d.body.length,
    }));
    const parsed = parseClassification(await llmCall(buildClassifyPrompt("_shared", chunks)));
    llmCalls = 1;
    const byId = new Map(parsed.map((c) => [c.id, c]));
    for (const [h, d] of fresh) {
      const c = byId.get(h);
      const cls = c?.class ?? "shared-guardrail"; // identical-across-agents defaults to shared
      registry.entries[h] = {
        heading: d.heading,
        class: cls,
        sharedKey: c?.sharedKey,
        basename: sharedBasenameFor(cls, c?.sharedKey),
        agents: [...d.agents].sort(),
        approved: false,
      };
    }
  }

  // Refresh provenance (agent list) for already-registered chunks still seen.
  for (const [h, d] of detected) {
    const e = registry.entries[h];
    if (e) e.agents = [...d.agents].sort();
  }

  let sharedChunkInstances = 0;
  for (const d of detected.values()) sharedChunkInstances += d.agents.size;

  if (opts?.write !== false) await saveSharedRegistry(registry);
  return { registry, llmCalls, sharedChunkInstances, uniqueShared: detected.size };
}

// ---------------------------------------------------------------------------
// Resolve + review
// ---------------------------------------------------------------------------

/** Canonical shared route for a chunk body, or null. Only approved entries route. */
export function resolveShared(
  body: string,
  registry: SharedRegistry,
): { class: SoulClass; sharedKey?: string; basename?: SharedBasename } | null {
  const e = registry.entries[hashBody(body)];
  if (!e || e.approved !== true) return null;
  return { class: e.class, sharedKey: e.sharedKey, basename: e.basename };
}

/** Approve entries: all, or those matching a predicate. Returns count approved. */
export function approveRegistry(registry: SharedRegistry, predicate?: (e: SharedEntry, hash: string) => boolean): number {
  let n = 0;
  for (const [hash, e] of Object.entries(registry.entries)) {
    if (e.approved === true) continue;
    if (predicate && !predicate(e, hash)) continue;
    e.approved = true;
    n += 1;
  }
  return n;
}

/** Human-readable review: shared chunks, agent coverage, and dedup savings. */
export function formatRegistryReport(registry: SharedRegistry): string {
  const entries = Object.entries(registry.entries);
  const pending = entries.filter(([, e]) => e.approved !== true).length;
  const lines: string[] = [];
  lines.push(`Shared registry — ${entries.length} shared chunks, ${pending} pending approval`);
  // Group by canonical destination.
  const byDest = new Map<string, { count: number; instances: number; agents: Set<string> }>();
  for (const [, e] of entries) {
    const dest = e.basename ?? (e.class === "model-calibration" ? "calibration(§3)" : e.class);
    const g = byDest.get(dest) ?? { count: 0, instances: 0, agents: new Set() };
    g.count += 1;
    g.instances += e.agents.length;
    e.agents.forEach((a) => g.agents.add(a));
    byDest.set(dest, g);
  }
  for (const [dest, g] of byDest) {
    const saved = g.instances - g.count; // copies collapsed into one canonical source
    lines.push(`  ${dest.padEnd(18)} ${g.count} chunk(s) × ${g.agents.size} agents → 1 source (saves ${saved} duplicate copies)`);
  }
  for (const [hash, e] of entries) {
    const mark = e.approved ? "✅" : "⬜";
    const dest = e.basename ?? (e.class === "model-calibration" ? "§3" : e.class);
    lines.push(`  ${mark} ${hash} ${dest.padEnd(12)} [${e.agents.length}] ${e.heading.slice(0, 50)}`);
  }
  return lines.join("\n");
}
