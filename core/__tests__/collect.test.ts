import { test, expect, describe } from "bun:test";
import {
  collectFromText,
  saveCollected,
  getCollectStatus,
  charCountToThreshold,
  resolveOrgPath,
  resolveSourceDir,
} from "../collect.ts";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "..", "data");

// ---------------------------------------------------------------------------
// charCountToThreshold tests
// ---------------------------------------------------------------------------

describe("charCountToThreshold", () => {
  test("<1500 chars is thin", () => {
    expect(charCountToThreshold(0)).toBe("thin");
    expect(charCountToThreshold(100)).toBe("thin");
    expect(charCountToThreshold(1499)).toBe("thin");
  });

  test("1500-4999 chars is normal", () => {
    expect(charCountToThreshold(1500)).toBe("normal");
    expect(charCountToThreshold(3000)).toBe("normal");
    expect(charCountToThreshold(4999)).toBe("normal");
  });

  test("5000-49999 chars is mustDistill", () => {
    expect(charCountToThreshold(5000)).toBe("mustDistill");
    expect(charCountToThreshold(25000)).toBe("mustDistill");
    expect(charCountToThreshold(49999)).toBe("mustDistill");
  });

  test("50000+ chars is heavyDistill", () => {
    expect(charCountToThreshold(50000)).toBe("heavyDistill");
    expect(charCountToThreshold(100000)).toBe("heavyDistill");
  });
});

// ---------------------------------------------------------------------------
// collectFromText tests
// ---------------------------------------------------------------------------

describe("collectFromText", () => {
  test("wraps text with header", () => {
    const result = collectFromText("Some raw text about Warren Buffett");
    expect(result).toContain("Collected from Text Input");
    expect(result).toContain("Some raw text about Warren Buffett");
  });

  test("includes timestamp", () => {
    const result = collectFromText("test content");
    expect(result).toContain("Date:");
  });

  test("preserves original text content", () => {
    const original = "Line 1\nLine 2\n\n## Heading\n- bullet point";
    const result = collectFromText(original);
    expect(result).toContain(original);
  });
});

// ---------------------------------------------------------------------------
// resolveOrgPath tests
// ---------------------------------------------------------------------------

describe("resolveOrgPath", () => {
  test("resolves to data/1_sources/{name}/org.md", () => {
    const path = resolveOrgPath("warren-buffett");
    expect(path).toContain("1_sources");
    expect(path).toContain("warren-buffett");
    expect(path).toEndWith("org.md");
  });

  test("sanitizes names with spaces", () => {
    const path = resolveOrgPath("Warren Buffett");
    expect(path).toContain("warren-buffett");
    expect(path).not.toContain(" ");
  });

  test("sanitizes special characters", () => {
    const path = resolveOrgPath("Test's Person!");
    expect(path).not.toContain("'");
    expect(path).not.toContain("!");
  });
});

// ---------------------------------------------------------------------------
// resolveSourceDir tests
// ---------------------------------------------------------------------------

describe("resolveSourceDir", () => {
  test("returns directory path without org.md", () => {
    const dir = resolveSourceDir("charlie-munger");
    expect(dir).toContain("1_sources");
    expect(dir).toContain("charlie-munger");
    expect(dir).not.toContain("org.md");
  });
});

// ---------------------------------------------------------------------------
// getCollectStatus tests (reads existing data)
// ---------------------------------------------------------------------------

describe("getCollectStatus", () => {
  test("existing source returns exists=true", async () => {
    // warren-buffett/org.md exists in test data
    const status = await getCollectStatus("warren-buffett");
    expect(status.exists).toBe(true);
    expect(status.charCount).toBeGreaterThan(0);
  });

  test("nonexistent source returns exists=false", async () => {
    const status = await getCollectStatus("nonexistent-person-xyz");
    expect(status.exists).toBe(false);
    expect(status.charCount).toBe(0);
    expect(status.threshold).toBe("thin");
  });

  test("threshold matches char count", async () => {
    const status = await getCollectStatus("warren-buffett");
    if (status.exists) {
      const expectedThreshold = charCountToThreshold(status.charCount);
      expect(status.threshold).toBe(expectedThreshold);
    }
  });
});

// ---------------------------------------------------------------------------
// saveCollected + getCollectStatus round-trip test
// ---------------------------------------------------------------------------

describe("saveCollected", () => {
  test("saves and retrieves content", async () => {
    const testName = `_test-collect-${Date.now()}`;
    const content = collectFromText("Test content for round-trip verification. ".repeat(10));

    await saveCollected(testName, content);

    const status = await getCollectStatus(testName);
    expect(status.exists).toBe(true);
    expect(status.charCount).toBe(content.length);

    // Verify file content
    const orgPath = resolveOrgPath(testName);
    const file = Bun.file(orgPath);
    const savedContent = await file.text();
    expect(savedContent).toBe(content);

    // Cleanup
    const { unlinkSync, rmdirSync } = await import("node:fs");
    try {
      unlinkSync(orgPath);
      rmdirSync(resolveSourceDir(testName));
    } catch {
      // Cleanup is best-effort
    }
  });
});
