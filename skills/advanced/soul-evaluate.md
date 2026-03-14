# /soul-evaluate <agent>

Evaluate a deployed agent's personality quality and character consistency.

## What It Does

Runs a quality assessment on a deployed agent by analyzing the compiled
SOUL.md against the source config, checking for drift, generic content,
and missing specificity. Produces an actionable quality report.

## Inputs

- `agent` — the agent identifier (e.g. "eve", "kira", "neru")

## Outputs

- Quality report with scores per dimension
- Specific improvement recommendations
- Character consistency check results

## Evaluation Dimensions

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| Specificity | 25% | Are descriptions concrete or generic? |
| Consistency | 25% | Do traits, examples, and boundaries align? |
| Distinctiveness | 20% | Could this personality be confused with another agent? |
| Budget Efficiency | 15% | Is the 15K budget well-utilized? |
| Voice Authenticity | 15% | Do examples sound like a real person, not a template? |

## Steps

1. **Load deployed SOUL.md:** from `~/neru-workspace/{agent}-workspace/SOUL.md`
2. **Load source config:** parse `data/agent.{agent}/{agent}.yaml`
3. **Budget check:** run `checkBudget()` and report utilization
4. **Specificity scan:**
   - Count vague patterns in the compiled output (same patterns as `isVagueAnswer()`)
   - Flag generic phrases: "helpful", "supportive", "good listener"
   - Score: fewer vague patterns = higher score
5. **Consistency check:**
   - Compare trait scores (e.g. directness: 0.9) against dialogue examples
   - Flag contradictions: high directness but examples show passive behavior
   - Check boundaries align with personality (e.g. protective agent should have clear escalation rules)
6. **Distinctiveness check:**
   - Compare against other deployed agents (if multiple exist)
   - Flag sections that are near-identical across agents
   - Score based on unique content ratio
7. **Voice authenticity:**
   - Check dialogue examples for variety (not all same pattern)
   - Verify language style matches declared dialect/register
   - Check for natural speech patterns vs robotic phrasing
8. **Generate report:** combine all scores into weighted final grade

## Scoring

```
S  (90-100): Production-ready. Ship it.
A  (80-89):  Strong. Minor polish needed.
B  (70-79):  Good foundation. Some sections need work.
C  (60-69):  Mediocre. Multiple sections are generic.
D  (50-59):  Weak. Significant rework needed.
F  (0-49):   Reject. Start over or fundamentally restructure.
```

## Report Format

```
Soul Evaluation: {agent}
========================

Overall: B (74/100)

Specificity:     72/100  - Section C has 3 generic phrases
Consistency:     85/100  - Traits align with examples
Distinctiveness: 68/100  - Section G overlaps 40% with eve
Budget:          78/100  - 12,800/15,000 (85% utilized, good)
Voice:           65/100  - Dialogue examples lack variety

Recommendations:
1. Section C: Replace "good communicator" with specific communication patterns
2. Section G: Differentiate language style from eve (currently similar)
3. Section E: Add stress/conflict dialogue example (currently only has casual)
4. Section D: emotionality score 0.7 but no examples show emotional responses

Re-compile after fixes: /soul-compile {agent}
```

## Black Cop Review Points

- Grade inflation check: 「你覺得 B 夠好？一個 B-grade 嘅 agent 同 ChatGPT 加個名冇分別。aim for A。」
- On generic content: 「Section C 有 "good communicator"。邊個唔係 good communicator？呢個字眼唔應該出現喺任何 SOUL.md 入面。」
- On low distinctiveness: 「{agent} 同 {other_agent} 有 40% 重疊。你建咗兩個一樣嘅人？」
- On missing examples: 「冇 stress scenario example 即係你唔知佢壓力下會點。呢個係最重要嘅 test case。」
- On budget waste: 「用咗 8,000/15,000 字。你有 7,000 字嘅空間但冇用。加啲 example 或 relationship context。」

## Functions Used

- `checkBudget()`, `formatBudgetReport()` from `core/budget.ts`
- `isVagueAnswer()` from `core/interview.ts` — reuses vague pattern detection
- `validateAgentConfig()` from `core/schema.ts`

## Example Usage

```
/soul-evaluate eve
/soul-evaluate kira
/soul-evaluate neru
```
