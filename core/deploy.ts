/**
 * Soul Compiler — Deploy engine.
 *
 * Deploys a compiled TRUE_SOUL.md to the agent's workspace,
 * restarts the gateway, and clears the agent's session.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DeployResult = {
  ok: boolean;
  agentName: string;
  charCount: number;
  workspacePath: string;
  gatewayRestarted: boolean;
  sessionReset: boolean;
  errors: string[];
};

export type DeployOptions = {
  dryRun?: boolean;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const HOME = homedir();
const WORKSPACE_BASE = resolve(HOME, "neru-workspace");
const GATEWAY_PORT = 18789;
const SESSIONS_PATH = resolve(HOME, ".openclaw", "sessions.json");

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Format date as YYYYMMDD-HHmmss for backup naming. */
function backupStamp(): string {
  const d = new Date();
  const parts = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
    "-",
    String(d.getHours()).padStart(2, "0"),
    String(d.getMinutes()).padStart(2, "0"),
    String(d.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

/** Resolve workspace path for an agent. */
export function resolveWorkspace(agentName: string): string {
  return resolve(WORKSPACE_BASE, `${agentName}-workspace`);
}

/** Resolve the compiled SOUL path for an agent. */
export function resolveCompiledPath(agentName: string): string {
  return resolve(DATA_DIR, "4_compiled", `${agentName}-TRUE_SOUL.md`);
}

/** Check if a port is listening by attempting a TCP connection. */
async function isPortListening(port: number): Promise<boolean> {
  try {
    const proc = Bun.spawn(["ss", "-ltnp"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    return output.includes(`:${port}`);
  } catch {
    return false;
  }
}

/** Restart the openclaw gateway. */
async function restartGateway(): Promise<boolean> {
  try {
    // Kill existing gateway
    const kill = Bun.spawn(["pkill", "-9", "-f", "openclaw gateway"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await kill.exited;

    // Start new gateway
    const start = Bun.spawn(
      [
        "nohup",
        "openclaw",
        "gateway",
        "run",
        "--bind",
        "loopback",
        "--port",
        String(GATEWAY_PORT),
        "--force",
      ],
      {
        stdout: Bun.file("/tmp/openclaw-gateway.log"),
        stderr: Bun.file("/tmp/openclaw-gateway.log"),
      },
    );
    // Don't await — it runs in background
    void start;

    // Wait for port to come up
    await Bun.sleep(5000);
    return await isPortListening(GATEWAY_PORT);
  } catch {
    return false;
  }
}

/** Clear an agent's session from sessions.json. */
async function clearSession(agentName: string): Promise<boolean> {
  try {
    const file = Bun.file(SESSIONS_PATH);
    if (!(await file.exists())) return true;

    const content = await file.text();
    const sessions = JSON.parse(content);

    // Remove entries matching the agent name
    let modified = false;
    if (typeof sessions === "object" && sessions !== null) {
      for (const key of Object.keys(sessions)) {
        if (key.includes(agentName)) {
          delete sessions[key];
          modified = true;
        }
      }
    }

    if (modified) {
      await Bun.write(SESSIONS_PATH, JSON.stringify(sessions, null, 2));
    }
    return true;
  } catch {
    return false;
  }
}

/** Ensure CLAUDE.md symlink points to AGENTS.md. */
async function ensureClaudeSymlink(workspacePath: string): Promise<void> {
  const claudePath = resolve(workspacePath, "CLAUDE.md");
  const agentsPath = resolve(workspacePath, "AGENTS.md");

  try {
    // Check if AGENTS.md exists
    const agentsFile = Bun.file(agentsPath);
    if (!(await agentsFile.exists())) return;

    // Try to create symlink (remove existing first)
    const proc = Bun.spawn(["ln", "-sf", "AGENTS.md", claudePath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
  } catch {
    // Non-fatal — symlink creation is best-effort
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Deploy a compiled TRUE_SOUL.md to the agent's workspace.
 *
 * Steps:
 * 1. Read compiled file from data/4_compiled/{agent}-TRUE_SOUL.md
 * 2. Resolve workspace at ~/neru-workspace/{agent}-workspace/
 * 3. Backup current SOUL.md with date suffix
 * 4. Copy to SOUL.md + AGENTS.md
 * 5. Ensure CLAUDE.md symlink -> AGENTS.md
 * 6. Restart gateway
 * 7. Verify port listening
 * 8. Clear agent session
 */
export async function deploy(
  agentName: string,
  options?: DeployOptions,
): Promise<DeployResult> {
  const dryRun = options?.dryRun ?? false;
  const errors: string[] = [];
  let gatewayRestarted = false;
  let sessionReset = false;

  const compiledPath = resolveCompiledPath(agentName);
  const workspacePath = resolveWorkspace(agentName);

  // 1. Read compiled file
  let content: string;
  try {
    const file = Bun.file(compiledPath);
    if (!(await file.exists())) {
      return {
        ok: false,
        agentName,
        charCount: 0,
        workspacePath,
        gatewayRestarted: false,
        sessionReset: false,
        errors: [`Compiled file not found: ${compiledPath}`],
      };
    }
    content = await file.text();
  } catch (e) {
    return {
      ok: false,
      agentName,
      charCount: 0,
      workspacePath,
      gatewayRestarted: false,
      sessionReset: false,
      errors: [`Failed to read compiled file: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  const charCount = content.length;

  if (dryRun) {
    return {
      ok: true,
      agentName,
      charCount,
      workspacePath,
      gatewayRestarted: false,
      sessionReset: false,
      errors: [],
    };
  }

  // 2. Check workspace exists
  try {
    const wsCheck = Bun.spawn(["test", "-d", workspacePath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await wsCheck.exited;
    if (exitCode !== 0) {
      errors.push(`Workspace directory not found: ${workspacePath}`);
      return {
        ok: false,
        agentName,
        charCount,
        workspacePath,
        gatewayRestarted: false,
        sessionReset: false,
        errors,
      };
    }
  } catch {
    errors.push(`Failed to check workspace: ${workspacePath}`);
  }

  // 3. Backup current SOUL.md
  const soulPath = resolve(workspacePath, "SOUL.md");
  try {
    const existingSoul = Bun.file(soulPath);
    if (await existingSoul.exists()) {
      const backupPath = resolve(workspacePath, `SOUL.md.${backupStamp()}.bak`);
      await Bun.write(backupPath, await existingSoul.text());
    }
  } catch {
    errors.push("Warning: failed to backup existing SOUL.md");
  }

  // 4. Copy to SOUL.md + AGENTS.md
  try {
    await Bun.write(soulPath, content);
    await Bun.write(resolve(workspacePath, "AGENTS.md"), content);
  } catch (e) {
    errors.push(`Failed to write SOUL.md/AGENTS.md: ${e instanceof Error ? e.message : String(e)}`);
    return {
      ok: false,
      agentName,
      charCount,
      workspacePath,
      gatewayRestarted: false,
      sessionReset: false,
      errors,
    };
  }

  // 5. Ensure CLAUDE.md symlink
  await ensureClaudeSymlink(workspacePath);

  // 6-7. Restart gateway and verify
  gatewayRestarted = await restartGateway();
  if (!gatewayRestarted) {
    errors.push("Gateway restart failed or port not listening after 5s");
  }

  // 8. Clear agent session
  sessionReset = await clearSession(agentName);
  if (!sessionReset) {
    errors.push("Failed to clear agent session");
  }

  return {
    ok: errors.length === 0,
    agentName,
    charCount,
    workspacePath,
    gatewayRestarted,
    sessionReset,
    errors,
  };
}
