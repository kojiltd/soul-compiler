/**
 * fold-orphans — carry live host-only content back into the pipeline inputs.
 *
 * Companion to deploy-diff-gate. The gate detects content that exists on the host
 * but not in `<agent>-live-soul.md`; this folds that content back in as marked
 * sections so the next deploy-prep run classifies and routes it like any other
 * chunk, instead of silently destroying it.
 *
 * Blocks are appended VERBATIM with provenance. We do not reword, merge or
 * re-order — the whole failure mode being fixed here is content quietly
 * changing shape between the host and the compiler.
 *
 * Usage: bun run fold-orphans.ts <inputs-dir> [--write] [agent ...]
 *        (dry-run unless --write)
 */
import { resolve } from "node:path";
import { resolveAgents, requireRemoteHost, REMOTE_WORKSPACE_BASE } from "./core/config";

const HOST = requireRemoteHost();
/** Remote workspace path — same layout as local, on the machine agents run on. */
const remoteWorkspace = (agent: string) => `${REMOTE_WORKSPACE_BASE}/${agent}-workspace`;

const BOOTSTRAP_FILES = ["SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "USER.md"];

/** Which input section a live file's orphans belong to, per SC2.0 §4a basenames. */
const SECTION_FOR: Record<string, string> = {
  "AGENTS.md": "03-iron-rules",
  "IDENTITY.md": "00-group-gate",
  "TOOLS.md": "00-calibration",
  "USER.md": "01-provenance",
  "SOUL.md": "02-identity",
};

const isSubstantive = (l: string) => l.trim().length >= 8 && !/^#{1,6}\s/.test(l.trim());
const isNoise = (l: string) => /^<!--\s*SC2\.0 generated/.test(l.trim());

function liveFile(agent: string, name: string): string | null {
  const proc = Bun.spawnSync([
    "ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", HOST,
    `cat ${remoteWorkspace(agent)}/${name} 2>/dev/null`,
  ], { maxBuffer: 1024 * 1024 * 16 });
  if (!proc.success) return null;
  const out = proc.stdout.toString();
  return out.length > 0 ? out : null;
}

/**
 * Contiguous runs of orphan lines, keeping headings and short lines that sit
 * between them — a rule loses its meaning if you keep the bullets and drop the
 * heading they hang off.
 */
function orphanBlocks(live: string, known: string): string[] {
  const lines = live.split("\n");
  const isOrphan = lines.map((l) => {
    const t = l.trim();
    if (!isSubstantive(t) || isNoise(t)) return false;
    return !known.includes(t);
  });

  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!isOrphan[i]) { i++; continue; }
    // Walk back over the heading/blank run that introduces this block.
    let start = i;
    while (start > 0) {
      const prev = lines[start - 1].trim();
      if (prev === "" || /^#{1,6}\s/.test(prev)) start--;
      else break;
    }
    // Extend forward while orphans continue, tolerating short connective lines.
    let end = i;
    let gap = 0;
    for (let j = i + 1; j < lines.length && gap < 3; j++) {
      if (isOrphan[j]) { end = j; gap = 0; }
      else gap++;
    }
    blocks.push(lines.slice(start, end + 1).join("\n").trim());
    i = end + 1;
  }
  return blocks.filter((b) => b.length > 0);
}

const inputsDir = process.argv[2];
if (!inputsDir) {
  console.error("usage: bun run fold-orphans.ts <inputs-dir> [--write] [agent ...]");
  process.exit(2);
}
const write = process.argv.includes("--write");
const named = process.argv.slice(3).filter((a) => !a.startsWith("--"));
const agents = named.length > 0 ? named : resolveAgents();

const stamp = new Date().toISOString().slice(0, 10);
let touched = 0;

for (const agent of agents) {
  const inputPath = resolve(inputsDir, `${agent}-live-soul.md`);
  const input = Bun.file(inputPath);
  if (!(await input.exists())) { console.log(`⏭  ${agent}: no input file`); continue; }

  let known = await input.text();
  for (const name of BOOTSTRAP_FILES) {
    const staged = Bun.file(resolve(import.meta.dir, "out-deploy", agent, name));
    if (await staged.exists()) known += "\n" + (await staged.text());
  }

  const additions: string[] = [];
  for (const name of BOOTSTRAP_FILES) {
    const live = liveFile(agent, name);
    if (live === null) continue;
    for (const block of orphanBlocks(live, known)) {
      additions.push(
        `\n<!-- section: ${SECTION_FOR[name] ?? "10-operating-rules"} -->\n` +
        `<!-- FOLDED-FROM-LIVE ${stamp}: recovered from live ${name}; ` +
        `present live but absent from this input. Verbatim, do not reword. -->\n\n` +
        block + "\n"
      );
      // Later blocks must see earlier ones, or duplicates slip through.
      known += "\n" + block;
    }
  }

  if (additions.length === 0) { console.log(`✅ ${agent}: nothing to fold`); continue; }
  const chars = additions.reduce((n, a) => n + a.length, 0);
  console.log(`${write ? "✍️ " : "🔍"} ${agent}: ${additions.length} block(s), ${chars}c`);
  for (const a of additions) {
    const head = a.split("\n").find((l) => l.trim() && !l.startsWith("<!--")) ?? "";
    console.log(`      · ${head.slice(0, 88)}`);
  }
  if (write) {
    await Bun.write(inputPath, (await Bun.file(inputPath).text()).trimEnd() + "\n" + additions.join("\n"));
    touched++;
  }
}

console.log(write ? `\n✍️  wrote ${touched} input file(s).` : `\n🔍 dry-run — re-run with --write to apply.`);
