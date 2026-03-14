/**
 * Soul Compiler — Main compile engine.
 *
 * Takes agent YAML config + trait cards + input.d/ content and
 * produces a TRUE_SOUL.md output in data/4_compiled/.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAgentConfig, type AgentConfig } from "./schema.ts";
import {
  allocateBudget,
  checkBudget,
  formatBudgetReport,
  SECTIONS,
  TOTAL_BUDGET,
  type Section,
  type BudgetAllocation,
} from "./budget.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LLMCallFn = (prompt: string) => Promise<string>;

export type CompileResult = {
  outputPath: string;
  content: string;
  sections: { id: string; title: string; content: string; chars: number }[];
  budgetReport: string;
  totalChars: number;
  ok: boolean;
  errors: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

/** Section titles keyed by section ID. */
const SECTION_TITLES: Record<Section, string> = {
  A: "Identity",
  B: "PJ Layer",
  C: "Domain Expertise",
  D: "Traits",
  E: "Examples",
  F: "Boundaries",
  G: "Language",
  H: "Relationships",
  I: "Safety/Ops",
};

/** Section descriptions used in LLM prompts. */
const SECTION_DESCRIPTIONS: Record<Section, string> = {
  A: "Agent identity, backstory, appearance, and core personality. This is who the agent IS.",
  B: "Patrick Jane observation layer — social skills, cold reading, question-over-answer techniques. Scaled by jane_ratio.",
  C: "Domain expertise from reference icons — frameworks, mental models, and specialized knowledge the agent has internalized.",
  D: "Personality trait dimensions expressed as behavioral tendencies (warmth, dominance, humor, etc).",
  E: "Example dialogues demonstrating the agent's voice, reactions, and decision patterns in realistic scenarios.",
  F: "Behavioral boundaries — when to give direct answers, when to guide, vulnerable_override rules.",
  G: "Language style — dialect, verbal tics, sentence patterns, emoji usage, formality levels.",
  H: "Relationships with Cody and other agents — dynamics, stories, emotional bonds.",
  I: "Safety and operational rules — hard limits, system constraints, never-do rules. This section is placed LAST so it survives truncation.",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve path to data directory. */
export function dataDir(): string {
  return DATA_DIR;
}

/** Load all trait cards referenced by domain icons. */
async function loadTraitCards(
  icons: AgentConfig["domain_icons"],
): Promise<Map<string, string>> {
  const cards = new Map<string, string>();
  const traitCardDir = resolve(DATA_DIR, "3_trait_cards");

  for (const icon of icons) {
    // Derive trait card filename from reference or name
    const refBase = icon.reference
      ? icon.reference.replace(/\.md$/, "")
      : icon.name.toLowerCase().replace(/\s+/g, "-");
    const traitPath = resolve(traitCardDir, `${refBase}.trait.md`);

    try {
      const file = Bun.file(traitPath);
      if (await file.exists()) {
        cards.set(icon.name, await file.text());
      }
    } catch {
      // Trait card not found — not fatal
    }
  }

  return cards;
}

/** Load input.d/ files for an agent, returning content tagged with section hints. */
async function loadInputD(agentName: string): Promise<string[]> {
  const inputDir = resolve(DATA_DIR, `agent.${agentName}`, "input.d");
  const results: string[] = [];

  try {
    const glob = new Bun.Glob("*.md");
    for await (const path of glob.scan({ cwd: inputDir })) {
      const file = Bun.file(resolve(inputDir, path));
      const content = await file.text();
      results.push(content);
    }
  } catch {
    // No input.d/ directory — not fatal
  }

  return results;
}

/** Extract input.d content relevant to a specific section. */
function filterInputDForSection(
  inputDContents: string[],
  section: Section,
): string[] {
  const sectionTag = `[Section ${section}]`;
  const sectionTitle = SECTION_TITLES[section].toLowerCase();

  return inputDContents.filter((content) => {
    // Match explicit section tags
    if (content.includes(sectionTag)) return true;

    // Match by content heuristics
    const lower = content.toLowerCase();
    if (section === "I" && (lower.includes("operational") || lower.includes("life-rhythm") || lower.includes("生活節奏"))) return true;
    if (section === "F" && (lower.includes("boundar") || lower.includes("邊界"))) return true;
    if (section === "G" && (lower.includes("language") || lower.includes("語言"))) return true;
    if (section === "D" && (lower.includes("micro-behavior") || lower.includes("微行為"))) return true;

    // Fallback: check if section title appears
    if (lower.includes(sectionTitle)) return true;

    return false;
  });
}

/** Load PJ playbook content. */
async function loadPJPlaybook(): Promise<string> {
  const path = resolve(DATA_DIR, "_system", "pj-playbook.md");
  try {
    const file = Bun.file(path);
    if (await file.exists()) {
      return await file.text();
    }
  } catch {
    // Not fatal
  }
  return "";
}

/** Build the LLM prompt for compiling a single section. */
export function buildSectionPrompt(
  section: Section,
  config: AgentConfig,
  traitCards: Map<string, string>,
  inputDContent: string[],
  budget: number,
  pjPlaybook: string,
): string {
  const parts: string[] = [];

  parts.push(`# Compile Section ${section}: ${SECTION_TITLES[section]}`);
  parts.push("");
  parts.push(`## Section Purpose`);
  parts.push(SECTION_DESCRIPTIONS[section]);
  parts.push("");
  parts.push(`## Budget: ${budget} characters maximum`);
  parts.push("");

  // Agent personality context
  parts.push(`## Agent: ${config.name} (${config.agent})`);
  parts.push(`Role: ${config.role}`);
  parts.push(`Base Personality: ${config.base_personality}`);
  if (config.language) parts.push(`Language: ${config.language}`);
  parts.push("");

  // Section-specific content
  if (section === "A") {
    parts.push(`## Identity Details`);
    if (config.image) parts.push(`Image: ${config.image}`);
    if (config.backstory) parts.push(`Backstory: ${config.backstory}`);
    parts.push("");
  }

  if (section === "B") {
    parts.push(`## PJ Layer (jane_ratio: ${config.jane_ratio})`);
    parts.push(`Scale all PJ techniques by ${config.jane_ratio} intensity.`);
    if (pjPlaybook) {
      parts.push("");
      parts.push("## PJ Playbook Reference:");
      parts.push(pjPlaybook.slice(0, 3000));
    }
    parts.push("");
  }

  if (section === "C") {
    parts.push(`## Domain Icons`);
    for (const icon of config.domain_icons) {
      parts.push(`- ${icon.name} (weight: ${icon.weight}): ${icon.aspect}`);
      const card = traitCards.get(icon.name);
      if (card) {
        parts.push(`  Trait Card:`);
        parts.push(card);
      }
    }
    parts.push("");
  }

  if (section === "D") {
    parts.push(`## Trait Dimensions`);
    for (const [trait, value] of Object.entries(config.traits)) {
      parts.push(`- ${trait}: ${value}`);
    }
    if (config.seduction_style) {
      parts.push(`\nSeduction Style: ${config.seduction_style}`);
    }
    parts.push("");
  }

  if (section === "F" && config.boundaries) {
    parts.push(`## Boundaries Config`);
    parts.push(`vulnerable_override: ${config.boundaries.vulnerable_override}`);
    if (config.boundaries.direct_answer_triggers) {
      parts.push(`Direct answer triggers: ${config.boundaries.direct_answer_triggers.join(", ")}`);
    }
    if (config.boundaries.guide_triggers) {
      parts.push(`Guide triggers: ${config.boundaries.guide_triggers.join(", ")}`);
    }
    parts.push("");
  }

  if (section === "G" && config.language) {
    parts.push(`## Language Configuration`);
    parts.push(config.language);
    parts.push("");
  }

  if (section === "H" && config.relationships) {
    parts.push(`## Relationships`);
    for (const [name, desc] of Object.entries(config.relationships)) {
      parts.push(`### ${name}`);
      parts.push(desc);
    }
    parts.push("");
  }

  // input.d/ verbatim content
  if (inputDContent.length > 0) {
    parts.push(`## Verbatim Input (MUST include as-is in output):`);
    for (const content of inputDContent) {
      parts.push(content);
    }
    parts.push("");
  }

  parts.push(`## Instructions`);
  parts.push(`Write Section ${section} (${SECTION_TITLES[section]}) for ${config.name}.`);
  parts.push(`Stay within ${budget} characters. Write in ${config.language || "繁體中文"}.`);
  parts.push(`Agent identity floor: 10% minimum — the agent's own voice must always be present.`);
  parts.push(`Output ONLY the section content (no section header, no metadata).`);

  return parts.join("\n");
}

/** Format date as YYYYMMDD. */
function dateStamp(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Format date for header display. */
function dateDisplay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile an agent's YAML config + trait cards + input.d/ into TRUE_SOUL.md.
 *
 * @param agentName - Agent identifier (e.g. "eve", "hana")
 * @param llmCall - Function that sends a prompt to an LLM and returns the response
 */
export async function compile(
  agentName: string,
  llmCall: LLMCallFn,
): Promise<CompileResult> {
  const errors: string[] = [];

  // 1. Load + validate YAML config
  let config: AgentConfig;
  try {
    config = await loadAgentConfig(agentName);
  } catch (e) {
    return {
      outputPath: "",
      content: "",
      sections: [],
      budgetReport: "Failed to load config",
      totalChars: 0,
      ok: false,
      errors: [`Config load failed: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  // 2. Allocate budget per section
  const budget = allocateBudget({
    jane_ratio: config.jane_ratio,
    domain_icons: config.domain_icons,
    relationships: config.relationships,
  });

  // 3. Load trait cards for domain icons
  const traitCards = await loadTraitCards(config.domain_icons);

  // 4. Load input.d/ content
  const inputDContents = await loadInputD(agentName);

  // 5. Load PJ playbook
  const pjPlaybook = await loadPJPlaybook();

  // 6. Compile each section A-H via LLM, then append I last
  const compiledSections: CompileResult["sections"] = [];

  for (const section of SECTIONS) {
    const relevantInputD = filterInputDForSection(inputDContents, section);
    const prompt = buildSectionPrompt(
      section,
      config,
      traitCards,
      relevantInputD,
      budget[section],
      pjPlaybook,
    );

    let sectionContent: string;
    try {
      sectionContent = await llmCall(prompt);
    } catch (e) {
      const errMsg = `LLM call failed for Section ${section}: ${e instanceof Error ? e.message : String(e)}`;
      errors.push(errMsg);
      sectionContent = `[COMPILE ERROR: ${errMsg}]`;
    }

    // Inject input.d/ verbatim content that wasn't already included
    for (const inputContent of relevantInputD) {
      if (!sectionContent.includes(inputContent.trim())) {
        sectionContent += "\n\n" + inputContent;
      }
    }

    compiledSections.push({
      id: section,
      title: SECTION_TITLES[section],
      content: sectionContent,
      chars: sectionContent.length,
    });
  }

  // 7. Assemble final document — Section I is already last in SECTIONS order
  const iconNames = config.domain_icons.map((i) => i.name).join(", ");
  const header = [
    `# ${config.name} — TRUE SOUL`,
    `# Generated by Soul Compiler v2 | ${dateDisplay()}`,
    `# Source: ${agentName}.yaml + trait cards (${iconNames || "none"}) + input.d`,
    `# DO NOT EDIT — edit source then recompile`,
    "",
    "---",
  ].join("\n");

  const body = compiledSections
    .map((s) => `\n## Section ${s.id}: ${s.title}\n\n${s.content}`)
    .join("\n\n---\n");

  const content = header + body + "\n";
  const totalChars = content.length;

  // 8. Budget check
  const budgetCheck = checkBudget(content, budget);
  const budgetReport = formatBudgetReport(budgetCheck);

  if (!budgetCheck.ok) {
    errors.push(`Budget exceeded: ${totalChars} / ${TOTAL_BUDGET} chars`);
  }

  // 9. Archive previous compiled file
  const outputDir = resolve(DATA_DIR, "4_compiled");
  const outputPath = resolve(outputDir, `${agentName}-TRUE_SOUL.md`);

  try {
    const existingFile = Bun.file(outputPath);
    if (await existingFile.exists()) {
      const archivePath = resolve(
        outputDir,
        `${agentName}-TRUE_SOUL.${dateStamp()}.md`,
      );
      const archiveFile = Bun.file(archivePath);
      // Only archive if archive doesn't already exist
      if (!(await archiveFile.exists())) {
        await Bun.write(archivePath, await existingFile.text());
      }
    }
  } catch {
    errors.push("Warning: failed to archive previous compiled file");
  }

  // 10. Write output
  try {
    await Bun.write(outputPath, content);
  } catch (e) {
    errors.push(`Write failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return {
    outputPath,
    content,
    sections: compiledSections,
    budgetReport,
    totalChars,
    ok: errors.length === 0 && budgetCheck.ok,
    errors,
  };
}
