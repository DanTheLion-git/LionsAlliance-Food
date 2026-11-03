// Kitchen cookbook — read-only web app + JSON API over a folder of recipe JSON
// files. Recipes are written by Claude chats through the knowledgebase
// connector (recipe_* tools), never by this app. No dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const RECIPES = path.resolve(process.env.RECIPES_DIR || './recipes');
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

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
  list.sort((a, b) => a.title.localeCompare(b.title));
  cache = { key, list, rev: crypto.createHash('sha1').update(key).digest('hex').slice(0, 10) };
  return cache;
}

// Tolerate hand-edited files: fill defaults, accept plain strings
function normalise(r) {
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const ingredients = arr(r.ingredients).map((g) =>
    typeof g === 'string' ? { items: [g] } : { section: g.section || undefined, items: arr(g.items).map(String) });
  const steps = arr(r.steps).map((s) =>
    typeof s === 'string' ? { text: s } : { section: s.section || undefined, text: String(s.text || ''), timer_min: s.timer_min || undefined });
  const total = (Number(r.prep_min) || 0) + (Number(r.cook_min) || 0);
  return {
    slug: r.slug,
    title: String(r.title || r.slug),
    description: r.description || '',
    servings: r.servings != null ? String(r.servings) : '',
    prep_min: r.prep_min || 0,
    cook_min: r.cook_min || 0,
    total_min: total,
    tags: arr(r.tags).map((t) => String(t).toLowerCase()),
    ingredients,
    steps,
    notes: arr(r.notes).map(String),
    source: r.source || '',
    updated: r.updated || '',
  };
}

const fold = (s) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function search(list, q, tag) {
  const words = fold(q || '').split(/\s+/).filter(Boolean);
  return list.filter((r) => {
    if (tag && !r.tags.includes(tag)) return false;
    if (!words.length) return true;
    const hay = fold([r.title, r.description, r.tags.join(' '), r.ingredients.flatMap((g) => g.items).join(' ')].join(' '));
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
  .replace(/°\s*([CF])\b/g, ' $1')                       // 180°C → 180 C
  .replace(/[^\x00-\x7f]/g, (c) => ASCII_MAP[c] ?? c)
  .normalize('NFKD').replace(/[^\x00-\x7f]/g, '');
const deepAscii = (v) => (typeof v === 'string' ? toAscii(v)
  : Array.isArray(v) ? v.map(deepAscii)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepAscii(x)]))
  : v);

// ── HTML ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const mins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`);

function layout(title, body, { back = false, bodyClass = '' } = {}) {
  return `<!doctype html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f1419">
<title>${esc(title)}</title>
<link rel="icon" href="/static/logo.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/app.css?v=${ASSET_V}">
<script>document.documentElement.classList.add('js')</script>
</head>
<body class="${bodyClass}">
<header class="bar">
  ${back ? '<a class="back" href="/" aria-label="All recipes">‹</a>' : '<img class="logo" src="/static/logo.svg" alt="">'}
  <a class="brand" href="/">Cookbook</a>
</header>
${body}
<div class="timerbar" id="timerbar" hidden></div>
<script src="/static/app.js?v=${ASSET_V}" defer></script>
</body>
</html>`;
}

function listPage(all, q, tag) {
  const found = search(all, q, tag);
  const tags = [...new Set(all.flatMap((r) => r.tags))].sort();
  const chips = tags.length
    ? `<nav class="chips">${['', ...tags].map((t) => {
      const href = t ? `/?tag=${encodeURIComponent(t)}` : '/';
      return `<a class="chip${(tag || '') === t ? ' on' : ''}" href="${href}">${esc(t || 'all')}</a>`;
    }).join('')}</nav>`
    : '';
  const rows = found.map((r) => {
    const meta = [r.total_min ? mins(r.total_min) : '', r.servings ? `${r.servings} pers.` : ''].filter(Boolean).join(' · ');
    return `<li><a href="/r/${esc(r.slug)}"><span class="t">${esc(r.title)}</span>${meta ? `<span class="m">${esc(meta)}</span>` : ''}</a></li>`;
  }).join('');
  const empty = all.length
    ? `<p class="empty">Nothing matches${q ? ` “${esc(q)}”` : ''}.</p>`
    : `<p class="empty">No recipes yet.<br>Tell Claude a recipe in any chat with the knowledgebase connector on — it lands here.</p>`;
  return layout('Cookbook', `
<main class="list">
  <form class="search" action="/" role="search">
    <input type="search" name="q" value="${esc(q)}" placeholder="Search recipes or ingredients" autocomplete="off" enterkeyhint="search">
    ${tag ? `<input type="hidden" name="tag" value="${esc(tag)}">` : ''}
  </form>
  ${chips}
  ${found.length ? `<ul class="recipes">${rows}</ul>` : empty}
</main>`);
}

function recipePage(r) {
  const meta = [
    r.prep_min ? `<span><b>${mins(r.prep_min)}</b> prep</span>` : '',
    r.cook_min ? `<span><b>${mins(r.cook_min)}</b> cook</span>` : '',
    r.servings ? `<span><b>${esc(r.servings)}</b> pers.</span>` : '',
  ].filter(Boolean).join('');
  let n = 0;
  const ingredients = r.ingredients.map((g, gi) => `
    ${g.section ? `<h3>${esc(g.section)}</h3>` : ''}
    <ul class="ing">${g.items.map((it, ii) => `<li data-k="i${gi}-${ii}">${esc(it)}</li>`).join('')}</ul>`).join('');
  const steps = r.steps.map((s) => {
    n += 1;
    return `${s.section ? `<li class="sec" aria-hidden="true">${esc(s.section)}</li>` : ''}
    <li class="step" data-n="${n}" data-k="s${n}"><span class="num">${n}</span><p>${esc(s.text)}</p>${s.timer_min ? `<button class="timer" type="button" data-min="${s.timer_min}">⏱ ${esc(mins(s.timer_min))}</button>` : ''}</li>`;
  }).join('');
  const notes = r.notes.length ? `<section class="notes"><h2>Notes</h2><ul>${r.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : '';
  const steplist = r.steps.map((s) => ({ t: s.text, s: s.section || '', m: s.timer_min || 0 }));
  return layout(r.title, `
<main class="recipe" data-slug="${esc(r.slug)}">
  <h1>${esc(r.title)}</h1>
  ${meta ? `<p class="meta">${meta}</p>` : ''}
  ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
  <div class="tabs" role="tablist">
    <button type="button" role="tab" data-tab="ing" aria-selected="true">Ingredients</button>
    <button type="button" role="tab" data-tab="steps" aria-selected="false">Steps</button>
  </div>
  <section class="pane" id="ing"><h2>Ingredients</h2>${ingredients}</section>
  <section class="pane" id="steps"><h2>Steps</h2><ol class="steps">${steps}</ol>${notes}
    ${r.source ? `<p class="source">Source: ${esc(r.source)}</p>` : ''}</section>
  <button type="button" class="cook" id="cook-start">Cook ›</button>
</main>
<div class="cookmode" id="cookmode" hidden>
  <div class="cm-top"><span id="cm-count"></span><button type="button" id="cm-close" aria-label="Close">✕</button></div>
  <div class="cm-body"><p class="cm-sec" id="cm-sec"></p><p class="cm-text" id="cm-text"></p></div>
  <button type="button" class="timer cm-timer" id="cm-timer" hidden></button>
  <div class="cm-nav"><button type="button" id="cm-prev">‹ Back</button><button type="button" id="cm-next">Next ›</button></div>
</div>
<script type="application/json" id="steps-data">${JSON.stringify(steplist).replace(/</g, '\\u003c')}</script>`, { back: true, bodyClass: 'has-cook' });
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
  const etag = `"${rev}"`;
  const headers = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache', ETag: etag };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8', headers);
}

const summary = (r) => ({ id: r.slug, title: r.title, total_min: r.total_min, servings: r.servings, tags: r.tags });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Read-only', 'text/plain');
  try {
    const { list, rev } = load();
    const ascii = url.searchParams.get('ascii') === '1';
    const out = (d) => (ascii ? deepAscii(d) : d);

    if (p === '/') return send(res, 200, listPage(list, url.searchParams.get('q') || '', url.searchParams.get('tag') || ''));
    if (p.startsWith('/r/')) {
      const r = list.find((x) => x.slug === decodeURIComponent(p.slice(3)));
      return r ? send(res, 200, recipePage(r)) : send(res, 404, layout('Not found', '<main class="list"><p class="empty">That recipe doesn’t exist (any more).</p></main>', { back: true }));
    }
    // JSON API — also what the ESP32 kitchen screen reads (see README)
    if (p === '/api/recipes') {
      const found = search(list, url.searchParams.get('q'), url.searchParams.get('tag'));
      return json(req, res, out({ rev, count: found.length, recipes: found.map(summary) }), `${rev}${ascii}${url.search}`);
    }
    if (p.startsWith('/api/recipes/')) {
      const r = list.find((x) => x.slug === decodeURIComponent(p.slice(13)));
      if (!r) return send(res, 404, '{"error":"not found"}', 'application/json');
      const { slug, ...rest } = r;
      return json(req, res, out({ id: slug, ...rest }), `${rev}${ascii}${p}`);
    }
    if (p === '/api/rev') return json(req, res, { rev }, rev);
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

server.listen(PORT, () => console.log(`[cookbook] :${PORT} — recipes in ${RECIPES}`));
