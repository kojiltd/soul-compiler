import { test, expect, describe } from "bun:test";
import { validateAgentConfig, TRAIT_NAMES } from "../schema.ts";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load the real Eve yaml for validation tests
const eveYamlPath = resolve(__dirname, "..", "..", "data", "agent.eve", "eve.yaml");
let eveYaml: string;
try {
  eveYaml = readFileSync(eveYamlPath, "utf-8");
} catch {
  // Fallback if data symlink not set up — use inline minimal Eve yaml
  eveYaml = `
agent: eve
name: "Eve (イヴ)"
language: 香港粵語繁體中文
role: 護士型女伴
image: |
  二十八歲，肩長微捲栗色髮。
base_personality: |
  可靠、暖心、善於傾聽、唔說教。
backstory: |
  曾經喺日本工作多年。
domain_icons:
  - name: Anne-Laure Le Cunff
    reference: anne-laure-le-cunff.md
    aspect: 神經科學 + 覺知生產力
    weight: 0.4
  - name: Adam Grant
    reference: adam-grant.md
    aspect: 重新思考 + 給予者思維
    weight: 0.3
  - name: 躺平哲學
    reference: tangping.md
    aspect: 反 hustle + strategic rest
    weight: 0.3
jane_ratio: 0.35
traits:
  warmth: 0.9
  dominance: 0.2
  openness: 0.8
  emotionality: 0.7
  agreeableness: 0.7
  risk_tolerance: 0.3
  humor: 0.6
  directness: 0.4
  analytical: 0.6
  protectiveness: 0.88
seduction_style: |
  療癒式誘惑 + 溫柔支配
boundaries:
  vulnerable_override: true
  direct_answer_triggers:
    - 緊急/系統故障
  guide_triggers:
    - 決策猶豫
outfits:
  - name: "日常溫柔套（外出）"
    description: |
      淺米色 oversize 毛衣 + A 字裙。
relationships:
  cody: |
    我照顧嘅人，我暗戀嘅人。
`;
}

// Helper: build a minimal valid config yaml
function minimalYaml(overrides: Record<string, unknown> = {}): string {
  const base: Record<string, unknown> = {
    agent: "test",
    name: "Test Agent",
    role: "test role",
    base_personality: "test personality",
    domain_icons: [],
    jane_ratio: 0.5,
    traits: {
      warmth: 0.5,
      dominance: 0.5,
      openness: 0.5,
      emotionality: 0.5,
      agreeableness: 0.5,
      risk_tolerance: 0.5,
      humor: 0.5,
      directness: 0.5,
      analytical: 0.5,
      protectiveness: 0.5,
    },
    ...overrides,
  };

  // Simple YAML serializer for test objects
  return serializeYaml(base);
}

function serializeYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  let out = "";
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        out += `${pad}${key}: []\n`;
      } else {
        out += `${pad}${key}:\n`;
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            const entries = Object.entries(item as Record<string, unknown>);
            const [firstKey, firstVal] = entries[0]!;
            out += `${pad}  - ${firstKey}: ${firstVal}\n`;
            for (const [k, v] of entries.slice(1)) {
              out += `${pad}    ${k}: ${v}\n`;
            }
          } else {
            out += `${pad}  - ${item}\n`;
          }
        }
      }
    } else if (typeof value === "object") {
      out += `${pad}${key}:\n`;
      out += serializeYaml(value as Record<string, unknown>, indent + 1);
    } else {
      out += `${pad}${key}: ${value}\n`;
    }
  }
  return out;
}

describe("schema", () => {
  describe("TRAIT_NAMES", () => {
    test("has exactly 10 traits", () => {
      expect(TRAIT_NAMES).toHaveLength(10);
    });
  });

  describe("validateAgentConfig", () => {
    test("valid Eve yaml parses without error", () => {
      const config = validateAgentConfig(eveYaml);
      expect(config.agent).toBe("eve");
      expect(config.name).toContain("Eve");
      expect(config.role).toBe("護士型女伴");
      expect(config.jane_ratio).toBe(0.35);
      expect(config.traits.warmth).toBe(0.9);
      expect(config.traits.protectiveness).toBe(0.88);
      expect(config.domain_icons).toHaveLength(3);
    });

    test("missing required field (agent) throws", () => {
      const yaml = minimalYaml();
      // Remove the agent line
      const noAgent = yaml
        .split("\n")
        .filter((l) => !l.startsWith("agent:"))
        .join("\n");
      expect(() => validateAgentConfig(noAgent)).toThrow();
    });

    test("missing required field (name) throws", () => {
      const yaml = minimalYaml();
      const noName = yaml
        .split("\n")
        .filter((l) => !l.startsWith("name:"))
        .join("\n");
      expect(() => validateAgentConfig(noName)).toThrow();
    });

    test("invalid trait name throws", () => {
      const yaml = minimalYaml({
        traits: {
          warmth: 0.5,
          dominance: 0.5,
          openness: 0.5,
          emotionality: 0.5,
          agreeableness: 0.5,
          risk_tolerance: 0.5,
          humor: 0.5,
          directness: 0.5,
          analytical: 0.5,
          // Invalid trait name instead of protectiveness
          seductiveness: 0.5,
        },
      });
      expect(() => validateAgentConfig(yaml)).toThrow(/[Ii]nvalid trait name/);
    });

    test("trait value > 1.0 throws", () => {
      const yaml = minimalYaml({
        traits: {
          warmth: 1.5,
          dominance: 0.5,
          openness: 0.5,
          emotionality: 0.5,
          agreeableness: 0.5,
          risk_tolerance: 0.5,
          humor: 0.5,
          directness: 0.5,
          analytical: 0.5,
          protectiveness: 0.5,
        },
      });
      expect(() => validateAgentConfig(yaml)).toThrow();
    });

    test("trait value < 0.0 throws", () => {
      const yaml = minimalYaml({
        traits: {
          warmth: -0.1,
          dominance: 0.5,
          openness: 0.5,
          emotionality: 0.5,
          agreeableness: 0.5,
          risk_tolerance: 0.5,
          humor: 0.5,
          directness: 0.5,
          analytical: 0.5,
          protectiveness: 0.5,
        },
      });
      expect(() => validateAgentConfig(yaml)).toThrow();
    });

    test("domain icon weights > 1.0 throws", () => {
      const yaml = minimalYaml({
        domain_icons: [
          { name: "A", aspect: "aspect A", weight: 0.6 },
          { name: "B", aspect: "aspect B", weight: 0.5 },
        ],
      });
      expect(() => validateAgentConfig(yaml)).toThrow(/[Ww]eight/);
    });

    test("jane_ratio > 1.0 throws", () => {
      const yaml = minimalYaml({ jane_ratio: 1.5 });
      expect(() => validateAgentConfig(yaml)).toThrow();
    });

    test("jane_ratio < 0.0 throws", () => {
      const yaml = minimalYaml({ jane_ratio: -0.1 });
      expect(() => validateAgentConfig(yaml)).toThrow();
    });

    test("empty domain_icons is ok", () => {
      const config = validateAgentConfig(minimalYaml({ domain_icons: [] }));
      expect(config.domain_icons).toHaveLength(0);
    });

    test("domain icons with weights summing to exactly 1.0 is ok", () => {
      const config = validateAgentConfig(
        minimalYaml({
          domain_icons: [
            { name: "A", aspect: "aspect A", weight: 0.5 },
            { name: "B", aspect: "aspect B", weight: 0.5 },
          ],
        }),
      );
      expect(config.domain_icons).toHaveLength(2);
    });

    test("optional fields can be omitted", () => {
      const config = validateAgentConfig(minimalYaml());
      expect(config.language).toBeUndefined();
      expect(config.image).toBeUndefined();
      expect(config.backstory).toBeUndefined();
      expect(config.seduction_style).toBeUndefined();
      expect(config.boundaries).toBeUndefined();
      expect(config.outfits).toBeUndefined();
      expect(config.relationships).toBeUndefined();
      expect(config.medication_routine).toBeUndefined();
      expect(config.team_synergy).toBeUndefined();
    });
  });
});
