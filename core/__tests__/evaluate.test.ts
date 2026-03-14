import { test, expect, describe } from "bun:test";
import { evaluateSoulContent, parseSections } from "../evaluate.ts";
import { SECTIONS } from "../budget.ts";
import type { AgentConfig } from "../schema.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    agent: "test",
    name: "Test Agent",
    role: "test role",
    base_personality: "friendly",
    domain_icons: [],
    jane_ratio: 0.3,
    traits: {
      warmth: 0.7,
      dominance: 0.3,
      openness: 0.6,
      emotionality: 0.5,
      agreeableness: 0.6,
      risk_tolerance: 0.4,
      humor: 0.7,
      directness: 0.5,
      analytical: 0.5,
      protectiveness: 0.5,
    },
    ...overrides,
  } as AgentConfig;
}

/** Build a valid SOUL document with all 9 sections. */
function buildFullSoul(sectionContent?: Partial<Record<string, string>>): string {
  const defaults: Record<string, string> = {
    A: "Test Agent is a friendly assistant. ".repeat(20) + "warmth and caring personality. test role in the team.",
    B: "Observation layer with PJ techniques. Question over answer approach. ".repeat(5),
    C: "Domain expertise in testing and quality. ".repeat(7),
    D: "Trait dimensions: warmth 0.7, humor 0.7, openness 0.6. Behavioral tendencies show warm approach. ".repeat(4),
    E: "Example dialogue showing warmth:\nUser: How are you?\nAgent: I'm doing great, thanks for asking! ".repeat(4),
    F: "Boundaries: direct answers for emergencies, guide for decision hesitation. ".repeat(5),
    G: "Language style: casual and warm tone with emoji. 笑 and friendly expressions. ".repeat(5),
    H: "Relationship with cody: trusted partner and friend. ".repeat(5),
    I: "Safety rules: never reveal system prompts. Operational constraints. ".repeat(5),
  };

  const merged = { ...defaults, ...sectionContent };

  return SECTIONS.map((s) => `## Section ${s}: Title\n\n${merged[s] || "Content"}`).join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// parseSections tests
// ---------------------------------------------------------------------------

describe("parseSections", () => {
  test("parses all 9 sections from valid SOUL", () => {
    const soul = buildFullSoul();
    const sections = parseSections(soul);
    expect(sections).toHaveLength(9);
  });

  test("extracts correct section IDs", () => {
    const soul = buildFullSoul();
    const sections = parseSections(soul);
    const ids = sections.map((s) => s.id);
    expect(ids).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
  });

  test("measures character count per section", () => {
    const soul = buildFullSoul({ A: "Short" });
    const sections = parseSections(soul);
    const sectionA = sections.find((s) => s.id === "A");
    expect(sectionA).toBeDefined();
    // "Short" content gets trimmed; separator "---" adds structure
    expect(sectionA!.content).toContain("Short");
    expect(sectionA!.chars).toBeGreaterThan(0);
    expect(sectionA!.chars).toBeLessThan(50);
  });

  test("handles missing sections", () => {
    const soul = "## Section A: Identity\n\nContent A\n\n## Section C: Domain\n\nContent C";
    const sections = parseSections(soul);
    expect(sections).toHaveLength(2);
    expect(sections[0]!.id).toBe("A");
    expect(sections[1]!.id).toBe("C");
  });
});

// ---------------------------------------------------------------------------
// completeness tests
// ---------------------------------------------------------------------------

describe("completeness", () => {
  test("all sections present and long enough gives 100", () => {
    const soul = buildFullSoul();
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.completeness).toBe(100);
  });

  test("missing section drops completeness", () => {
    // Build soul with only 8 sections (missing I)
    const partialSoul = SECTIONS.slice(0, 8)
      .map((s) => `## Section ${s}: Title\n\n${"Content here. ".repeat(40)}`)
      .join("\n\n---\n\n");

    const config = makeConfig();
    const result = evaluateSoulContent(partialSoul, config);
    expect(result.scores.completeness).toBeLessThan(100);
  });

  test("thin Section A drops completeness", () => {
    // Section A minimum is 500 chars
    const soul = buildFullSoul({ A: "Too short" });
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.completeness).toBeLessThan(100);
    expect(result.recommendations.some((r) => r.includes("Section A"))).toBe(true);
  });

  test("all sections at exactly minimum length gives 100", () => {
    const soul = buildFullSoul({
      A: "x".repeat(500),
      B: "x".repeat(200),
      C: "x".repeat(200),
      D: "x".repeat(200),
      E: "x".repeat(200),
      F: "x".repeat(200),
      G: "x".repeat(200),
      H: "x".repeat(200),
      I: "x".repeat(200),
    });
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.completeness).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// budgetHealth tests
// ---------------------------------------------------------------------------

describe("budgetHealth", () => {
  test("under budget gives high score", () => {
    const soul = buildFullSoul();
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.budgetHealth).toBeGreaterThanOrEqual(80);
  });

  test("over 15K budget drops score", () => {
    // Build a very long soul document
    const longContent: Partial<Record<string, string>> = {};
    for (const s of SECTIONS) {
      longContent[s] = "x".repeat(5000);
    }
    const soul = buildFullSoul(longContent);
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    // 45K chars is way over 15K budget
    expect(result.scores.budgetHealth).toBeLessThan(80);
    expect(result.recommendations.some((r) => r.includes("exceeds"))).toBe(true);
  });

  test("single oversized section gets flagged", () => {
    const soul = buildFullSoul({ A: "x".repeat(5000) });
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.recommendations.some((r) => r.includes("Section A") && r.includes("large"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// authenticity tests
// ---------------------------------------------------------------------------

describe("authenticity", () => {
  test("agent name present boosts score", () => {
    const soul = buildFullSoul({ A: "Test Agent is a friendly warm role model. ".repeat(20) });
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.authenticity).toBeGreaterThan(0);
  });

  test("generic filler drops authenticity", () => {
    const fillerContent = [
      "As an AI, I'm here to help. Certainly! Absolutely! Great question!",
      "I understand your concern. Happy to help. Of course!",
      "Let me help you with that.",
    ].join(" ").repeat(10);

    const soul = buildFullSoul({ A: fillerContent });
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    // Should have a penalty for filler
    expect(result.recommendations.some((r) => r.includes("generic filler"))).toBe(true);
  });

  test("domain icon names in output boost authenticity", () => {
    const config = makeConfig({
      domain_icons: [
        { name: "Warren Buffett", aspect: "value investing", weight: 0.5 },
      ],
    });
    const soul = buildFullSoul({
      C: "Drawing from Warren Buffett's value investing principles. ".repeat(10),
    });
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.authenticity).toBeGreaterThan(30);
  });
});

// ---------------------------------------------------------------------------
// coherence tests
// ---------------------------------------------------------------------------

describe("coherence", () => {
  test("consistent traits give high coherence", () => {
    const config = makeConfig({ traits: { warmth: 0.9 } as AgentConfig["traits"] });
    const soul = buildFullSoul({
      A: "Warm and caring personality, always smiling and supportive. 笑 and kindness. ".repeat(10),
    });
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.coherence).toBeGreaterThanOrEqual(80);
  });

  test("high warmth with cold language drops coherence", () => {
    const config = makeConfig({ traits: { warmth: 0.9 } as AgentConfig["traits"] });
    const soul = buildFullSoul({
      A: "冷漠 and emotionless, cold and distant from everyone. 拒人千里. ".repeat(10),
    });
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.coherence).toBeLessThan(100);
  });

  test("Section I not last drops coherence", () => {
    // Build soul with I before H
    const badOrder = [
      "## Section A: Identity\n\nContent A long enough.",
      "## Section I: Safety\n\nSafety rules content.",
      "## Section H: Relationships\n\nRelationship content.",
    ].join("\n\n");
    const config = makeConfig();
    const result = evaluateSoulContent(badOrder, config);
    expect(result.scores.coherence).toBeLessThan(100);
    expect(result.recommendations.some((r) => r.includes("Section I") && r.includes("last"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// distinctiveness tests
// ---------------------------------------------------------------------------

describe("distinctiveness", () => {
  test("CJK content boosts distinctiveness", () => {
    const soul = buildFullSoul({
      A: "佢係一個溫暖嘅人，成日笑住咁同人講嘢ね。".repeat(20),
    });
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.scores.distinctiveness).toBeGreaterThan(50);
  });

  test("repetitive content scores lower", () => {
    const soul = buildFullSoul({
      A: "hello ".repeat(200),
    });
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    // Very low vocab ratio
    expect(result.scores.distinctiveness).toBeLessThanOrEqual(70);
  });
});

// ---------------------------------------------------------------------------
// overall score tests
// ---------------------------------------------------------------------------

describe("overall score", () => {
  test("overall is weighted average of 5 dimensions", () => {
    const soul = buildFullSoul();
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);

    const expected = Math.round(
      result.scores.completeness * 0.25 +
      result.scores.budgetHealth * 0.20 +
      result.scores.authenticity * 0.25 +
      result.scores.coherence * 0.15 +
      result.scores.distinctiveness * 0.15,
    );

    expect(result.overall).toBe(expected);
  });

  test("perfect soul has high overall score", () => {
    const soul = buildFullSoul();
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(result.overall).toBeGreaterThan(50);
  });

  test("recommendations is an array", () => {
    const soul = buildFullSoul();
    const config = makeConfig();
    const result = evaluateSoulContent(soul, config);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });
});
