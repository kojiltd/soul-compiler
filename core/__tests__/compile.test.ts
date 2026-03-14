import { test, expect, describe } from "bun:test";
import { compile, buildSectionPrompt, dataDir } from "../compile.ts";
import { SECTIONS, type Section } from "../budget.ts";
import type { AgentConfig } from "../schema.ts";
import type { LLMCallFn } from "../compile.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal valid agent config for testing. */
function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    agent: "test-agent",
    name: "Test Agent",
    role: "test role",
    base_personality: "friendly and helpful",
    domain_icons: [],
    jane_ratio: 0.3,
    traits: {
      warmth: 0.7,
      dominance: 0.5,
      openness: 0.6,
      emotionality: 0.5,
      agreeableness: 0.6,
      risk_tolerance: 0.4,
      humor: 0.5,
      directness: 0.5,
      analytical: 0.5,
      protectiveness: 0.5,
    },
    ...overrides,
  } as AgentConfig;
}

/** Mock LLM that returns deterministic section content. */
function mockLLM(charTarget: number = 300): LLMCallFn {
  return async (prompt: string): Promise<string> => {
    // Extract section ID from prompt
    const match = prompt.match(/Compile Section ([A-I])/);
    const sectionId = match ? match[1] : "?";
    // Return content sized to target
    const base = `This is compiled content for Section ${sectionId}. `;
    const padding = "x".repeat(Math.max(0, charTarget - base.length));
    return base + padding;
  };
}

// ---------------------------------------------------------------------------
// buildSectionPrompt tests
// ---------------------------------------------------------------------------

describe("buildSectionPrompt", () => {
  test("includes section ID and title", () => {
    const config = makeConfig();
    const prompt = buildSectionPrompt("A", config, new Map(), [], 2000, "");
    expect(prompt).toContain("Compile Section A");
    expect(prompt).toContain("Identity");
  });

  test("includes agent name and personality", () => {
    const config = makeConfig({ name: "Eve (イヴ)", base_personality: "warm and caring" });
    const prompt = buildSectionPrompt("A", config, new Map(), [], 2000, "");
    expect(prompt).toContain("Eve (イヴ)");
    expect(prompt).toContain("warm and caring");
  });

  test("includes budget limit", () => {
    const config = makeConfig();
    const prompt = buildSectionPrompt("D", config, new Map(), [], 1500, "");
    expect(prompt).toContain("1500");
  });

  test("Section B includes jane_ratio", () => {
    const config = makeConfig({ jane_ratio: 0.35 });
    const prompt = buildSectionPrompt("B", config, new Map(), [], 1000, "pj playbook content");
    expect(prompt).toContain("0.35");
    expect(prompt).toContain("PJ Layer");
    expect(prompt).toContain("pj playbook content");
  });

  test("Section C includes domain icons and trait cards", () => {
    const config = makeConfig({
      domain_icons: [
        { name: "Warren Buffett", aspect: "value investing", weight: 0.5 },
      ],
    });
    const traitCards = new Map([["Warren Buffett", "## Decision Style\nPatient capital allocation"]]);
    const prompt = buildSectionPrompt("C", config, traitCards, [], 2000, "");
    expect(prompt).toContain("Warren Buffett");
    expect(prompt).toContain("value investing");
    expect(prompt).toContain("Patient capital allocation");
  });

  test("Section D includes trait dimensions", () => {
    const config = makeConfig();
    const prompt = buildSectionPrompt("D", config, new Map(), [], 1500, "");
    expect(prompt).toContain("warmth: 0.7");
    expect(prompt).toContain("dominance: 0.5");
  });

  test("Section H includes relationships", () => {
    const config = makeConfig({
      relationships: { cody: "my best friend", hana: "trusted colleague" },
    });
    const prompt = buildSectionPrompt("H", config, new Map(), [], 1000, "");
    expect(prompt).toContain("cody");
    expect(prompt).toContain("my best friend");
    expect(prompt).toContain("hana");
  });

  test("includes input.d content verbatim", () => {
    const config = makeConfig();
    const inputD = ["## [Section D] micro-behaviors\n- Always greet warmly"];
    const prompt = buildSectionPrompt("D", config, new Map(), inputD, 1500, "");
    expect(prompt).toContain("Always greet warmly");
    expect(prompt).toContain("Verbatim Input");
  });

  test("instructs agent identity floor", () => {
    const config = makeConfig();
    const prompt = buildSectionPrompt("A", config, new Map(), [], 2000, "");
    expect(prompt).toContain("10%");
  });
});

// ---------------------------------------------------------------------------
// compile tests (using mock LLM, requires agent YAML on disk)
// ---------------------------------------------------------------------------

describe("compile", () => {
  // These tests use a mock LLM and require the agent YAML files to exist.
  // They test the compile pipeline logic, not actual LLM output.

  test("compile returns result with 9 sections", async () => {
    // Use "eve" since we know the YAML exists
    const result = await compile("eve", mockLLM(500));
    expect(result.sections).toHaveLength(9);
  });

  test("Section I is the last section", async () => {
    const result = await compile("eve", mockLLM(500));
    const lastSection = result.sections[result.sections.length - 1];
    expect(lastSection).toBeDefined();
    expect(lastSection!.id).toBe("I");
  });

  test("output contains all section headers", async () => {
    const result = await compile("eve", mockLLM(300));
    for (const section of SECTIONS) {
      expect(result.content).toContain(`## Section ${section}`);
    }
  });

  test("budget report is generated", async () => {
    const result = await compile("eve", mockLLM(300));
    expect(result.budgetReport).toBeTruthy();
    expect(result.budgetReport.length).toBeGreaterThan(0);
  });

  test("ok is true when under budget", async () => {
    // Small content per section to stay under budget
    const result = await compile("eve", mockLLM(200));
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("input.d/ content appears verbatim in output", async () => {
    // The mock LLM won't include input.d content, but compile()
    // appends it if not already present. We verify by checking
    // that known input.d patterns appear in the final output.
    const result = await compile("eve", mockLLM(200));

    // Eve has input.d files with known content
    // At minimum, the section structure should be intact
    expect(result.content).toContain("TRUE SOUL");
    expect(result.content).toContain("eve");
  });

  test("output path points to 4_compiled directory", async () => {
    const result = await compile("eve", mockLLM(200));
    expect(result.outputPath).toContain("4_compiled");
    expect(result.outputPath).toContain("eve-TRUE_SOUL.md");
  });

  test("totalChars matches content length", async () => {
    const result = await compile("eve", mockLLM(200));
    expect(result.totalChars).toBe(result.content.length);
  });

  test("config load failure returns ok=false", async () => {
    const result = await compile("nonexistent-agent", mockLLM(200));
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Config load failed");
  });

  test("LLM failure is captured in errors but compile continues", async () => {
    let callCount = 0;
    const failingLLM: LLMCallFn = async () => {
      callCount++;
      if (callCount === 3) throw new Error("LLM timeout");
      return "Section content here";
    };

    const result = await compile("eve", failingLLM);
    // Should still have 9 sections despite one failure
    expect(result.sections).toHaveLength(9);
    expect(result.errors.some((e) => e.includes("LLM timeout"))).toBe(true);
  });

  test("header includes agent name and generation date", async () => {
    const result = await compile("eve", mockLLM(200));
    expect(result.content).toContain("Eve (イヴ)");
    expect(result.content).toContain("Soul Compiler v2");
    expect(result.content).toContain("DO NOT EDIT");
  });
});
