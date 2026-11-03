// Kitchen cookbook — read-only web app + JSON API over a folder of recipe JSON
// files. Recipes are written by Claude chats through the knowledgebase
// connector (recipe_* tools), never by this app. No dependencies.
// Recipes are bilingual: English in the main fields, Dutch in translations.nl.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const RECIPES = path.resolve(process.env.RECIPES_DIR || './recipes');
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const LANGS = ['en', 'nl'];
const DEFAULT_LANG = LANGS.includes(process.env.DEFAULT_LANG) ? process.env.DEFAULT_LANG : 'en';

const UI = {
  en: {
    cookbook: 'Cookbook', search: 'Search recipes or ingredients', all: 'all', ingredients: 'Ingredients',
    steps: 'Steps', notes: 'Notes', source: 'Source', cook: 'Cook ›', prep: 'prep', cooking: 'cook',
    servings: (n) => (/^\d+$/.test(n) ? `${n} serv.` : n), back: 'All recipes', other: 'NL', otherLabel: 'Nederlands',
    nothing: (q) => `Nothing matches${q ? ` “${q}”` : ''}.`,
    empty: 'No recipes yet.<br>Tell Claude a recipe in any chat with the knowledgebase connector on — it lands here.',
    notFound: 'That recipe doesn’t exist (any more).', close: 'Close',
  },
  nl: {
    cookbook: 'Kookboek', search: 'Zoek recepten of ingrediënten', all: 'alles', ingredients: 'Ingrediënten',
    steps: 'Bereiding', notes: 'Tips', source: 'Bron', cook: 'Koken ›', prep: 'voorbereiden', cooking: 'koken',
    servings: (n) => (/^\d+$/.test(n) ? `${n} pers.` : n), back: 'Alle recepten', other: 'EN', otherLabel: 'English',
    nothing: (q) => `Niets gevonden${q ? ` voor “${q}”` : ''}.`,
    empty: 'Nog geen recepten.<br>Vertel Claude een recept in een chat met de knowledgebase-connector aan — het komt hier terecht.',
    notFound: 'Dat recept bestaat niet (meer).', close: 'Sluiten',
  },
};

// ── Recipes (re-read when the folder changes) ─────────────────────────────
let cache = { key: null, list: [], rev: '' };

function load() {
  let files = [];
  try {
    files = fs.readdirSync(RECIPES).filter((f) => f.endsWith('.json'));
  } catch { /* folder missing → empty cookbook */ }
  const stats = files.map((f) => [f, fs.statSync(path.join(RECIPES, f)).mtimeMs]);
  const key = JSON.stringify(stats);
  if (key === cache.key) return cache;
  const list = [];
  for (const [f] of stats) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(RECIPES, f), 'utf8'));
      r.slug = f.slice(0, -5);
      list.push(normalise(r));
    } catch (err) {
      console.warn(`[cookbook] skipping ${f}: ${err.message}`);
    }
  }
  cache = { key, list, rev: crypto.createHash('sha1').update(key).digest('hex').slice(0, 10) };
  return cache;
}

const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const normIngredients = (v) => arr(v).map((g) =>
  typeof g === 'string' ? { items: [g] } : { section: g.section || undefined, items: arr(g.items).map(String) });
const normSteps = (v) => arr(v).map((s) =>
  typeof s === 'string' ? { text: s } : { section: s.section || undefined, text: String(s.text || ''), timer_min: s.timer_min || undefined });

// Tolerate hand-edited files: fill defaults, accept plain strings
function normalise(r) {
  const translations = {};
  for (const [lang, t] of Object.entries(r.translations || {})) {
    if (!t || typeof t !== 'object') continue;
    translations[lang] = {
      title: t.title ? String(t.title) : undefined,
      description: t.description || undefined,
      servings: t.servings != null ? String(t.servings) : undefined,
      ingredients: t.ingredients ? normIngredients(t.ingredients) : undefined,
      steps: t.steps ? normSteps(t.steps) : undefined,
      notes: t.notes ? arr(t.notes).map(String) : undefined,
    };
  }
  return {
    slug: r.slug,
    title: String(r.title || r.slug),
    description: r.description || '',
    servings: r.servings != null ? String(r.servings) : '',
    prep_min: r.prep_min || 0,
    cook_min: r.cook_min || 0,
    total_min: (Number(r.prep_min) || 0) + (Number(r.cook_min) || 0),
    tags: arr(r.tags).map((t) => String(t).toLowerCase()),
    ingredients: normIngredients(r.ingredients),
    steps: normSteps(r.steps),
    notes: arr(r.notes).map(String),
    source: r.source || '',
    updated: r.updated || '',
    translations,
  };
}

// The recipe in one language: translated text over the English base.
// Timers always come from the base steps (translations match them one to one).
function localise(r, lang) {
  const t = r.translations[lang];
  const { translations, ...base } = r;
  const out = { ...base, lang: t ? lang : 'en', languages: ['en', ...Object.keys(translations)] };
  if (!t) return out;
  for (const k of ['title', 'description', 'servings', 'ingredients', 'notes']) if (t[k] !== undefined) out[k] = t[k];
  if (t.steps && t.steps.length === r.steps.length) {
    out.steps = r.steps.map((s, i) => ({ ...s, section: t.steps[i].section, text: t.steps[i].text }));
  }
  return out;
}

const fold = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Search all languages at once
function search(list, q, tag) {
  const words = fold(q || '').split(/\s+/).filter(Boolean);
  return list.filter((r) => {
    if (tag && !r.tags.includes(tag)) return false;
    if (!words.length) return true;
    const versions = [r, ...Object.values(r.translations)];
    const hay = fold(versions.map((v) => [v.title, v.description, (v.ingredients || []).flatMap((g) => g.items).join(' ')].join(' ')).join(' ') + r.tags.join(' '));
    return words.every((w) => hay.includes(w));
  });
}

// ── ASCII mode for microcontroller displays (fonts without accents/symbols) ──
const ASCII_MAP = {
  '°': ' deg', '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8',
  '×': 'x', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '-',
  'ß': 'ss', 'æ': 'ae', 'ø': 'o', 'Ø': 'O', '€': 'EUR', '\u00a0': ' ',
};
const toAscii = (s) => String(s)
  .replace(/\s*°\s*([CF])\b/g, ' $1')                    // 180 °C → 180 C
  .replace(/[^\x00-\x7f]/g, (c) => ASCII_MAP[c] ?? c)
  .normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
const deepAscii = (v) => (typeof v === 'string' ? toAscii(v)
  : Array.isArray(v) ? v.map(deepAscii)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepAscii(x)]))
  : v);

// ── HTML ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
// Keep numbers and their units together on narrow screens (200 °C, 125 g, 5 min)
const nbsp = (s) => String(s ?? '').replace(/(\d) (?=°|(?:g|kg|ml|l|cl|dl|min|el|tl|tbsp|tsp|cm)\b)/g, '$1\u00a0');
const escText = (s) => esc(nbsp(s));
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`);

function layout(lang, title, body, { back = false, actions = '', self = '/' } = {}) {
  const ui = UI[lang];
  const other = lang === 'en' ? 'nl' : 'en';
  const sep = self.includes('?') ? '&' : '?';
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f1419">
<title>${esc(title)}</title>
<link rel="icon" href="/static/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/app.css?v=${ASSET_V}">
<script>document.documentElement.classList.add('js')</script>
</head>
<body>
<header class="bar">
  ${back ? `<a class="back" href="/" aria-label="${esc(ui.back)}">‹</a>` : '<img class="logo" src="/static/logo.svg" alt="">'}
  <a class="brand" href="/">${esc(ui.cookbook)}</a>
  <span class="spacer"></span>
  <a class="lang" href="${esc(self + sep)}lang=${other}" hreflang="${other}" aria-label="${esc(ui.otherLabel)}">${ui.other}</a>
  ${actions}
</header>
${body}
<div class="timerbar" id="timerbar" hidden></div>
<script src="/static/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

function listPage(lang, all, q, tag) {
  const ui = UI[lang];
  const found = search(all, q, tag).map((r) => localise(r, lang)).sort((a, b) => a.title.localeCompare(b.title, lang));
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort();
  const chips = tags.length
    ? `<nav class="chips">${['', ...tags].map((t) => {
      const href = t ? `/?tag=${encodeURIComponent(t)}` : '/';
      return `<a class="chip${(tag || '') === t ? ' on' : ''}" href="${href}">${esc(t || ui.all)}</a>`;
    }).join('')}</nav>`
    : '';
  const rows = found.map((r) => {
    const meta = [r.total_min ? mins(r.total_min) : '', r.servings ? ui.servings(r.servings) : ''].filter(Boolean).join(' · ');
    return `<li><a href="/r/${esc(r.slug)}"><span class="t">${esc(r.title)}</span>${meta ? `<span class="m">${esc(meta)}</span>` : ''}</a></li>`;
  }).join('');
  const empty = all.length ? `<p class="empty">${esc(ui.nothing(q))}</p>` : `<p class="empty">${ui.empty}</p>`;
  const self = q || tag ? `/?${new URLSearchParams({ ...(q && { q }), ...(tag && { tag }) })}` : '/';
  return layout(lang, ui.cookbook, `
<main class="list">
  <form class="search" action="/" role="search">
    <input type="search" name="q" value="${esc(q)}" placeholder="${esc(ui.search)}" autocomplete="off" enterkeyhint="search">
    ${tag ? `<input type="hidden" name="tag" value="${esc(tag)}">` : ''}
  </form>
  ${chips}
  ${found.length ? `<ul class="recipes">${rows}</ul>` : empty}
</main>`, { self });
}

function recipePage(lang, r) {
  const ui = UI[lang];
  const meta = [
    r.prep_min ? `<span><b>${mins(r.prep_min)}</b> ${ui.prep}</span>` : '',
    r.cook_min ? `<span><b>${mins(r.cook_min)}</b> ${ui.cooking}</span>` : '',
    r.servings ? `<span>${esc(ui.servings(r.servings)).replace(/^(\S+)/, '<b>$1</b>')}</span>` : '',
  ].filter(Boolean).join('');
  let n = 0;
  const ingredients = r.ingredients.map((g, gi) => `
    ${g.section ? `<h3>${esc(g.section)}</h3>` : ''}
    <ul class="ing">${g.items.map((it, ii) => `<li data-k="i${gi}-${ii}">${escText(it)}</li>`).join('')}</ul>`).join('');
  const steps = r.steps.map((s) => {
    n += 1;
    return `${s.section ? `<li class="sec" aria-hidden="true">${esc(s.section)}</li>` : ''}
    <li class="step" data-n="${n}" data-k="s${n}"><span class="num">${n}</span><p>${escText(s.text)}</p>${s.timer_min ? `<button class="timer" type="button" data-min="${s.timer_min}">⏱ ${esc(mins(s.timer_min))}</button>` : ''}</li>`;
  }).join('');
  const notes = r.notes.length ? `<section class="notes"><h2>${ui.notes}</h2><ul>${r.notes.map((x) => `<li>${escText(x)}</li>`).join('')}</ul></section>` : '';
  const steplist = r.steps.map((s) => ({ t: nbsp(s.text), s: s.section || '', m: s.timer_min || 0 }));
  return layout(lang, r.title, `
<main class="recipe" data-slug="${esc(r.slug)}">
  <h1>${esc(r.title)}</h1>
  ${meta ? `<p class="meta">${meta}</p>` : ''}
  ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
  <div class="tabs" role="tablist">
    <button type="button" role="tab" data-tab="ing" aria-selected="true">${ui.ingredients}</button>
    <button type="button" role="tab" data-tab="steps" aria-selected="false">${ui.steps}</button>
  </div>
  <section class="pane" id="ing"><h2>${ui.ingredients}</h2>${ingredients}</section>
  <section class="pane" id="steps"><h2>${ui.steps}</h2><ol class="steps">${steps}</ol>${notes}
    ${r.source ? `<p class="source">${ui.source}: ${esc(r.source)}</p>` : ''}</section>
</main>
<div class="cookmode" id="cookmode" hidden>
  <div class="cm-top"><span id="cm-count"></span><button type="button" id="cm-close" aria-label="${esc(ui.close)}">✕</button></div>
  <div class="cm-body"><p class="cm-sec" id="cm-sec"></p><p class="cm-text" id="cm-text"></p></div>
  <button type="button" class="timer cm-timer" id="cm-timer" hidden></button>
  <div class="cm-nav"><button type="button" id="cm-prev"></button><button type="button" id="cm-next"></button></div>
</div>
<script type="application/json" id="steps-data">${JSON.stringify(steplist).replace(/</g, '\\u003c')}</script>`, {
    back: true,
    self: `/r/${encodeURIComponent(r.slug)}`,
    actions: `<button type="button" class="cook" id="cook-start">${ui.cook}</button>`,
  });
}

// ── HTTP ──────────────────────────────────────────────────────────────────
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const ASSET_V = crypto.createHash('sha1')
  .update(['app.css', 'app.js'].map((f) => fs.readFileSync(path.join(PUBLIC, f))).join('')).digest('hex').slice(0, 8);

function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(body);
}

function json(req, res, data, rev) {
  const etag = `"${crypto.createHash('sha1').update(rev).digest('hex').slice(0, 16)}"`;
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache', ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8', headers);
}

const cookieLang = (req) => /(?:^|;\s*)lang=(en|nl)\b/.exec(req.headers.cookie || '')?.[1];
const summary = (r) => ({ id: r.slug, title: r.title, total_min: r.total_min, servings: r.servings, tags: r.tags });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Read-only', 'text/plain');
  try {
    const { list, rev } = load();
    const ascii = url.searchParams.get('ascii') === '1';
    const qLang = LANGS.includes(url.searchParams.get('lang')) ? url.searchParams.get('lang') : null;
    const out = (d) => (ascii ? deepAscii(d) : d);

    // JSON API — also what the ESP32 kitchen screen reads (see README)
    if (p.startsWith('/api/')) {
      const lang = qLang || DEFAULT_LANG;
      const key = `${rev}|${url.pathname}|${url.search}`;
      if (p === '/api/rev') return json(req, res, { rev }, rev);
      if (p === '/api/recipes') {
        const found = search(list, url.searchParams.get('q'), url.searchParams.get('tag'))
          .map((r) => localise(r, lang)).sort((a, b) => a.title.localeCompare(b.title, lang));
        return json(req, res, out({ rev, lang, count: found.length, recipes: found.map(summary) }), key);
      }
      if (p.startsWith('/api/recipes/')) {
        const r = list.find((x) => x.slug === decodeURIComponent(p.slice(13)));
        if (!r) return send(res, 404, '{"error":"not found"}', 'application/json');
        const { slug, ...rest } = localise(r, lang);
        return json(req, res, out({ id: slug, ...rest }), key);
      }
      return send(res, 404, '{"error":"not found"}', 'application/json');
    }

    // HTML: ?lang= switches and is remembered in a cookie, then redirects to the clean URL
    if (qLang) {
      url.searchParams.delete('lang');
      return send(res, 303, '', 'text/plain', {
        'Set-Cookie': `lang=${qLang}; Path=/; Max-Age=31536000; SameSite=Lax`,
        Location: url.pathname + (url.search || ''),
      });
    }
    const lang = cookieLang(req) || DEFAULT_LANG;
    if (p === '/') return send(res, 200, listPage(lang, list, url.searchParams.get('q') || '', url.searchParams.get('tag') || ''));
    if (p.startsWith('/r/')) {
      const r = list.find((x) => x.slug === decodeURIComponent(p.slice(3)));
      return r ? send(res, 200, recipePage(lang, localise(r, lang)))
        : send(res, 404, layout(lang, UI[lang].notFound, `<main class="list"><p class="empty">${UI[lang].notFound}</p></main>`, { back: true }));
    }
    if (p === '/healthz') return send(res, 200, '{"ok":true}', 'application/json');
    if (p.startsWith('/static/')) {
      const f = path.join(PUBLIC, path.basename(p));
      if (fs.existsSync(f)) {
        return send(res, 200, fs.readFileSync(f), TYPES[path.extname(f)] || 'application/octet-stream',
          { 'Cache-Control': 'public, max-age=31536000, immutable' });
      }
    }
    send(res, 404, 'Not found', 'text/plain');
  } catch (err) {
    console.error('[cookbook]', err);
    send(res, 500, 'Internal error', 'text/plain');
  }
});

server.listen(PORT, () => console.log(`[cookbook] :${PORT} — recipes in ${RECIPES}, default language ${DEFAULT_LANG}`));
