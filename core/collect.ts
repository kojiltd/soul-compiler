/**
 * Soul Compiler — Collect engine.
 *
 * Collects raw material about a person/topic from various sources
 * and saves to data/1_sources/.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CollectThreshold = "thin" | "normal" | "mustDistill" | "heavyDistill";

export type CollectStatus = {
  exists: boolean;
  charCount: number;
  threshold: CollectThreshold;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "..", "data");
const SOURCES_DIR = resolve(DATA_DIR, "1_sources");
const LIGHTPANDA_PATH = resolve(homedir(), ".local", "bin", "lightpanda");

// Thresholds per Design Doc v1
const THIN_LIMIT = 1_500;
const NORMAL_LIMIT = 5_000;
const MUST_DISTILL_LIMIT = 50_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Sanitize a name for use as a directory name. */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/g, "");
}

/** Determine threshold category from character count. */
export function charCountToThreshold(charCount: number): CollectThreshold {
  if (charCount < THIN_LIMIT) return "thin";
  if (charCount < NORMAL_LIMIT) return "normal";
  if (charCount < MUST_DISTILL_LIMIT) return "mustDistill";
  return "heavyDistill";
}

/** Check if lightpanda browser is available. */
async function hasLightpanda(): Promise<boolean> {
  try {
    const file = Bun.file(LIGHTPANDA_PATH);
    return await file.exists();
  } catch {
    return false;
  }
}

/** Fetch a URL using lightpanda (headless browser) and return markdown. */
async function fetchWithLightpanda(url: string): Promise<string> {
  const proc = Bun.spawn([LIGHTPANDA_PATH, "--url", url, "--format", "markdown"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`lightpanda failed (exit ${exitCode}): ${stderr}`);
  }
  return output;
}

/** Fetch a URL using basic fetch API and extract text content. */
async function fetchBasic(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SoulCompiler/1.0 (research)",
      "Accept": "text/html,text/plain,application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  // If HTML, strip tags for a rough markdown conversion
  if (contentType.includes("html")) {
    return htmlToBasicMarkdown(text);
  }

  return text;
}

/** Minimal HTML to markdown conversion — strips tags, keeps text structure. */
function htmlToBasicMarkdown(html: string): string {
  let text = html;

  // Remove scripts and styles
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Convert headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n");

  // Convert paragraphs and line breaks
  text = text.replace(/<p[^>]*>/gi, "\n\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/p>/gi, "");

  // Convert lists
  text = text.replace(/<li[^>]*>/gi, "- ");
  text = text.replace(/<\/li>/gi, "\n");

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  text = text.trim();

  return text;
}

/** Resolve the source directory path for a given name. */
export function resolveSourceDir(name: string): string {
  return resolve(SOURCES_DIR, sanitizeName(name));
}

/** Resolve the org.md path for a given name. */
export function resolveOrgPath(name: string): string {
  return resolve(resolveSourceDir(name), "org.md");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Collect material via web search.
 * Uses the `openclaw` CLI search command if available, otherwise returns a stub.
 */
export async function collectFromSearch(name: string): Promise<string> {
  try {
    const proc = Bun.spawn(
      ["openclaw", "search", `"${name}" biography personality traits decision-making style`],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode === 0 && output.trim().length > 0) {
      const header = `# ${name} — Collected from Web Search\n# Date: ${new Date().toISOString()}\n\n`;
      return header + output;
    }
  } catch {
    // Search command not available
  }

  // Fallback: return structured placeholder
  return [
    `# ${name} — Web Search Collection`,
    `# Date: ${new Date().toISOString()}`,
    `# Status: Manual collection needed (search command unavailable)`,
    "",
    `## Person/Topic: ${name}`,
    "",
    "## Decision Style",
    "[To be collected]",
    "",
    "## Communication Style",
    "[To be collected]",
    "",
    "## Key Principles",
    "[To be collected]",
    "",
    "## Notable Quotes",
    "[To be collected]",
  ].join("\n");
}

/**
 * Collect material from a URL.
 * Uses lightpanda (headless browser) if available, otherwise basic fetch.
 */
export async function collectFromUrl(url: string): Promise<string> {
  const useLightpanda = await hasLightpanda();

  let content: string;
  if (useLightpanda) {
    content = await fetchWithLightpanda(url);
  } else {
    content = await fetchBasic(url);
  }

  const header = [
    `# Collected from URL`,
    `# Source: ${url}`,
    `# Date: ${new Date().toISOString()}`,
    `# Method: ${useLightpanda ? "lightpanda" : "fetch"}`,
    "",
  ].join("\n");

  return header + content;
}

/**
 * Structure raw text as an org.md document.
 * Passes through content, adding a standard header.
 */
export function collectFromText(text: string): string {
  const header = [
    `# Collected from Text Input`,
    `# Date: ${new Date().toISOString()}`,
    "",
  ].join("\n");

  return header + text;
}

/**
 * Save collected content to data/1_sources/{name}/org.md.
 */
export async function saveCollected(
  name: string,
  content: string,
): Promise<void> {
  const orgPath = resolveOrgPath(name);
  const dirPath = resolveSourceDir(name);

  // Ensure directory exists
  const proc = Bun.spawn(["mkdir", "-p", dirPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  await Bun.write(orgPath, content);
}

/**
 * Get the collection status for a source name.
 */
export async function getCollectStatus(name: string): Promise<CollectStatus> {
  const orgPath = resolveOrgPath(name);

  try {
    const file = Bun.file(orgPath);
    if (!(await file.exists())) {
      return { exists: false, charCount: 0, threshold: "thin" };
    }

    const content = await file.text();
    const charCount = content.length;

    return {
      exists: true,
      charCount,
      threshold: charCountToThreshold(charCount),
    };
  } catch {
    return { exists: false, charCount: 0, threshold: "thin" };
  }
}
