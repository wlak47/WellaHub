// Wella Hub extras (renderer). Uses h(), toast(), ico(), showModal(), closeModal() and the globals of app.js.
//   #34 hidden games   #32 global search (Ctrl+K)   #40 first-run tutorial   #38 theme gallery + look settings
//   #24 compare players   #20 rank history graph   #9 badge crafting   #29 Steam sales   #25 daily report   #37 PC health
(function () {
  'use strict';
  const X = window.WellaExtra = {};
  const muted = 'color:var(--mut)';
  const D = '\u2014';
  const uiLocale = () => window.WellaI18n ? window.WellaI18n.locale() : 'en-US';
  const feat = (n, d) => window.api.feat(n, d);
  const call = async (n, d) => { const r = await feat(n, d); if (r && r.error) throw new Error(r.error); return r; };
  const fail = (e) => toast((e && e.message) || String(e), 'bad');
  const hint = (t) => h('small', { style: muted }, t);
  const spin = (t) => h('div', {}, h('span', { class: 'spin' }), t || 'Loading...');
  const alive = (el) => document.body.contains(el);
  const num = (v, suf) => (v == null || v === '' || Number.isNaN(v) ? D : Number(v).toLocaleString(uiLocale()) + (suf || ''));
  const cd = (ms) => { ms = Math.max(0, Math.floor(ms / 1000)); const d = Math.floor(ms / 86400), hh = Math.floor((ms % 86400) / 3600), m = Math.floor((ms % 3600) / 60), s = ms % 60; return d ? `${d}d ${hh}h ${m}m` : hh ? `${hh}h ${m}m ${s}s` : `${m}m ${s}s`; };
  const chkRow = (label, on, fn, tip) => h('div', { class: 'setrow' }, h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: on ? 'checked' : null, onchange: (e) => fn(e.target.checked) }), label), tip ? hint(tip) : null);
  const svgEl = (s) => { const d = document.createElement('div'); d.innerHTML = s; return d.firstChild; };

  // ================= hidden games (#34) =================
  const HID = { ids: new Set(), keep: new Set(), auto: true, ready: false };
  const AUTO_RE = /\b(demo|soundtrack|ost|sdk|dedicated server|playtest|benchmark|authoring tools?|mod tools?|artbook|dlc|editor)\b|\bTools?$/i;
  const autoMatch = (g) => !!g && AUTO_RE.test(g.name || '');
  X.isHidden = (g) => !!g && (HID.ids.has(g.appid) || (HID.auto && !HID.keep.has(g.appid) && autoMatch(g)));
  X.visible = (list) => (HID.ready ? list.filter((g) => !X.isHidden(g)) : list);
  const saveHid = () => feat('hiddenSet', { ids: [...HID.ids], keep: [...HID.keep], auto: HID.auto }).catch(() => {});
  X.hide = (appid) => { HID.ids.add(appid); HID.keep.delete(appid); saveHid(); };
  X.unhide = (appid) => { HID.ids.delete(appid); if (HID.auto) HID.keep.add(appid); saveHid(); };
  const afterHidden = () => { try { render(); } catch {} try { if (tab === 'ach') drawGameList(false); } catch {} };
  X.loadHidden = async () => {
    try { const c = await call('get'); HID.ids = new Set(c.hidden.ids || []); HID.keep = new Set(c.hidden.keep || []); HID.auto = c.hidden.auto !== false; HID.ready = true; afterHidden(); } catch { HID.ready = true; }
  };
  X.hideBtn = (g, redraw) => h('button', { class: 'star hidebtn', title: 'Hide this game from the lists', onclick: (e) => { e.preventDefault(); e.stopPropagation(); X.hide(g.appid); toast(`Hidden: ${g.name}. Restore it in Settings > General > Hidden games.`); redraw(); } }, '\u2298');
  X.hiddenManager = () => {
    const all = new Map();
    for (const a of accounts) for (const g of a.games || []) if (X.isHidden(g)) all.set(g.appid, g);
    const body = h('div', { class: 'modal wide' });
    const paint = () => {
      const list = [...all.values()].filter((g) => X.isHidden(g)).sort((x, y) => x.name.localeCompare(y.name));
      body.replaceChildren(h('h2', {}, 'Hidden games'),
        hint('Hidden games are left out of the Hour Booster list and the Achievement Manager list. Nothing is deleted from Steam.'),
        chkRow('Hide demos, soundtracks, tools, SDKs and DLC automatically', HID.auto, (v) => { HID.auto = v; saveHid(); afterHidden(); for (const a of accounts) for (const g of a.games || []) if (X.isHidden(g)) all.set(g.appid, g); paint(); }),
        h('div', { class: 'plist' }, list.length ? list.map((g) => h('div', { class: 'pi' }, gameImg(g), h('span', {}, g.name + (autoMatch(g) && !HID.ids.has(g.appid) ? '  (auto)' : '')),
          h('button', { class: 'btn ghost sm', onclick: () => { X.unhide(g.appid); afterHidden(); paint(); } }, 'Show again'))) : [h('div', { class: 'empty' }, 'No hidden games.')]),
        h('div', { class: 'mact' }, h('button', { class: 'btn red', onclick: closeModal }, 'Done')));
    };
    paint(); showModal(body);
  };

  // ================= global search, Ctrl+K (#32) =================
  function searchItems() {
    const out = [];
    const go = (fn) => () => { closeBar(); try { fn(); } catch (e) { fail(e); } };
    const goTab = (t) => go(() => setTab(t));
    const sub = (k, label) => out.push({ k: 'Utility', t: label, a: go(() => { US.sub = k; if (tab !== 'util') setTab('util'); else paintUtilPage(); else_(); }) });
    const else_ = () => { if (tab === 'util') paintUtilPage(); };
    out.push({ k: 'Tab', t: 'Hour Booster', a: goTab('boost') }, { k: 'Tab', t: 'Achievement Manager', a: goTab('ach') }, { k: 'Tab', t: 'Utility', a: goTab('util') });
    if (!document.getElementById('tabFree').classList.contains('hidden')) out.push({ k: 'Tab', t: 'Free Games', a: goTab('free') });
    if (!document.getElementById('tabPc').classList.contains('hidden')) out.push({ k: 'Tab', t: 'Monitor', a: goTab('pcmon') });
    if (!document.getElementById('tabFps').classList.contains('hidden')) out.push({ k: 'Tab', t: 'FPS Monitor', a: goTab('fps') });
    if (!document.getElementById('tabRemote').classList.contains('hidden')) out.push({ k: 'Tab', t: 'Remote PC', a: goTab('remote') });
    for (const [k, l] of [['players', 'Player stats'], ['pcmp', 'Compare players'], ['hist', 'Rank history'], ['compare', 'Profile Compare'], ['inv', 'Inventory'], ['health', 'Account Health'], ['badge', 'Badges'], ['sale', 'Steam sales'], ['daily', 'Daily report'], ['pchealth', 'PC health'], ['pass', 'Password Generator'], ['speed', 'Speed Test'], ['hook', 'Webhook'], ['yt', 'YouTube'], ['pace', 'Timings']]) sub(k, l);
    for (const [k, l] of [['general', 'Settings: General, themes & language'], ['discord', 'Settings: Discord'], ['remote', 'Settings: Web access']]) out.push({ k: 'Settings', t: l, a: go(() => { settingsTab = k; openSettings(); }) });
    for (const p of window.WellaTheme.presets) out.push({ k: 'Theme', t: p.name, a: go(() => { window.WellaTheme.preset(p.id); toast('Theme: ' + p.name, 'ok'); }) });
    out.push({ k: 'Action', t: 'Start all accounts', a: go(() => window.api.startAll()) }, { k: 'Action', t: 'Stop all accounts', a: go(() => window.api.stopAll()) },
      { k: 'Action', t: 'Add account', a: go(() => { setTab('boost'); openAdd(); }) },
      { k: 'Action', t: 'Craft badges now', a: go(() => { US.sub = 'badge'; setTab('util'); paintUtilPage(); }) },
      { k: 'Action', t: 'Hidden games', a: go(() => X.hiddenManager()) },
      { k: 'Action', t: 'Show the tutorial', a: go(() => X.tutorial(true)) },
      { k: 'Action', t: 'Switch black / white theme', a: go(() => window.WellaTheme.set({ mode: window.WellaTheme.get().mode === 'dark' ? 'light' : 'dark', pal: null })) });
    for (const a of accounts) {
      out.push({ k: 'Account', t: a.personaName || a.accountName, a: go(() => { setTab('boost'); switchView(a.id); }) });
      for (const g of (a.games || [])) { if (X.isHidden(g)) continue; out.push({ k: 'Game', t: g.name, s: a.personaName || a.accountName, a: go(() => { setTab('boost'); switchView(a.id); openGame(a.id, g.appid); }) }); }
    }
    return out;
  }
  function score(q, t) {
    t = t.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 80;
    const i = t.indexOf(q); if (i >= 0) return t[i - 1] === ' ' ? 60 : 40;
    let j = 0; for (const ch of t) if (ch === q[j]) j++;
    return j === q.length && q.length >= 3 ? 10 : 0;
  }
  let bar = null;
  function closeBar() { if (bar) { bar.remove(); bar = null; } }
  function openBar() {
    if (bar) { closeBar(); return; }
    const items = searchItems();
    let sel = 0, shown = [];
    const input = h('input', { class: 'in', placeholder: 'Search accounts, games, settings, tools...', autofocus: 'autofocus' });
    const list = h('div', { class: 'kres' });
    const paint = () => {
      const q = input.value.trim().toLowerCase();
      const variants = window.WellaI18n ? window.WellaI18n.searchTerms(q) : [q];
      shown = (q ? items.map((it) => ({ it, s: Math.max(...variants.map((v) => Math.max(score(v, it.t + ' ' + (it.k || '')), score(v, window.WellaI18n ? window.WellaI18n.t(it.t) + ' ' + window.WellaI18n.t(it.k || '') : it.t)))) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.it) : items.filter((x) => x.k === 'Tab' || x.k === 'Action' || x.k === 'Account')).slice(0, 12);
      sel = Math.min(sel, Math.max(0, shown.length - 1));
      list.replaceChildren(...(shown.length ? shown.map((it, i) => h('div', { class: 'kit' + (i === sel ? ' on' : ''), onclick: it.a, onmouseenter: () => { sel = i; [...list.children].forEach((c, n) => c.classList.toggle('on', n === sel)); } },
        h('em', {}, it.k), h('span', {}, it.t), it.s ? h('small', {}, it.s) : null)) : [h('div', { class: 'empty' }, 'Nothing found.')]));
    };
    input.addEventListener('input', () => { sel = 0; paint(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); e.preventDefault(); paint(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); e.preventDefault(); paint(); }
      else if (e.key === 'Enter' && shown[sel]) shown[sel].a();
      else if (e.key === 'Escape') closeBar();
    });
    bar = h('div', { class: 'kbar', onmousedown: (e) => { if (e.target === bar) closeBar(); } }, h('div', { class: 'kbox' }, input, list, h('small', { class: 'khint' }, '\u2191 \u2193 to move \u00b7 Enter to open \u00b7 Esc to close')));
    document.body.append(bar); paint(); input.focus();
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); if (document.body.classList.contains('boot')) return; openBar(); }
  });
  X.search = openBar;

  // ================= first-run tutorial (#40) =================
  const TUT_KEY = 'wella-tutorial';
  let tut = null;
  X.tutorial = (force) => {
    try { if (!force && localStorage.getItem(TUT_KEY)) return; } catch {}
    if (tut) tut.remove();
    const steps = [
      { sel: '.tab[data-tab="boost"]', t: 'Hour Booster', d: 'Add your Steam accounts, pick up to 32 games per account and press Start. The hours go up while the games idle. Card drops, badges and the Start all / Stop all buttons are here too.' },
      { sel: '.tab[data-tab="ach"]', t: 'Achievement Manager', d: 'Choose an account and a game, then lock or unlock achievements one by one or in bulk. \u201cSelect games with missing achievements\u201d finds what you still miss. Timings are in Utility > Timings.' },
      { sel: '#tabUtil', t: 'Utility', d: 'Player stats and compare, rank history graph, inventory, account health, Steam sales countdown, badge crafting, daily report, PC health check, Discord webhook and the YouTube downloader.' },
      { sel: '#gear', t: 'Settings', d: 'Themes, backgrounds, language, notifications, Discord status and web access from your phone. Press Ctrl+K at any time to search any account, game, tool or setting.' }
    ];
    let i = 0;
    tut = h('div', { class: 'tut' });
    const finish = () => { try { localStorage.setItem(TUT_KEY, '1'); } catch {} if (tut) tut.remove(); tut = null; window.removeEventListener('resize', place); };
    const ring = h('div', { class: 'tut-ring' }), card = h('div', { class: 'tut-card' });
    tut.append(ring, card);
    function place() {
      if (!tut) return;
      const s = steps[i];
      let el = document.querySelector(s.sel);
      if (!el || el.classList.contains('hidden') || !el.offsetParent) el = document.querySelector('.top');
      const r = el.getBoundingClientRect(), pad = 6;
      ring.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
      const w = 340, left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left + r.width / 2 - w / 2));
      card.style.cssText = `left:${left}px;top:${Math.min(window.innerHeight - 220, r.bottom + 18)}px;width:${w}px`;
      card.replaceChildren(h('small', { class: 'tut-n' }, `${i + 1} / ${steps.length}`), h('b', {}, s.t), h('p', {}, s.d),
        h('div', { class: 'tut-act' }, h('button', { class: 'btn text sm', onclick: finish }, 'Skip'),
          h('span', { style: 'flex:1' }),
          i ? h('button', { class: 'btn ghost sm', onclick: () => { i--; place(); } }, 'Back') : null,
          h('button', { class: 'btn red sm', onclick: () => { if (i < steps.length - 1) { i++; place(); } else finish(); } }, i < steps.length - 1 ? 'Next' : 'Got it')));
    }
    document.body.append(tut); place(); window.addEventListener('resize', place);
    document.addEventListener('keydown', function esc(e) { if (!tut) { document.removeEventListener('keydown', esc); return; } if (e.key === 'Escape') { finish(); document.removeEventListener('keydown', esc); } else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (i < steps.length - 1) { i++; place(); } else { finish(); document.removeEventListener('keydown', esc); } } else if (e.key === 'ArrowLeft' && i) { i--; place(); } });
  };
  (function autoTutorial() {
    let n = 0;
    const t = setInterval(() => {
      if (++n > 60) { clearInterval(t); return; }
      if (document.body.classList.contains('intro') && !document.getElementById('splash')) { clearInterval(t); setTimeout(() => X.tutorial(false), 700); }
    }, 500);
  })();

  // ================= Look settings: theme gallery, customizing, language (#38, #39) =================
  X.section = (id, title, kids, open) => {
    const K = 'wella-sec'; let st = {}; try { st = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch {}
    let on = id in st ? !!st[id] : !!open;
    const box = h('div', { class: 'csec' + (on ? ' open' : '') });
    const head = h('button', { class: 'csec-head', type: 'button', 'aria-expanded': String(on), onclick: () => {
      on = !on; box.classList.toggle('open', on); head.setAttribute('aria-expanded', String(on));
      try { const s = JSON.parse(localStorage.getItem(K) || '{}') || {}; s[id] = on; localStorage.setItem(K, JSON.stringify(s)); } catch {}
    } }, h('span', { class: 'csec-arr' }, '\u25B6'), h('b', {}, title));
    box.append(head, h('div', { class: 'csec-body' }, ...kids.filter(Boolean)));
    return box;
  };
  X.lookTab = (draw) => {
    const T = window.WellaTheme, B = window.WellaBg, L = window.WellaI18n;
    const t = T.get();
    const slider = (label, min, max, val, unit, onset, onchange) => {
      const out = h('output', {}, val + unit);
      return h('div', { class: 'bgsl' }, h('b', {}, label), h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(val), oninput: (e) => { out.textContent = e.target.value + unit; onset(+e.target.value); }, onchange: onchange || (() => {}) }), out);
    };
    const sw = (label, key, tip) => chkRow(label, !!t[key], (v) => { T.set({ [key]: v, preset: '' }); draw(); }, tip);
    const gallery = h('div', { class: 'pgrid' }, T.presets.map((p) => {
      const pal = p.theme.pal || {}, bg0 = pal.bg0 || (p.theme.mode === 'light' ? '#f5f5f7' : '#050505'), panel = pal.panel0 || (p.theme.mode === 'light' ? '#fff' : '#0d0d0d'), line = pal.line2 || '#262626', text = pal.text || (p.theme.mode === 'light' ? '#16161a' : '#f3f3f3');
      const bgUrl = p.bg && p.bg.id && p.bg.id !== 'none' && B ? B.thumb(p.bg.id) : '';
      return h('div', { class: 'pcard' + (t.preset === p.id ? ' on' : ''), role: 'button', tabindex: '0', title: p.note, onclick: () => { T.preset(p.id); toast('Theme: ' + p.name, 'ok'); draw(); } },
        h('div', { class: 'pprev', style: `background-color:${bg0}${bgUrl ? `;background-image:url("${bgUrl}");background-size:cover;background-position:center` : ''}` },
          h('div', { class: 'pv-box', style: `background:${panel};border-color:${line}` }, h('div', { class: 'pv-line', style: `background:${text}` }), h('div', { class: 'pv-line short', style: `background:${text}` }), h('div', { class: 'pv-btn', style: `background:${p.theme.accent}` }))),
        h('b', {}, p.name), h('small', {}, p.note));
    }));
    const fontPreview = h('div', { class: 'font-preview', style: T.fonts[t.font || 'ui'] && T.fonts[t.font || 'ui'].css ? `font-family:${T.fonts[t.font || 'ui'].css}` : '' }, h('small', {}, 'Preview'), h('b', {}, 'The quick brown fox jumps over the lazy dog'), h('span', {}, '0123456789 · Wella Hub · Free Games'));
    const fontSel = h('select', { class: 'in', onchange: (e) => { T.set({ font: e.target.value, preset: '' }); const f = T.fonts[e.target.value]; fontPreview.style.fontFamily = f && f.css || ''; } }, Object.entries(T.fonts).map(([k, f]) => h('option', { value: k, selected: (t.font || 'ui') === k ? 'selected' : null }, f.name)));
    const langSel = h('select', { class: 'in', onchange: (e) => { L.setLang(e.target.value); window.api.setPrefs({ uiLang: e.target.value }).catch(() => {}); feat('setLang', e.target.value).catch(() => {}); draw(); } },
      [['en', 'English'], ['ro', 'Rom\u00e2n\u0103'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ru', 'Русский']].map(([k, n]) => h('option', { value: k, selected: L.lang() === k ? 'selected' : null }, n)));
    let savedThemes = [];
    const customName = h('input', { class: 'in', maxlength: '36', placeholder: 'Name this theme…' });
    const customList = h('div', { class: 'custom-theme-list' });
    const paintCustomThemes = () => customList.replaceChildren(...(savedThemes.length ? savedThemes.map((item) => h('div', { class: 'custom-theme-row' },
      h('b', {}, item.name),
      h('button', { class: 'btn ghost sm', onclick: () => { T.set({ ...(item.theme || {}), preset: '' }); if (item.bg) B.set(item.bg); toast('Theme applied: ' + item.name, 'ok'); draw(); } }, 'Apply'),
      h('button', { class: 'btn stop sm', onclick: async () => { try { savedThemes = await window.api.deleteCustomTheme(item.id); paintCustomThemes(); } catch (e) { fail(e); } } }, 'Delete'))) : [hint('No saved themes yet.') ]));
    window.api.getCustomThemes().then((items) => { savedThemes = Array.isArray(items) ? items : []; paintCustomThemes(); }).catch(() => paintCustomThemes());
    const customSave = h('button', { class: 'btn red sm', onclick: async () => {
      if (!customName.value.trim()) { toast('Enter a name for this theme.', 'bad'); customName.focus(); return; }
      try { const r = await window.api.saveCustomTheme({ name: customName.value, theme: T.get(), bg: B.get() }); if (r.error) throw new Error(r.error); savedThemes = r.themes || []; paintCustomThemes(); toast('Theme saved: ' + customName.value.trim(), 'ok'); }
      catch (e) { fail(e); }
    } }, 'Save current theme');
    return [
      h('div', { class: 'setrow' }, h('b', {}, 'Language'), langSel),
      h('div', { class: 'bgsec' }, h('b', {}, 'Theme gallery'), gallery),
      h('div', { class: 'bgsec' }, h('b', {}, 'My saved themes'), h('small', { style: muted }, 'Save the current colors, font, layout and background with your own name.'), h('div', { class: 'lk' }, customName, customSave), customList),
      h('div', { class: 'bgsec' }, h('b', {}, 'Customize'),
        h('div', { class: 'setrow' }, h('b', {}, 'Font'), fontSel), fontPreview,
        slider('Corner roundness', 0, 30, t.radius >= 0 ? t.radius : 12, ' px', (v) => T.set({ radius: v, preset: '' })),
        h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: () => { T.set({ radius: -1, preset: '' }); draw(); } }, 'Default corners')),
        slider('Interface size', 80, 130, t.scale || 100, ' %', () => {}, (e) => { T.set({ scale: +e.target.value }); }),
        sw('Glow (soft light around buttons and cards)', 'glow'), sw('Scanlines (retro screen)', 'scan'), sw('Compact layout (less space between things)', 'compact'),
        sw('Reduce motion (no animations)', 'nomo')),
      h('div', { class: 'sbtns' },
        h('button', { class: 'btn ghost', onclick: () => { T.preset('default'); toast('Look reset', 'ok'); draw(); } }, 'Reset the look'),
        h('button', { class: 'btn ghost', onclick: () => { closeModal(); setTimeout(() => X.tutorial(true), 250); } }, 'Show the tutorial'),
        h('button', { class: 'btn ghost', onclick: () => X.hiddenManager() }, 'Hidden games'))
    ];
  };
  // extra background controls (called from bgSection)
  X.bgExtra = (draw) => {
    const B = window.WellaBg; if (!B) return [];
    const cur = B.get();
    const sl = (label, key, min, max, unit) => { const out = h('output', {}, cur[key] + unit); return h('div', { class: 'bgsl' }, h('b', {}, label), h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(cur[key]), oninput: (e) => { const v = +e.target.value; out.textContent = v + unit; B.set({ [key]: v }); } }), out); };
    const seg = (key, opts) => h('div', { class: 'seg' }, opts.map(([k, l]) => h('button', { class: 'btn' + (cur[key] === k ? ' on' : ''), onclick: () => { B.set({ [key]: k }); draw(); } }, l)));
    return [
      sl('Darkness', 'dim', 0, 90, ' %'), sl('Saturation', 'sat', 0, 250, ' %'), sl('Colour shift', 'hue', 0, 360, '\u00b0'), sl('Zoom', 'zoom', 100, 220, ' %'), sl('Vignette (dark edges)', 'vig', 0, 100, ' %'),
      h('div', { class: 'setrow' }, h('b', {}, 'Fit'), seg('fit', [['cover', 'Fill'], ['contain', 'Repeat'], ['tile', 'Small tiles']])),
      h('div', { class: 'setrow' }, h('b', {}, 'Position'), seg('pos', [['center', 'Center'], ['top', 'Top'], ['bottom', 'Bottom'], ['left', 'Left'], ['right', 'Right']])),
      chkRow('Slow drifting movement', !!cur.drift, (v) => { B.set({ drift: v }); draw(); }),
      h('div', { class: 'sbtns' },
        h('button', { class: 'btn ghost sm', onclick: () => { const l = B.list; B.set({ id: l[Math.floor(Math.random() * l.length)].id }); draw(); } }, 'Random background'),
        h('button', { class: 'btn ghost sm', onclick: () => { B.set({ dim: 0, sat: 100, hue: 0, zoom: 100, fit: 'cover', pos: 'center', drift: false, vig: 0, blur: 0, vis: 70 }); draw(); } }, 'Reset the sliders'))
    ];
  };

  // ================= Utility: compare players (#24) =================
  const CP = { a: '', b: '', ra: null, rb: null, busy: false };
  X.comparePlayers = () => {
    const out = h('div', { class: 'uout' });
    const paint = () => {
      if (CP.busy) { out.replaceChildren(spin('Reading both players...')); return; }
      const A = CP.ra, Bq = CP.rb; if (!A || !Bq) { out.replaceChildren(); return; }
      const head = (r) => h('div', { class: 'cmph' }, r.avatar ? h('img', { src: r.avatar, alt: '', draggable: 'false' }) : h('i', {}), h('b', {}, r.name || 'Unknown'), h('small', {}, { banned: 'BANNED', suspicious: 'SUSPICIOUS', clean: 'Nothing flagged', unknown: 'Not enough data' }[r.verdict] || ''));
      const g = (r, f) => { try { const v = f(r); return v == null || Number.isNaN(v) ? null : v; } catch { return null; } };
      const ROWS = [
        ['CS Rating (Premier)', (r) => r.leetify && r.leetify.found ? r.leetify.premier : null, true, (v) => num(v)],
        ['Leetify rating', (r) => r.leetify && r.leetify.found ? r.leetify.leetifyRating : null, true],
        ['Aim', (r) => r.leetify && r.leetify.found ? r.leetify.aim : null, true],
        ['Positioning', (r) => r.leetify && r.leetify.found ? r.leetify.positioning : null, true],
        ['Utility', (r) => r.leetify && r.leetify.found ? r.leetify.utility : null, true],
        ['Reaction time (lower is better)', (r) => r.leetify && r.leetify.found ? r.leetify.reactionMs : null, false, (v) => Math.round(v) + ' ms'],
        ['Headshot accuracy', (r) => r.leetify && r.leetify.found ? r.leetify.hs : null, true, (v) => v + '%'],
        ['Accuracy (spotted)', (r) => r.leetify && r.leetify.found ? r.leetify.accSpotted : null, true, (v) => v + '%'],
        ['Spray accuracy', (r) => r.leetify && r.leetify.found ? r.leetify.spray : null, true, (v) => v + '%'],
        ['Leetify win rate', (r) => r.leetify && r.leetify.found ? r.leetify.winRate : null, true, (v) => v + '%'],
        ['Leetify matches', (r) => r.leetify && r.leetify.found ? r.leetify.matches : null, true],
        ['FACEIT level', (r) => r.faceit && r.faceit.found ? r.faceit.level : null, true],
        ['FACEIT ELO', (r) => r.faceit && r.faceit.found ? r.faceit.elo : null, true],
        ['FACEIT K/D', (r) => r.faceit && r.faceit.found ? r.faceit.kd : null, true],
        ['FACEIT headshots', (r) => r.faceit && r.faceit.found ? r.faceit.hs : null, true, (v) => v + '%'],
        ['Trust Factor (estimate)', (r) => r.trust ? r.trust.pct : null, true, (v) => v + '%']
      ];
      const cells = [];
      for (const [label, f, hi, fmt] of ROWS) {
        const x = g(A, f), y = g(Bq, f); if (x == null && y == null) continue;
        const better = x == null || y == null || x === y ? 0 : ((hi ? x > y : x < y) ? 1 : 2);
        const show = (v) => (v == null ? D : (fmt ? fmt(v) : num(v)));
        cells.push(h('small', {}, label), h('span', { class: better === 1 ? 'win' : '' }, show(x)), h('span', { class: better === 2 ? 'win' : '' }, show(y)));
      }
      out.replaceChildren(cells.length ? h('div', { class: 'cmp' }, h('span', {}), head(A), head(Bq), ...cells) : hint('No Leetify or FACEIT numbers for these players. Add the API keys in Utility > Player stats.'),
        hint('Green = the better number. Statistics are a hint, not proof.'));
    };
    const a = h('input', { class: 'in', placeholder: 'Player 1: steamcommunity.com/id/..., faceit link, SteamID64', value: CP.a, oninput: (e) => { CP.a = e.target.value; } });
    const b = h('input', { class: 'in', placeholder: 'Player 2', value: CP.b, oninput: (e) => { CP.b = e.target.value; } });
    const go = async () => {
      if (!CP.a.trim() || !CP.b.trim()) { toast('Fill in both players.', 'bad'); return; }
      CP.busy = true; CP.ra = CP.rb = null; paint();
      try {
        const [x, y] = await Promise.all([window.api.utilLookup(CP.a.trim(), { account: false }), window.api.utilLookup(CP.b.trim(), { account: false })]);
        if (x.error || y.error) toast(x.error || y.error, 'bad'); else { CP.ra = x; CP.rb = y; }
      } catch (e) { fail(e); }
      CP.busy = false; paint();
    };
    [a, b].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
    paint();
    return [h('b', {}, 'Compare two players (CS2)'), hint('Aim, reaction time, headshots, rank, FACEIT and trust side by side. Needs the Leetify and FACEIT keys from Utility > Player stats.'), h('div', { class: 'cmpin' }, a, b, h('button', { class: 'btn red sm', onclick: go }, 'Compare')), out];
  };

  // ================= Utility: rank history graph (#20) =================
  const RH = { q: '', res: null, busy: false };
  function lineChart(title, color, pts, fmt) {
    const W = 640, H = 190, L = 54, R = 14, T = 16, Bm = 30;
    if (!pts.length) return h('div', { class: 'rchart' }, h('b', {}, title), hint('No data yet.'));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 === x0) { x0 -= 3600e3; x1 += 3600e3; }
    const padY = (y1 - y0) * 0.12 || Math.max(1, Math.abs(y1) * 0.02); y0 -= padY; y1 += padY;
    const X_ = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R), Y_ = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - Bm);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X_(p[0]).toFixed(1)} ${Y_(p[1]).toFixed(1)}`).join('');
    const area = `${line}L${X_(pts[pts.length - 1][0]).toFixed(1)} ${H - Bm}L${X_(pts[0][0]).toFixed(1)} ${H - Bm}Z`;
    let grid = '';
    for (let i = 0; i <= 3; i++) { const v = y0 + ((y1 - y0) * i) / 3, y = Y_(v); grid += `<path d="M${L} ${y.toFixed(1)}H${W - R}" stroke="currentColor" stroke-opacity=".12"/><text x="${L - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity=".6">${fmt(Math.round(v))}</text>`; }
    const dstr = (t) => new Date(t).toLocaleDateString(uiLocale(), { day: '2-digit', month: 'short' });
    const ticks = `<text x="${L}" y="${H - 9}" font-size="11" fill="currentColor" fill-opacity=".6">${dstr(x0)}</text><text x="${W - R}" y="${H - 9}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity=".6">${dstr(x1)}</text>`;
    const dots = pts.map((p) => `<circle cx="${X_(p[0]).toFixed(1)}" cy="${Y_(p[1]).toFixed(1)}" r="3.4" fill="${color}"><title>${new Date(p[0]).toLocaleString(uiLocale(), { hour12: false })}: ${fmt(p[1])}</title></circle>`).join('');
    const first = pts[0][1], last = pts[pts.length - 1][1], diff = last - first;
    const svg = svgEl(`<svg viewBox="0 0 ${W} ${H}" width="100%" style="color:var(--text);max-width:${W}px" role="img" aria-label="${title}">${grid}<path d="${area}" fill="${color}" fill-opacity=".14"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>${dots}${ticks}</svg>`);
    return h('div', { class: 'rchart' }, h('div', { class: 'rhead' }, h('b', {}, title), h('span', { style: `color:${diff >= 0 ? '#3ddc84' : '#ff6b6b'}` }, `${fmt(last)}  (${diff >= 0 ? '+' : ''}${fmt(diff)} since the first point)`)), svg,
      pts.length < 2 ? hint('Only one point so far. The graph grows every time you check this player.') : null);
  }
  X.rankHistory = () => {
    const out = h('div', { class: 'uout' });
    const paint = () => {
      if (RH.busy) { out.replaceChildren(spin('Reading Leetify...')); return; }
      const r = RH.res; if (!r) { out.replaceChildren(); return; }
      const c = r.current || {};
      out.replaceChildren(
        h('div', { class: 'uranks' },
          c.premier != null ? h('div', { class: 'rk prem' }, h('small', {}, 'CS Rating (Premier)'), h('b', {}, num(c.premier))) : null,
          c.faceitElo != null ? h('div', { class: 'rk' }, h('small', {}, 'FACEIT ELO'), h('b', {}, num(c.faceitElo)), c.faceitLevel != null ? h('i', {}, 'Level ' + c.faceitLevel) : null) : null),
        lineChart('Premier (CS Rating)', '#8847ff', r.premier, (v) => num(v)),
        lineChart('FACEIT ELO / level', '#ff5500', r.faceit, (v) => num(v)),
        lineChart('Leetify rating per match', '#3ddc84', (r.rating || []).map(([t, v]) => [t, Math.round(v * 1000) / 1000]), (v) => String(Math.round(v * 100) / 100)),
        hint(`${r.name || 'Player'}: ${r.matches} recent matches from Leetify + ${r.logged} saved check${r.logged === 1 ? '' : 's'} on this PC. Leetify only shares the latest matches, so the graph gets longer every time you look the player up.`));
    };
    const q = h('input', { class: 'in', placeholder: 'steamcommunity.com/id/..., faceit link, leetify link, SteamID64', value: RH.q, oninput: (e) => { RH.q = e.target.value; } });
    const go = async () => {
      if (!RH.q.trim()) return;
      RH.busy = true; RH.res = null; paint();
      try { RH.res = await call('history', { q: RH.q.trim() }); } catch (e) { fail(e); }
      RH.busy = false; paint();
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    paint();
    return [h('b', {}, 'Rank history (Premier + FACEIT)'), hint('Graphs of the rating over time, built from the matches Leetify shows and from every check saved on this PC. Needs the Leetify key (Utility > Player stats).'), h('div', { class: 'lk' }, q, h('button', { class: 'btn red sm', onclick: go }, 'Show graph')), out];
  };

  // ================= Utility: badge crafting (#9) =================
  const BS = { acc: '', res: null, busy: false };
  X.badges = () => {
    const box = h('div', { class: 'uout' });
    const resBox = h('div', { class: 'uout' });
    let st = null;
    const paintRes = () => {
      if (BS.busy) { resBox.replaceChildren(spin(BS.busy === 'craft' ? 'Crafting badges... (a few seconds per badge)' : 'Looking for complete card sets...')); return; }
      if (!BS.res) { resBox.replaceChildren(); return; }
      resBox.replaceChildren(...BS.res.map((a) => h('div', { class: 'ucard' }, h('b', {}, a.name),
        a.error ? h('small', { class: 'unote bad' }, a.error) : null,
        ...(a.crafted && a.crafted.length ? a.crafted.map((x) => h('div', { class: 'itop' }, h('span', {}, x.name), h('b', {}, `level ${x.from} \u2192 ${x.to}`))) : []),
        ...(!a.crafted || !a.crafted.length ? (a.ready && a.ready.length ? a.ready.map((x) => h('div', { class: 'itop' }, h('span', {}, x.name), h('b', {}, `${x.times}\u00d7 can be crafted (now level ${x.level})`))) : (a.error ? [] : [hint(`No complete set to craft. ${a.candidates || 0} games with cards checked.`)])) : []),
        ...(a.notes || []).map((n) => h('small', { class: 'unote' }, n)))));
    };
    const run = async (dry) => {
      BS.busy = dry ? 'scan' : 'craft'; BS.res = null; paintRes();
      try { BS.res = await call('badgeRun', { dry, accountId: BS.acc || undefined }); } catch (e) { fail(e); }
      BS.busy = false; paintRes(); if (!dry) paint();
    };
    const paint = () => {
      if (!st) { box.replaceChildren(spin()); return; }
      const upd = async (p) => { try { st = { ...st, ...(await call('badgeSet', p)) }; } catch (e) { fail(e); } paint(); };
      const accSel = h('select', { class: 'in', onchange: (e) => { BS.acc = e.target.value; } }, [h('option', { value: '' }, 'All accounts'), ...accounts.map((a) => h('option', { value: a.id, selected: BS.acc === a.id ? 'selected' : null }, a.personaName || a.accountName))]);
      box.replaceChildren(
        chkRow('Craft complete sets automatically', st.auto, (v) => upd({ auto: v }), 'Every check looks at the trading cards of all your accounts and crafts a badge when a full set is there. Crafting cannot be undone: the cards are used up.'),
        h('div', { class: 'setrow' }, h('b', {}, 'Craft up to level'), h('select', { class: 'in', onchange: (e) => upd({ maxLevel: +e.target.value }) }, [1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), selected: st.maxLevel === n ? 'selected' : null }, 'Level ' + n))), hint('Level 1 = one badge per game. Level 5 is the maximum Steam allows and gives the most XP.')),
        h('div', { class: 'setrow' }, h('b', {}, 'Check every'), h('select', { class: 'in', onchange: (e) => upd({ everyMin: +e.target.value }) }, [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [180, '3 hours'], [720, '12 hours']].map(([n, l]) => h('option', { value: String(n), selected: st.everyMin === n ? 'selected' : null }, l)))),
        h('div', { class: 'setrow' }, h('b', {}, 'Now'), h('div', { class: 'lk' }, accSel,
          h('button', { class: 'btn ghost sm', disabled: BS.busy ? 'disabled' : null, onclick: () => run(true) }, 'Look for sets'),
          h('button', { class: 'btn red sm', disabled: BS.busy ? 'disabled' : null, onclick: () => { if (confirm('Craft every complete set now? The cards are used up and this cannot be undone.')) run(false); } }, 'Craft now'))),
        resBox,
        st.log && st.log.length ? h('div', { class: 'ublk' }, h('b', {}, 'Recently crafted'), st.log.slice(0, 12).map((l) => h('div', { class: 'itop' }, h('span', {}, `${l.game} \u00b7 ${l.acc}`), h('b', {}, `level ${l.from} \u2192 ${l.to} \u00b7 ${new Date(l.t).toLocaleDateString(uiLocale())}`)))) : null,
        hint('A message goes to the Discord webhook when badges are crafted (Utility > Webhook).'));
      paintRes();
    };
    call('get').then((r) => { st = r.badge; paint(); }).catch((e) => box.replaceChildren(hint(e.message)));
    return [h('b', {}, 'Badge crafting'), hint('When you own every card of a game, Wella Hub can craft the badge for you.'), box];
  };

  // ================= Utility: Steam sales countdown (#29) =================
  X.sales = () => {
    const box = h('div', { class: 'uout' });
    let data = null;
    const paint = () => {
      if (!data) { box.replaceChildren(spin()); return; }
      const c = data.cfg;
      const upd = async (p) => { try { data = await call('saleSet', p); } catch (e) { fail(e); } paint(); };
      const off = Date.now() - data.now;                                   // clock difference between main process and page
      const rows = data.list.filter((e) => e.state !== 'over').slice(0, 8).map((e) => {
        const left = h('b', {}, '');
        const tickRow = () => { const n = Date.now() - off; left.textContent = e.state === 'live' ? 'LIVE \u00b7 ends in ' + cd(e.endMs - n) : 'starts in ' + cd(e.startMs - n); };
        tickRow();
        const t = setInterval(() => { if (!alive(left)) { clearInterval(t); return; } tickRow(); }, 1000);
        return h('div', { class: 'ucard sale' + (e.state === 'live' ? ' live' : '') }, h('div', { class: 'invh' }, h('b', {}, e.name), left),
          hint(new Date(e.startMs).toLocaleString(uiLocale(), { hour12: false, dateStyle: 'medium', timeStyle: 'short' }) + '  \u2192  ' + new Date(e.endMs).toLocaleString(uiLocale(), { hour12: false, dateStyle: 'medium', timeStyle: 'short' }) + ' (your time)'),
          e.custom ? h('button', { class: 'btn stop sm', onclick: async () => { try { data = await call('saleDel', { id: e.id }); } catch (er) { fail(er); } paint(); } }, 'Remove') : null);
      });
      const nm = h('input', { class: 'in', placeholder: 'Event name' }), st1 = h('input', { class: 'in', type: 'datetime-local' }), en1 = h('input', { class: 'in', type: 'datetime-local' });
      box.replaceChildren(...rows, rows.length ? null : hint('No upcoming events in the list.'),
        chkRow('Notify me about sales and fests', c.on, (v) => upd({ on: v }), 'A desktop notification and (when set) a Discord message.'),
        chkRow('A day before', c.at24, (v) => upd({ at24: v })), chkRow('One hour before', c.at1, (v) => upd({ at1: v })), chkRow('When it starts', c.atStart, (v) => upd({ atStart: v })),
        h('div', { class: 'ublk' }, h('b', {}, 'Add my own event'), hint('For a sale Valve announces later or a date that moved.'), nm, h('div', { class: 'lk' }, st1, en1),
          h('button', { class: 'btn ghost sm', onclick: async () => { try { data = await call('saleAdd', { name: nm.value, start: st1.value, end: en1.value }); toast('Event added', 'ok'); } catch (e) { fail(e); } paint(); } }, 'Add')),
        hint('Dates are from the official Steam calendar (Valve can still change them). Start times are 10:00 Pacific.'));
    };
    call('saleList').then((r) => { data = r; paint(); }).catch((e) => box.replaceChildren(hint(e.message)));
    return [h('b', {}, 'Steam sales countdown'), hint('The next sales and fests with a live countdown. The same countdown shows at the bottom of the app.'), box];
  };

  // footer chip with the next event
  (function footerChip() {
    const foot = document.querySelector('.foot .fl'); if (!foot) return;
    const chip = h('span', { id: 'fSale', class: 'fsale hidden', title: 'Steam sales countdown (click)', onclick: () => { US.sub = 'sale'; if (tab === 'util') paintUtilPage(); else setTab('util'); } });
    foot.append(chip);
    let data = null, off = 0;
    const paint = () => {
      if (!data) return;
      const e = data.list.find((x) => x.state !== 'over'); if (!e || !data.cfg.on) { chip.classList.add('hidden'); return; }
      const n = Date.now() - off;
      chip.classList.remove('hidden'); chip.classList.toggle('live', e.state === 'live');
      chip.textContent = e.state === 'live' ? `${e.name}: live, ends in ${cd(e.endMs - n)}` : `${e.name} in ${cd(e.startMs - n)}`;
    };
    const load = () => feat('saleList').then((r) => { if (r && !r.error) { data = r; off = Date.now() - r.now; paint(); } }).catch(() => {});
    setTimeout(load, 5000); setInterval(load, 600e3); setInterval(paint, 30e3);
  })();

  // ================= Utility: daily report (#25) =================
  X.daily = () => {
    const box = h('div', { class: 'uout' });
    let st = null, pv = null;
    const paint = () => {
      if (!st) { box.replaceChildren(spin()); return; }
      const upd = async (p) => { try { st = await call('dailySet', p); } catch (e) { fail(e); } paint(); };
      const time = h('input', { class: 'in', type: 'time', value: `${String(st.hour).padStart(2, '0')}:${String(st.minute).padStart(2, '0')}`, style: 'width:140px', onchange: (e) => { const m = /^(\d\d):(\d\d)$/.exec(e.target.value); if (m) upd({ hour: +m[1], minute: +m[2] }); } });
      box.replaceChildren(
        chkRow('Send a summary to Discord every day', st.on, (v) => upd({ on: v }), 'Hours boosted, trading cards dropped, achievements unlocked and badges crafted today, per account. Needs a webhook (Utility > Webhook).'),
        h('div', { class: 'setrow' }, h('b', {}, 'Send at'), time, hint('If the PC was off at that time, it is sent when Wella Hub starts later the same day.')),
        h('div', { class: 'sbtns' },
          h('button', { class: 'btn ghost sm', onclick: async () => { try { pv = await call('dailyPreview'); } catch (e) { fail(e); } paint(); } }, 'Preview today'),
          h('button', { class: 'btn red sm', onclick: async (e) => { const b = e.currentTarget; b.disabled = true; try { await call('dailyNow'); toast('Summary sent', 'ok'); } catch (er) { fail(er); } b.disabled = false; } }, 'Send now')),
        pv ? h('div', { class: 'ucard' }, h('b', {}, pv.title), pv.fields.map((f) => h('div', { class: 'itop' }, h('span', {}, f.name), h('b', {}, f.value))), pv.description ? hint(pv.description) : null) : null);
    };
    call('get').then((r) => { st = r.daily; paint(); }).catch((e) => box.replaceChildren(hint(e.message)));
    return [h('b', {}, 'Daily report'), hint('Your day in one Discord message.'), box];
  };

  // ================= Utility: PC health (#37) =================
  X.pcHealth = () => {
    const box = h('div', { class: 'uout' }), live = h('div', { class: 'hlive' });
    let st = null;
    const meter = (label, v, lim, unit) => h('div', { class: 'hm' + (v != null && v >= lim ? ' bad' : '') }, h('small', {}, label), h('b', {}, v == null ? D : v + unit), h('i', {}, h('u', { style: `width:${v == null ? 0 : Math.min(100, (v / lim) * 100)}%` })), h('small', {}, 'limit ' + lim + unit));
    const poll = async () => {
      try { const r = await call('healthNow'); if (!alive(live)) return; live.replaceChildren(r.boosting ? h('div', { class: 'hrow2' }, meter('Wella Hub CPU', r.cpuApp, r.cfg.cpuApp, '%'), meter('Whole PC CPU', r.cpuSys, r.cfg.cpuSys, '%'), meter('Network (whole PC)', r.net, r.cfg.netMbps, ' Mbit/s')) : hint(r.cfg.on ? 'Waiting: nothing is boosting right now. Readings start with the Hour Booster.' : 'Switched off.')); } catch {}
    };
    const paint = () => {
      if (!st) { box.replaceChildren(spin()); return; }
      const upd = async (p) => { try { st = await call('healthSet', p); } catch (e) { fail(e); } paint(); };
      const n = (label, key, unit, lo, hi) => h('div', { class: 'setrow' }, h('b', {}, label), h('div', { class: 'lk' }, h('input', { class: 'in', type: 'number', min: String(lo), max: String(hi), value: String(st[key]), style: 'width:110px;text-align:center', onchange: (e) => upd({ [key]: +e.target.value }) }), h('small', {}, unit)));
      box.replaceChildren(
        chkRow('Warn me when boosting loads the PC', st.on, (v) => upd({ on: v }), 'Checked every 10 seconds, only while an account is boosting.'),
        n('Wella Hub CPU limit', 'cpuApp', '% of all cores', 1, 100), n('Whole PC CPU limit', 'cpuSys', '%', 30, 100), n('Network limit', 'netMbps', 'Mbit/s (whole PC)', 1, 10000),
        n('Readings in a row', 'samples', 'before the warning (10 s each)', 1, 20), n('Same warning again after', 'cooldownMin', 'minutes', 1, 720),
        hint('The network number is the traffic of the whole PC (the booster alone is tiny), so a download or a stream also counts. A warning goes to a desktop notification and to the Discord webhook.'),
        live);
      poll();
    };
    call('get').then((r) => { st = r.health; paint(); const t = setInterval(() => { if (!alive(box)) { clearInterval(t); return; } poll(); }, 3000); }).catch((e) => box.replaceChildren(hint(e.message)));
    return [h('b', {}, 'PC health check'), hint('Warns you if the boost makes the PC or the connection too busy.'), box];
  };

  // search button next to the gear
  (function searchBtn() {
    const g = document.getElementById('gear'); if (!g) return;
    g.before(h('button', { class: 'srch', title: 'Search (Ctrl+K)', onclick: openBar }, svgEl('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>')));
  })();
  // the sliding tab highlight must follow the real size of the tabs (language and font change their width)
  (function keepIndicator() {
    const tabs = document.querySelector('.tabs'); if (!tabs || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => { try { moveInd(); } catch {} });
    tabs.querySelectorAll('.tab').forEach((b) => ro.observe(b)); ro.observe(tabs);
    window.addEventListener('resize', () => { try { moveInd(); } catch {} });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { moveInd(); } catch {} });
  })();
  X.loadHidden();
})();
