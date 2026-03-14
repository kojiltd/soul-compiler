/**
 * Multi-profile weighted blend for domain icons into a SOUL section.
 *
 * Rules enforced:
 *  - Total weight <= 1.0 per section; remainder = agent own identity (floor 10%)
 *  - Max 3 references per section
 *  - Conflict priority: YAML > higher weight > lower weight
 *  - No phantom references: every icon must have non-empty content
 */

export type MergeSource = {
  name: string;
  content: string;
  weight: number;
  aspect: string;
};

export type MergeResult = {
  text: string;
  sources: { name: string; chars: number; weight: number }[];
};

export type LLMCallFn = (prompt: string) => Promise<string>;

const MAX_SOURCES = 3;
const IDENTITY_FLOOR = 0.1;

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateMergeSources(sources: MergeSource[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (sources.length > MAX_SOURCES) {
    errors.push(
      `Too many sources: ${sources.length} (max ${MAX_SOURCES})`
    );
  }

  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight > 1.0 + 1e-9) {
    errors.push(
      `Total weight ${totalWeight.toFixed(3)} exceeds 1.0`
    );
  }

  for (const s of sources) {
    if (s.weight <= 0 || s.weight > 1.0) {
      errors.push(`Source "${s.name}" has invalid weight ${s.weight}`);
    }
    if (!s.content || s.content.trim().length === 0) {
      errors.push(`Source "${s.name}" has no content (phantom reference)`);
    }
    if (!s.name || s.name.trim().length === 0) {
      errors.push("Source has empty name");
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Budget allocation
// ---------------------------------------------------------------------------

/**
 * Allocate character budget proportionally by weight.
 * Always reserves at least `identityFloor` fraction for the agent's own voice.
 *
 * Returns a record keyed by source index (as string) with char counts,
 * plus an "__identity" key for the agent's own allocation.
 */
export function allocateByWeight(
  sources: { weight: number }[],
  totalBudget: number,
  identityFloor: number = IDENTITY_FLOOR
): Record<string, number> {
  const result: Record<string, number> = {};

  const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
  const identityWeight = Math.max(identityFloor, 1.0 - totalWeight);
  const identityChars = Math.floor(totalBudget * identityWeight);
  result["__identity"] = identityChars;

  const remaining = totalBudget - identityChars;

  if (sources.length === 0 || remaining <= 0) {
    return result;
  }

  // Distribute remaining chars proportionally among sources
  let allocated = 0;
  for (let i = 0; i < sources.length; i++) {
    const share = Math.floor(remaining * (sources[i].weight / totalWeight));
    result[String(i)] = share;
    allocated += share;
  }

  // Give rounding remainder to highest-weight source
  if (allocated < remaining && sources.length > 0) {
    const maxIdx = sources.reduce(
      (best, s, idx) => (s.weight > sources[best].weight ? idx : best),
      0
    );
    result[String(maxIdx)] += remaining - allocated;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Merge multiple icon references into a single section text.
 *
 * Conflict priority is enforced by sorting sources by descending weight
 * and instructing the LLM accordingly.
 */
export async function mergeIcons(
  sources: MergeSource[],
  budget: number,
  agentOwnContent: string,
  llmCall: LLMCallFn
): Promise<MergeResult> {
  // Validate first
  const validation = validateMergeSources(sources);
  if (!validation.valid) {
    throw new Error(
      `Invalid merge sources: ${validation.errors.join("; ")}`
    );
  }

  // Handle empty sources — just return agent's own content
  if (sources.length === 0) {
    const trimmed = agentOwnContent.slice(0, budget);
    return {
      text: trimmed,
      sources: [],
    };
  }

  // Sort by weight descending (higher weight = higher priority)
  const sorted = [...sources].sort((a, b) => b.weight - a.weight);

  // Allocate budget
  const allocation = allocateByWeight(
    sorted.map((s) => ({ weight: s.weight })),
    budget,
    IDENTITY_FLOOR
  );

  const identityBudget = allocation["__identity"];

  // Build merge prompt
  const sourceBlocks = sorted
    .map((s, i) => {
      const charBudget = allocation[String(i)];
      return [
        `### Reference ${i + 1}: ${s.name} (weight: ${s.weight}, aspect: ${s.aspect}, budget: ~${charBudget} chars)`,
        s.content,
      ].join("\n");
    })
    .join("\n\n");

  const prompt = `You are merging multiple personality references into one cohesive section for an AI agent's SOUL file.

CONFLICT RESOLUTION: When references contradict, prefer higher-weight sources. Priority order (highest first):
${sorted.map((s, i) => `${i + 1}. ${s.name} (weight: ${s.weight})`).join("\n")}

AGENT'S OWN IDENTITY (~${identityBudget} chars reserved):
${agentOwnContent}

REFERENCES TO MERGE:
${sourceBlocks}

RULES:
- Total output MUST be under ${budget} characters
- Preserve the agent's own voice and identity (at least ${identityBudget} chars worth)
- Blend reference traits naturally — do not just concatenate
- Each reference's contribution should be roughly proportional to its weight
- Be specific, not generic. Use concrete behavioral examples.
- Output ONLY the merged section text, no meta-commentary.`;

  const merged = await llmCall(prompt);

  // Truncate if LLM exceeded budget
  const text = merged.length > budget ? merged.slice(0, budget) : merged;

  return {
    text,
    sources: sorted.map((s, i) => ({
      name: s.name,
      chars: allocation[String(i)],
      weight: s.weight,
    })),
  };
}
