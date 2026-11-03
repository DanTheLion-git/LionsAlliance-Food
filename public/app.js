// Kitchen cookbook — progressive enhancement for the recipe page:
// tabs, tick-off ingredients/steps, one-step-at-a-time cook mode, timers.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };

  // ── timers (work on every page, survive reloads) ──
  const bar = $('#timerbar');
  let timers = store.get('timers', []).filter((t) => t.end > Date.now() - 10 * 60e3);
  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + ':' + String(x).padStart(2, '0');
  };
  let audio;
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.25, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.5);
      o.start(); o.stop(audio.currentTime + 0.5);
    } catch { /* no audio */ }
    if (navigator.vibrate) navigator.vibrate(300);
  }
  function renderTimers() {
    if (!bar) return;
    store.set('timers', timers);
    bar.hidden = !timers.length;
    bar.innerHTML = timers.map((t, i) => {
      const left = t.end - Date.now();
      return `<div class="trun${left <= 0 ? ' ring' : ''}"><span>${t.label} · ${left <= 0 ? 'done!' : fmt(left)}</span><button type="button" data-i="${i}">${left <= 0 ? 'OK' : 'Stop'}</button></div>`;
    }).join('');
    document.body.style.setProperty('--tb', timers.length ? `${bar.offsetHeight + 8}px` : '0px');
  }
  bar?.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    timers.splice(Number(b.dataset.i), 1);
    renderTimers();
  });
  setInterval(() => {
    if (!timers.length) return;
    if (timers.some((t) => t.end <= Date.now() && Date.now() - t.end < 60e3)) beep();
    renderTimers();
  }, 1000);
  renderTimers();
  function startTimer(min, label) {
    timers.push({ end: Date.now() + min * 60e3, label });
    renderTimers();
    if (audio?.state === 'suspended') audio.resume();
  }

  // ── recipe page ──
  const recipe = $('main.recipe');
  if (!recipe) return;
  const slug = recipe.dataset.slug;
  const stateKey = `r:${slug}`;
  // Ticks are for today's cooking session; forget them after 12 hours
  let state = store.get(stateKey, null);
  if (!state || Date.now() - state.t > 12 * 3600e3) state = { t: Date.now(), done: [], step: 0, tab: 'ing' };
  const save = () => { state.t = Date.now(); store.set(stateKey, state); };

  // tabs
  const tabs = $$('.tabs [data-tab]');
  function showTab(id) {
    state.tab = id; save();
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    $$('.pane').forEach((p) => { p.hidden = p.id !== id; });
    window.scrollTo({ top: 0 });
  }
  tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab(state.tab || 'ing');

  // tick off ingredients and steps
  const ticks = $$('[data-k]');
  ticks.forEach((el) => el.classList.toggle('done', state.done.includes(el.dataset.k)));
  ticks.forEach((el) => el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const k = el.dataset.k;
    state.done = el.classList.toggle('done') ? [...state.done, k] : state.done.filter((x) => x !== k);
    save();
  }));

  // timers on step rows
  $$('.steps .timer').forEach((b) => b.addEventListener('click', () => {
    startTimer(Number(b.dataset.min), `Step ${b.closest('.step').dataset.n}`);
  }));

  // ── cook mode ──
  const steps = JSON.parse($('#steps-data').textContent);
  const cm = $('#cookmode');
  const el = { count: $('#cm-count'), sec: $('#cm-sec'), text: $('#cm-text'), timer: $('#cm-timer'), prev: $('#cm-prev'), next: $('#cm-next') };
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator) wake = await navigator.wakeLock.request('screen');
      else if (!on && wake) { await wake.release(); wake = null; }
    } catch { /* not allowed */ }
  }
  function show(i) {
    state.step = Math.max(0, Math.min(steps.length - 1, i)); save();
    const s = steps[state.step];
    el.count.textContent = `Step ${state.step + 1} / ${steps.length}`;
    el.sec.textContent = s.s;
    el.text.textContent = s.t;
    el.timer.hidden = !s.m;
    if (s.m) el.timer.textContent = `⏱ Start ${s.m} min timer`;
    el.prev.disabled = state.step === 0;
    el.next.textContent = state.step === steps.length - 1 ? 'Done ✓' : 'Next ›';
    $('.cm-body').scrollTop = 0;
  }
  function open() {
    cm.hidden = false;
    document.body.style.overflow = 'hidden';
    show(state.step || 0);
    keepAwake(true);
    history.pushState({ cook: 1 }, '');
  }
  function close(fromHistory) {
    if (cm.hidden) return;
    cm.hidden = true;
    document.body.style.overflow = '';
    keepAwake(false);
    if (!fromHistory && history.state?.cook) history.back();
  }
  $('#cook-start').addEventListener('click', open);
  $('#cm-close').addEventListener('click', () => close());
  el.prev.addEventListener('click', () => show(state.step - 1));
  el.next.addEventListener('click', () => {
    if (state.step === steps.length - 1) { state.step = 0; save(); close(); } else show(state.step + 1);
  });
  el.timer.addEventListener('click', () => {
    const s = steps[state.step];
    startTimer(s.m, `Step ${state.step + 1}`);
  });
  window.addEventListener('popstate', () => close(true));
  document.addEventListener('visibilitychange', () => { if (!cm.hidden && document.visibilityState === 'visible') keepAwake(true); });
  document.addEventListener('keydown', (e) => {
    if (cm.hidden) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); el.next.click(); }
    if (e.key === 'ArrowLeft') show(state.step - 1);
    if (e.key === 'Escape') close();
  });
  // swipe left/right between steps
  let x0 = null;
  cm.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  cm.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 60) show(state.step + (dx < 0 ? 1 : -1));
  });
})();
