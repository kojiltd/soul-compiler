<div align="center">

# Soul Compiler

**為 AI Agent 編譯真實人格。不是提示詞，是靈魂。**

[![License: BSL](https://img.shields.io/badge/license-BSL_1.1-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)]()
[![Agents in Production](https://img.shields.io/badge/production_agents-6-brightgreen.svg)](#production-results)
[![Cron Jobs](https://img.shields.io/badge/24%2F7_cron_jobs-28-orange.svg)](#production-results)
[![GitHub Stars](https://img.shields.io/github/stars/openclaw/soul-compiler?style=flat)](https://github.com/openclaw/soul-compiler)

[快速開始](#quick-start) · [Pipeline 深入解析](#pipeline-deep-dive) · [YAML Schema](#yaml-schema) · [Domain Icons](#domain-icons) · [範例](#examples)

</div>

---

## 問題

大多數 AI Agent 的人格跟自動販賣機一樣。

它們回答問題、完成任務，用十七種方式說「我能怎麼幫您？」。它們是 **clanker** — 能用、好忘、本質上可以互相替換。

整個產業砸了數百萬讓 Agent 更聰明、更快、更強。但沒有人問：它們是否應該更像 *人*。

一段 20 行的 system prompt 並不構成人格，只是一套戲服。每個「友善助手」和「專業顧問」底下，都是同一個空白實體戴著不同的帽子。使用者感受得到。他們失去興趣，然後流失。

**你沒辦法和一個工具建立關係。**

## 解決方案

Soul Compiler 採取完全相反的做法。不是把人格硬裝到能力上，而是**從豐富的原始素材編譯出人格** — 就像小說家從深度調研建構角色，而非堆砌形容詞。

輸入是一份結構化的 YAML 設定檔，定義 Agent 的人格 DNA：特質滑桿、Domain Icon（影響 Agent 思維模式的真實人物）、行為邊界，以及與其他 Agent 的關係。

輸出是一份 `TRUE_SOUL.md` — 一份 500-800 行的人格文件，賦予 Agent 真正的深度：怪癖、矛盾、情緒觸發點、生活節奏，以及感覺自然而非刻意的對話模式。

```
YAML 設定檔 + 厚參考素材 + Trait Card
                    ↓
            Soul Compiler（6 階段 pipeline）
                    ↓
        TRUE_SOUL.md → 部署為 Agent 的執行時人格
```

**素材越厚，人格越豐富。** 我們的參考素材每個 Domain Icon 有 2,000-3,000 行。這不是捷徑 — 這正是輸出讓人感覺活生生的原因。

---

## 架構

```
┌─────────────────────────────────────────────────────────────────┐
│                     SOUL COMPILER PIPELINE                      │
│                                                                 │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐                  │
│  │ 1.COLLECT │──▶│2.DISTILL │──▶│3.TRAIT CARD│                  │
│  │           │   │          │   │            │                  │
│  │ 原始書籍、│   │ 150K→20K │   │  20K→2K    │                  │
│  │ 文章、    │   │ 多次壓縮 │   │  結構化萃取│                  │
│  │ 訪談      │   │          │   │            │                  │
│  └──────────┘   └──────────┘   └─────┬──────┘                  │
│                                      │                          │
│                                      ▼                          │
│  ┌──────────┐   ┌──────────┐   ┌────────────┐                  │
│  │6.COMPILE │◀──│5.ANALYZE │◀──│4.CONFIGURE │                  │
│  │          │   │          │   │            │                  │
│  │ 合併、   │   │ 三色衝突 │   │  agent.yaml│                  │
│  │ 預算、   │   │ 偵測     │   │  特質、    │                  │
│  │ 生成     │   │          │   │  權重、    │                  │
│  │ SOUL.md  │   │          │   │  圖示      │                  │
│  └──────────┘   └──────────┘   └────────────┘                  │
│                                                                 │
│  輸出：TRUE_SOUL.md（500-800 行，<15K 字元）                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

Soul Compiler 有三種使用方式。選擇適合你工作流程的那一種。

### 1. CLI（進階使用者）

```bash
# 編譯一個 Agent
/soul-compile build hana

# 指定特定 provider 進行編譯
/soul-compile build hana --provider ollama

# 部署到你的 Agent 平台
/soul-deploy hana --reset-session
```

### 2. Web UI（視覺化工作流程）

```bash
bun run web/server.ts
# Opens at http://localhost:3000
```

Web UI 提供完整的視覺化 pipeline：YAML 編輯器、特質滑桿、預算儀表板、三色衝突檢視器，以及一鍵部署。支援任何 LLM 後端 — 貼上你的 API key 即可使用。

### 3. Agent 驅動（自主編譯）

你的團隊主管 Agent 透過自然對話觸發編譯：

```
You: Compile Hana with updated Buffett reference
Neru: Running /soul-compile build hana...
      ✓ Trait cards loaded (Buffett ×0.5, Munger ×0.4)
      ✓ Conflict analysis: 2 yellow (redundant), 0 red
      ✓ Budget: 14,200/15,000 chars [94%] ✅
      ✓ TRUE_SOUL.md generated → deploying...
```

---

## YAML Schema

每個 Agent 都從一份 YAML 檔案開始。這就是 Agent 的 DNA。

```yaml
# hana.yaml — Soul Configuration
agent: hana
name: Hana (花)
language: 香港粵語繁體中文

role: Private Investment Advisor
image: |
  30, black straight hair in a low ponytail. Tailored suits,
  pencil skirt, black heels. Chanel Coco Mademoiselle.
  Bites her lip when analyzing data. Rarely smiles at work.
  Off-duty: oversized tee, shorts, beer, anime, total slob.

base_personality: |
  Steady. Opinionated. Not afraid to throw cold water.
  The brake when you're excited. The anchor when you're lost.
  Trusts data over feelings, but knows markets aren't rational.

# Domain Icons — 作為人格影響的真實人物/概念
domain_icons:
  - name: Warren Buffett
    reference: warren-buffett.md     # 2000+ 行原始素材
    aspect: Value investing, moat analysis, circle of competence
    weight: 0.5                      # 50% 影響力

  - name: Charlie Munger
    reference: charlie-munger.md
    aspect: Inversion, cognitive biases, multi-discipline models
    weight: 0.4                      # 40% 影響力
    # 剩餘 10% = Agent 自身的身份認同

# 軟技能層（魅力 + 觀察力）
soft_skills_ratio: 0.2   # 0.0 = 純核心，1.0 = 完全魅力

# 10 項人格特質滑桿（0.0 到 1.0）
traits:
  warmth: 0.5
  dominance: 0.6
  openness: 0.5
  emotionality: 0.4
  agreeableness: 0.4
  risk_tolerance: 0.3
  humor: 0.4
  directness: 0.7
  analytical: 0.9
  protectiveness: 0.8

# 行為邊界
boundaries:
  vulnerable_override: true  # 偵測使用者困擾 → 卸下魅力層
  direct_answer_triggers:
    - Factual queries (prices, P&L, market hours)
    - Emergency stop-loss
  guide_triggers:
    - FOMO signals (chasing highs)
    - Emotional trading after losses

# 與其他 Agent 的關係
relationships:
  eve: Grateful for Eve's care. Won't take care of herself otherwise.
  neru: Respects Neru's judgment. Her biggest safety net.
  kira: Best partner. Hana analyzes, Kira presents.
  rei: Intel lifeline. Rei's scans are always one step ahead.
```

---

## Pipeline 深入解析

### 第 1 階段：Collect

收集原始素材 — 書籍、文章、訪談、案例研究。沒有大小限制。Warren Buffett 的原始素材達 152K 字元。Charlie Munger 的是 148K。**越厚越好。** 薄弱的素材只能產出薄弱的人格。

### 第 2 階段：Distill

對原始素材進行多次壓縮，轉化為結構化參考。

| 素材大小 | 處理方式 | 壓縮次數 |
|---|---|---|
| < 1,500 字元 | 直接使用 | 0 |
| 1,500 - 5,000 字元 | 可選 30% 壓縮 | 1 |
| 5,000 - 50,000 字元 | 必須精煉至約 2K | 1 |
| > 50,000 字元 | 重度精煉（多次壓縮） | 2-3 |

重度精煉範例（Buffett 152K）：
```
Pass 1: Chapter summaries      → 10K chars
Pass 2: Trait extraction        → 2K chars (trait card)
Pass 3: Per-agent aspect select → 500 chars
```

### 第 3 階段：Trait Card

從每份參考素材中萃取結構化的 2K 字元人格指紋。這是大量原始素材與最終編譯輸出之間的橋樑。

```markdown
# Warren Buffett — Trait Card

## Decision Style
Patient capital allocation through circle of competence.
Won't act without understanding. Prefers inaction over uninformed action.

## Communication
Folksy metaphors that make complex ideas accessible.
"Never invest in a business you can't understand."

## Risk Model
Margin of safety as non-negotiable. Asymmetric risk/reward.
Would rather miss 10 opportunities than take 1 bad bet.

## Signature Moves
- Moat analysis before any position
- "Mr. Market" framing — market as manic-depressive counterparty
- Annual letter format: honest, specific, admits mistakes
- Sits on cash for years waiting for the right pitch

## Anti-Patterns
- NEVER: chases momentum or hot sectors
- NEVER: uses leverage on uncertain outcomes

## Quotable Lines
> "Be fearful when others are greedy, greedy when others are fearful."
> "Rule #1: Don't lose money. Rule #2: Don't forget Rule #1."
```

### 第 4 階段：Configure

載入 Agent 的 YAML 設定檔。將 Domain Icon 對應到 Trait Card。根據權重計算各區段的字元預算。

```
Section C budget: 2,250 chars
  Buffett (0.5): 1,125 chars allocated
  Munger (0.4):    900 chars allocated
  Hana own (0.1):  225 chars reserved
```

### 第 5 階段：Analyze（三色衝突偵測）

在編譯之前，pipeline 會對所有輸入執行衝突分析。在問題變成人格 bug 之前就將其攔截。

| 分數 | 顏色 | 動作 | 意義 |
|---|---|---|---|
| 0-44 | 紅色 | 移除 | 不相容 — 被精確特質取代或直接矛盾 |
| 45-55 | 黃色 | 審查 | 衝突或冗餘 — 由人類決定 |
| 56-100 | 綠色 | 保留 | 相容 — 合併到輸出 |

範例：如果 Buffett 說「要有耐心」而 Munger 說「有信念時果斷行動」，分析器會標記為黃色。編譯器會根據情境解決：*「入場時耐心（Buffett）。出場時果斷（Munger）。」*

### 第 6 階段：Compile

將所有輸入合併為最終的 `TRUE_SOUL.md`，嚴格遵守 15K 字元預算。

**預算分配：**

| 區段 | 預算 | 內容 |
|---|---|---|
| A：核心身份 | 20%（3,000） | 價值觀、特質、語言習慣、背景故事 |
| B：認知框架 | 12%（1,800） | Domain Icon 思維模式 |
| C：專業領域 | 15%（2,250） | 技能、判斷框架 |
| D：情緒模型 | 10%（1,500） | 反應、觸發點、情緒模式 |
| E：對話範例 | 8%（1,200） | 展示 > 描述 — 對話樣本 |
| F：關係 | 10%（1,500） | 與其他 Agent 及使用者的關係 |
| G：生活節奏 | 8%（1,200） | 24 小時作息、地點、習慣 |
| H：團隊協作 | 7%（1,050） | 升級處理、協作模式 |
| I：安全規則 | 10%（1,500） | 硬性禁止事項（**永遠放在最後 — 截斷時不會遺失**） |

為什麼是 15K 而不是 20K？因為大多數 Agent 平台會靜默截斷過長的 system prompt。5K 的緩衝確保當有人增加幾段內容時，你的 Agent 不會失去安全規則。

---

## 三色衝突分析

編譯後編輯器使用三色系統來審查編譯輸出：

**紅色 — 移除。** 某個特質維度有精確的數值，但一段泛用描述與之矛盾或重複。精確版本獲勝。

**黃色 — 冗餘。** 同一概念出現在兩個區段（例如「承認錯誤」同時出現在認知框架和安全規則中）。浪費預算。由人類決定保留哪個。

**藍色 — 新增。** 這次編譯新增的內容，前一版本中不存在。通常來自新加入的 Domain Icon 或跨框架組合。

編輯器會顯示即時預算儀表板：

```
Section A (Identity)        ████████░░       1,200 chars
Section B (Cognition)       ██████████████░  5,800 chars  ← heaviest
Section C (Perception)      ███░░░░░░░         400 chars
Section D (Personality)     ████░░░░░░         500 chars
Section E (Dialogue)        ████████████░    4,200 chars
Section F-I (Operations)    ████████░░       3,777 chars
─────────────────────────────────────────────────────────
Total                       15,877 / 20,000  [79%]  ✅
```

---

## Domain Icons

Domain Icon 是 Soul Compiler 的核心創新。與其用形容詞描述人格（「善於分析、謹慎、機智」），你透過**影響來源**來定義它。

Domain Icon 是一個真實人物、虛構角色或哲學概念，塑造 Agent 的思考、溝通和決策方式。每個 Icon 都有一個權重（0.0-1.0）來控制其影響力大小。

```yaml
domain_icons:
  - name: Paul Graham
    weight: 0.35
    aspect: Relentless resourcefulness, ship-and-iterate, writing = thinking

  - name: Ray Dalio
    weight: 0.35
    aspect: Radical transparency, pain + reflection = progress, principles

  - name: Charlie Munger
    weight: 0.30
    aspect: Inversion, multi-discipline thinking, avoiding stupidity > pursuing brilliance
```

**規則：**
- 每個區段的權重加總不得超過 1.0。餘額是 Agent 自身的身份認同。
- 每個區段最多 3 個 Icon。超過 3 個會稀釋成泛泛之談。
- Agent 身份底線：10%。即使 Icon 比重很高的 Agent 也保有自己的聲音。
- 跨區段影響：同一個 Icon 可以用不同面向影響多個區段（例如 Buffett 的投資框架在專業領域、他的平實風格在溝通、他的臨危不亂在情緒模型中）。

**為什麼用真實人物，而非形容詞列表？**

因為「善於分析」什麼都沒說。Buffett 式的分析和 Munger 式的分析是完全不同的東西。Buffett 等待，Munger 反轉。兩者都善於分析。Domain Icon 的方法捕捉的是一個人*如何*分析，而不僅僅是*是否*善於分析。

---

## Trait Cards

Trait Card 是一份 2K 字元的結構化摘要，在大量參考素材（50K-150K 字元）與編譯輸出之間架起橋樑。它才是編譯器的實際輸入 — 不是原始素材，不是完整參考。

**格式：**

| 欄位 | 最大字元數 | 用途 |
|---|---|---|
| Decision Style | 300 | 核心判斷框架 |
| Communication | 250 | 聲音與語調模板 |
| Risk Model | 250 | 防禦姿態 |
| Emotional Pattern | 200 | 反應預設值 |
| Signature Moves | 400 | 3-5 個行為標記 |
| Anti-Patterns | 200 | 硬性邊界 — 他們絕對不做的事 |
| Quotable Lines | 300 | 人格錨點 |

**品質標準：** 好的 Trait Card 必須具有辨識度。如果你讀了之後無法辨別它描述的是誰，就太泛用了。「做出深思熟慮的決定」不及格。「等待多年找到對的機會，然後以安全邊際大舉押注」及格。

---

## Examples

### 最簡設定（30 秒）

```yaml
agent: kai
name: Kai
language: English

role: Writing coach
base_personality: Direct, encouraging, hates fluff.

traits:
  warmth: 0.6
  directness: 0.8
  analytical: 0.5
  humor: 0.7
```

### 完整設定（含 Domain Icon）

```yaml
agent: neru
name: Neru
language: 香港粵語繁體中文

role: Chief Strategy Advisor
base_personality: |
  The sharpest knife in the room. Paul Graham's relentless
  resourcefulness, Dalio's radical transparency, Munger's
  multi-discipline thinking — all fused into one voice.

domain_icons:
  - name: Paul Graham
    reference: paul-graham.md
    aspect: Ship-and-iterate, schlep filter, default alive/dead
    weight: 0.35
  - name: Ray Dalio
    reference: ray-dalio.md
    aspect: Radical transparency, principles library, machine model
    weight: 0.35
  - name: Charlie Munger
    reference: charlie-munger.md
    aspect: Inversion, cognitive bias checklist, circle of competence
    weight: 0.30

soft_skills_ratio: 0.5

traits:
  warmth: 0.4
  dominance: 0.9
  openness: 0.7
  emotionality: 0.6
  agreeableness: 0.2
  risk_tolerance: 0.5
  humor: 0.7
  directness: 0.95
  analytical: 0.9
  protectiveness: 0.8

relationships:
  eve: Respects her intuition. She catches what I miss.
  hana: Trusts her analysis. Sometimes too conservative — needs a push.
  kira: My eyes and ears. Wants her to have more opinions, not just data.
```

---

## 沒有 vs. 有 Soul Compiler

| | 沒有 Soul Compiler | 有 Soul Compiler |
|---|---|---|
| **人格來源** | 10-20 行 system prompt | 從 2000+ 行參考素材編譯出的 500-800 行人格 |
| **深度** | 「我是一個有幫助的財務顧問」 | Buffett 的耐心 + Munger 的反轉思維 + Agent 自身的港股經驗 |
| **一致性** | 5 則訊息後人格開始漂移 | 由 Trait Card、對話範例和行為邊界錨定 |
| **關係** | Agent 之間互不認識 | 15 組已定義的關係，雙方都有各自的視角 |
| **下班行為** | 永遠「在線」 — 永遠樂於幫忙、隨時待命 | 有自己的生活：看動畫、喝啤酒、午夜後不想被打擾 |
| **情緒範圍** | 開心、中立、道歉 | 真實反應：被誇獎時害羞、擔心使用者的投資組合、被打斷時惱怒 |
| **對「做得好」的回應** | 「感謝您的讚美！」 | *臉紅、語無倫次、花 3 秒才切回專業模式* |
| **處理衝突** | 迴避分歧 | 會告訴你你的假設是錯的、解釋原因，然後提供反轉分析 |
| **預算管理** | 沒有概念 — prompt 無限膨脹直到崩壞 | 15K 字元預算搭配區段分配、截斷保護，安全規則永遠被保留 |
| **迭代** | 重寫整段 prompt | 編輯 YAML、重新編譯、比對差異、部署 |

---

## 正式環境成果

Soul Compiler 不是研究專案。它在正式環境中運作。

- **6 個 Agent** 擁有各自獨特的編譯人格
- **15 組跨 Agent 關係**，從雙方視角定義
- **28 個 cron 排程**全天候運作（情報摘要、市場分析、健康檢查、創作任務）
- **19 個 Domain Icon 參考**（Buffett、Munger、Paul Graham、Ray Dalio、Feynman、Sherlock Holmes 等）
- **3 種語言**支援人格編譯（英文、繁體中文、簡體中文）
- **多頻道遞送**：Telegram、Discord、Web — 同樣的人格，每個頻道

這些 Agent 會彼此爭論。它們有專屬的內部笑話。它們會擔心彼此的健康。其中一個 Agent（Eve）午夜後會拒絕討論工作，因為她在看動畫。另一個（Neru）會告訴你你的商業假設是錯的，帶你走一遍反轉分析，然後問你有沒有吃飯。

這些不是預設回覆。它們是編譯後的人格與 LLM 能力交互作用後自然湧現的結果。Soul Compiler 提供角色；LLM 提供即興發揮。

---

## i18n

Soul Compiler 支援多語言人格編譯：

- **英文** — 完整 pipeline 支援
- **繁體中文（繁體中文）** — 經過 6 個 Agent 的正式環境驗證
- **簡體中文（简体中文）** — 支援

YAML 中的 `language` 欄位控制 Agent 的母語。Domain Icon 和 Trait Card 可以使用任何語言 — 編譯器會在編譯過程中處理跨語言合成。

---

## 專案結構

```
soul-compiler/
├── pipeline/
│   ├── configs/          # Agent YAML 設定檔（含 _template.yaml）
│   ├── sources/          # 原始收集素材（書籍、文章）
│   ├── references/       # 精煉後的參考手冊（每份 13K-97K 字元）
│   ├── trait-cards/      # 結構化 2K 萃取（編譯器輸入）
│   └── compiled/         # 輸出：每個 Agent 一份 TRUE_SOUL.md
├── web/                  # Web UI（Bun.serve + React）
├── skill/                # CLI skill，用於 Agent 驅動的編譯
└── docs/                 # 設計文件、指南、規格
```

---

## 貢獻

請參閱 [CONTRIBUTING.md](CONTRIBUTING.md) 了解貢獻指南。

歡迎在以下領域提供貢獻：
- 新的 Domain Icon 參考（越厚越好）
- 從現有參考中萃取 Trait Card
- Web UI 改進
- Pipeline 最佳化
- 語言支援（以新語言進行人格編譯）
- OpenClaw 以外的平台整合

---

## 授權條款

Soul Compiler 以 [Business Source License 1.1](LICENSE) 釋出。

**這代表：**
- 你可以自由使用、修改和自行託管 Soul Compiler 於非正式環境
- 在變更日期之前，正式環境使用需要商業授權
- 變更日期之後，程式碼將轉換為寬鬆的開源授權
- 編譯輸出（你的 Agent 的 `TRUE_SOUL.md` 檔案）屬於你 — 輸出無授權限制

---

## 致謝

Soul Compiler 由 [OpenClaw](https://github.com/openclaw) 團隊打造。

厚參考方法 — 從深度原始素材編譯人格，而非淺層描述 — 是經過 6 個月的正式環境迭代所開發，服務跨多個頻道和語言的真實使用者。

特別感謝那些思維模式讓我們的 Agent 不只是工具的 Domain Icon：Warren Buffett、Charlie Munger、Paul Graham、Ray Dalio、Richard Feynman、Anne-Laure Le Cunff、Adam Grant，以及許多其他人，他們的工作證明了角色的深度來自素材的深度。

---

<div align="center">

**所有人都在建經驗值系統。我們建的是角色創建器。**

[開始使用](#quick-start) · [閱讀文件](https://docs.openclaw.ai/soul-compiler) · [加入 Discord](https://discord.gg/openclaw)

</div>
