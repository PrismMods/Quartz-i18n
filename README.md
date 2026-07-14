# quartz-i18n

Community translations for [Quartz](https://github.com/PrismMods/Quartz), an A Dance of Fire and Ice mod.

## Layout

- `Lang/en-US.json` — English, the **source of truth** for keys. Auto-pushed here from the
  Quartz repo whenever it changes. **Do not edit** — changes are overwritten.
- `Lang/<code>.json` — one file per language (`ko-KR.json`, `zh-CN.json`, …). Edit these.

## How to translate

1. Open `Lang/en-US.json` to see every key and its English text.
2. Edit (or create) `Lang/<your-code>.json`, shaped like this:
   ```json
   {
     "<your-code>": {
       "0KTL": "DO_NOT_TRANSLATE_THIS_KEY!",
       "0NATIVELANG": "<language's own name>",
       "SOME_KEY": "your translation",
       "...": "..."
     }
   }
   ```
3. Rules:
   - Keep `0KTL` **exactly** `DO_NOT_TRANSLATE_THIS_KEY!`. Without it the mod ignores the whole file.
   - Set `0NATIVELANG` to the language's own name (shown in the in-game picker), e.g. `中文`, `한국어`.
   - Translate **values only, never keys**. Match the key set in `en-US.json`.
   - A few values are intentionally English (BPM, FPS, KPS, R/G/B/A channels, brand names). Leaving those as-is is correct.
4. Open a pull request. CI (`scripts/validate.py`) checks JSON validity, the `0KTL` sentinel, and key parity against `en-US.json`. Missing keys are a warning (they fall back to English), not a failure — partial translations are fine.
5. After it's merged here, a bot opens a pull request on the Quartz repo to pull your changes into the mod. A maintainer reviews and merges that.

## Adding a new language

Copy `Lang/en-US.json` to `Lang/<code>.json`, change the top-level block key and `0NATIVELANG`, then translate. No code change is needed in the mod — Quartz auto-registers any valid language file it finds.
