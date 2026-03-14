import { test, expect, describe } from "bun:test";
import {
  startInterview,
  generateNextQuestion,
  processAnswer,
  isVagueAnswer,
  challengeVague,
  interviewToYaml,
  type InterviewState,
  type LLMCallFn,
} from "../interview.ts";

// Stub LLM that returns a trait score
const stubLLM: LLMCallFn = async (_prompt: string) => "0.7";

// LLM that returns invalid output — should fallback to 0.5
const brokenLLM: LLMCallFn = async () => "not a number";

describe("interview", () => {
  describe("startInterview", () => {
    test("returns initial state in identity phase", () => {
      const state = startInterview();
      expect(state.phase).toBe("identity");
      expect(state.answers).toHaveLength(0);
      expect(state.questionIndex).toBe(0);
      expect(state.challenges).toBe(0);
      expect(state.partialConfig).toEqual({});
    });
  });

  describe("generateNextQuestion", () => {
    test("first question is identity phase", () => {
      const state = startInterview();
      const q = generateNextQuestion(state);
      expect(q).not.toBeNull();
      expect(q!.phase).toBe("identity");
      expect(q!.field).toBe("name");
    });

    test("returns null when interview is fully complete", () => {
      // Simulate a state at the end of the build phase
      const state: InterviewState = {
        phase: "build",
        answers: [],
        partialConfig: {},
        questionIndex: 1, // past the single build question
        challenges: 0,
      };
      const q = generateNextQuestion(state);
      expect(q).toBeNull();
    });

    test("transitions to next phase when current is exhausted", () => {
      const state: InterviewState = {
        phase: "identity",
        answers: [],
        partialConfig: {},
        questionIndex: 5, // past all 5 identity questions
        challenges: 0,
      };
      const q = generateNextQuestion(state);
      expect(q).not.toBeNull();
      expect(q!.phase).toBe("calibration");
    });
  });

  describe("isVagueAnswer", () => {
    test("empty string is vague", () => {
      expect(isVagueAnswer("", "name")).toBe(true);
    });

    test("whitespace-only is vague", () => {
      expect(isVagueAnswer("   ", "name")).toBe(true);
    });

    test("short answer for personality field is vague", () => {
      expect(isVagueAnswer("good", "base_personality")).toBe(true);
    });

    test("short answer for non-personality field is NOT vague", () => {
      expect(isVagueAnswer("Kira", "name")).toBe(false);
    });

    test("exact Chinese vague pattern is vague", () => {
      expect(isVagueAnswer("溫柔", "base_personality")).toBe(true);
      expect(isVagueAnswer("善良", "role")).toBe(true);
      expect(isVagueAnswer("乜都得", "backstory")).toBe(true);
    });

    test("exact English vague pattern is vague", () => {
      expect(isVagueAnswer("helpful", "role")).toBe(true);
      expect(isVagueAnswer("Nice", "base_personality")).toBe(true);
      expect(isVagueAnswer("SMART", "role")).toBe(true);
    });

    test("combo of vague words is vague", () => {
      expect(isVagueAnswer("nice and kind", "role")).toBe(true);
      expect(isVagueAnswer("溫柔、善良", "base_personality")).toBe(true);
    });

    test("specific answer is NOT vague", () => {
      expect(
        isVagueAnswer(
          "佢會先冷靜十秒，然後用最平靜嘅語氣講出最狠嘅話",
          "base_personality",
        ),
      ).toBe(false);
    });

    test("detailed English answer is NOT vague", () => {
      expect(
        isVagueAnswer(
          "She masks her insecurity with dark humor and never apologizes first",
          "base_personality",
        ),
      ).toBe(false);
    });
  });

  describe("challengeVague", () => {
    test("returns a non-empty challenge string", () => {
      const challenge = challengeVague("善良", "base_personality");
      expect(challenge.length).toBeGreaterThan(0);
    });

    test("includes the original answer in the challenge when template has placeholder", () => {
      // Use a field with templates that always include {answer}
      const challenge = challengeVague("善良", "base_personality");
      expect(challenge).toContain("善良");
    });

    test("uses field-specific challenges when available", () => {
      // Run multiple times to check it doesn't crash on any field
      const fields = [
        "base_personality",
        "role",
        "backstory",
        "communication_style",
        "conflict_response",
        "decision_style",
        "unknown_field",
      ];
      for (const field of fields) {
        const c = challengeVague("test", field);
        expect(c.length).toBeGreaterThan(0);
      }
    });
  });

  describe("processAnswer", () => {
    test("vague answer triggers challenge without advancing", async () => {
      const state = startInterview();
      const { state: newState, response } = await processAnswer(
        state,
        "helpful",
        stubLLM,
      );

      // Should not advance — same phase, same index
      expect(newState.phase).toBe("identity");
      expect(newState.questionIndex).toBe(0);
      expect(newState.answers).toHaveLength(0);
      expect(newState.challenges).toBe(1);
      expect(response.length).toBeGreaterThan(0);
    });

    test("valid answer advances to next question", async () => {
      const state = startInterview();
      const { state: newState, response } = await processAnswer(
        state,
        "Kira",
        stubLLM,
      );

      expect(newState.answers).toHaveLength(1);
      expect(newState.answers[0]!.answer).toBe("Kira");
      expect(newState.answers[0]!.field).toBe("name");
      expect(newState.questionIndex).toBe(1);
    });

    test("stores identity answers in partialConfig", async () => {
      const state = startInterview();
      const { state: s1 } = await processAnswer(state, "Kira", stubLLM);
      expect(s1.partialConfig.name).toBe("Kira");
    });

    test("handles phase transition", async () => {
      // Fast-forward to last identity question
      const state: InterviewState = {
        phase: "identity",
        answers: Array(4).fill({
          questionId: "x",
          answer: "test answer that is specific enough",
          field: "name",
        }),
        partialConfig: {},
        questionIndex: 4, // last identity question (index 4 = 5th)
        challenges: 0,
      };

      const { state: newState, response } = await processAnswer(
        state,
        "佢會先冷靜十秒，然後用最平靜嘅語氣講出最狠嘅話。最大缺陷係唔識認錯。",
        stubLLM,
      );

      expect(newState.phase).toBe("calibration");
      expect(newState.questionIndex).toBe(0);
      expect(response).toContain("情景測試");
    });

    test("calibration phase scores traits via LLM", async () => {
      const state: InterviewState = {
        phase: "calibration",
        answers: [],
        partialConfig: {},
        questionIndex: 0,
        challenges: 0,
      };

      const { state: newState } = await processAnswer(
        state,
        "佢會即刻衝過去抱住對方，問佢點解唔開心，陪佢傾到天光",
        stubLLM,
      );

      const traits = newState.partialConfig.traits as Record<string, number>;
      expect(traits).toBeDefined();
      expect(traits.warmth).toBe(0.7); // from stubLLM
    });

    test("broken LLM defaults trait to 0.5", async () => {
      const state: InterviewState = {
        phase: "calibration",
        answers: [],
        partialConfig: {},
        questionIndex: 0,
        challenges: 0,
      };

      const { state: newState } = await processAnswer(
        state,
        "佢會靜靜地陪住，唔講嘢但一直喺度",
        brokenLLM,
      );

      const traits = newState.partialConfig.traits as Record<string, number>;
      expect(traits.warmth).toBe(0.5);
    });

    test("returns 'Interview complete' when all phases done", async () => {
      const state: InterviewState = {
        phase: "build",
        answers: [],
        partialConfig: {},
        questionIndex: 1,
        challenges: 0,
      };

      const { response } = await processAnswer(state, "OK", stubLLM);
      expect(response).toBe("Interview complete.");
    });
  });

  describe("interviewToYaml", () => {
    test("generates valid YAML from interview state", () => {
      const state: InterviewState = {
        phase: "build",
        answers: [],
        partialConfig: {
          name: "Kira",
          role: "Full-stack intel analyst",
          base_personality:
            "Sharp, impatient with lazy thinking, loves digging into data",
          backstory: "Former cybersec researcher turned AI intel specialist",
          traits: {
            warmth: 0.4,
            directness: 0.9,
            analytical: 0.95,
          },
        },
        questionIndex: 0,
        challenges: 2,
      };

      const result = interviewToYaml(state);

      expect(result).toContain("agent: kira");
      expect(result).toContain("name: Kira");
      expect(result).toContain("role: Full-stack intel analyst");
      expect(result).toContain("warmth: 0.4");
      expect(result).toContain("directness: 0.9");
      expect(result).toContain("analytical: 0.95");
      // Missing traits should default to 0.5
      expect(result).toContain("openness: 0.5");
    });

    test("generates agent ID from name", () => {
      const state: InterviewState = {
        phase: "build",
        answers: [],
        partialConfig: { name: "Eve (イヴ)" },
        questionIndex: 0,
        challenges: 0,
      };

      const result = interviewToYaml(state);
      expect(result).toContain("agent: eve");
    });

    test("handles missing partialConfig gracefully", () => {
      const state = startInterview();
      const result = interviewToYaml(state);
      expect(result).toContain("agent:");
      expect(result).toContain("name:");
    });
  });
});
