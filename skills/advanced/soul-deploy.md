# /soul-deploy <agent>

Deploy a compiled TRUE_SOUL.md to the agent's workspace.

## What It Does

Copies the compiled SOUL.md to the agent's active workspace directory
and updates AGENTS.md. This is the final step — after deploy, the agent
uses the new personality on next gateway restart.

## Inputs

- `agent` — the agent identifier (e.g. "eve", "kira", "neru")

## Outputs

- `~/neru-workspace/{agent}-workspace/SOUL.md` — deployed personality
- `~/neru-workspace/{agent}-workspace/AGENTS.md` — symlink or copy of SOUL.md
- Console report: diff summary, char count, deploy timestamp

## Steps

1. **Check compiled exists:** verify `data/4_compiled/{agent}.TRUE_SOUL.md` exists
2. **Budget gate:** re-run `checkBudget()` on the compiled file — refuse deploy if over 15K
3. **Diff check:** if target SOUL.md already exists, show diff before overwriting
   - Summarize: sections added/removed/changed, char count delta
   - Ask for confirmation: 「確認 deploy？呢個會覆蓋現有 SOUL.md。」
4. **Backup current:** if existing SOUL.md present, copy to `SOUL.md.bak.{timestamp}`
5. **Deploy:**
   - Copy `4_compiled/{agent}.TRUE_SOUL.md` → `~/neru-workspace/{agent}-workspace/SOUL.md`
   - Copy same file → `~/neru-workspace/{agent}-workspace/AGENTS.md`
6. **Verify:** read back deployed file and confirm char count matches compiled
7. **Gateway note:** remind user to restart gateway for changes to take effect
   - 「Gateway 會 cache 檔案。記住 restart：`pkill -9 -f openclaw-gateway || true; nohup openclaw gateway run ...`」

## Black Cop Review Points

- Before deploy, force a diff review:
  - 「你有冇睇過 diff？上次 deploy 之後改咗乜？」
  - 「Section I 仲係 last 嘅？Check 吓。」
- After deploy, verify the file is readable:
  - 「Deploy 完但 gateway 冇 restart 等於冇做。你 restart 咗未？」
- Check for accidental hand-edits that will be overwritten:
  - 「現有 SOUL.md 有手動改過嘅嘢。呢啲會被覆蓋。你確定？」
- Warn if deploying without recent compile:
  - 「呢個 TRUE_SOUL.md 係三日前 compile 嘅。中間有冇改過 yaml 或 input.d？」

## Functions Used

- `checkBudget()`, `formatBudgetReport()` from `core/budget.ts`
- `Bun.file()` for reading/writing
- File system ops only — no LLM calls needed

## Example Usage

```
/soul-deploy eve
/soul-deploy kira
/soul-deploy neru
```
