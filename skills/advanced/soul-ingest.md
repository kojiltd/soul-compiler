# /soul-ingest <name|url>

Collect raw source material about a reference person into `1_sources/`.

## What It Does

Gathers everything available about a person — articles, interviews, books,
social media posts, podcast transcripts — and dumps it into a single `org.md`
file for later distillation.

## Inputs

- `name` — the reference person's name (e.g. "adam-grant", "anne-laure-le-cunff")
- OR `url` — a URL to fetch and add to existing source material

## Outputs

- `~/.openclaw/soul-configs/1_sources/{name}/org.md` — raw concatenated material
- Console report: source count, total char count, distill recommendation

## Steps

1. **Create directory** if not exists: `data/1_sources/{name}/`
2. **If URL provided:**
   - Fetch the URL content
   - Append to `org.md` with source header (`--- Source: {url} ---`)
   - Report char count added
3. **If name only (no URL):**
   - Check if `org.md` already exists
   - If exists: report current size and ask if user wants to add more
   - If not: create empty `org.md` and prompt user to provide sources
4. **Size assessment:**
   - < 1,500 chars: "Too thin. Need more sources before distilling."
   - 1,500 - 5,000 chars: "Enough for basic distill. Optional: add more for richer output."
   - 5,000 - 50,000 chars: "Good volume. Ready for standard distill."
   - > 50,000 chars: "Heavy source. Will use multi-pass distill (slower but thorough)."

## Black Cop Review Points

- Challenge if the source is just a Wikipedia summary: 「Wikipedia 唔夠。畀我 interview transcripts、actual quotes、或者佢自己寫嘅嘢。」
- Challenge if source is too short: 「{count} 字？你想我用咁少嘢建一個性格？至少畀 3,000 字嘅 primary source。」
- Challenge if source has no quotes: 「冇 quotes 等於冇聲音。我需要知佢點講嘢，唔係其他人點形容佢。」

## Functions Used

- `Bun.file()` for reading/writing (per project rules)
- No core/ functions needed at this stage — pure file ops

## Example Usage

```
/soul-ingest adam-grant
/soul-ingest anne-laure-le-cunff https://nesslabs.com/about
```
