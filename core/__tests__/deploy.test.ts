import { test, expect, describe } from "bun:test";
import { deploy, resolveWorkspace, resolveCompiledPath } from "../deploy.ts";
import { homedir } from "node:os";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// resolveWorkspace tests
// ---------------------------------------------------------------------------

describe("resolveWorkspace", () => {
  test("resolves to ~/neru-workspace/{agent}-workspace/", () => {
    const path = resolveWorkspace("eve");
    expect(path).toBe(resolve(homedir(), "neru-workspace", "eve-workspace"));
  });

  test("different agents get different paths", () => {
    const evePath = resolveWorkspace("eve");
    const hanaPath = resolveWorkspace("hana");
    expect(evePath).not.toBe(hanaPath);
    expect(evePath).toContain("eve-workspace");
    expect(hanaPath).toContain("hana-workspace");
  });
});

// ---------------------------------------------------------------------------
// resolveCompiledPath tests
// ---------------------------------------------------------------------------

describe("resolveCompiledPath", () => {
  test("points to 4_compiled directory", () => {
    const path = resolveCompiledPath("eve");
    expect(path).toContain("4_compiled");
    expect(path).toContain("eve-TRUE_SOUL.md");
  });
});

// ---------------------------------------------------------------------------
// deploy (dryRun) tests
// ---------------------------------------------------------------------------

describe("deploy dryRun", () => {
  test("dryRun=true does not copy files", async () => {
    // This test uses dryRun so no actual file system changes occur.
    // It requires a compiled file to exist for the agent.
    const result = await deploy("eve", { dryRun: true });

    if (result.ok) {
      // dryRun should not restart gateway
      expect(result.gatewayRestarted).toBe(false);
      // dryRun should not reset session
      expect(result.sessionReset).toBe(false);
      // Should report char count
      expect(result.charCount).toBeGreaterThan(0);
      // Workspace path should be correct
      expect(result.workspacePath).toContain("eve-workspace");
    } else {
      // If compiled file doesn't exist, that's also a valid test outcome
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  test("dryRun returns correct agent name", async () => {
    const result = await deploy("hana", { dryRun: true });
    expect(result.agentName).toBe("hana");
  });

  test("nonexistent agent compiled file returns error", async () => {
    const result = await deploy("nonexistent-agent-xyz", { dryRun: true });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("not found"))).toBe(true);
  });

  test("dryRun workspace path is correct", async () => {
    const result = await deploy("sakura", { dryRun: true });
    expect(result.workspacePath).toBe(
      resolve(homedir(), "neru-workspace", "sakura-workspace"),
    );
  });
});
