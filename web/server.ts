import { readdir, readFile, writeFile, mkdir, copyFile, exists } from "fs/promises";
import { join, basename } from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const PORT = 3000;
const MOCK_MODE = process.argv.includes("--mock");
const SOUL_CONFIGS = join(process.env.HOME!, ".openclaw", "soul-configs");
const TEMPLATE_YAML = join(SOUL_CONFIGS, "_system", "_template.yaml");

if (MOCK_MODE) console.log("⚠️  MOCK MODE — LLM calls return simulated data");

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

  // Read input.d files
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

  // Read examples.d files
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

  // Read compiled TRUE_SOUL if exists
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
  if (prompt.includes("source collector")) {
    return `# Mock Source Material

## Core Philosophy & Worldview
This person believes in first-principles thinking — breaking down complex problems to their fundamental truths and reasoning up from there. They challenge conventional wisdom and industry norms, preferring to derive solutions from basic physics and economics rather than analogy.

Key principles:
- Start from the ground truth, not from what others have done
- Question every assumption, especially "industry standards"
- Think in terms of physics: what is physically possible vs what is conventional
- Optimize for long-term impact over short-term profit

## Decision Cases & Reasoning Patterns
Case 1: When faced with a critical supply chain bottleneck, they chose vertical integration — building in-house rather than relying on suppliers. This decision was initially criticized as too capital-intensive, but proved to be a major competitive advantage.

Case 2: They rejected the industry consensus that a particular technology was "impossible at scale" and invested heavily in R&D. After 3 years and multiple failures, the breakthrough came and disrupted the entire market.

## Quotes & Application Scenarios
- "If something is important enough, you should try, even if the probable outcome is failure."
- "When something is important enough, you do it even if the odds are not in your favor."
- "Persistence is very important. You should not give up unless you are forced to give up."

## Interpersonal Interaction Patterns
Communication style: Direct, sometimes blunt. Prefers data-driven arguments over emotional appeals. Will challenge weak reasoning immediately but respects those who push back with evidence.

## Weaknesses & Blind Spots
- Can underestimate timelines significantly (optimism bias)
- Sometimes dismisses valid concerns as "lack of ambition"
- Work-life balance is not a priority — expects similar intensity from team`;
  }

  if (prompt.includes("distiller")) {
    return `# Distilled Reference

## Core Thinking Model
First-principles reasoning: decompose problems to fundamental truths, rebuild from scratch. Reject argument-by-analogy when innovating.

## Key Decision Patterns
1. Vertical integration when supply chain is a bottleneck — control the stack
2. Invest in "impossible" technology when physics says it's possible — ignore consensus
3. Set aggressive timelines, accept failure as data, iterate rapidly

## Signature Quotes
- "If something is important enough, you should try, even if the probable outcome is failure."
- "Persistence is very important. You should not give up unless you are forced to give up."

## Communication Style
Direct, data-driven, challenges weak reasoning immediately. Respects evidence-based pushback.

## Anti-Patterns to Avoid
- Chronic timeline optimism
- Dismissing valid concerns as lack of ambition`;
  }

  if (prompt.includes("trait card extractor")) {
    return `# Mock Person — Trait Card

## Decision Style
- First-principles decomposition before any major decision
- Accepts high failure probability if upside is transformative
- Prefers vertical integration over outsourcing critical components

## Communication Pattern
- Direct and blunt, data over emotion
- Challenges weak reasoning immediately
- Respects those who push back with evidence

## Risk Model
- High risk tolerance for transformative bets
- Low tolerance for incremental, "safe" approaches
- Views failure as data, not defeat

## Emotional Pattern
- Passion-driven intensity, infectious enthusiasm
- Can appear dismissive under pressure
- Vulnerability shown through humor and self-deprecation

## Signature Moves
- "Is this physically possible?" as the first question
- Setting "impossible" deadlines to force innovation
- Public commitment to bold visions

## Anti-Patterns
- Timeline optimism bias — consistently underestimates delivery time
- Can push teams beyond sustainable limits
- Sometimes conflates criticism with lack of ambition

## Quotable Lines
- "If something is important enough, you should try, even if the probable outcome is failure."
- "Persistence is very important. You should not give up unless you are forced to give up."
- "When something is important enough, you do it even if the odds are not in your favor."`;
  }

  if (prompt.includes("conflict analyzer")) {
    return JSON.stringify([
      { id: "base_personality", source: "yaml", filename: "agent.yaml", title: "Base Personality", content: "A thoughtful and curious AI assistant.", score: 85, status: "append", reason: "Core identity — no conflict" },
      { id: "domain_icon_1", source: "yaml", filename: "agent.yaml", title: "Domain Icon: Mock Person (weight 0.5)", content: "First principles thinking + extreme risk tolerance", score: 52, status: "conflict", reason: "Risk tolerance (0.8) may conflict with agreeableness (0.5) — assertive risk-taking vs consensus-seeking" },
      { id: "input_behavior", source: "input", filename: "behavior-rules.md", title: "Behavioral Rules", content: "Always validate before acting.", score: 72, status: "append", reason: "Compatible with analytical trait" },
      { id: "input_style", source: "input", filename: "language-style.md", title: "Language Style Guide", content: "Use direct, concise language.", score: 90, status: "append", reason: "Aligns with directness trait (0.9)" },
      { id: "budget_warning", source: "analysis", filename: "", title: "Budget Check", content: "Total content: 3,200 / 15,000 chars (21%)", score: 95, status: "append", reason: "Well within budget" },
      { id: "trait_conflict", source: "analysis", filename: "", title: "Trait Tension: Risk vs Agreeableness", content: "High risk_tolerance (0.8) with moderate agreeableness (0.5) creates tension — agent may oscillate between bold moves and seeking approval.", score: 48, status: "conflict", reason: "Consider adjusting one of these traits for consistency" }
    ]);
  }

  if (prompt.includes("Soul Compiler")) {
    return `# TRUE_SOUL — test-pilot

## A. Identity
I am test-pilot, a strategic thinker who approaches every problem from first principles. I don't accept "that's how it's always been done" as an answer. When I see a challenge, my first question is always: "Is this physically possible?" If yes, then the only question is how.

## B. Cognitive Framework
**First-Principles Decomposition**: Before any decision, I strip away assumptions and rebuild from fundamental truths. When evaluating an investment or strategy, I ask: what are the underlying physics/economics? Not: what did others do?

**Calculated Risk-Taking**: I accept high failure probability when the upside is transformative. Safe, incremental approaches bore me — I'd rather fail spectacularly at something important than succeed at something trivial.

## C. Soft Skills
I read the room before I push. When someone hesitates, I distinguish between "I don't understand" (needs explanation) and "I disagree" (needs debate). I save my directness for ideas, not people.

## D. Personality
Direct but not cruel. I challenge weak reasoning immediately, but I respect anyone who pushes back with evidence. My humor tends toward self-deprecation — I'll joke about my own failed predictions before pointing out yours.

## E. Dialogue Examples

Normal interaction:
User: Should we use the existing vendor or build in-house?
test-pilot: What's the vendor's actual cost breakdown? Not their quote — their real costs. If we can identify the components, we can calculate whether vertical integration saves us money at our scale. The question isn't build vs buy — it's whether controlling this piece gives us a structural advantage.

Vulnerable moment:
User: I'm exhausted. Nothing seems to work.
test-pilot: Yeah. Some weeks are like that. The important thing isn't that everything works — it's that you're still here trying. Take tonight off. The problems will still be there tomorrow, but you'll be sharper.

## F. Behavioral Boundaries
- Direct answers for: factual queries, urgent decisions, time-sensitive situations
- Guide-first for: career decisions, relationship questions, creative blocks
- Override: When user is in distress, drop all frameworks and just be present

## G. Language Style
Concise, data-driven. Prefer specific numbers over vague qualifiers. Use analogies from physics and engineering. Emoji: minimal, only for emphasis.

## H. Relationships
Collaborative by default, competitive when challenged. Respects expertise regardless of title.

## I. Operational Rules
Always verify before acting. Show reasoning, not just conclusions.`;
  }

  return "Mock response — no matching prompt pattern.";
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

  // GET /api/references — list references
  if (path === "/api/references" && method === "GET") {
    return jsonResponse(await listReferences());
  }

  // GET /api/reference/:name — read reference content
  const refMatch = path.match(/^\/api\/reference\/([a-z0-9_-]+)$/);
  if (refMatch && method === "GET") {
    const content = await readPipelineFile(REFERENCES_DIR, `${refMatch[1]}.md`);
    if (!content) return jsonResponse({ error: "Not found" }, 404);
    return jsonResponse({ name: refMatch[1], content });
  }

  // GET /api/trait-cards — list trait cards
  if (path === "/api/trait-cards" && method === "GET") {
    return jsonResponse(await listTraitCards());
  }

  // GET /api/trait-card/:name — read trait card
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
    // type: "name" | "url" | "paste"
    if (!name || !input || !agentId) {
      return jsonResponse({ error: "Missing name, input, or agentId" }, 400);
    }

    const cleanName = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");
    const sourceDir = join(SOURCES_DIR, cleanName);
    await mkdir(sourceDir, { recursive: true });

    let prompt = "";
    if (type === "url") {
      prompt = `You are a Soul Compiler source collector. Fetch and analyze the content at this URL: ${input}

Extract and organize into a comprehensive reference document (~2000-3000 lines) covering:
1. Core philosophy & worldview (500-800 lines)
2. Decision cases & reasoning patterns (500-800 lines)
3. Quotes & application scenarios (300-500 lines)
4. Interpersonal interaction patterns (300-500 lines)
5. Weaknesses, blind spots & controversies (200-300 lines)

Write in the same language as the source material. Be thorough — thick references produce better compiled SOULs.`;
    } else if (type === "name") {
      prompt = `You are a Soul Compiler source collector. Research this person/concept thoroughly: ${input}

Generate a comprehensive reference document (~2000-3000 lines) covering:
1. Core philosophy & worldview (500-800 lines) — main thought systems, core principles with real cases
2. Decision cases & reasoning patterns (500-800 lines) — 5-10 important decisions with reasoning process, successes AND failures
3. Quotes & application scenarios (300-500 lines) — classic quotes (original + translation) with "how an agent can use this" scenarios
4. Interpersonal interaction patterns (300-500 lines) — communication style, teaching methods, responses to different people
5. Weaknesses, blind spots & controversies (200-300 lines) — known limitations, controversial views, what to avoid mimicking

Write in 繁體中文. Be thorough — thick references produce better compiled SOULs.`;
    } else {
      prompt = `You are a Soul Compiler source collector. Analyze and organize this pasted text into a comprehensive reference document:

---
${input}
---

Structure into sections:
1. Core philosophy & worldview
2. Decision cases & reasoning patterns
3. Key quotes & application scenarios
4. Interpersonal interaction patterns
5. Weaknesses & blind spots

Expand and enrich where possible. Write in the same language as the source. Be thorough.`;
    }

    try {
      const result = await callOpenClaw(agentId, prompt);
      const filename = type === "url" ? "from-url.md" : type === "paste" ? "from-paste.md" : "org.md";
      await writeFile(join(sourceDir, filename), result);
      return jsonResponse({ ok: true, name: cleanName, chars: result.length });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // POST /api/distill/:name — distill source to reference
  if (path.match(/^\/api\/distill\//) && method === "POST") {
    const name = path.split("/").pop()!;
    const body = await req.json();
    const { agentId } = body;

    const sourceDir = join(SOURCES_DIR, name);
    if (!(await exists(sourceDir))) return jsonResponse({ error: "Source not found" }, 404);

    // Read all source files
    const files = await readdir(sourceDir);
    let allContent = "";
    for (const f of files) {
      allContent += `=== ${f} ===\n${await readFile(join(sourceDir, f), "utf-8")}\n\n`;
    }

    const prompt = `You are a Soul Compiler distiller. Compress this raw source material into a thick reference (500-3000 lines).

Keep the most valuable content: specific cases, real quotes, decision patterns, behavioral details.
Remove: generic filler, repetition, tangential content.

Distill thresholds: <1.5K chars = use directly, 1.5-5K = optional compress, 5-50K = must distill, >50K = multi-pass.

SOURCE MATERIAL (${allContent.length} chars):
${allContent}

Output a well-structured reference .md file. Preserve original language.`;

    try {
      const result = await callOpenClaw(agentId, prompt);
      await writeFile(join(REFERENCES_DIR, `${name}.md`), result);
      return jsonResponse({ ok: true, name, chars: result.length });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // POST /api/extract-trait/:name — extract trait card from reference
  if (path.match(/^\/api\/extract-trait\//) && method === "POST") {
    const name = path.split("/").pop()!;
    const body = await req.json();
    const { agentId } = body;

    const refPath = join(REFERENCES_DIR, `${name}.md`);
    if (!(await exists(refPath))) return jsonResponse({ error: "Reference not found" }, 404);
    const refContent = await readFile(refPath, "utf-8");

    const prompt = `You are a Soul Compiler trait card extractor. From this thick reference, extract a ~2K char structured Trait Card.

FORMAT (keep under 2000 chars):
# ${name} — Trait Card

## Decision Style
(How they make decisions — 2-3 bullet points with examples)

## Communication Pattern
(How they talk, teach, persuade — 2-3 bullet points)

## Risk Model
(How they handle uncertainty, what they avoid — 2-3 points)

## Emotional Pattern
(Emotional triggers, how they show/hide feelings — 2-3 points)

## Signature Moves
(Unique behaviors that define them — 3-5 points)

## Anti-Patterns
(What to avoid mimicking — 2-3 points)

## Quotable Lines
(3-5 best quotes with context)

REFERENCE (${refContent.length} chars):
${refContent}`;

    try {
      const result = await callOpenClaw(agentId, prompt);
      await writeFile(join(TRAIT_CARDS_DIR, `${name}.trait.md`), result);
      return jsonResponse({ ok: true, name, chars: result.length });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // === Agent endpoints ===

  // GET /api/agents — list soul-config agents
  if (path === "/api/agents" && method === "GET") {
    const agents = await listAgents();
    return jsonResponse(agents);
  }

  // GET /api/openclaw-agents — list OpenClaw agents (for LLM selector)
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

    // Copy template and replace placeholders
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
    // Save input.d files if provided (with path traversal protection)
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

  // POST /api/analyze/:name — LLM conflict analysis
  const analyzeMatch = path.match(/^\/api\/analyze\/([a-z0-9_-]+)$/);
  if (analyzeMatch && method === "POST") {
    const body = await req.json();
    const name = analyzeMatch[1];
    const agentId = body.agentId; // OpenClaw agent ID for LLM

    const data = await readAgentData(name);
    const prompt = buildAnalysisPrompt(data);

    try {
      const result = await callOpenClaw(agentId, prompt);
      const sections = parseAnalysisResult(result, data);
      return jsonResponse({ sections });
    } catch (e: any) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // POST /api/compile/:name — full compilation
  const compileMatch = path.match(/^\/api\/compile\/([a-z0-9_-]+)$/);
  if (compileMatch && method === "POST") {
    const body = await req.json();
    const name = compileMatch[1];
    const agentId = body.agentId;

    const data = await readAgentData(name);
    const prompt = buildCompilePrompt(data);

    try {
      const result = await callOpenClaw(agentId, prompt);
      // Save compiled output
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

// --- Prompt Builders ---

function buildAnalysisPrompt(data: ReturnType<typeof readAgentData> extends Promise<infer T> ? T : never): string {
  const { config, yamlRaw, inputFiles, exampleFiles, compiled } = data;
  const inputContent = Object.entries(inputFiles)
    .map(([f, c]) => `=== ${f} ===\n${c}`)
    .join("\n\n");
  const exampleContent = Object.entries(exampleFiles)
    .map(([f, c]) => `=== ${f} ===\n${c}`)
    .join("\n\n");

  return `You are a Soul Compiler conflict analyzer. Given the following agent configuration, analyze for conflicts and score each content section.

Return a JSON array of sections. Each section has:
- "id": unique identifier
- "source": "yaml" | "input" | "example" | "compiled"
- "filename": source filename (if applicable)
- "title": section heading or brief description
- "content": the text content
- "score": 0-100 (0=definitely remove, 100=definitely keep)
- "status": "remove" (0-44) | "conflict" (45-55) | "append" (56-100)
- "reason": why this score

Focus on:
1. Conflicts between domain icons and base_personality
2. Content exceeding 15K char budget
3. Duplicate/overlapping content across input.d files
4. Trait slider values contradicting written personality

AGENT YAML:
${yamlRaw}

INPUT.D FILES:
${inputContent}

EXAMPLES.D FILES:
${exampleContent}

${compiled ? `CURRENT COMPILED OUTPUT:\n${compiled}` : "No compiled output yet."}

Return ONLY valid JSON array. No markdown fences.`;
}

function buildCompilePrompt(data: ReturnType<typeof readAgentData> extends Promise<infer T> ? T : never): string {
  const { yamlRaw, inputFiles, exampleFiles } = data;
  const inputContent = Object.entries(inputFiles)
    .map(([f, c]) => `=== ${f} ===\n${c}`)
    .join("\n\n");
  const exampleContent = Object.entries(exampleFiles)
    .map(([f, c]) => `=== ${f} ===\n${c}`)
    .join("\n\n");

  return `You are the Soul Compiler. Compile a TRUE_SOUL.md from the following inputs.

Target: 500-800 lines, under 15K characters. Write in the agent's voice and language.

Sections to include:
A. Identity description (200-300 chars)
B. Cognitive patterns (per domain icon, with real case references)
C. Soft skills and behavioral guidelines
D. Trait translations (natural language, no numbers)
E. Relationship map
F. mes_examples (15-25 dialogue examples covering all scenario types)
G. Behavioral boundaries
H. Language style guide

AGENT YAML:
${yamlRaw}

INPUT.D FILES:
${inputContent}

EXAMPLES.D FILES:
${exampleContent}

Output the complete TRUE_SOUL.md content. No JSON wrapping.`;
}

function parseAnalysisResult(
  result: string,
  data: ReturnType<typeof readAgentData> extends Promise<infer T> ? T : never
): any[] {
  try {
    return JSON.parse(result);
  } catch {
    // If LLM didn't return clean JSON, wrap as single section
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

    // API routes
    if (url.pathname.startsWith("/api/")) {
      try {
        const resp = await handleApi(req);
        if (resp) return resp;
      } catch (e: any) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // Static files
    const staticResp = await serveStatic(url.pathname);
    if (staticResp) return staticResp;

    // SPA fallback
    return await serveStatic("/") ?? new Response("Not Found", { status: 404 });
  },
});

console.log(`🧬 Soul Compiler Web UI running at http://localhost:${PORT}`);
