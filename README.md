# LionsAlliance Cookbook

Kitchen cookbook on the Pi, made to be read on a small screen (320×480 ESP32 board
on the kitchen wall, phones, tablets). Replaces the old nutrition/receipt tracker
(2026-11-03; the old code is in git history before commit "Replace food tracker with cookbook").

**Recipes are added by talking to Claude.** In any claude.ai chat (web or phone) with
the *Lions Alliance Knowledgebase* connector on, tell Claude a recipe. Claude writes it
out properly, asks about anything unclear, and saves it with the connector's
`recipe_save` tool. It is on the kitchen screen right away. Editing works the same way
("make the carbonara for 4", "add a note that it freezes well").

```
claude.ai chat ──recipe_save──▶ kb-mcp (lionsalliance-docs/mcp/cookbook.js)
                                   │ writes + git-commits
                                   ▼
                 /mnt/media/lionsalliance-food/recipes/<id>.json
                                   │ read-only mount
                                   ▼
                 cookbook (this app) :4242 ──▶ browser / ESP32 JSON API
```

This app never writes recipes: it is read-only, without login, and LAN only.

## Run

```bash
docker compose up -d --build        # on the Pi, in /mnt/media/lionsalliance-food
```

Web UI: `http://lionsalliance-pi:4242`. Locally: `RECIPES_DIR=./recipes npm run dev`.
No npm dependencies.

## Recipe files

`recipes/` holds one JSON file per recipe (the file name is the id). It is its own git
repo (`git -C recipes log`), so every change from a chat can be undone. The folder is
ignored by this repo.

```json
{
  "title": "Pasta carbonara",
  "description": "…",
  "servings": "2",
  "prep_min": 10, "cook_min": 15,
  "tags": ["diner", "pasta"],
  "ingredients": [{ "section": "Saus", "items": ["2 eieren", "50 g pecorino"] }],
  "steps": [{ "section": "Saus", "text": "Klop de eieren los…", "timer_min": 6 }],
  "notes": ["…"], "created": "2026-11-03", "updated": "2026-11-03",
  "translations": { "nl": { "title": "…", "description": "…", "servings": "2",
    "ingredients": [ … ], "steps": [{ "section": "…", "text": "…" }], "notes": [ … ] } }
}
```

The connector's zod schema in `lionsalliance-docs/mcp/server.js` (`recipeShape`) is
the source of truth.

**Bilingual:** English is in the main fields and Dutch in `translations.nl`. The
translated steps match the English ones one to one, and timers always come from the
English steps. This app also accepts hand-edited files (plain-string steps and
ingredients).

## Web UI

- **EN / NL** toggle in the header (remembered in a cookie; `DEFAULT_LANG` env sets
  the default, `en`). The whole UI switches, not just the recipe text.
- List: search (title, tags, ingredients) and tag chips.
- Recipe: Ingredients / Steps tabs on narrow screens, side by side from 720 px. Tap to
  tick off ingredients and steps (remembered for 12 h per device).
- **Cook ›**: one step per screen, big text, swipe/arrow keys, keeps the screen awake.
- Step timers (⏱) run in a bar at the bottom on every page, survive reloads, and beep.

## JSON API (for the ESP32 kitchen screen)

All `GET`, CORS open, `ETag` + `If-None-Match` → `304` so the board can poll cheaply.
Add `lang=nl` for Dutch (default `en`). Add `ascii=1` to fold text to plain ASCII for display fonts without accents
(`180°C`→`180 C`, `½`→`1/2`, `é`→`e`, `—`→`-`).

| Endpoint | Returns |
|---|---|
| `/api/rev` | `{ "rev": "27c980675a" }`: changes whenever any recipe changes. Poll this (~30 s). |
| `/api/recipes?q=&tag=&ascii=1` | `{ rev, lang, count, recipes: [{ id, title, total_min, servings, tags }] }` |
| `/api/recipes/<id>?ascii=1` | Full recipe: `{ id, lang, languages, title, description, servings, prep_min, cook_min, total_min, tags, ingredients[{section?, items[]}], steps[{section?, text, timer_min?}], notes[], source, updated }` |
| `/healthz` | `{ "ok": true }` |

Steps are written to be short (≤ ~200 chars, one action each), so one step fits one
320×480 screen at a readable size. Use `timer_min` for an on-device timer button.

## Ports

| Service | Host port | Notes |
|---|---|---|
| cookbook | 4242 | Node 20, no deps |
