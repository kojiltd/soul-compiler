/**
 * Soul Compiler 2.0 — one-shot pipeline (ergonomics).
 *
 * Wires the whole flow behind one call:
 *   shared registry (classify shared ONCE)  →  per-agent classify+pin  →  review  →  [apply] approve + inject
 *
 * Two modes:
 *  - review (default): proposes + pins, extracts NOTHING, returns pending counts + reports.
 *  - apply: approves the registry + each agent's route-lock, then injects to out/.
 *
 * Pure-ish: side effects are Bun.write under data/4_compiled (locks/registry) and
 * out/ (inject), all gitignored / additive. Live souls are never touched.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMCallFn } from "./compile.ts";
import {
  classifyWithLock,
  approveLock,
  saveRouteLock,
  formatLockReview,
  type RouteLock,
} from "./route-lock.ts";
import type { SoulMap } from "./classify.ts";
import {
  buildSharedRegistry,
  loadSharedRegistry,
  saveSharedRegistry,
  approveRegistry,
  resolveShared,
  formatRegistryReport,
  type SharedRegistry,
} from "./shared-registry.ts";
import { injectToFiles, formatInjectReport, type InjectResult } from "../adapters/file.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

export type Soul = { agent: string; content: string };

export type AgentResult = {
  agent: string;
  map: SoulMap;
  lock: RouteLock;
  lockPending: number; // route-lock entries awaiting approval
  sharedCount: number;
  llmCalls: number;
  inject?: InjectResult; // present only in apply mode
};

export type PipelineResult = {
  registry: SharedRegistry;
  registryPending: number;
  agents: AgentResult[];
  applied: boolean;
};

function pendingRegistry(r: SharedRegistry): number {
  return Object.values(r.entries).filter((e) => e.approved !== true).length;
}

/**
 * Run the full SC2.0 pipeline over a set of souls.
 *
 * @param opts.apply    approve registry + locks and inject (default false = review only)
 * @param opts.outRoot  base dir for inject output (default repo `out/`)
 * @param opts.write    persist registry/locks (default true)
 */
export async function runPipeline(
  souls: Soul[],
  llmCall: LLMCallFn,
  opts?: { apply?: boolean; outRoot?: string; write?: boolean },
): Promise<PipelineResult> {
  const apply = opts?.apply ?? false;
  const write = opts?.write ?? true;
  const outRoot = opts?.outRoot ?? resolve(REPO_ROOT, "out");

  // 1. Shared registry — classify the fleet's shared content ONCE (merge into any
  //    existing registry so prior approvals survive).
  const existing = await loadSharedRegistry();
  const built = await buildSharedRegistry(souls, llmCall, { registry: existing, write: false });
  const registry = built.registry;
  if (apply) approveRegistry(registry);
  if (write) await saveSharedRegistry(registry);

  const sharedResolver = (body: string) => {
    const r = resolveShared(body, registry);
    return r ? { class: r.class, sharedKey: r.sharedKey } : null;
  };

  // 2. Per agent — classify + pin (proposes; extracts nothing yet).
  const agents: AgentResult[] = [];
  for (const { agent, content } of souls) {
    let res = await classifyWithLock(agent, content, llmCall, {
      resolveShared: sharedResolver,
      requireApproval: true,
      write,
    });

    let inject: InjectResult | undefined;
    if (apply) {
      // 3. Approve this agent's proposals, then re-run (now extracting) + inject.
      approveLock(res.lock);
      if (write) await saveRouteLock(agent, res.lock);
      res = await classifyWithLock(agent, content, llmCall, {
        resolveShared: sharedResolver,
        requireApproval: false,
        lock: res.lock,
        write,
      });
      inject = await injectToFiles(agent, content, res.map, {
        outDir: resolve(outRoot, agent),
        sharedDir: resolve(outRoot, "_shared"),
      });
    }

    agents.push({
      agent,
      map: res.map,
      lock: res.lock,
      lockPending: res.pendingCount,
      sharedCount: res.sharedCount,
      llmCalls: res.llmCalls,
      inject,
    });
  }

  return { registry, registryPending: pendingRegistry(registry), agents, applied: apply };
}

/** Human-readable summary of a pipeline run. */
export function formatPipeline(result: PipelineResult): string {
  const lines: string[] = [];
  lines.push(result.applied ? "=== SC2.0 pipeline — APPLIED ===" : "=== SC2.0 pipeline — REVIEW (nothing extracted / deployed) ===");
  lines.push("");
  lines.push(formatRegistryReport(result.registry).split("\n").slice(0, 7).join("\n"));
  lines.push("");
  for (const a of result.agents) {
    const m = a.map;
    const cap = m.soulInlineChars > 12_000 ? "⚠️ OVER 12K" : "✅";
    lines.push(
      `${a.agent.padEnd(7)} SOUL ${String(m.soulInlineChars).padStart(5)}c ${cap} | shared=${a.sharedCount} llm=${a.llmCalls} lockPending=${a.lockPending}` +
        (a.inject ? ` | wrote ${a.inject.files.length} files` : ""),
    );
  }
  lines.push("");
  if (result.applied) {
    lines.push(`Injected to out/. Shared files deduped under out/_shared/.`);
  } else {
    const lp = result.agents.reduce((n, a) => n + a.lockPending, 0);
    lines.push(`Review only. Pending: ${result.registryPending} shared-registry + ${lp} per-agent route entries.`);
    lines.push(`Run with --apply to approve all pending and inject.`);
  }
  return lines.join("\n");
}
