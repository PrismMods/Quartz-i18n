# quartz-i18n

Community translations for [Quartz](https://github.com/PrismMods/Quartz), an A Dance of Fire and Ice mod.

## Layout

- `Lang/en-US.json` — English, the **source of truth** for keys. Auto-pushed here from the
  Quartz repo whenever it changes. **Do not edit** — changes are overwritten.
- `Lang/<code>.json` — one file per language (`ko-KR.json`, `zh-CN.json`, …). Edit these.
- `Lang/AprilFools/<code>.json` — the joke overlay, an optional extra. Same rules, different
  goal. See [The April Fools overlay](#the-april-fools-overlay).

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

## The April Fools overlay

`Lang/AprilFools/` is a second, **optional** set of files that Quartz shows in place of the
normal strings on one day of the year. It uses the **same keys** as `Lang/` with different
values, which is exactly why it lives in its own folder — the two can never be merged into
one file.

You do not have to touch it. If a key is missing there, the mod falls back to the English
joke, and if that is missing too, to your normal translation. Nothing breaks.

If you do want to write it:

1. Open `Lang/AprilFools/en-US.json` beside `Lang/en-US.json` and compare. Most values are
   still identical — those are the ones nobody has written a joke for yet. The ones that
   differ show the tone that is wanted.
2. Edit `Lang/AprilFools/<your-code>.json`. It starts as a copy of your real translation, so
   you are rewriting values in place, not filling in blanks.
3. **Do not translate the English joke literally.** It will not be funny in your language and
   often will not even parse. Write a joke that works in your language for the same UI
   element — misspellings, the wrong word, over-casual register, a straight-faced lie about
   what the button does. Keep it about the same length so the UI still fits.
4. Leave anything you have no joke for exactly as it is. A half-written overlay is fine and
   is the normal state of this folder.

Same hard rules as everywhere else: keep `0KTL` exactly `DO_NOT_TRANSLATE_THIS_KEY!`,
translate values and never keys, keep any `{0}` / `{1}` placeholders intact.

## Adding a new language

Copy `Lang/en-US.json` to `Lang/<code>.json`, change the top-level block key and `0NATIVELANG`, then translate. No code change is needed in the mod — Quartz auto-registers any valid language file it finds.
