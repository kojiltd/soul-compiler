/**
 * Budget allocation engine for Soul Compiler.
 *
 * Total budget is 15,000 chars (25% safety margin below the 20K per-file limit).
 * Section I (Safety/Ops) is always compiled last so it survives OpenClaw's
 * 70/20 truncation window.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Section = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

export type BudgetAllocation = Record<Section, number>;

export type SectionCheck = { allocated: number; used: number; over: boolean };

export type BudgetCheck = {
  ok: boolean;
  total: number;
  limit: number;
  remaining: number;
  perSection: Record<Section, SectionCheck>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard char-count ceiling for a compiled SOUL.md. */
export const TOTAL_BUDGET = 15_000;

/**
 * Ordered section list. I (Safety/Ops) is always last so it lands at the
 * bottom of the compiled output and survives truncation.
 */
export const SECTIONS: readonly Section[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
] as const;

// ---------------------------------------------------------------------------
// Fixed budgets
// ---------------------------------------------------------------------------

const FIXED: Partial<Record<Section, number>> = {
  A: 2000, // Identity
  D: 1500, // Traits
  E: 2500, // Examples
  F: 1000, // Boundaries
  G: 1000, // Language
  I: 1500, // Safety/Ops
};

// ---------------------------------------------------------------------------
// Dynamic helpers
// ---------------------------------------------------------------------------

/** Section B scales linearly with jane_ratio (0 → 0, 1.0 → 1500). */
function allocateB(janeRatio: number): number {
  const clamped = Math.max(0, Math.min(1, janeRatio));
  return Math.round(clamped * 1500);
}

/**
 * Section C scales with the number of domain icons.
 * Range: 1500 (0-1 icons) → 3000 (3+ icons), stepping by total weight.
 */
function allocateC(icons: { weight: number }[]): number {
  const totalWeight = icons.reduce((s, i) => s + i.weight, 0);
  // Clamp total weight to [0, 1] per project rules (weights sum <= 1.0)
  const clamped = Math.max(0, Math.min(1, totalWeight));
  return Math.round(1500 + clamped * 1500);
}

/**
 * Section H scales with the number of relationships.
 * Range: 500 (0-1 relationships) → 1500 (10+ relationships).
 */
function allocateH(relationships?: Record<string, string>): number {
  const count = relationships ? Object.keys(relationships).length : 0;
  // Linear scale: 0 → 500, 10+ → 1500
  const t = Math.min(count / 10, 1);
  return Math.round(500 + t * 1000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BudgetConfig {
  jane_ratio: number;
  domain_icons: { weight: number }[];
  relationships?: Record<string, string>;
}

/**
 * Compute per-section char budgets based on agent configuration.
 * The sum is guaranteed to be <= TOTAL_BUDGET.
 */
export function allocateBudget(config: BudgetConfig): BudgetAllocation {
  const allocation: BudgetAllocation = {
    A: FIXED.A!,
    B: allocateB(config.jane_ratio),
    C: allocateC(config.domain_icons),
    D: FIXED.D!,
    E: FIXED.E!,
    F: FIXED.F!,
    G: FIXED.G!,
    H: allocateH(config.relationships),
    I: FIXED.I!,
  };

  // If dynamic sections pushed us over budget, proportionally shrink them.
  const total = Object.values(allocation).reduce((a, b) => a + b, 0);
  if (total > TOTAL_BUDGET) {
    const excess = total - TOTAL_BUDGET;
    const dynamicSections: Section[] = ["B", "C", "H"];
    const dynamicTotal = dynamicSections.reduce(
      (s, k) => s + allocation[k],
      0,
    );
    if (dynamicTotal > 0) {
      for (const k of dynamicSections) {
        const reduction = Math.round((allocation[k] / dynamicTotal) * excess);
        allocation[k] = Math.max(0, allocation[k] - reduction);
      }
    }
  }

  return allocation;
}

// ---------------------------------------------------------------------------
// Section header → key mapping
// ---------------------------------------------------------------------------

const HEADER_MAP: Record<string, Section> = {
  "Identity": "A",
  "身份": "A",
  "PJ Layer": "B",
  "觀察層": "B",
  "Domain Expertise": "C",
  "領域框架": "C",
  "Traits": "D",
  "性格維度": "D",
  "Examples": "E",
  "示範對話": "E",
  "Boundaries": "F",
  "行為邊界": "F",
  "Language": "G",
  "語言風格": "G",
  "Relationships": "H",
  "關係": "H",
  "Safety": "I",
  "Ops": "I",
  "安全": "I",
  "運行指令": "I",
  "Safety/Ops": "I",
  "安全/運行指令": "I",
};

function headerToSection(heading: string): Section | undefined {
  // Try exact match first, then substring match
  if (HEADER_MAP[heading]) return HEADER_MAP[heading];
  for (const [key, section] of Object.entries(HEADER_MAP)) {
    if (heading.includes(key)) return section;
  }
  return undefined;
}

/**
 * Parse a compiled SOUL.md string by `## Section` headers and measure
 * actual char usage per section against the allocation.
 */
export function checkBudget(
  compiled: string,
  allocation: BudgetAllocation,
): BudgetCheck {
  // Split by ## headings
  const sectionUsage: Record<Section, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
    F: 0,
    G: 0,
    H: 0,
    I: 0,
  };

  const lines = compiled.split("\n");
  let currentSection: Section | undefined;
  let currentContent: string[] = [];

  const flushSection = () => {
    if (currentSection) {
      sectionUsage[currentSection] += currentContent.join("\n").length;
    }
    currentContent = [];
  };

  for (const line of lines) {
    const match = line.match(/^##\s+(.+)/);
    if (match) {
      flushSection();
      currentSection = headerToSection(match[1].trim());
    } else {
      currentContent.push(line);
    }
  }
  flushSection();

  const total = Object.values(sectionUsage).reduce((a, b) => a + b, 0);

  const perSection = {} as Record<Section, SectionCheck>;
  for (const s of SECTIONS) {
    perSection[s] = {
      allocated: allocation[s],
      used: sectionUsage[s],
      over: sectionUsage[s] > allocation[s],
    };
  }

  return {
    ok: total <= TOTAL_BUDGET,
    total,
    limit: TOTAL_BUDGET,
    remaining: TOTAL_BUDGET - total,
    perSection,
  };
}

/**
 * Human-readable budget report.
 */
export function formatBudgetReport(check: BudgetCheck): string {
  const pct = Math.round((check.total / check.limit) * 100);
  const status = check.ok ? "\u2705" : "\u274C";
  const lines: string[] = [
    `${check.total.toLocaleString()} / ${check.limit.toLocaleString()} (${pct}%) ${status}`,
    "",
  ];

  const sectionNames: Record<Section, string> = {
    A: "Identity (身份)",
    B: "PJ Layer (觀察層)",
    C: "Domain Expertise (領域框架)",
    D: "Traits (性格維度)",
    E: "Examples (示範對話)",
    F: "Boundaries (行為邊界)",
    G: "Language (語言風格)",
    H: "Relationships (關係)",
    I: "Safety/Ops (安全/運行指令)",
  };

  for (const s of SECTIONS) {
    const sc = check.perSection[s];
    const flag = sc.over ? " OVER" : "";
    lines.push(
      `  ${s}: ${sc.used.toLocaleString()} / ${sc.allocated.toLocaleString()}${flag}  ${sectionNames[s]}`,
    );
  }

  return lines.join("\n");
}
