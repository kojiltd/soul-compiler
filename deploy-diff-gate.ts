/**
 * deploy-diff-gate — refuse to deploy when the live host holds content our inputs don't.
 *
 * Why this exists (board checker NEW-2, 2026-07-19):
 * deploy-prep derives all five bootstrap files from ONE `<agent>-live-soul.md`
 * input, and its losslessness check only proves input ⊆ output. Content that
 * was hand-edited onto the live host AFTER the input was pulled is invisible to that
 * check — deploy silently overwrites it. Two such edits were found live:
 *
 *   IDENTITY.md  +1066b  reply-gate STEP 0 hard-scope fix   (2026-07-05)
 *   AGENTS.md    +1277b  〈查證不到就停〉anti-fabrication    (2026-07-17)
 *
 * The second is the same class of guard rule whose loss caused a documented
 * fabrication incident. The pre-deploy check only grepped SOUL.md, so drift in
 * AGENTS.md / IDENTITY.md went unseen for weeks.
 *
 * This gate closes the other direction: live ⊆ (input ∪ output).
 * Read-only against the host. Never writes, never deploys.
 *
 * Usage: bun run deploy-diff-gate.ts <inputs-dir> [agent ...]
 */
import { resolve } from "node:path";
import { resolveAgents, requireRemoteHost, REMOTE_WORKSPACE_BASE } from "./core/config";

const HOST = requireRemoteHost();
/** Remote workspace path — same layout as local, on the machine agents run on. */
const remoteWorkspace = (agent: string) => `${REMOTE_WORKSPACE_BASE}/${agent}-workspace`;

const BOOTSTRAP_FILES = ["SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "USER.md"];

/** A line worth protecting: long enough to be substantive, not a heading. */
const isSubstantive = (l: string) => l.length >= 8 && !/^#{1,6}\s/.test(l);

/** Generated banners differ per run; never treat them as lost content. */
const isNoise = (l: string) => /^<!--\s*SC2\.0 generated/.test(l) || /^<!--\s*\/?SAFETY-RULE/.test(l);

async function liveFile(agent: string, name: string): Promise<string | null> {
  const proc = Bun.spawnSync([
    "ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", HOST,
    `cat ${remoteWorkspace(agent)}/${name} 2>/dev/null`,
  ], { maxBuffer: 1024 * 1024 * 16 });
  if (!proc.success) return null;
  const out = proc.stdout.toString();
  return out.length > 0 ? out : null;
}

async function readIfExists(path: string): Promise<string> {
  const f = Bun.file(path);
  return (await f.exists()) ? await f.text() : "";
}

const inputsDir = process.argv[2];
if (!inputsDir) {
  console.error("usage: bun run deploy-diff-gate.ts <inputs-dir> [agent ...]");
  process.exit(2);
}
const agents = process.argv.length > 3 ? process.argv.slice(3) : resolveAgents();

let totalOrphans = 0;
const report: string[] = [];

for (const agent of agents) {
  // Everything we know about locally: the pull input + anything already staged.
  let known = await readIfExists(resolve(inputsDir, `${agent}-live-soul.md`));
  for (const name of BOOTSTRAP_FILES) {
    known += "\n" + (await readIfExists(resolve(import.meta.dir, "out-deploy", agent, name)));
  }

  const orphansByFile: Record<string, string[]> = {};
  let agentOrphans = 0;

  for (const name of BOOTSTRAP_FILES) {
    const live = await liveFile(agent, name);
    if (live === null) continue;
    const orphans = live
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => isSubstantive(l) && !isNoise(l) && !known.includes(l));
    if (orphans.length > 0) {
      orphansByFile[name] = orphans;
      agentOrphans += orphans.length;
    }
  }

  totalOrphans += agentOrphans;
  if (agentOrphans === 0) {
    report.push(`✅ ${agent.padEnd(8)} clean — host holds nothing our inputs lack`);
  } else {
    report.push(`🛑 ${agent.padEnd(8)} ${agentOrphans} line(s) live on the host but absent locally:`);
    for (const [name, lines] of Object.entries(orphansByFile)) {
      report.push(`      ${name} (${lines.length}):`);
      for (const l of lines.slice(0, 6)) report.push(`        · ${l.slice(0, 100)}`);
      if (lines.length > 6) report.push(`        · … ${lines.length - 6} more`);
    }
  }
}

console.log("=== deploy diff gate — live ⊆ local? ===\n");
console.log(report.join("\n"));
console.log();

if (totalOrphans > 0) {
  console.log(`🛑 GATE FAILED — ${totalOrphans} orphan line(s).`);
  console.log("   These exist on the host and would be DESTROYED by deploy.");
  console.log("   Fold them into the live-soul input (or the agent's input.d/) first,");
  console.log("   then re-run deploy-prep so they flow through the pipeline.");
  process.exit(1);
}
console.log("✅ GATE PASSED — deploy would not destroy any live content.");
