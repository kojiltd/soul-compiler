/**
 * bootstrap-headroom — assert deployed instruction files still fit the runtime's budget.
 *
 * Why this exists (board checker NEW-5, 2026-07-19):
 * The runtime's only truncation signal is a warning emitted once per session and
 * buried in per-session trajectory JSONL on the host. When an agent genuinely
 * blew the cap it emitted 62 such warnings into one session file and nobody
 * noticed for weeks. Every size computation in this repo happens locally against
 * staged output; there was no feedback loop from what is actually deployed.
 *
 * Measured in UTF-16 code units, deliberately. `bootstrapMaxChars` is a JS
 * string-length check; CJK costs ~1 unit but 3 bytes, so `wc -c` overstates
 * these files by ~2×. Measuring bytes is what produced a two-month-old fictional
 * crisis in our own architecture doc.
 *
 * Usage: bun run bootstrap-headroom.ts [--warn N] [--cap N] [--total N]
 * Exit 1 if any file exceeds the cap; exit 0 with warnings above the threshold.
 */
import { resolveAgents, requireRemoteHost, REMOTE_WORKSPACE_BASE } from "./core/config";

const HOST = requireRemoteHost();
const AGENTS = resolveAgents();
const BOOTSTRAP_FILES = ["SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "USER.md"];

const argOf = (flag: string, dflt: number): number => {
  const i = process.argv.indexOf(flag);
  if (i === -1) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
};

/** OpenClaw v2026.4.29 defaults; see adapters/file.ts for the version caveat. */
const CAP = argOf("--cap", 12_000);
const TOTAL_CAP = argOf("--total", 60_000);
/** ~83% of cap — enough runway to notice before a deploy pushes a file over. */
const WARN_AT = argOf("--warn", 10_000);

/**
 * One ssh round-trip for everything: per-agent, per-file UTF-16 length.
 *
 * The measuring program goes over base64 rather than inline. It has to survive
 * two levels of shell quoting (local spawn, then the remote shell) while itself
 * containing quotes — encoding it sidesteps that entirely, and a length check
 * that silently mis-measures is worse than no check at all.
 *
 * UTF-16 specifically, matching the runtime: `len()` on a Python str counts code
 * points, so astral characters (emoji, which these files contain) would come out
 * one unit short each. Hence the surrogate-aware sum rather than plain len().
 */
function fetchSizes(): Record<string, Record<string, number>> {
  const py = `
import io, os, sys
base, agents, files = sys.argv[1], sys.argv[2].split(","), sys.argv[3].split(",")
for a in agents:
    for f in files:
        p = os.path.join(os.path.expanduser(base), a + "-workspace", f)
        if not os.path.isfile(p):
            continue
        s = io.open(p, encoding="utf-8").read()
        # UTF-16 code units: astral chars cost 2, everything else 1.
        n = sum(2 if ord(c) > 0xFFFF else 1 for c in s)
        print(a, f, n)
`.trim();
  const b64 = Buffer.from(py, "utf8").toString("base64");
  const script =
    `printf %s '${b64}' | base64 -d > /tmp/.soul-headroom.py && ` +
    `python3 /tmp/.soul-headroom.py '${REMOTE_WORKSPACE_BASE}' '${AGENTS.join(",")}' '${BOOTSTRAP_FILES.join(",")}'; ` +
    `rm -f /tmp/.soul-headroom.py`;

  const proc = Bun.spawnSync(["ssh", "-o", "ConnectTimeout=10", "-o", "BatchMode=yes", HOST, script], {
    maxBuffer: 1024 * 1024,
  });
  if (!proc.success) {
    console.error("ssh failed:", proc.stderr.toString().slice(-300));
    process.exit(2);
  }
  const sizes: Record<string, Record<string, number>> = {};
  for (const line of proc.stdout.toString().trim().split("\n")) {
    const [agent, file, n] = line.trim().split(/\s+/);
    if (!agent || !file || !n) continue;
    (sizes[agent] ??= {})[file] = Number(n);
  }
  return sizes;
}

const sizes = fetchSizes();

// A check that measured nothing must not report success. Silent zero-coverage is
// the exact failure this tool exists to catch — usually a remote path that
// resolved to a different home directory and matched no files at all.
const measured = Object.values(sizes).reduce((n, files) => n + Object.keys(files).length, 0);
if (measured === 0) {
  console.error(
    `no files measured under ${REMOTE_WORKSPACE_BASE} on ${HOST}.\n` +
      `  Nothing was verified — this is a failure, not a pass.\n` +
      `  Check SOUL_REMOTE_WORKSPACE_BASE: the remote home directory is often not the local one.`,
  );
  process.exit(2);
}

const over: string[] = [];
const warn: string[] = [];
const rows: string[] = [];

for (const agent of AGENTS) {
  const files = sizes[agent];
  if (!files) continue;
  let total = 0;
  for (const [file, chars] of Object.entries(files).sort()) {
    total += chars;
    const pct = Math.round((chars / CAP) * 100);
    let mark = "  ";
    if (chars > CAP) {
      mark = "🛑";
      over.push(`${agent}/${file} ${chars} chars > ${CAP}`);
    } else if (chars >= WARN_AT) {
      mark = "⚠️ ";
      warn.push(`${agent}/${file} ${chars} chars (${pct}% of cap)`);
    }
    rows.push(`${mark} ${agent.padEnd(8)} ${file.padEnd(12)} ${String(chars).padStart(6)}  ${String(pct).padStart(3)}%`);
  }
  const tpct = Math.round((total / TOTAL_CAP) * 100);
  if (total > TOTAL_CAP) over.push(`${agent} total ${total} chars > ${TOTAL_CAP}`);
  rows.push(`   ${agent.padEnd(8)} ${"TOTAL".padEnd(12)} ${String(total).padStart(6)}  ${String(tpct).padStart(3)}% of ${TOTAL_CAP}`);
  rows.push("");
}

console.log(`=== bootstrap headroom (UTF-16 chars — NOT bytes) ===`);
console.log(`cap ${CAP}/file · ${TOTAL_CAP}/agent · warn at ${WARN_AT}\n`);
console.log(rows.join("\n"));

if (warn.length > 0) {
  console.log(`⚠️  ${warn.length} file(s) above ${WARN_AT} chars — shrinking runway:`);
  for (const w of warn) console.log(`     ${w}`);
  console.log();
}
if (over.length > 0) {
  console.log(`🛑 OVER CAP — the runtime will truncate:`);
  for (const o of over) console.log(`     ${o}`);
  process.exit(1);
}
console.log(`✅ every live bootstrap file fits.`);
