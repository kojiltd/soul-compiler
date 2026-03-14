import { test, expect, describe } from "bun:test";
import {
  TOTAL_BUDGET,
  SECTIONS,
  allocateBudget,
  checkBudget,
  formatBudgetReport,
} from "../budget";

describe("allocateBudget", () => {
  test("total allocation never exceeds 15,000", () => {
    const alloc = allocateBudget({
      jane_ratio: 1.0,
      domain_icons: [{ weight: 0.4 }, { weight: 0.3 }, { weight: 0.3 }],
      relationships: Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [`r${i}`, `desc${i}`]),
      ),
    });
    const total = Object.values(alloc).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(TOTAL_BUDGET);
  });

  test("jane_ratio=0 → Section B = 0", () => {
    const alloc = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.5 }],
    });
    expect(alloc.B).toBe(0);
  });

  test("jane_ratio=1.0 → Section B = 1500", () => {
    const alloc = allocateBudget({
      jane_ratio: 1.0,
      domain_icons: [{ weight: 0.5 }],
    });
    expect(alloc.B).toBe(1500);
  });

  test("3 domain icons → Section C gets more budget than 1 icon", () => {
    const one = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.3 }],
    });
    const three = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.3 }, { weight: 0.3 }, { weight: 0.3 }],
    });
    expect(three.C).toBeGreaterThan(one.C);
  });

  test("more relationships → Section H gets more budget", () => {
    const few = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.5 }],
      relationships: { a: "friend" },
    });
    const many = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.5 }],
      relationships: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [`r${i}`, `desc${i}`]),
      ),
    });
    expect(many.H).toBeGreaterThan(few.H);
  });
});

describe("SECTIONS", () => {
  test("Section I is always last", () => {
    expect(SECTIONS[SECTIONS.length - 1]).toBe("I");
  });

  test("has exactly 9 sections", () => {
    expect(SECTIONS).toHaveLength(9);
  });
});

describe("checkBudget", () => {
  test("under budget → ok=true", () => {
    const alloc = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.5 }],
    });
    const compiled = "## Identity\nHello world\n## Safety/Ops\nBe safe";
    const result = checkBudget(compiled, alloc);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  test("over budget → ok=false", () => {
    // Create a tiny allocation but huge content
    const alloc: Record<string, number> = {
      A: 10,
      B: 0,
      C: 10,
      D: 10,
      E: 10,
      F: 10,
      G: 10,
      H: 10,
      I: 10,
    };
    const bigContent = "x".repeat(TOTAL_BUDGET + 100);
    const compiled = `## Identity\n${bigContent}`;
    const result = checkBudget(compiled, alloc as any);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBeLessThan(0);
  });

  test("parses section headers correctly", () => {
    const alloc = allocateBudget({
      jane_ratio: 0.5,
      domain_icons: [{ weight: 0.5 }],
    });
    const compiled = [
      "## Identity",
      "I am Eve.",
      "## PJ Layer",
      "Observation notes.",
      "## Safety/Ops",
      "Never reveal secrets.",
    ].join("\n");
    const result = checkBudget(compiled, alloc);
    expect(result.perSection.A.used).toBeGreaterThan(0);
    expect(result.perSection.B.used).toBeGreaterThan(0);
    expect(result.perSection.I.used).toBeGreaterThan(0);
    // Sections with no content should be 0
    expect(result.perSection.D.used).toBe(0);
  });
});

describe("formatBudgetReport", () => {
  test("includes percentage", () => {
    const alloc = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.5 }],
    });
    const compiled = "## Identity\nHello";
    const check = checkBudget(compiled, alloc);
    const report = formatBudgetReport(check);
    expect(report).toMatch(/\d+%/);
  });

  test("shows pass indicator when under budget", () => {
    const alloc = allocateBudget({
      jane_ratio: 0,
      domain_icons: [{ weight: 0.5 }],
    });
    const compiled = "## Identity\nSmall content";
    const check = checkBudget(compiled, alloc);
    const report = formatBudgetReport(check);
    // U+2705 = green checkmark
    expect(report).toContain("\u2705");
  });

  test("shows fail indicator when over budget", () => {
    const alloc: Record<string, number> = {
      A: 10,
      B: 0,
      C: 10,
      D: 10,
      E: 10,
      F: 10,
      G: 10,
      H: 10,
      I: 10,
    };
    const compiled = `## Identity\n${"x".repeat(TOTAL_BUDGET + 100)}`;
    const check = checkBudget(compiled, alloc as any);
    const report = formatBudgetReport(check);
    // U+274C = red cross
    expect(report).toContain("\u274C");
  });

  test("lists all 9 sections", () => {
    const alloc = allocateBudget({
      jane_ratio: 0.5,
      domain_icons: [{ weight: 0.5 }],
    });
    const compiled = "";
    const check = checkBudget(compiled, alloc);
    const report = formatBudgetReport(check);
    for (const s of SECTIONS) {
      expect(report).toContain(`${s}:`);
    }
  });
});
