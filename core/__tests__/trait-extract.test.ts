import { test, expect, describe } from "bun:test";
import {
  validateTraitCard,
  formatTraitCard,
  parseTraitCard,
  type TraitCard,
} from "../trait-extract";

function makeValidCard(): TraitCard {
  return {
    decisionStyle:
      "Rapid first-principles thinker. Gathers 70% data then commits. Reverses only when new evidence is overwhelming, not from social pressure.",
    communication:
      "Direct, compressed sentences. Uses analogies from physics. Interrupts when the point is already clear.",
    riskModel:
      "Accepts catastrophic downside if expected value is positive. Sizes bets by conviction, not consensus.",
    emotionalPattern:
      "Flat affect in crisis, spikes of visible frustration at bureaucracy. Recovers fast.",
    signatureMoves: [
      "Deadline compression: cuts timelines by 50% then asks why not 50% more",
      "Walks the factory floor daily to find bottlenecks firsthand",
      "Rewrites spec mid-sprint when physics says the original is wrong",
    ],
    antiPatterns: [
      "Ignores team fatigue signals until attrition spikes",
      "Over-promises public timelines by 2-3x regularly",
    ],
    quotableLines: [
      "The best part is no part. The best process is no process.",
      "If the schedule is long enough, your assumptions are wrong.",
    ],
  };
}

describe("validateTraitCard", () => {
  test("valid card passes validation", () => {
    const card = makeValidCard();
    const result = validateTraitCard(card);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.totalChars).toBeLessThanOrEqual(2000);
  });

  test("missing section → invalid", () => {
    const card = makeValidCard();
    card.decisionStyle = "";
    const result = validateTraitCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("decisionStyle"))).toBe(true);
  });

  test("missing array section → invalid", () => {
    const card = makeValidCard();
    card.signatureMoves = [];
    const result = validateTraitCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("signatureMoves"))).toBe(true);
  });

  test("over 2000 chars total → invalid", () => {
    const card = makeValidCard();
    // Inflate decisionStyle to blow past total limit
    card.decisionStyle = "x".repeat(300);
    card.communication = "y".repeat(250);
    card.riskModel = "z".repeat(250);
    card.emotionalPattern = "w".repeat(200);
    card.signatureMoves = ["a".repeat(400)];
    card.antiPatterns = ["b".repeat(200)];
    card.quotableLines = ["c".repeat(300), "d".repeat(200)];
    const result = validateTraitCard(card);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("exceeds limit"))).toBe(true);
  });

  test("section over its own char limit → error", () => {
    const card = makeValidCard();
    card.decisionStyle = "x".repeat(301);
    const result = validateTraitCard(card);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes("decisionStyle") && e.includes("limit: 300")
      )
    ).toBe(true);
  });

  test('generic Signature Move "makes good decisions" → flagged', () => {
    const card = makeValidCard();
    card.signatureMoves = ["makes good decisions"];
    const result = validateTraitCard(card);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes("Generic Signature Move"))
    ).toBe(true);
  });

  test("generic Signature Move variations are caught", () => {
    const genericMoves = [
      "Works hard every day",
      "Leads by example",
      "Communicates effectively",
    ];
    for (const move of genericMoves) {
      const card = makeValidCard();
      card.signatureMoves = [move];
      const result = validateTraitCard(card);
      expect(result.errors.some((e) => e.includes("Generic"))).toBe(true);
    }
  });
});

describe("formatTraitCard", () => {
  test("produces proper markdown with headers", () => {
    const card = makeValidCard();
    const md = formatTraitCard(card, "TestPerson");

    expect(md).toContain("# Trait Card: TestPerson");
    expect(md).toContain("## Decision Style");
    expect(md).toContain("## Communication");
    expect(md).toContain("## Risk Model");
    expect(md).toContain("## Emotional Pattern");
    expect(md).toContain("## Signature Moves");
    expect(md).toContain("## Anti-Patterns");
    expect(md).toContain("## Quotable Lines");

    // Signature moves as bullet list
    expect(md).toContain("- Deadline compression");
    // Quotable lines as blockquotes
    expect(md).toContain("> The best part is no part");
  });
});

describe("parseTraitCard", () => {
  test("round-trip: format → parse preserves data", () => {
    const original = makeValidCard();
    const md = formatTraitCard(original, "RoundTrip");
    const parsed = parseTraitCard(md);

    expect(parsed.decisionStyle).toBe(original.decisionStyle);
    expect(parsed.communication).toBe(original.communication);
    expect(parsed.riskModel).toBe(original.riskModel);
    expect(parsed.emotionalPattern).toBe(original.emotionalPattern);
    expect(parsed.signatureMoves).toEqual(original.signatureMoves);
    expect(parsed.antiPatterns).toEqual(original.antiPatterns);
    expect(parsed.quotableLines).toEqual(original.quotableLines);
  });

  test("parses standalone markdown without title", () => {
    const md = `## Decision Style
Quick and bold.

## Communication
Short sentences.

## Risk Model
High risk tolerance.

## Emotional Pattern
Calm under fire.

## Signature Moves
- Does X specifically
- Does Y in context Z

## Anti-Patterns
- Overcommits on timelines

## Quotable Lines
> Move fast.`;

    const card = parseTraitCard(md);
    expect(card.decisionStyle).toBe("Quick and bold.");
    expect(card.signatureMoves).toHaveLength(2);
    expect(card.antiPatterns).toHaveLength(1);
    expect(card.quotableLines).toEqual(["Move fast."]);
  });
});
