/**
 * config — every environment-specific path in one place.
 *
 * Nothing in this repo should hardcode a machine layout. Each value below reads
 * an environment variable and falls back to a generic default, so the compiler
 * runs on someone else's box without edits. Bun loads `.env` / `.env.local`
 * automatically; `.env.example` documents the full set.
 *
 * The remote host has no default on purpose: a tool that ssh's somewhere should
 * fail loudly when nobody told it where, rather than quietly try a hostname that
 * happens to exist on the author's network.
 */
import { homedir } from "node:os";
import { resolve } from "node:path";

const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v.trim() : undefined;
};

/** Parent directory holding one `<agent>-workspace/` per agent. */
export const WORKSPACE_BASE = resolve(env("SOUL_WORKSPACE_BASE") ?? resolve(homedir(), "agent-workspaces"));

/** Soul config tree: sources, references, trait cards, compiled output. */
export const SOUL_CONFIG_DIR = resolve(env("SOUL_CONFIG_DIR") ?? resolve(homedir(), ".soul-compiler"));

/** Runtime session registry, when the target runtime keeps one. */
export const SESSIONS_PATH = resolve(env("SOUL_SESSIONS_PATH") ?? resolve(SOUL_CONFIG_DIR, "sessions.json"));

/** Local gateway port for the target runtime. */
export const GATEWAY_PORT = Number(env("SOUL_GATEWAY_PORT") ?? 18789);

/** Web UI port. */
export const WEB_PORT = Number(env("SOUL_WEB_PORT") ?? 3000);

/**
 * Host to read deployed files from. Undefined means "local only" — the tools
 * that need a remote must say so themselves rather than guessing.
 */
export const REMOTE_HOST = env("SOUL_REMOTE_HOST");

/**
 * Workspace base ON THE REMOTE. Separate from the local one because the remote
 * user's home directory is usually not the local one — sending a local absolute
 * path over ssh silently matches nothing, and a size check that measures zero
 * files reports success just as loudly as one that measured them all. Accepts
 * `~`-relative paths, which is normally what you want here.
 */
export const REMOTE_WORKSPACE_BASE = env("SOUL_REMOTE_WORKSPACE_BASE") ?? WORKSPACE_BASE;

/** Runtime config file, read to enumerate agents the runtime knows about. */
export const RUNTIME_CONFIG_PATH = resolve(
  env("SOUL_RUNTIME_CONFIG") ?? resolve(homedir(), ".openclaw", "openclaw.json"),
);

/** Workspace path for one agent. */
export function workspaceFor(agent: string): string {
  return resolve(WORKSPACE_BASE, `${agent}-workspace`);
}

/**
 * Agents to operate on. Explicit list via `SOUL_AGENTS`, else discovered from
 * the workspace directory — so a fleet roster is never baked into source.
 */
export function resolveAgents(): string[] {
  const explicit = env("SOUL_AGENTS");
  if (explicit) return explicit.split(",").map((a) => a.trim()).filter(Boolean);
  try {
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    return readdirSync(WORKSPACE_BASE, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.endsWith("-workspace"))
      .map((d) => d.name.replace(/-workspace$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/** Fail with an actionable message instead of ssh-ing into the void. */
export function requireRemoteHost(): string {
  if (!REMOTE_HOST) {
    console.error(
      "SOUL_REMOTE_HOST is not set.\n" +
        "  This tool reads files from the machine your agents actually run on.\n" +
        "  Set it in .env.local (see .env.example), e.g. SOUL_REMOTE_HOST=my-server",
    );
    process.exit(2);
  }
  return REMOTE_HOST;
}
