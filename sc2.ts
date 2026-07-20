/**
 * sc2 — one-command SC2.0 pipeline.
 *
 *   bun run sc2.ts <souls-dir> [agents|all] [--apply]
 *
 * <souls-dir> holds `<agent>-live-soul.md`. Default review-only (proposes, shows
 * pending, extracts nothing). `--apply` approves all pending + injects to out/.
 */
import { runPipeline, formatPipeline, type Soul } from "./core/pipeline";
import { resolveAgents } from "./core/config";

const SYS =
  "你係一個精準嘅 soul-chunk 分類器。完全跟足 user prompt 嘅 taxonomy。只輸出一個 JSON array,每個 chunk 一個 object,唔好加任何開場白、解釋、或 markdown code fence。";
const llmCall = async (prompt: string): Promise<string> => {
  const b64 = Buffer.from(prompt, "utf8").toString("base64");
  const s64 = Buffer.from(SYS, "utf8").toString("base64");
  const script =
    `MSG=$(printf %s '${b64}' | base64 -d); SYS=$(printf %s '${s64}' | base64 -d); ` +
    `claude -p "$MSG" --system-prompt "$SYS" --model opus --max-turns 1 --output-format json`;
  const proc = Bun.spawnSync(["bash", "-lc", script], { maxBuffer: 1024 * 1024 * 16 });
  const out = proc.stdout.toString();
  if (!proc.success || !out) throw new Error("claude -p failed: " + proc.stderr.toString().slice(-300));
  const j = JSON.parse(out);
  if (j.is_error) throw new Error("claude -p returned error");
  return (j.result || "").trim();
};

const ALL = resolveAgents();
const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun run sc2.ts <souls-dir> [agents|all] [--apply]");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const agentArg = process.argv[3] && !process.argv[3].startsWith("--") ? process.argv[3] : "all";
const agents = agentArg === "all" ? ALL : agentArg.split(",");

const souls: Soul[] = [];
for (const a of agents) {
  const f = Bun.file(`${dir}/${a}-live-soul.md`);
  if (await f.exists()) souls.push({ agent: a, content: await f.text() });
  else console.error(`skip ${a}: no ${a}-live-soul.md`);
}

console.log(`sc2 — ${souls.length} agents — mode: ${apply ? "APPLY" : "review"}\n`);
const result = await runPipeline(souls, llmCall, { apply });
console.log(formatPipeline(result));
