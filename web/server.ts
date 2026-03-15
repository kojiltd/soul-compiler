import { readdir, readFile, writeFile, mkdir, copyFile, exists } from "fs/promises";
import { join, basename } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const PORT = 3000;
const MOCK_MODE = process.argv.includes("--mock");
const SOUL_CONFIGS = join(process.env.HOME!, ".openclaw", "soul-configs");
const TEMPLATE_YAML = join(SOUL_CONFIGS, "_system", "_template.yaml");
const PROMPTS_DIR = join(SOUL_CONFIGS, "_system", "prompts");

if (MOCK_MODE) console.log("⚠️  MOCK MODE — LLM calls return simulated data");

// --- Prompt Loader ---
// Prompts are loaded from ~/.openclaw/soul-configs/_system/prompts/
// This keeps compilation logic private and configurable.

async function loadPrompt(name: string): Promise<string> {
  const promptPath = join(PROMPTS_DIR, `${name}.md`);
  if (await exists(promptPath)) {
    return readFile(promptPath, "utf-8");
  }
  // Fallback: generic prompt if custom not found
  return `You are a Soul Compiler. Process the following input and return a well-structured result.\n\n`;
}

// --- Helpers ---

async function listAgents(): Promise<string[]> {
  const entries = await readdir(SOUL_CONFIGS, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && e.name.startsWith("agent."))
    .map((e) => e.name.replace("agent.", ""));
}

async function readAgentData(name: string) {
  const agentDir = join(SOUL_CONFIGS, `agent.${name}`);
  const yamlPath = join(agentDir, `${name}.yaml`);

  const yamlContent = await readFile(yamlPath, "utf-8");
  const config = parseYaml(yamlContent);

  const inputDir = join(agentDir, "input.d");
  const inputFiles: Record<string, string> = {};
  if (await exists(inputDir)) {
    const files = await readdir(inputDir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        inputFiles[f] = await readFile(join(inputDir, f), "utf-8");
      }
    }
  }

  const examplesDir = join(agentDir, "examples.d");
  const exampleFiles: Record<string, string> = {};
  if (await exists(examplesDir)) {
    const files = await readdir(examplesDir);
    for (const f of files) {
      if (f.endsWith(".md")) {
        exampleFiles[f] = await readFile(join(examplesDir, f), "utf-8");
      }
    }
  }

  const compiledDir = join(SOUL_CONFIGS, "4_compiled");
  const compiledPath = join(compiledDir, `${name}-TRUE_SOUL.md`);
  let compiled = "";
  if (await exists(compiledPath)) {
    compiled = await readFile(compiledPath, "utf-8");
  }

  return { config, yamlRaw: yamlContent, inputFiles, exampleFiles, compiled };
}

async function listOpenClawAgents(): Promise<Array<{ id: string; name: string; model: string }>> {
  try {
    const configPath = join(process.env.HOME!, ".openclaw", "openclaw.json");
    const raw = await readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    const agentList = config?.agents?.list || [];
    return agentList.map((a: any) => ({
      id: a.id,
      name: a.identity?.name || a.id,
      model: typeof a.model === "string" ? a.model : a.model?.primary || "unknown",
    }));
  } catch {
    return [];
  }
}

async function callOpenClaw(agentId: string, message: string): Promise<string> {
  if (MOCK_MODE) return mockLLMResponse(message);
  const proc = Bun.spawn(
    ["openclaw", "agent", "--agent", agentId, "--message", message, "--no-stream"],
    { stdout: "pipe", stderr: "pipe" }
  );
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  return text.trim();
}

function mockLLMResponse(prompt: string): string {
  if (prompt.includes("collect")) return "# Mock Source\n\nSample collected material for testing.\n\n## Philosophy\nFirst-principles thinking.\n\n## Decisions\nBold, calculated risks.\n\n## Quotes\n\"Move fast, break things.\"\n\n## Patterns\nDirect communication style.\n\n## Weaknesses\nTimeline optimism.";
  if (prompt.includes("distill")) return "# Distilled Reference\n\n## Core Model\nFirst-principles reasoning.\n\n## Key Patterns\n1. Vertical integration\n2. Aggressive timelines\n\n## Quotes\n\"Persistence is key.\"";
  if (prompt.includes("trait")) return "# Trait Card\n\n## Decision Style\n- First-principles\n\n## Communication\n- Direct, data-driven\n\n## Risk Model\n- High tolerance\n\n## Emotional Pattern\n- Passion-driven\n\n## Signature Moves\n- Bold public commitments\n\n## Anti-Patterns\n- Timeline optimism\n\n## Quotes\n- \"If it's important, try even if you'll probably fail.\"";
  if (prompt.includes("analyze")) return JSON.stringify([
    { id: "core", source: "yaml", title: "Base Personality", content: "Core identity.", score: 85, status: "append", reason: "No conflict" },
    { id: "icon1", source: "yaml", title: "Domain Icon", content: "Reference influence.", score: 50, status: "conflict", reason: "Weight tension" },
    { id: "input1", source: "input", title: "Behavior Rules", content: "Guidelines.", score: 72, status: "append", reason: "Compatible" }
  ]);
  if (prompt.includes("compile")) return "# TRUE_SOUL\n\n## Identity\nI am a strategic thinker.\n\n## Cognitive Framework\nFirst-principles analysis.\n\n## Personality\nDirect but empathetic.\n\n## Examples\nUser: What should I do?\nAgent: What does the data say?\n\n## Boundaries\nDirect answers for urgent queries.";
  return "Mock response.";
}

// --- Pipeline Helpers ---

const SOURCES_DIR = join(SOUL_CONFIGS, "1_sources");
const REFERENCES_DIR = join(SOUL_CONFIGS, "2_references");
const TRAIT_CARDS_DIR = join(SOUL_CONFIGS, "3_trait_cards");

async function listSources(): Promise<Array<{ name: string; files: string[] }>> {
  if (!(await exists(SOURCES_DIR))) return [];
  const entries = await readdir(SOURCES_DIR, { withFileTypes: true });
  const sources = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const files = await readdir(join(SOURCES_DIR, e.name));
      sources.push({ name: e.name, files });
    }
  }
  return sources;
}

async function listReferences(): Promise<Array<{ name: string; lines: number; chars: number }>> {
  if (!(await exists(REFERENCES_DIR))) return [];
  const files = await readdir(REFERENCES_DIR);
  const refs = [];
  for (const f of files.filter((f) => f.endsWith(".md"))) {
    const content = await readFile(join(REFERENCES_DIR, f), "utf-8");
    refs.push({ name: f.replace(".md", ""), lines: content.split("\n").length, chars: content.length });
  }
  return refs;
}

async function listTraitCards(): Promise<Array<{ name: string; chars: number }>> {
  if (!(await exists(TRAIT_CARDS_DIR))) return [];
  const files = await readdir(TRAIT_CARDS_DIR);
  const cards = [];
  for (const f of files.filter((f) => f.endsWith(".trait.md"))) {
    const content = await readFile(join(TRAIT_CARDS_DIR, f), "utf-8");
    cards.push({ name: f.replace(".trait.md", ""), chars: content.length });
  }
  return cards;
}

async function readPipelineFile(dir: string, filename: string): Promise<string> {
  const filepath = join(dir, filename);
  if (await exists(filepath)) return readFile(filepath, "utf-8");
  return "";
}

// --- Router ---

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleApi(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // === Pipeline endpoints ===

  // GET /api/pipeline — full pipeline overview
  if (path === "/api/pipeline" && method === "GET") {
    const [sources, references, traitCards, agents] = await Promise.all([
      listSources(), listReferences(), listTraitCards(), listAgents(),
    ]);
    return jsonResponse({ sources, references, traitCards, agents });
  }

  // GET /api/sources — list source folders
  if (path === "/api/sources" && method === "GET") {
    return jsonResponse(await listSources());
  }

  // GET /api/source/:name — read source files
  const sourceMatch = path.match(/^\/api\/source\/([a-z0-9_-]+)$/);
  if (sourceMatch && method === "GET") {
    const dir = join(SOURCES_DIR, sourceMatch[1]);
    if (!(await exists(dir))) return jsonResponse({ error: "Not found" }, 404);
    const files = await readdir(dir);
    const contents: Record<string, string> = {};
    for (const f of files) {
      contents[f] = await readFile(join(dir, f), "utf-8");
    }
    return jsonResponse({ name: sourceMatch[1], files: contents });
  }

  // GET /api/references
  if (path === "/api/references" && method === "GET") {
    return jsonResponse(await listReferences());
  }

  // GET /api/reference/:name
  const refMatch = path.match(/^\/api\/reference\/([a-z0-9_-]+)$/);
  if (refMatch && method === "GET") {
    const content = await readPipelineFile(REFERENCES_DIR, `${refMatch[1]}.md`);
    if (!content) return jsonResponse({ error: "Not found" }, 404);
    return jsonResponse({ name: refMatch[1], content });
  }

  // GET /api/trait-cards
  if (path === "/api/trait-cards" && method === "GET") {
    return jsonResponse(await listTraitCards());
  }

  // GET /api/trait-card/:name
  const tcMatch = path.match(/^\/api\/trait-card\/([a-z0-9_-]+)$/);
  if (tcMatch && method === "GET") {
    const content = await readPipelineFile(TRAIT_CARDS_DIR, `${tcMatch[1]}.trait.md`);
    if (!content) return jsonResponse({ error: "Not found" }, 404);
    return jsonResponse({ name: tcMatch[1], content });
  }

  // POST /api/collect — collect new source material via LLM
  if (path === "/api/collect" && method === "POST") {
    const body = await req.json();
    const { name, input, type, agentId } = body;
    if (!name || !input || !agentId) {
      return jsonResponse({ error: "Missing name, input, or agentId" }, 400);
    }

    const cleanName = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
    const sourceDir = join(SOURCES_DIR, cleanName);
    await mkdir(sourceDir, { recursive: true });

    const promptTemplate = await loadPrompt(`collect-${type}`);
    const prompt = promptTemplate
      .replace("{{input}}", input)
      .replace("{{name}}", cleanName);

    try {
      const result = await callOpenClaw(agentId, prompt);
      const filename = type === "url" ? "from-url.md" : type === "paste" ? "from-paste.md" : "org.md";
      await writeFile(join(sourceDir, filename), result);
      return jsonResponse({ ok: true, name: cleanName, chars: result.length });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // POST /api/distill/:name
  if (path.match(/^\/api\/distill\//) && method === "POST") {
    const name = path.split("/").pop()!;
    const body = await req.json();
    const { agentId } = body;

    const sourceDir = join(SOURCES_DIR, name);
    if (!(await exists(sourceDir))) return jsonResponse({ error: "Source not found" }, 404);

    const files = await readdir(sourceDir);
    let allContent = "";
    for (const f of files) {
      allContent += `=== ${f} ===\n${await readFile(join(sourceDir, f), "utf-8")}\n\n`;
    }

    const promptTemplate = await loadPrompt("distill");
    const prompt = promptTemplate
      .replace("{{content}}", allContent)
      .replace("{{chars}}", String(allContent.length));

    try {
      const result = await callOpenClaw(agentId, prompt);
      await writeFile(join(REFERENCES_DIR, `${name}.md`), result);
      return jsonResponse({ ok: true, name, chars: result.length });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // POST /api/extract-trait/:name
  if (path.match(/^\/api\/extract-trait\//) && method === "POST") {
    const name = path.split("/").pop()!;
    const body = await req.json();
    const { agentId } = body;

    const refPath = join(REFERENCES_DIR, `${name}.md`);
    if (!(await exists(refPath))) return jsonResponse({ error: "Reference not found" }, 404);
    const refContent = await readFile(refPath, "utf-8");

    const promptTemplate = await loadPrompt("extract-trait");
    const prompt = promptTemplate
      .replace("{{name}}", name)
      .replace("{{content}}", refContent)
      .replace("{{chars}}", String(refContent.length));

    try {
      const result = await callOpenClaw(agentId, prompt);
      await writeFile(join(TRAIT_CARDS_DIR, `${name}.trait.md`), result);
      return jsonResponse({ ok: true, name, chars: result.length });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // === Agent endpoints ===

  // GET /api/agents
  if (path === "/api/agents" && method === "GET") {
    const agents = await listAgents();
    return jsonResponse(agents);
  }

  // GET /api/openclaw-agents
  if (path === "/api/openclaw-agents" && method === "GET") {
    const agents = await listOpenClawAgents();
    return jsonResponse(agents);
  }

  // GET /api/agent/:name
  const agentMatch = path.match(/^\/api\/agent\/([a-z0-9_-]+)$/);
  if (agentMatch && method === "GET") {
    try {
      const data = await readAgentData(agentMatch[1]);
      return jsonResponse(data);
    } catch (e: any) {
      return jsonResponse({ error: "Agent not found" }, 404);
    }
  }

  // POST /api/agent — create new agent
  if (path === "/api/agent" && method === "POST") {
    const body = await req.json();
    const name = body.name?.trim().toLowerCase();
    if (!name || !/^[a-z0-9_-]+$/.test(name)) {
      return jsonResponse({ error: "Invalid agent name" }, 400);
    }
    const agentDir = join(SOUL_CONFIGS, `agent.${name}`);
    if (await exists(agentDir)) {
      return jsonResponse({ error: "Agent already exists" }, 409);
    }
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(agentDir, "input.d"), { recursive: true });
    await mkdir(join(agentDir, "examples.d"), { recursive: true });

    let template = await readFile(TEMPLATE_YAML, "utf-8");
    template = template.replace(/^agent:\s*$/m, `agent: ${name}`);
    template = template.replace(/^name:\s*$/m, `name: ${name}`);
    await writeFile(join(agentDir, `${name}.yaml`), template);

    return jsonResponse({ ok: true, name });
  }

  // PUT /api/agent/:name — save YAML
  if (agentMatch && method === "PUT") {
    const body = await req.json();
    const name = agentMatch[1];
    const yamlPath = join(SOUL_CONFIGS, `agent.${name}`, `${name}.yaml`);
    if (body.yaml) {
      await writeFile(yamlPath, body.yaml);
    }
    if (body.inputFiles) {
      const inputDir = join(SOUL_CONFIGS, `agent.${name}`, "input.d");
      for (const [filename, content] of Object.entries(body.inputFiles)) {
        const safeFilename = basename(filename);
        if (!safeFilename || safeFilename !== filename || safeFilename.startsWith('.')) {
          continue;
        }
        await writeFile(join(inputDir, safeFilename), content as string);
      }
    }
    return jsonResponse({ ok: true });
  }

  // POST /api/analyze/:name
  const analyzeMatch = path.match(/^\/api\/analyze\/([a-z0-9_-]+)$/);
  if (analyzeMatch && method === "POST") {
    const body = await req.json();
    const name = analyzeMatch[1];
    const agentId = body.agentId;

    const data = await readAgentData(name);
    const prompt = await buildPromptFromTemplate("analyze", data);

    try {
      const result = await callOpenClaw(agentId, prompt);
      const sections = parseAnalysisResult(result);
      return jsonResponse({ sections });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // POST /api/compile/:name
  const compileMatch = path.match(/^\/api\/compile\/([a-z0-9_-]+)$/);
  if (compileMatch && method === "POST") {
    const body = await req.json();
    const name = compileMatch[1];
    const agentId = body.agentId;

    const data = await readAgentData(name);
    const prompt = await buildPromptFromTemplate("compile", data);

    try {
      const result = await callOpenClaw(agentId, prompt);
      const compiledDir = join(SOUL_CONFIGS, "4_compiled");
      await mkdir(compiledDir, { recursive: true });
      await writeFile(join(compiledDir, `${name}-TRUE_SOUL.md`), result);
      return jsonResponse({ ok: true, compiled: result });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return null;
}

// --- Prompt Template Builder ---

async function buildPromptFromTemplate(
  type: string,
  data: ReturnType<typeof readAgentData> extends Promise<infer T> ? T : never
): Promise<string> {
  const template = await loadPrompt(type);
  const { yamlRaw, inputFiles, exampleFiles, compiled } = data;

  const inputContent = Object.entries(inputFiles)
    .map(([f, c]) => `=== ${f} ===\n${c}`)
    .join("\n\n");
  const exampleContent = Object.entries(exampleFiles)
    .map(([f, c]) => `=== ${f} ===\n${c}`)
    .join("\n\n");

  return template
    .replace("{{yaml}}", yamlRaw)
    .replace("{{input_files}}", inputContent)
    .replace("{{example_files}}", exampleContent)
    .replace("{{compiled}}", compiled || "No compiled output yet.");
}

function parseAnalysisResult(result: string): any[] {
  try {
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : parsed.sections || [];
  } catch {
    return [
      {
        id: "raw",
        source: "analysis",
        title: "Analysis Result",
        content: result,
        score: 50,
        status: "conflict",
        reason: "Could not parse structured response",
      },
    ];
  }
}

// --- Static Files ---

async function serveStatic(path: string): Promise<Response | null> {
  const publicDir = join(import.meta.dir, "public");
  let filePath = join(publicDir, path === "/" ? "index.html" : path);

  const file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file);
  }
  return null;
}

// --- Server ---

Bun.serve({
  hostname: "0.0.0.0",
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        const resp = await handleApi(req);
        if (resp) return resp;
      } catch (e: any) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    const staticResp = await serveStatic(url.pathname);
    if (staticResp) return staticResp;

    return await serveStatic("/") ?? new Response("Not Found", { status: 404 });
  },
});

console.log(`🧬 Soul Compiler Web UI running at http://localhost:${PORT}`);
