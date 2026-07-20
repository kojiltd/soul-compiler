/**
 * soul-version — mint a stable, content-addressed identifier for a compiled soul.
 *
 * Why this exists (board decision, 2026-07-19):
 * A downstream refraction instrument already treats `soul_version` as a first-class
 * field — `judgment.py append_recompiled(..., soul_version=, model_id=)` records
 * it on every recompiled judgment, and `recompile_diff` relies on it to attribute
 * divergence: hold the lineage refs fixed, vary the soul, and any difference is
 * attributable to soul/model rather than to the input. That attribution only
 * holds if the soul identifier is stable and honest.
 *
 * Nobody was minting it. Soul Compiler is the only component that knows when a
 * soul actually changed, so minting belongs here.
 *
 * Contract:
 *   - DETERMINISTIC. Same content + same taxonomy → same version, always.
 *     Refraction experiments are only interpretable if re-compiling an unchanged
 *     soul yields an unchanged id (otherwise every run looks like soul drift).
 *   - CONTENT-ADDRESSED. The version changes iff the soul content changes.
 *     Not a timestamp, not a counter — those drift without meaning.
 *   - HONEST. `model_id` is NOT part of it. The soul is the prism; the model is
 *     the light. Re-platforming agents to a different model family must NOT
 *     change soul_version (refractive-memory SETTLED §7: the two fields together
 *     are what make "model X interpreting character Y's spec" unambiguous,
 *     rather than ventriloquism passed off as character Y itself).
 */
import { createHash } from "node:crypto";
import { hashBody } from "./route-lock";
import type { SoulMap } from "./classify";

/**
 * Bump when the classify taxonomy changes meaning. Two souls with identical text
 * but different taxonomy versions are not the same prism — they route differently.
 */
export const TAXONOMY_VERSION = "v2";

export type SoulLineage = {
  soulVersion: string;
  agent: string;
  /** sha256/12 of the normalized source — the identity-bearing part. */
  contentHash: string;
  taxonomyVersion: string;
  /** git HEAD of the compiler that produced this, when resolvable. */
  compilerCommit: string | null;
  sourceChars: number;
  chunkCount: number;
  /** chunkId → body hash; lets a diff say WHICH chunk moved. */
  chunkHashes: Record<string, string>;
  /** Previous soulVersion when re-compiling a known soul, else null. */
  parent: string | null;
  /** Caller-stamped; never part of the identity. */
  stampedAt: string | null;
};

/**
 * Normalize before hashing so cosmetic churn does not mint a new identity.
 * Generated banners carry per-run text, and trailing whitespace is invisible —
 * neither changes who the agent is.
 */
export function normalizeForHash(content: string): string {
  return content
    .split("\n")
    .filter((l) => !/^<!--\s*SC2\.0 (generated|fleet-shared)/.test(l.trim()))
    .filter((l) => !/^<!--\s*FOLDED-FROM-LIVE/.test(l.trim()))
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

/** Content hash of a soul source — 12 hex, mirroring soul.lock/v1. */
export function hashSoulContent(content: string): string {
  return createHash("sha256").update(normalizeForHash(content)).digest("hex").slice(0, 12);
}

/**
 * `<agent>-soul-<taxonomy>+<hash12>` — e.g. `example-soul-v2+3f9a2c1d8b04`.
 * Readable at a glance, greppable, and unambiguous across agents and taxonomies.
 */
export function formatSoulVersion(agent: string, taxonomyVersion: string, contentHash: string): string {
  return `${agent}-soul-${taxonomyVersion}+${contentHash}`;
}

export function parseSoulVersion(
  soulVersion: string,
): { agent: string; taxonomyVersion: string; contentHash: string } | null {
  const m = /^(.+)-soul-([^+]+)\+([0-9a-f]{12})$/.exec(soulVersion);
  return m ? { agent: m[1], taxonomyVersion: m[2], contentHash: m[3] } : null;
}

/** git HEAD of the compiler, or null outside a repo. */
export function resolveCompilerCommit(): string | null {
  try {
    const p = Bun.spawnSync(["git", "rev-parse", "--short=12", "HEAD"], {
      cwd: new URL("..", import.meta.url).pathname,
    });
    if (!p.success) return null;
    const out = p.stdout.toString().trim();
    return /^[0-9a-f]{7,40}$/.test(out) ? out : null;
  } catch {
    return null;
  }
}

export function mintSoulVersion(
  agent: string,
  content: string,
  map: SoulMap,
  opts?: { parent?: string | null; stampedAt?: string | null; compilerCommit?: string | null },
): SoulLineage {
  const contentHash = hashSoulContent(content);
  const chunkHashes: Record<string, string> = {};
  for (const c of map.chunks) chunkHashes[c.id] = hashBody(c.body ?? "");

  return {
    soulVersion: formatSoulVersion(agent, TAXONOMY_VERSION, contentHash),
    agent,
    contentHash,
    taxonomyVersion: TAXONOMY_VERSION,
    compilerCommit: opts?.compilerCommit !== undefined ? opts.compilerCommit : resolveCompilerCommit(),
    sourceChars: content.length,
    chunkCount: map.chunks.length,
    chunkHashes,
    parent: opts?.parent ?? null,
    stampedAt: opts?.stampedAt ?? null,
  };
}

/**
 * Which chunks actually moved between two lineages. `unchanged` is the useful
 * signal for refraction: if a soul is unchanged, divergence in a downstream
 * judgment is attributable to the model, not to the prism.
 */
export function diffLineage(
  prev: SoulLineage,
  next: SoulLineage,
): { unchanged: boolean; added: string[]; removed: string[]; modified: string[] } {
  const prevIds = new Set(Object.keys(prev.chunkHashes));
  const nextIds = new Set(Object.keys(next.chunkHashes));
  const added = [...nextIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !nextIds.has(id));
  const modified = [...nextIds].filter((id) => prevIds.has(id) && prev.chunkHashes[id] !== next.chunkHashes[id]);
  return {
    unchanged: prev.soulVersion === next.soulVersion,
    added,
    removed,
    modified,
  };
}

/** Header line embedded in every deployed bootstrap file, so the live artifact self-identifies. */
export function lineageBanner(lineage: SoulLineage): string {
  const commit = lineage.compilerCommit ? ` compiler=${lineage.compilerCommit}` : "";
  return `<!-- soul_version: ${lineage.soulVersion}${commit} -->`;
}
