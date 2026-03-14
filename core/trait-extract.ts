/**
 * Extract a ~2000 char Trait Card from a reference file.
 *
 * Trait Card sections with char limits:
 *  - Decision Style (300)
 *  - Communication (250)
 *  - Risk Model (250)
 *  - Emotional Pattern (200)
 *  - Signature Moves (400) — must be SPECIFIC not generic
 *  - Anti-Patterns (200) — must be ACTIONABLE
 *  - Quotable Lines (300)
 *
 * Total <= 2000 chars.
 */

export type TraitCard = {
  decisionStyle: string;
  communication: string;
  riskModel: string;
  emotionalPattern: string;
  signatureMoves: string[];
  antiPatterns: string[];
  quotableLines: string[];
};

export type LLMCallFn = (prompt: string) => Promise<string>;

const SECTION_LIMITS: Record<keyof TraitCard, number> = {
  decisionStyle: 300,
  communication: 250,
  riskModel: 250,
  emotionalPattern: 200,
  signatureMoves: 400,
  antiPatterns: 200,
  quotableLines: 300,
};

const TOTAL_LIMIT = 2000;

// Generic phrases that indicate lazy extraction — Signature Moves must be specific
const GENERIC_MOVE_PATTERNS = [
  /^makes? good/i,
  /^is (a )?good/i,
  /^works? hard/i,
  /^tries? (to be |their )?best/i,
  /^leads? (by example|well|effectively)/i,
  /^communicates? (well|effectively|clearly)/i,
  /^thinks? (carefully|strategically|critically)$/i,
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function validateTraitCard(card: TraitCard): {
  valid: boolean;
  errors: string[];
  totalChars: number;
} {
  const errors: string[] = [];

  // Check required scalar sections
  const scalarKeys: (keyof TraitCard)[] = [
    "decisionStyle",
    "communication",
    "riskModel",
    "emotionalPattern",
  ];
  for (const key of scalarKeys) {
    const value = card[key];
    if (!value || (typeof value === "string" && value.trim().length === 0)) {
      errors.push(`Missing section: ${key}`);
    }
  }

  // Check required array sections
  const arrayKeys: (keyof TraitCard)[] = [
    "signatureMoves",
    "antiPatterns",
    "quotableLines",
  ];
  for (const key of arrayKeys) {
    const value = card[key];
    if (!value || !Array.isArray(value) || value.length === 0) {
      errors.push(`Missing section: ${key}`);
    }
  }

  // Check individual section char limits
  const sectionChars = computeSectionChars(card);
  for (const [key, limit] of Object.entries(SECTION_LIMITS)) {
    const chars = sectionChars[key as keyof TraitCard] ?? 0;
    if (chars > limit) {
      errors.push(
        `Section "${key}" is ${chars} chars (limit: ${limit})`
      );
    }
  }

  // Check total
  const totalChars = Object.values(sectionChars).reduce((a, b) => a + b, 0);
  if (totalChars > TOTAL_LIMIT) {
    errors.push(`Total ${totalChars} chars exceeds limit of ${TOTAL_LIMIT}`);
  }

  // Check for generic signature moves
  if (card.signatureMoves) {
    for (const move of card.signatureMoves) {
      for (const pattern of GENERIC_MOVE_PATTERNS) {
        if (pattern.test(move.trim())) {
          errors.push(
            `Generic Signature Move detected: "${move}" — must be specific`
          );
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, totalChars };
}

function computeSectionChars(card: TraitCard): Record<keyof TraitCard, number> {
  return {
    decisionStyle: (card.decisionStyle ?? "").length,
    communication: (card.communication ?? "").length,
    riskModel: (card.riskModel ?? "").length,
    emotionalPattern: (card.emotionalPattern ?? "").length,
    signatureMoves: (card.signatureMoves ?? []).join("\n").length,
    antiPatterns: (card.antiPatterns ?? []).join("\n").length,
    quotableLines: (card.quotableLines ?? []).join("\n").length,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatTraitCard(card: TraitCard, name: string): string {
  const lines: string[] = [
    `# Trait Card: ${name}`,
    "",
    "## Decision Style",
    card.decisionStyle,
    "",
    "## Communication",
    card.communication,
    "",
    "## Risk Model",
    card.riskModel,
    "",
    "## Emotional Pattern",
    card.emotionalPattern,
    "",
    "## Signature Moves",
    ...card.signatureMoves.map((m) => `- ${m}`),
    "",
    "## Anti-Patterns",
    ...card.antiPatterns.map((a) => `- ${a}`),
    "",
    "## Quotable Lines",
    ...card.quotableLines.map((q) => `> ${q}`),
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export function parseTraitCard(markdown: string): TraitCard {
  const section = (heading: string): string => {
    const regex = new RegExp(
      `## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`
    );
    const match = markdown.match(regex);
    return match ? match[1].trim() : "";
  };

  const listItems = (text: string): string[] =>
    text
      .split("\n")
      .map((line) => line.replace(/^[-*]\s*/, "").trim())
      .filter((line) => line.length > 0);

  const quoteItems = (text: string): string[] =>
    text
      .split("\n")
      .map((line) => line.replace(/^>\s*/, "").trim())
      .filter((line) => line.length > 0);

  return {
    decisionStyle: section("Decision Style"),
    communication: section("Communication"),
    riskModel: section("Risk Model"),
    emotionalPattern: section("Emotional Pattern"),
    signatureMoves: listItems(section("Signature Moves")),
    antiPatterns: listItems(section("Anti-Patterns")),
    quotableLines: quoteItems(section("Quotable Lines")),
  };
}

// ---------------------------------------------------------------------------
// Extraction via LLM
// ---------------------------------------------------------------------------

export async function extractTraitCard(
  referencePath: string,
  llmCall: LLMCallFn
): Promise<TraitCard> {
  const file = Bun.file(referencePath);
  const content = await file.text();

  const prompt = `Analyze the following reference material and extract a Trait Card with EXACTLY these 7 sections.
Stay within the character limits. Be SPECIFIC — no generic platitudes.

CHARACTER LIMITS PER SECTION:
- Decision Style: 300 chars max
- Communication: 250 chars max
- Risk Model: 250 chars max
- Emotional Pattern: 200 chars max
- Signature Moves: 400 chars max total (bullet list, each must be SPECIFIC and observable)
- Anti-Patterns: 200 chars max total (bullet list, each must be ACTIONABLE)
- Quotable Lines: 300 chars max total (actual quotes or paraphrased signature phrases)

TOTAL must be under 2000 chars.

OUTPUT FORMAT (use exactly this markdown structure):
## Decision Style
<text>

## Communication
<text>

## Risk Model
<text>

## Emotional Pattern
<text>

## Signature Moves
- <specific move 1>
- <specific move 2>

## Anti-Patterns
- <actionable pattern 1>
- <actionable pattern 2>

## Quotable Lines
> <quote 1>
> <quote 2>

REFERENCE MATERIAL:
${content}`;

  const response = await llmCall(prompt);
  return parseTraitCard(response);
}
