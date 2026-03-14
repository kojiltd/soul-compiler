/**
 * Distill engine for Soul Compiler.
 *
 * Transforms collected org.md (raw sources) into structured reference.md files.
 * Uses Bun.file for reading per project rules.
 *
 * Thresholds (from Design Doc v1):
 *   < 1.5K chars  → direct use (no distillation needed)
 *   1.5K - 5K     → optional compress
 *   5K - 50K      → standard distill (single pass)
 *   > 50K         → heavy distill (multi-pass)
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LLMCallFn = (prompt: string) => Promise<string>;

export type ValidationResult = {
  valid: boolean;
  sections: string[];
  missing: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");

/** The 6 required sections in a reference.md */
const REQUIRED_SECTIONS = [
  "Identity",
  "Core Frameworks",
  "Behavioral Patterns",
  "Signature Phrases",
  "Application Scenarios",
  "Anti-Patterns",
] as const;

const HEAVY_DISTILL_THRESHOLD = 50_000;
const CHUNK_SIZE = 30_000;

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function distillPrompt(name: string, source: string): string {
  return `You are distilling raw source material about "${name}" into a structured reference document.

SOURCE MATERIAL:
${source}

Generate a reference document with EXACTLY these 6 sections (use ## headings):

## Identity
Who they are — background, credentials, what makes them notable.
Keep to essential facts only.

## Core Frameworks
Their key mental models, methodologies, or philosophies.
Extract 3-5 concrete frameworks they use, with brief explanations.

## Behavioral Patterns
How they act in practice — decision-making style, communication habits,
characteristic behaviors under different conditions.

## Signature Phrases
Actual quotes, catchphrases, or distinctive language patterns.
Include 5-10 representative quotes with context.

## Application Scenarios
When to apply their approach — specific situations where their thinking
is most relevant. Include 3-5 concrete scenarios.

## Anti-Patterns
What they would NEVER do — things that contradict their philosophy,
behaviors they explicitly reject. This is critical for maintaining
character consistency.

RULES:
- Be specific — no vague summaries
- Preserve original language/quotes where possible
- Each section should be self-contained
- Total output should be 2,000-4,000 chars
- Use the person's actual words, not your interpretation`;
}

function chunkDistillPrompt(name: string, chunk: string, chunkIndex: number, totalChunks: number): string {
  return `You are extracting key information from chunk ${chunkIndex + 1}/${totalChunks} of source material about "${name}".

CHUNK:
${chunk}

Extract and organize the most important information from this chunk.
Focus on: identity facts, mental models, behavioral patterns, quotes, and anti-patterns.
Output structured notes (not a final reference — these will be merged later).
Keep to 1,500-2,500 chars.`;
}

function mergeDistillPrompt(name: string, extractedChunks: string[]): string {
  const combined = extractedChunks.join("\n\n---\n\n");
  return `You are merging extracted notes about "${name}" into a final structured reference.

EXTRACTED NOTES FROM MULTIPLE PASSES:
${combined}

${distillPrompt(name, "").split("SOURCE MATERIAL:")[1]!.split("RULES:")[0]}

RULES:
- Deduplicate information across chunks
- Prioritize specificity over breadth
- Preserve the best quotes (not all of them)
- Total output: 2,500-4,500 chars
- Use ## headings for each section`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Standard distill: reads 1_sources/{name}/org.md, produces 2_references/{name}.md.
 * For sources under 50K chars. Returns the distilled reference content.
 */
export async function distill(name: string, llmCall: LLMCallFn): Promise<string> {
  const sourcePath = resolve(DATA_DIR, "1_sources", name, "org.md");
  const outputPath = resolve(DATA_DIR, "2_references", `${name}.md`);

  const file = Bun.file(sourcePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Source not found: ${sourcePath}`);
  }

  const source = await file.text();

  // If source is huge, redirect to heavy distill
  if (source.length > HEAVY_DISTILL_THRESHOLD) {
    return heavyDistill(name, llmCall);
  }

  const prompt = distillPrompt(name, source);
  const result = await llmCall(prompt);

  // Write output
  await Bun.write(outputPath, result);

  return result;
}

/**
 * Heavy distill: multi-pass extraction for sources > 50K chars.
 * Splits source into chunks, extracts from each, then merges.
 */
export async function heavyDistill(name: string, llmCall: LLMCallFn): Promise<string> {
  const sourcePath = resolve(DATA_DIR, "1_sources", name, "org.md");
  const outputPath = resolve(DATA_DIR, "2_references", `${name}.md`);

  const file = Bun.file(sourcePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Source not found: ${sourcePath}`);
  }

  const source = await file.text();

  // Split into chunks
  const chunks: string[] = [];
  for (let i = 0; i < source.length; i += CHUNK_SIZE) {
    chunks.push(source.slice(i, i + CHUNK_SIZE));
  }

  // Pass 1: extract from each chunk
  const extracted: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const prompt = chunkDistillPrompt(name, chunks[i]!, i, chunks.length);
    const result = await llmCall(prompt);
    extracted.push(result);
  }

  // Pass 2: merge all extractions into final reference
  const mergePrompt = mergeDistillPrompt(name, extracted);
  const result = await llmCall(mergePrompt);

  // Write output
  await Bun.write(outputPath, result);

  return result;
}

/**
 * Validate that a reference.md has all 6 required sections.
 */
export function validateReference(refContent: string): ValidationResult {
  const found: string[] = [];
  const missing: string[] = [];

  for (const section of REQUIRED_SECTIONS) {
    // Match ## heading with the section name (case-insensitive)
    const pattern = new RegExp(`^##\\s+${escapeRegex(section)}`, "im");
    if (pattern.test(refContent)) {
      found.push(section);
    } else {
      missing.push(section);
    }
  }

  return {
    valid: missing.length === 0,
    sections: found,
    missing,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
