/**
 * deploy-prep — generate a lossless standalone split for ONE agent + verify no
 * content was lost. Writes to out-deploy/<agent>/. Does NOT touch the live host.
 */
import { resolve } from "node:path";
import { classifyWithLock } from "./core/route-lock";
import { injectToFiles, formatInjectReport } from "./adapters/file";
import { loadSharedRegistry, resolveShared } from "./core/shared-registry";
import { stripGeneratedNoise } from "./core/classify";
import { mintSoulVersion } from "./core/soul-version";

const SYS =
  "你係一個精準嘅 soul-chunk 分類器。完全跟足 user prompt 嘅 taxonomy。只輸出一個 JSON array,每個 chunk 一個 object,唔好加任何開場白、解釋、或 markdown code fence。";
const llmCall = async (prompt: string): Promise<string> => {
  const b64 = Buffer.from(prompt, "utf8").toString("base64");
  const s64 = Buffer.from(SYS, "utf8").toString("base64");
  const script = `MSG=$(printf %s '${b64}' | base64 -d); SYS=$(printf %s '${s64}' | base64 -d); claude -p "$MSG" --system-prompt "$SYS" --model opus --max-turns 1 --output-format json`;
  const proc = Bun.spawnSync(["bash", "-lc", script], { maxBuffer: 1024 * 1024 * 16 });
  const out = proc.stdout.toString();
  if (!proc.success || !out) throw new Error("claude -p failed: " + proc.stderr.toString().slice(-300));
  const j = JSON.parse(out);
  if (j.is_error) throw new Error("claude -p returned error");
  return (j.result || "").trim();
};

const SCR = process.argv[2];
const agent = process.argv[3] || "example";
const content = await Bun.file(`${SCR}/${agent}-live-soul.md`).text();
const outDir = resolve(import.meta.dir, "out-deploy", agent);

const registry = await loadSharedRegistry();
const resolver = (body: string) => {
  const r = resolveShared(body, registry);
  return r ? { class: r.class, sharedKey: r.sharedKey } : null;
};

const cls = await classifyWithLock(agent, content, llmCall, { resolveShared: resolver, requireApproval: false, write: false });

// Mint the soul's identity BEFORE writing: downstream refraction instruments key on
// soul_version (judgment.py append_recompiled), and nothing else in the stack
// knows when a soul actually changed.
const lineage = mintSoulVersion(agent, content, cls.map, { stampedAt: new Date().toISOString().slice(0, 10) });

const inj = await injectToFiles(agent, content, cls.map, { outDir, lossless: true, standalone: true, lineage });
console.log(`=== ${agent} lossless standalone split ===`);
console.log(`soul_version: ${lineage.soulVersion}  (${lineage.chunkCount} chunks, compiler ${lineage.compilerCommit ?? "unknown"})`);
console.log(formatInjectReport(inj));

await Bun.write(resolve(outDir, "soul.lineage.json"), JSON.stringify(lineage, null, 2) + "\n");

// Losslessness check: every substantive content line of the original (after the
// same cruft-strip) must appear in the union of the deployed files.
const cleanedOrig = stripGeneratedNoise(content, { stripTitles: true });
let union = "";
for (const f of inj.files) union += "\n" + (await Bun.file(resolve(outDir, f.path)).text());
const origLines = cleanedOrig
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length >= 8 && !/^#{1,6}\s/.test(l));
const missing = origLines.filter((l) => !union.includes(l));
console.log(`\n=== losslessness ===`);
console.log(`original substantive lines: ${origLines.length} | missing in deployed files: ${missing.length}`);
if (missing.length > 0) {
  console.log("⚠️ MISSING (would be lost):");
  for (const l of missing.slice(0, 15)) console.log("   " + l.slice(0, 90));
} else {
  console.log("✅ LOSSLESS — every content line present in the deployed bootstrap files");
}
const total = inj.files.reduce((n, f) => n + f.chars, 0);
console.log(`\ndeployed: ${inj.files.length} files, ${total}c total (orig ${content.length}c), max file ${Math.max(...inj.files.map((f) => f.chars))}c (cap 12000)`);
