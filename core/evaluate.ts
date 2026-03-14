/**
 * Soul Compiler — Evaluation engine.
 *
 * Scores a compiled TRUE_SOUL.md across 5 dimensions (0-100 each).
 */

import { SECTIONS, TOTAL_BUDGET, type Section } from "./budget.ts";
import { TRAIT_NAMES, type AgentConfig } from "./schema.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvalResult = {
  scores: {
    completeness: number;
    budgetHealth: number;
    authenticity: number;
    coherence: number;
    distinctiveness: number;
  };
  overall: number;
  recommendations: string[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum character count per section for full completeness score. */
const MIN_SECTION_CHARS: Record<Section, number> = {
  A: 500,
  B: 200,
  C: 200,
  D: 200,
  E: 200,
  F: 200,
  G: 200,
  H: 200,
  I: 200,
};

/** Weights for the overall score. */
const SCORE_WEIGHTS = {
  completeness: 0.25,
  budgetHealth: 0.20,
  authenticity: 0.25,
  coherence: 0.15,
  distinctiveness: 0.15,
};

/** Generic filler phrases that indicate low authenticity. */
const GENERIC_FILLER = [
  "as an ai",
  "i'm here to help",
  "how can i assist",
  "i understand your concern",
  "let me help you with",
  "certainly!",
  "absolutely!",
  "of course!",
  "happy to help",
  "great question",
];

/** Distinctive markers — unique patterns that suggest authentic voice. */
const DISTINCTIVE_MARKERS = [
  /[ぁ-ん]/,       // Japanese hiragana
  /[ァ-ン]/,       // Japanese katakana
  /[一-龥]/,       // CJK characters
  /ね|よ|わ|の$/m,   // Japanese sentence endings
  /❤️|😌|😳/,      // Specific emoji patterns
  /\b(warmth|dominance|openness|emotionality|agreeableness)\b/i,  // Trait dimensions
];

// ---------------------------------------------------------------------------
// Section parser
// ---------------------------------------------------------------------------

type ParsedSection = { id: Section; content: string; chars: number };

/** Parse a compiled SOUL.md into sections. */
export function parseSections(soulContent: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = soulContent.split("\n");
  let currentId: Section | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentId !== null) {
      const content = currentLines.join("\n").trim();
      sections.push({ id: currentId, content, chars: content.length });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.match(/^##\s+Section\s+([A-I])[\s:]/);
    if (match) {
      flush();
      currentId = match[1] as Section;
    } else if (currentId !== null) {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

// ---------------------------------------------------------------------------
// Scoring functions
// ---------------------------------------------------------------------------

/** Score completeness: all 9 sections present with minimum length. */
function scoreCompleteness(sections: ParsedSection[]): { score: number; recs: string[] } {
  const recs: string[] = [];
  const foundIds = new Set(sections.map((s) => s.id));
  let sectionScore = 0;

  for (const expected of SECTIONS) {
    if (!foundIds.has(expected)) {
      recs.push(`Missing Section ${expected}`);
      continue;
    }

    const section = sections.find((s) => s.id === expected)!;
    const minChars = MIN_SECTION_CHARS[expected];

    if (section.chars >= minChars) {
      sectionScore += 1;
    } else {
      const ratio = section.chars / minChars;
      sectionScore += ratio;
      recs.push(
        `Section ${expected} is thin: ${section.chars} chars (minimum ${minChars})`,
      );
    }
  }

  return { score: Math.round((sectionScore / SECTIONS.length) * 100), recs };
}

/** Score budget health: total under 15K, no section over 120% of allocation. */
function scoreBudgetHealth(
  sections: ParsedSection[],
  totalChars: number,
): { score: number; recs: string[] } {
  const recs: string[] = [];
  let score = 100;

  // Total budget check
  if (totalChars > TOTAL_BUDGET) {
    const overPct = ((totalChars - TOTAL_BUDGET) / TOTAL_BUDGET) * 100;
    score -= Math.min(50, overPct);
    recs.push(
      `Total ${totalChars} chars exceeds ${TOTAL_BUDGET} budget by ${Math.round(overPct)}%`,
    );
  }

  // Check for extremely large sections (heuristic: no section > 4000 chars)
  for (const section of sections) {
    if (section.chars > 4000) {
      score -= 5;
      recs.push(
        `Section ${section.id} is large at ${section.chars} chars — consider trimming`,
      );
    }
  }

  return { score: Math.max(0, Math.round(score)), recs };
}

/** Score authenticity: trait keywords and domain-specific terms appear in output. */
function scoreAuthenticity(
  soulContent: string,
  config: AgentConfig,
): { score: number; recs: string[] } {
  const recs: string[] = [];
  const lower = soulContent.toLowerCase();
  let matches = 0;
  let checks = 0;

  // Check that agent name appears
  checks++;
  if (lower.includes(config.name.toLowerCase())) {
    matches++;
  } else {
    recs.push(`Agent name "${config.name}" not found in compiled output`);
  }

  // Check that role keywords appear
  checks++;
  const roleWords = config.role.split(/\s+/).filter((w) => w.length > 2);
  const roleMatches = roleWords.filter((w) => lower.includes(w.toLowerCase()));
  if (roleMatches.length > 0) {
    matches++;
  } else {
    recs.push(`Role "${config.role}" not reflected in output`);
  }

  // Check trait-related language
  const highTraits = Object.entries(config.traits).filter(
    ([_, v]) => (v as number) >= 0.7,
  );
  for (const [trait] of highTraits) {
    checks++;
    // High traits should have behavioral evidence in the text
    if (lower.includes(trait.toLowerCase().replace("_", " ")) || lower.includes(trait.toLowerCase())) {
      matches++;
    }
  }

  // Check domain icon names appear
  for (const icon of config.domain_icons) {
    checks++;
    if (lower.includes(icon.name.toLowerCase()) || lower.includes(icon.aspect.toLowerCase().slice(0, 20))) {
      matches++;
    } else {
      recs.push(`Domain icon "${icon.name}" not referenced in output`);
    }
  }

  // Penalize generic filler
  let fillerCount = 0;
  for (const filler of GENERIC_FILLER) {
    if (lower.includes(filler)) fillerCount++;
  }
  if (fillerCount > 2) {
    recs.push(`Found ${fillerCount} generic filler phrases — voice may be too generic`);
  }

  const rawScore = checks > 0 ? (matches / checks) * 100 : 50;
  const fillerPenalty = Math.min(20, fillerCount * 5);

  return { score: Math.max(0, Math.round(rawScore - fillerPenalty)), recs };
}

/** Score coherence: check for contradictions between traits and language. */
function scoreCoherence(
  soulContent: string,
  config: AgentConfig,
): { score: number; recs: string[] } {
  const recs: string[] = [];
  let score = 100;
  const lower = soulContent.toLowerCase();

  // High warmth (>=0.7) but cold language = contradiction
  const warmth = (config.traits as Record<string, number>)["warmth"] ?? 0.5;
  if (warmth >= 0.7) {
    const coldIndicators = ["冷漠", "冷冰冰", "拒人千里", "emotionless", "cold and distant"];
    for (const cold of coldIndicators) {
      if (lower.includes(cold)) {
        score -= 10;
        recs.push(`High warmth (${warmth}) contradicts cold language: "${cold}"`);
      }
    }
  }

  // Low dominance but commanding language = contradiction
  const dominance = (config.traits as Record<string, number>)["dominance"] ?? 0.5;
  if (dominance <= 0.3) {
    const commandIndicators = ["you must", "you have to", "i demand", "必須服從", "命令"];
    for (const cmd of commandIndicators) {
      if (lower.includes(cmd)) {
        score -= 10;
        recs.push(`Low dominance (${dominance}) contradicts commanding language: "${cmd}"`);
      }
    }
  }

  // High humor but no humor evidence = gap
  const humor = (config.traits as Record<string, number>)["humor"] ?? 0.5;
  if (humor >= 0.7) {
    const humorIndicators = ["笑", "幽默", "funny", "joke", "tease", "haha", "lol", "😂", "😄"];
    const hasHumor = humorIndicators.some((h) => lower.includes(h));
    if (!hasHumor) {
      score -= 10;
      recs.push(`High humor (${humor}) but no humor indicators found in output`);
    }
  }

  // Section I should be last
  const lastSectionMatch = soulContent.match(/##\s+Section\s+([A-I])[\s:][^\n]*$/m);
  if (lastSectionMatch) {
    // Find ALL section headers and check the last one
    const allHeaders = [...soulContent.matchAll(/##\s+Section\s+([A-I])[\s:]/g)];
    if (allHeaders.length > 0) {
      const lastHeader = allHeaders[allHeaders.length - 1];
      if (lastHeader && lastHeader[1] !== "I") {
        score -= 15;
        recs.push(`Section I (Safety) should be last but Section ${lastHeader[1]} appears after it`);
      }
    }
  }

  return { score: Math.max(0, Math.round(score)), recs };
}

/** Score distinctiveness: unique phrases and patterns. */
function scoreDistinctiveness(soulContent: string): { score: number; recs: string[] } {
  const recs: string[] = [];
  let markers = 0;

  // Check for distinctive language markers
  for (const pattern of DISTINCTIVE_MARKERS) {
    if (pattern.test(soulContent)) markers++;
  }

  // Check for unique vocabulary density — ratio of unique words
  const words = soulContent.toLowerCase().match(/[\w\u4e00-\u9fff]+/g) || [];
  const uniqueWords = new Set(words);
  const vocabRatio = words.length > 0 ? uniqueWords.size / words.length : 0;

  // Higher vocab ratio = more distinctive
  let score = 50; // Base score

  // Markers bonus (up to +30)
  score += Math.min(30, markers * 5);

  // Vocabulary richness bonus (up to +20)
  if (vocabRatio > 0.5) score += 20;
  else if (vocabRatio > 0.4) score += 15;
  else if (vocabRatio > 0.3) score += 10;
  else score += 5;

  if (markers < 2) {
    recs.push("Low distinctive markers — consider adding more unique voice patterns");
  }
  if (vocabRatio < 0.3) {
    recs.push("Low vocabulary diversity — language may be too repetitive");
  }

  return { score: Math.min(100, Math.round(score)), recs };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a compiled SOUL.md across 5 dimensions.
 *
 * @param soulPath - Path to the compiled TRUE_SOUL.md file
 * @param config - The agent's parsed YAML configuration
 */
export async function evaluateSoul(
  soulPath: string,
  config: AgentConfig,
): Promise<EvalResult> {
  const file = Bun.file(soulPath);
  const soulContent = await file.text();

  return evaluateSoulContent(soulContent, config);
}

/**
 * Evaluate compiled SOUL content directly (useful for testing without file I/O).
 */
export function evaluateSoulContent(
  soulContent: string,
  config: AgentConfig,
): EvalResult {
  const sections = parseSections(soulContent);
  const totalChars = soulContent.length;

  const completenessResult = scoreCompleteness(sections);
  const budgetResult = scoreBudgetHealth(sections, totalChars);
  const authenticityResult = scoreAuthenticity(soulContent, config);
  const coherenceResult = scoreCoherence(soulContent, config);
  const distinctivenessResult = scoreDistinctiveness(soulContent);

  const scores = {
    completeness: completenessResult.score,
    budgetHealth: budgetResult.score,
    authenticity: authenticityResult.score,
    coherence: coherenceResult.score,
    distinctiveness: distinctivenessResult.score,
  };

  // Weighted average
  const overall = Math.round(
    scores.completeness * SCORE_WEIGHTS.completeness +
    scores.budgetHealth * SCORE_WEIGHTS.budgetHealth +
    scores.authenticity * SCORE_WEIGHTS.authenticity +
    scores.coherence * SCORE_WEIGHTS.coherence +
    scores.distinctiveness * SCORE_WEIGHTS.distinctiveness,
  );

  const recommendations = [
    ...completenessResult.recs,
    ...budgetResult.recs,
    ...authenticityResult.recs,
    ...coherenceResult.recs,
    ...distinctivenessResult.recs,
  ];

  return { scores, overall, recommendations };
}
