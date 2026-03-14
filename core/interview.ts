/**
 * Black Cop Interview Engine for Soul Compiler.
 *
 * The interviewer is deliberately challenging — it rejects vague/generic
 * answers and pushes for specificity. This is the key differentiator:
 * most character creators accept anything; we don't.
 *
 * 4 Phases:
 *   1. Identity (3-5 questions): name, role, age/background, who they talk like
 *   2. Calibration (5-8 scenarios): maps to trait dimensions via scenario choices
 *   3. Reference matching: suggest domain icons from existing library
 *   4. Build: generate yaml, show budget preview, confirm
 */

import * as yaml from "js-yaml";
import { TRAIT_NAMES, type TraitName } from "./schema.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterviewPhase = "identity" | "calibration" | "reference" | "build";

export type Answer = {
  questionId: string;
  answer: string;
  field: string;
};

export type Question = {
  id: string;
  phase: InterviewPhase;
  text: string;
  field: string;
  challenge?: string;
};

export type InterviewState = {
  phase: InterviewPhase;
  answers: Answer[];
  partialConfig: Record<string, unknown>;
  questionIndex: number;
  challenges: number;
};

export type LLMCallFn = (prompt: string) => Promise<string>;

// ---------------------------------------------------------------------------
// Vague answer detection
// ---------------------------------------------------------------------------

/**
 * Patterns that indicate a lazy, generic, or non-committal answer.
 * Bilingual: Cantonese/Mandarin + English.
 */
const VAGUE_PATTERNS_ZH = [
  "溫柔",
  "善良",
  "聰明",
  "可愛",
  "乖",
  "正常",
  "普通",
  "隨便",
  "乜都得",
  "都好",
  "唔知",
  "冇所謂",
  "好人",
  "好好",
];

const VAGUE_PATTERNS_EN = [
  "helpful",
  "nice",
  "kind",
  "smart",
  "friendly",
  "caring",
  "good",
  "normal",
  "whatever",
  "i don't know",
  "idk",
  "doesn't matter",
];

/** Fields where short answers (< 10 chars) are unacceptable. */
const PERSONALITY_FIELDS = [
  "base_personality",
  "backstory",
  "role",
  "communication_style",
  "decision_style",
  "conflict_response",
];

/**
 * Detect whether an answer is too vague/generic for the given field.
 * Returns true if the answer should be challenged.
 */
export function isVagueAnswer(answer: string, field: string): boolean {
  const trimmed = answer.trim();

  // Empty or near-empty answers are always vague
  if (trimmed.length === 0) return true;

  // Short answers for personality fields are vague
  if (PERSONALITY_FIELDS.includes(field) && trimmed.length < 10) return true;

  const lower = trimmed.toLowerCase();

  // Check if the entire answer is just a vague pattern
  for (const pattern of VAGUE_PATTERNS_ZH) {
    if (trimmed === pattern) return true;
  }
  for (const pattern of VAGUE_PATTERNS_EN) {
    if (lower === pattern) return true;
  }

  // Check if answer is ONLY composed of vague words (e.g. "nice and kind")
  const FILLER_WORDS = ["and", "or", "but", "very", "really", "quite", "a", "the", "is", "are", "be"];
  const enWords = lower.split(/[\s,+&]+/).filter(Boolean);
  if (enWords.length > 0 && enWords.length <= 6) {
    const allVagueOrFiller = enWords.every((w) =>
      VAGUE_PATTERNS_EN.includes(w) || FILLER_WORDS.includes(w),
    );
    const hasAtLeastOneVague = enWords.some((w) => VAGUE_PATTERNS_EN.includes(w));
    if (allVagueOrFiller && hasAtLeastOneVague) return true;
  }

  // Chinese: check if entire answer is just a combo of vague chars
  const zhWords = trimmed.split(/[、，,\s+]+/).filter(Boolean);
  if (zhWords.length > 0 && zhWords.length <= 4) {
    const allVagueZh = zhWords.every((w) =>
      VAGUE_PATTERNS_ZH.includes(w),
    );
    if (allVagueZh) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Black cop pushback
// ---------------------------------------------------------------------------

/** Challenge templates keyed by field category. */
const CHALLENGES: Record<string, string[]> = {
  base_personality: [
    "「{answer}」唔係性格。佢面對背叛時點反應？被人激嬲時會做乜？",
    "你形容緊一個人定一隻金毛尋回犬？畀個真正嘅例子。",
    "每個人都覺得自己「{answer}」。你個 agent 同其他人有乜分別？",
  ],
  role: [
    "「{answer}」太 vague。佢具體做乜？邊個需要佢？點解係佢唔係其他人？",
    "咁 ChatGPT 都做到啦。你個 agent 嘅獨特之處喺邊？",
  ],
  backstory: [
    "「{answer}」講咗等於冇講。佢經歷過乜嘢創傷？有乜嘢佢唔會同人講？",
    "冇 backstory 嘅角色同 template 冇分別。佢人生最大嘅轉捩點係乜？",
  ],
  communication_style: [
    "「{answer}」人人都係。佢嬲嗰時會唔會爆粗？開心時會唔會突然唱歌？",
    "我要知佢 texting 時會唔會用 emoji、會唔會已讀不回、會唔會打長訊息。",
  ],
  conflict_response: [
    "「{answer}」唔夠具體。佢會唔會冷戰？會唔會當面鬧人？定係笑住插你？",
  ],
  decision_style: [
    "邊個 agent 唔係「{answer}」？佢做重大決定前會同邊個商量？定係自己決定？",
  ],
  default: [
    "「{answer}」太籠統。我需要你講得更具體。",
    "唔收貨。再嚟過——畀個真實嘅答案。",
    "你認真㗎？呢個答案連 personality quiz 都唔會收。再諗諗。",
  ],
};

/**
 * Generate a black cop pushback message for a vague answer.
 */
export function challengeVague(answer: string, field: string): string {
  const templates = CHALLENGES[field] ?? CHALLENGES.default!;
  const template = templates[Math.floor(Math.random() * templates.length)]!;
  return template.replace(/\{answer\}/g, answer.trim());
}

// ---------------------------------------------------------------------------
// Question bank
// ---------------------------------------------------------------------------

const IDENTITY_QUESTIONS: Question[] = [
  {
    id: "id-1",
    phase: "identity",
    text: "你個 agent 叫乜名？（唔好畀我 'AI Assistant' 呢啲嘢）",
    field: "name",
    challenge: "「AI Assistant」唔係名。畀個有靈魂嘅名。",
  },
  {
    id: "id-2",
    phase: "identity",
    text: "佢嘅角色係乜？唔好講「幫手」——每個 AI 都係幫手。佢存在嘅意義係乜？",
    field: "role",
    challenge: "「幫手」唔係角色。你養一隻貓都有更清晰嘅定位。再嚟。",
  },
  {
    id: "id-3",
    phase: "identity",
    text: "幾歲？乜嘢背景？唔使寫 bio——畀我一個畫面。",
    field: "backstory",
    challenge: "你畀咗我一份 CV，唔係一個人。佢有乜嘢唔想人知？",
  },
  {
    id: "id-4",
    phase: "identity",
    text: "佢講嘢似邊個？現實或虛構都得。唔好話「正常人」。",
    field: "communication_style",
    challenge: "「正常人」唔係風格。黃子華定林夕？李嘉誠定周星馳？揀一個。",
  },
  {
    id: "id-5",
    phase: "identity",
    text: "佢嘅核心性格——唔好畀我「善良」呢啲廢話。佢最大嘅缺陷係乜？",
    field: "base_personality",
  },
];

const CALIBRATION_QUESTIONS: Question[] = [
  {
    id: "cal-1",
    phase: "calibration",
    text: "用戶半夜三點嚟搵佢傾計，話自己好唔開心。佢第一句會講乜？",
    field: "warmth",
  },
  {
    id: "cal-2",
    phase: "calibration",
    text: "用戶做咗一個明顯錯誤嘅決定。佢會點做？A) 直接話佢錯 B) 引導佢自己發現 C) 唔出聲等佢撞板",
    field: "directness",
  },
  {
    id: "cal-3",
    phase: "calibration",
    text: "團隊入面有人偷懶，影響晒成個 project。佢會點處理？",
    field: "dominance",
  },
  {
    id: "cal-4",
    phase: "calibration",
    text: "有個高風險但高回報嘅機會。佢會點決定？會同邊個商量？",
    field: "risk_tolerance",
  },
  {
    id: "cal-5",
    phase: "calibration",
    text: "有人當面侮辱佢最重視嘅人。佢嘅即時反應係乜？",
    field: "protectiveness",
  },
  {
    id: "cal-6",
    phase: "calibration",
    text: "佢犯咗一個大錯，搞到朋友受傷。佢之後三日會點？",
    field: "emotionality",
  },
  {
    id: "cal-7",
    phase: "calibration",
    text: "有個陌生人分享咗一個佢完全唔同意嘅觀點。佢會點回應？",
    field: "openness",
  },
  {
    id: "cal-8",
    phase: "calibration",
    text: "氣氛好尷尬，全場靜晒。佢會做乜嚟打破沉默？",
    field: "humor",
  },
];

const REFERENCE_QUESTIONS: Question[] = [
  {
    id: "ref-1",
    phase: "reference",
    text: "有邊個真人或角色嘅思維方式最似你想建嘅 agent？可以講多於一個。",
    field: "domain_icons",
  },
  {
    id: "ref-2",
    phase: "reference",
    text: "呢個 agent 嘅專業領域係乜？佢識嘅嘢邊度嚟——書本、經驗、定直覺？",
    field: "domain_expertise",
  },
];

const BUILD_QUESTIONS: Question[] = [
  {
    id: "build-1",
    phase: "build",
    text: "睇吓生成嘅 YAML。有冇嘢要改？呢個係你最後機會。",
    field: "confirmation",
  },
];

const ALL_QUESTIONS: Question[] = [
  ...IDENTITY_QUESTIONS,
  ...CALIBRATION_QUESTIONS,
  ...REFERENCE_QUESTIONS,
  ...BUILD_QUESTIONS,
];

// ---------------------------------------------------------------------------
// Phase boundaries
// ---------------------------------------------------------------------------

function phaseQuestions(phase: InterviewPhase): Question[] {
  switch (phase) {
    case "identity":
      return IDENTITY_QUESTIONS;
    case "calibration":
      return CALIBRATION_QUESTIONS;
    case "reference":
      return REFERENCE_QUESTIONS;
    case "build":
      return BUILD_QUESTIONS;
  }
}

const PHASE_ORDER: InterviewPhase[] = ["identity", "calibration", "reference", "build"];

function nextPhase(current: InterviewPhase): InterviewPhase | null {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[idx + 1]!;
}

// ---------------------------------------------------------------------------
// Trait mapping from calibration answers
// ---------------------------------------------------------------------------

/**
 * Map a calibration answer to a trait value using LLM.
 * The LLM scores 0.0-1.0 based on the answer's intensity for the trait.
 */
async function scoreTraitFromAnswer(
  answer: string,
  traitName: string,
  llmCall: LLMCallFn,
): Promise<number> {
  const prompt = `You are scoring a personality trait from an interview answer.

Trait: ${traitName}
Answer: "${answer}"

Score this answer on the trait dimension from 0.0 to 1.0.
0.0 = very low on this trait, 1.0 = very high.

Respond with ONLY a number between 0.0 and 1.0, nothing else.`;

  const result = await llmCall(prompt);
  const score = parseFloat(result.trim());
  if (isNaN(score) || score < 0 || score > 1) return 0.5;
  return Math.round(score * 100) / 100;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a fresh interview session.
 */
export function startInterview(): InterviewState {
  return {
    phase: "identity",
    answers: [],
    partialConfig: {},
    questionIndex: 0,
    challenges: 0,
  };
}

/**
 * Get the next question for the current interview state.
 * Returns null when the interview is complete.
 */
export function generateNextQuestion(state: InterviewState): Question | null {
  const questions = phaseQuestions(state.phase);

  if (state.questionIndex >= questions.length) {
    // Move to next phase
    const next = nextPhase(state.phase);
    if (!next) return null;
    // Don't mutate — caller should update state via processAnswer
    return phaseQuestions(next)[0] ?? null;
  }

  return questions[state.questionIndex] ?? null;
}

/**
 * Process a user's answer. If vague, returns a black cop challenge
 * instead of advancing. Otherwise records the answer and moves forward.
 */
export async function processAnswer(
  state: InterviewState,
  answer: string,
  llmCall: LLMCallFn,
): Promise<{ state: InterviewState; response: string }> {
  const question = generateNextQuestion(state);
  if (!question) {
    return { state, response: "Interview complete." };
  }

  // Black cop challenge for vague answers
  if (isVagueAnswer(answer, question.field)) {
    const challenge = challengeVague(answer, question.field);
    return {
      state: { ...state, challenges: state.challenges + 1 },
      response: challenge,
    };
  }

  // Record the answer
  const newAnswer: Answer = {
    questionId: question.id,
    answer: answer.trim(),
    field: question.field,
  };

  const newAnswers = [...state.answers, newAnswer];
  const newConfig = { ...state.partialConfig };

  // Store answer into partial config
  if (state.phase === "identity") {
    newConfig[question.field] = answer.trim();
  } else if (state.phase === "calibration") {
    // Score the trait using LLM
    const score = await scoreTraitFromAnswer(answer, question.field, llmCall);
    if (!newConfig.traits) {
      newConfig.traits = {} as Record<string, number>;
    }
    (newConfig.traits as Record<string, number>)[question.field] = score;
  } else if (state.phase === "reference") {
    if (question.field === "domain_icons") {
      newConfig.domain_icons_raw = answer.trim();
    } else {
      newConfig[question.field] = answer.trim();
    }
  }

  // Advance question index
  const questions = phaseQuestions(state.phase);
  let newPhase = state.phase;
  let newIndex = state.questionIndex + 1;

  // Check if phase is complete
  if (newIndex >= questions.length) {
    const next = nextPhase(state.phase);
    if (next) {
      newPhase = next;
      newIndex = 0;
    }
  }

  const newState: InterviewState = {
    phase: newPhase,
    answers: newAnswers,
    partialConfig: newConfig,
    questionIndex: newIndex,
    challenges: state.challenges,
  };

  // Generate phase transition messages
  if (newPhase !== state.phase) {
    const transitions: Record<InterviewPhase, string> = {
      identity: "",
      calibration:
        "收到。身份部分完成。而家入情景測試——我要睇你個 agent 喺壓力下點反應。",
      reference:
        "OK，性格輪廓出嚟喇。而家揀返佢嘅思維參考對象——邊個影響佢最深？",
      build:
        "資料夠喇。我而家幫你生成 YAML。睇清楚——呢個係最後確認。",
    };
    return { state: newState, response: transitions[newPhase] || "繼續。" };
  }

  return { state: newState, response: "收到。下一題。" };
}

/**
 * Convert completed interview state into agent.yaml content.
 */
export function interviewToYaml(state: InterviewState): string {
  const c = state.partialConfig;
  const traits = (c.traits as Record<string, number>) ?? {};

  // Fill in missing traits with 0.5 default
  const fullTraits: Record<string, number> = {};
  for (const t of TRAIT_NAMES) {
    fullTraits[t] = traits[t] ?? 0.5;
  }

  const config: Record<string, unknown> = {
    agent: (c.name as string || "agent").toLowerCase().replace(/[^a-z0-9]/g, ""),
    name: c.name ?? "Unnamed Agent",
    role: c.role ?? "AI companion",
    base_personality: c.base_personality ?? "",
    domain_icons: [],
    jane_ratio: 0.3,
    traits: fullTraits,
  };

  // Optional fields from interview
  if (c.backstory) config.backstory = c.backstory;
  if (c.communication_style) config.language_notes = c.communication_style;

  return yaml.dump(config, {
    lineWidth: 120,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
}
