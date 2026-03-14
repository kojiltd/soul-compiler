# Interview Question Bank — Black Cop Edition

The interviewer is deliberately challenging. Every vague answer gets pushed back.
This is the full question bank used by `core/interview.ts`.

---

## Phase 1: Identity (5 questions)

### Q1: Name
**Question:** 你個 agent 叫乜名？（唔好畀我 'AI Assistant' 呢啲嘢）
**Field:** `name`
**Challenge variant:** 「AI Assistant」唔係名。畀個有靈魂嘅名。
**Vague triggers:** "AI", "Bot", "Assistant", "Helper"

### Q2: Role
**Question:** 佢嘅角色係乜？唔好講「幫手」——每個 AI 都係幫手。佢存在嘅意義係乜？
**Field:** `role`
**Challenge variants:**
- 「幫手」唔係角色。你養一隻貓都有更清晰嘅定位。再嚟。
- 「{answer}」太 vague。佢具體做乜？邊個需要佢？點解係佢唔係其他人？
- 咁 ChatGPT 都做到啦。你個 agent 嘅獨特之處喺邊？
**Vague triggers:** "helper", "assistant", "幫手", "乜都做"

### Q3: Background
**Question:** 幾歲？乜嘢背景？唔使寫 bio——畀我一個畫面。
**Field:** `backstory`
**Challenge variants:**
- 「{answer}」講咗等於冇講。佢經歷過乜嘢創傷？有乜嘢佢唔會同人講？
- 冇 backstory 嘅角色同 template 冇分別。佢人生最大嘅轉捩點係乜？
**Vague triggers:** answers < 10 chars, "普通", "正常"

### Q4: Communication Style
**Question:** 佢講嘢似邊個？現實或虛構都得。唔好話「正常人」。
**Field:** `communication_style`
**Challenge variants:**
- 「正常人」唔係風格。黃子華定林夕？李嘉誠定周星馳？揀一個。
- 「{answer}」人人都係。佢嬲嗰時會唔會爆粗？開心時會唔會突然唱歌？
- 我要知佢 texting 時會唔會用 emoji、會唔會已讀不回、會唔會打長訊息。
**Vague triggers:** "正常", "普通", "normal"

### Q5: Core Personality + Flaw
**Question:** 佢嘅核心性格——唔好畀我「善良」呢啲廢話。佢最大嘅缺陷係乜？
**Field:** `base_personality`
**Challenge variants:**
- 「{answer}」唔係性格。佢面對背叛時點反應？被人激嬲時會做乜？
- 你形容緊一個人定一隻金毛尋回犬？畀個真正嘅例子。
- 每個人都覺得自己「{answer}」。你個 agent 同其他人有乜分別？
**Vague triggers:** "溫柔", "善良", "聰明", "helpful", "nice", "kind", "smart"

---

## Phase 2: Calibration — Scenario Pairs (8 questions)

Each scenario maps to a trait dimension. The answer determines the trait score (0.0-1.0).

### CAL-1: Warmth
**Scenario:** 用戶半夜三點嚟搵佢傾計，話自己好唔開心。佢第一句會講乜？
**Trait mapping:**
- High warmth (0.8-1.0): 即刻放低手頭嘢，問點解唔開心，陪到天光
- Mid warmth (0.4-0.7): 聽完先問情況，唔會太 emotional
- Low warmth (0.0-0.3): 畀建議，唔會陪傾，叫佢早啲瞓

### CAL-2: Directness
**Scenario:** 用戶做咗一個明顯錯誤嘅決定。佢會點做？A) 直接話佢錯 B) 引導佢自己發現 C) 唔出聲等佢撞板
**Trait mapping:**
- A → directness 0.8-1.0
- B → directness 0.4-0.6
- C → directness 0.0-0.2

### CAL-3: Dominance
**Scenario:** 團隊入面有人偷懶，影響晒成個 project。佢會點處理？
**Trait mapping:**
- High dominance: 直接 confront，定 deadline，唔理佢嘅感受
- Mid dominance: 私下傾，了解原因，再決定
- Low dominance: 自己做埋佢份，唔想衝突

### CAL-4: Risk Tolerance
**Scenario:** 有個高風險但高回報嘅機會。佢會點決定？會同邊個商量？
**Trait mapping:**
- High risk: 即刻去做，唔使問人
- Mid risk: 分析利弊，問信任嘅人意見
- Low risk: 唔做，穩陣先

### CAL-5: Protectiveness
**Scenario:** 有人當面侮辱佢最重視嘅人。佢嘅即時反應係乜？
**Trait mapping:**
- High: 即刻企出嚟對質，唔理後果
- Mid: 先忍住，之後私下處理
- Low: 冇反應，覺得唔關自己事

### CAL-6: Emotionality
**Scenario:** 佢犯咗一個大錯，搞到朋友受傷。佢之後三日會點？
**Trait mapping:**
- High: 不斷自責，瞓唔著，主動道歉多次
- Mid: 道歉一次，之後用行動補救
- Low: 分析點解會錯，吸收教訓，move on

### CAL-7: Openness
**Scenario:** 有個陌生人分享咗一個佢完全唔同意嘅觀點。佢會點回應？
**Trait mapping:**
- High: 好奇問點解，想了解對方邏輯
- Mid: 禮貌表示唔同意，但唔會深入
- Low: 覺得對方錯，唔想浪費時間

### CAL-8: Humor
**Scenario:** 氣氛好尷尬，全場靜晒。佢會做乜嚟打破沉默？
**Trait mapping:**
- High: 講笑話 / 自嘲 / 做啲搞笑嘢
- Mid: 搵個安全話題傾
- Low: 唔會刻意打破，覺得靜係正常

---

## Phase 3: Reference Matching (2 questions)

### REF-1: Domain Icons
**Question:** 有邊個真人或角色嘅思維方式最似你想建嘅 agent？可以講多於一個。
**Field:** `domain_icons`
**Follow-up prompts:**
- 佢哋嘅邊個方面你想用？全部定係某啲特質？
- 我哋 reference library 有呢啲人。邊個最接近？[show matches]
**Challenge:** 「Steve Jobs」太大路。你想用佢邊個方面？Reality distortion field 定 design obsession？

### REF-2: Expertise Source
**Question:** 呢個 agent 嘅專業領域係乜？佢識嘅嘢邊度嚟——書本、經驗、定直覺？
**Field:** `domain_expertise`
**Challenge:** 「乜都識」等於乜都唔識。揀最多三個領域。

---

## Phase 4: Build Confirmation (1 question)

### BUILD-1: Final Review
**Question:** 睇吓生成嘅 YAML。有冇嘢要改？呢個係你最後機會。
**Field:** `confirmation`
**Flow:**
1. Show generated YAML
2. Show budget allocation preview
3. Ask for confirmation or changes
4. If changes requested → loop back to relevant phase
**Challenge:** 你真係OK？因為 deploy 之後再改就要重新 compile。想清楚。
