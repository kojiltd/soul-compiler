import { test, expect, describe } from "bun:test";
import {
  allocateByWeight,
  validateMergeSources,
  mergeIcons,
  type MergeSource,
} from "../merge";

describe("allocateByWeight", () => {
  test("2 sources 0.6/0.4 get proportional allocation", () => {
    const sources = [{ weight: 0.6 }, { weight: 0.4 }];
    const result = allocateByWeight(sources, 1000, 0.1);

    // Identity floor not triggered (0.6 + 0.4 = 1.0, but floor is 0.1)
    // identity = max(0.1, 1.0 - 1.0) = 0.1 → 100 chars
    expect(result["__identity"]).toBe(100);

    const remaining = 900;
    // Source 0 gets 0.6/1.0 * 900 = 540
    // Source 1 gets 0.4/1.0 * 900 = 360
    expect(result["0"]).toBe(540);
    expect(result["1"]).toBe(360);

    // Total should equal budget
    const total = result["__identity"] + result["0"] + result["1"];
    expect(total).toBe(1000);
  });

  test("identity floor 10% always reserved", () => {
    // Even when weights sum to 0.95, identity gets at least 10%
    const sources = [{ weight: 0.5 }, { weight: 0.45 }];
    const result = allocateByWeight(sources, 1000, 0.1);

    expect(result["__identity"]).toBeGreaterThanOrEqual(100);
  });

  test("identity gets all budget when no sources", () => {
    const result = allocateByWeight([], 1000, 0.1);
    expect(result["__identity"]).toBe(1000);
    expect(Object.keys(result).length).toBe(1);
  });

  test("low total weight gives more to identity", () => {
    const sources = [{ weight: 0.3 }];
    const result = allocateByWeight(sources, 1000, 0.1);

    // identity = max(0.1, 1.0 - 0.3) = 0.7 → 700 chars
    expect(result["__identity"]).toBe(700);
    expect(result["0"]).toBe(300);
  });
});

describe("validateMergeSources", () => {
  test("valid sources pass", () => {
    const sources: MergeSource[] = [
      { name: "Elon", content: "Visionary leader...", weight: 0.4, aspect: "decision" },
      { name: "Jobs", content: "Design obsessed...", weight: 0.3, aspect: "communication" },
    ];
    const result = validateMergeSources(sources);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test("weights > 1.0 → validation error", () => {
    const sources: MergeSource[] = [
      { name: "A", content: "x", weight: 0.6, aspect: "a" },
      { name: "B", content: "y", weight: 0.5, aspect: "b" },
    ];
    const result = validateMergeSources(sources);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("exceeds 1.0"))).toBe(true);
  });

  test("more than 3 sources → validation error", () => {
    const sources: MergeSource[] = [
      { name: "A", content: "x", weight: 0.2, aspect: "a" },
      { name: "B", content: "y", weight: 0.2, aspect: "b" },
      { name: "C", content: "z", weight: 0.2, aspect: "c" },
      { name: "D", content: "w", weight: 0.2, aspect: "d" },
    ];
    const result = validateMergeSources(sources);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Too many sources"))).toBe(true);
  });

  test("empty content → phantom reference error", () => {
    const sources: MergeSource[] = [
      { name: "Ghost", content: "", weight: 0.5, aspect: "a" },
    ];
    const result = validateMergeSources(sources);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("phantom"))).toBe(true);
  });

  test("empty sources array is valid", () => {
    const result = validateMergeSources([]);
    expect(result.valid).toBe(true);
  });
});

describe("mergeIcons", () => {
  const mockLLM = async (prompt: string) =>
    "Blended personality section with traits from all sources.";

  test("empty sources → only agent identity", async () => {
    const result = await mergeIcons([], 500, "I am the agent.", mockLLM);
    expect(result.text).toBe("I am the agent.");
    expect(result.sources).toHaveLength(0);
  });

  test("merges sources and returns metadata", async () => {
    const sources: MergeSource[] = [
      { name: "Elon", content: "Builds rockets.", weight: 0.5, aspect: "vision" },
      { name: "Jobs", content: "Design genius.", weight: 0.3, aspect: "taste" },
    ];
    const result = await mergeIcons(sources, 1000, "Base identity.", mockLLM);

    expect(result.text.length).toBeGreaterThan(0);
    expect(result.text.length).toBeLessThanOrEqual(1000);
    expect(result.sources).toHaveLength(2);
    // Higher weight first (sorted)
    expect(result.sources[0].name).toBe("Elon");
    expect(result.sources[0].weight).toBe(0.5);
  });

  test("throws on invalid sources", async () => {
    const sources: MergeSource[] = [
      { name: "A", content: "x", weight: 0.6, aspect: "a" },
      { name: "B", content: "y", weight: 0.6, aspect: "b" },
    ];
    expect(mergeIcons(sources, 1000, "base", mockLLM)).rejects.toThrow(
      /exceeds 1\.0/
    );
  });
});
