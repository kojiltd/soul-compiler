import { z } from "zod";
import * as yaml from "js-yaml";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// === Trait Names (exactly 10) ===

export const TRAIT_NAMES = [
  "warmth",
  "dominance",
  "openness",
  "emotionality",
  "agreeableness",
  "risk_tolerance",
  "humor",
  "directness",
  "analytical",
  "protectiveness",
] as const;

export type TraitName = (typeof TRAIT_NAMES)[number];

// === Schemas ===

const TraitDimensionsSchema = z
  .record(z.string(), z.number().min(0.0).max(1.0))
  .refine(
    (traits) => {
      const keys = Object.keys(traits);
      return keys.every((k) => (TRAIT_NAMES as readonly string[]).includes(k));
    },
    { message: "Invalid trait name. Must be one of: " + TRAIT_NAMES.join(", ") },
  )
  .refine(
    (traits) => {
      const keys = Object.keys(traits);
      return keys.length > 0;
    },
    { message: "At least one trait must be defined" },
  );

export type TraitDimensions = Record<TraitName, number>;

const DomainIconSchema = z.object({
  name: z.string(),
  reference: z.string().optional(),
  aspect: z.string(),
  weight: z.number().min(0.0).max(1.0),
  sources: z.string().optional(),
});

export type DomainIcon = z.infer<typeof DomainIconSchema>;

// Boundaries sub-schema (flexible structure)
const BoundariesSchema = z.object({
  vulnerable_override: z.boolean().optional(),
  direct_answer_triggers: z.array(z.string()).optional(),
  guide_triggers: z.array(z.string()).optional(),
});

// Outfit sub-schema
const OutfitSchema = z.object({
  name: z.string(),
  description: z.string(),
});

const AgentConfigSchema = z
  .object({
    // Required fields
    agent: z.string(),
    name: z.string(),
    role: z.string(),
    base_personality: z.string(),
    domain_icons: z.array(DomainIconSchema).default([]),
    jane_ratio: z.number().min(0.0).max(1.0),
    traits: TraitDimensionsSchema,

    // Optional fields
    language: z.string().optional(),
    image: z.string().optional(),
    backstory: z.string().optional(),
    seduction_style: z.string().optional(),
    boundaries: BoundariesSchema.optional(),
    outfits: z.array(OutfitSchema).optional(),
    relationships: z.record(z.string(), z.string()).optional(),
    medication_routine: z.string().optional(),
    team_synergy: z.string().optional(),
  })
  .refine(
    (config) => {
      if (config.domain_icons.length === 0) return true;
      const totalWeight = config.domain_icons.reduce((sum, icon) => sum + icon.weight, 0);
      // Allow small floating-point tolerance
      return totalWeight <= 1.0 + 1e-9;
    },
    { message: "Domain icon weights must sum to <= 1.0" },
  );

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

// === Public API ===

/**
 * Validate and parse a YAML string into an AgentConfig.
 * Throws on validation failure.
 */
export function validateAgentConfig(yamlString: string): AgentConfig {
  const raw = yaml.load(yamlString);
  return AgentConfigSchema.parse(raw);
}

/**
 * Load and validate an agent config from data/agent.{name}/{name}.yaml.
 * Uses Bun.file for reading (per project rules).
 */
export async function loadAgentConfig(agentName: string): Promise<AgentConfig> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(__dirname, "..", "data", `agent.${agentName}`, `${agentName}.yaml`);
  const file = Bun.file(configPath);
  const content = await file.text();
  return validateAgentConfig(content);
}
