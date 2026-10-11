const $ = (s) => document.querySelector(s);
const MAX = 32;
const uiLocale = () => window.WellaI18n ? window.WellaI18n.locale() : 'en-US';
let accounts = [];
let gameRotationOn = false;
let installedAppIds = new Set(), installedAppsAt = 0, installedAppsRequest = null;
const steamGameHours = new Map(), steamGameHoursPending = new Set();
let view = 'all'; // 'all' or account id

function loadSteamGameHours(accountId) {
  if (steamGameHours.has(accountId) || steamGameHoursPending.has(accountId) || !window.api.gameHours) return;
  steamGameHoursPending.add(accountId);
  window.api.gameHours(accountId).then((hours) => {
    steamGameHours.set(accountId, hours || {});
    document.querySelectorAll(`[data-steam-hours-account="${CSS.escape(accountId)}"]`).forEach((el) => {
      const value = steamGameHours.get(accountId)[el.dataset.steamHoursAppid];
      el.textContent = value == null ? '\u2014' : Number(value).toLocaleString(uiLocale());
    });
  }).catch(() => {}).finally(() => steamGameHoursPending.delete(accountId));
}

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, raw] of Object.entries(props)) {
    const v = raw;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) {
    if (k.nodeType) el.append(k);
    else { const n = document.createTextNode(k); if (typeof k === 'string' && window.WellaI18n && window.WellaI18n.translateNode) window.WellaI18n.translateNode(n, k); el.append(n); }
  }
  return el;
}
const fmtHM = (sec) => {
  sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
};
// ---------- game art ----------
// Steam art comes from several CDN paths; old or delisted games often lack some of them.
// Each game is resolved ONCE (first address that really loads), the result is remembered, and the picture
// only replaces the placeholder tile after it has loaded, so nothing flashes or flickers when the list is redrawn.
const IMG_CHAIN = [
  (g) => g.hdr && `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/${g.hdr}`,
  (g) => `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg`,
  (g) => `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
  (g) => `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/capsule_231x87.jpg`,
  (g) => g.icon && `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.icon}.jpg`
];
const imgOk = new Map(), imgBad = new Set(), imgPending = new Map();
const probe = (u) => new Promise((res) => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = u; });
function resolveImg(g) {
  if (imgOk.has(g.appid)) return Promise.resolve(imgOk.get(g.appid));
  if (imgBad.has(g.appid)) return Promise.resolve(null);
  if (imgPending.has(g.appid)) return imgPending.get(g.appid);
  const p = (async () => {
    for (const f of IMG_CHAIN) { const u = f(g); if (u && await probe(u)) { imgOk.set(g.appid, u); return u; } }
    if (navigator.onLine) imgBad.add(g.appid); // offline failures are not remembered
    return null;
  })().finally(() => imgPending.delete(g.appid));
  imgPending.set(g.appid, p);
  return p;
}
// at most 6 games are resolved at the same time (libraries can have hundreds of games)
const imgQueue = []; let imgActive = 0;
function queueImg(g) {
  return new Promise((res) => { imgQueue.push([g, res]); pumpImg(); });
}
function pumpImg() {
  while (imgActive < 6 && imgQueue.length) {
    const [g, res] = imgQueue.shift(); imgActive++;
    resolveImg(g).then(res).finally(() => { imgActive--; pumpImg(); });
  }
}
const tileCache = new Map();
function tileFor(g) { // placeholder: colored tile with the first letter
  if (tileCache.has(g.appid)) return tileCache.get(g.appid);
  const hue = (g.appid * 47) % 360, letter = ((g.name || '?').trim()[0] || '?').toUpperCase().replace(/[<>&]/g, '?');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="460" height="215"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},45%,24%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,14%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI,Arial" font-size="120" font-weight="700" fill="rgba(255,255,255,.28)">${letter}</text></svg>`;
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  tileCache.set(g.appid, url);
  return url;
}
const imgObserver = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { imgObserver.unobserve(e.target); if (e.target._start) e.target._start(); }
}, { rootMargin: '240px' }) : null;
function gameImg(g, props = {}) {
  const img = h('img', { ...props, alt: '', draggable: 'false' });
  img.className = ((props.class || '') + ' gimg').trim();
  const known = imgOk.get(g.appid);
  if (known) { img.src = known; return img; }   // already resolved: shows instantly
  img.src = tileFor(g);
  if (imgBad.has(g.appid)) { img.classList.add('nopic'); return img; }
  img._start = () => queueImg(g).then((url) => {
    if (!url) { img.classList.add('nopic'); return; }
    img.classList.remove('nopic'); img.src = url; img.classList.add('fadein');
  });
  if (imgObserver) imgObserver.observe(img); else img._start();
  return img;
}
// when the connection comes back, try the games that had no picture again
window.addEventListener('online', () => {
  imgBad.clear();
  document.querySelectorAll('img.gimg.nopic').forEach((im) => { if (im._start) im._start(); });
});
function tile(g, cls = '') {
  const letter = ((g.name || '?').trim()[0] || '?').toUpperCase();
  return h('div', { class: ('gtile ' + cls).trim(), style: `--hue:${(g.appid * 47) % 360}` }, letter);
}
function beamGo() { const b = $('#beam'); if (!b) return; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); }
// iOS style banner at the top, centered. type: 'ok' (green) | 'bad' (red) | undefined (accent). title is optional (bold first line).
// The shape (pill / rounded / soft / square / oval) comes from Settings > General > Notifications.
const TOAST_ICON = {
  ok: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bad: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg>'
};
function toast(msg, type, title) {
  const t = $('#toast');
  const ic = h('i', { class: 'ti' }); ic.innerHTML = TOAST_ICON[type] || TOAST_ICON.info;
  t.replaceChildren(ic, h('div', { class: 'tx' }, title ? h('b', {}, title) : null, msg ? h('span', {}, String(msg)) : null));
  clearTimeout(toast.t); clearTimeout(toast.t2);
  t.className = 'toast' + (type ? ' ' + type : '');
  void t.offsetWidth; t.classList.add('pop');
  toast.t = setTimeout(() => { t.classList.add('out'); toast.t2 = setTimeout(() => t.classList.add('hidden'), 320); }, type === 'bad' ? 6500 : 3600);
}
const plusSvg = (n) => { const d = document.createElement('div'); d.innerHTML = `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`; return d.firstChild; };
const clockSvg = () => { const d = document.createElement('div'); d.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>'; return d.firstChild; };

const STATUSES = [{ v: 1, label: 'Online' }, { v: 7, label: 'Offline' }, { v: 2, label: 'Do not disturb' }, { v: 4, label: 'Sleep' }];
const statusLabel = (v) => (STATUSES.find((s) => s.v === v) || STATUSES[0]).label;
function closeMenu() { document.querySelectorAll('.smenu').forEach((m) => m.remove()); }
function statusMenu(a, x, y) {
  closeMenu();
  const m = h('div', { class: 'smenu', style: `left:${Math.min(x, window.innerWidth - 210)}px;top:${Math.min(y, window.innerHeight - 190)}px` },
    STATUSES.map((s) => h('button', { class: 'smi' + (a.persona === s.v ? ' on' : ''), onclick: () => { window.api.setStatus({ id: a.id, persona: s.v }); closeMenu(); } },
      h('i', { class: 'sd s' + s.v }), s.label)));
  document.body.append(m);
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 0);
}
function sortedGames(a) {
  const fav = new Set(a.favorites);
  const WX = window.WellaExtra;
  return (WX ? WX.visible(a.games) : [...a.games]).sort((x, y) => (fav.has(y.appid) - fav.has(x.appid)) || x.name.localeCompare(y.name));
}

let lastSideSig = '', lastCardSig = '', lastCount = -1, animateNext = true, switching = false;
async function refreshInstalledApps(force = false) {
  if (!window.__WELLA_WEB || (!force && Date.now() - installedAppsAt < 60000)) return;
  if (installedAppsRequest) return installedAppsRequest;
  installedAppsRequest = window.api.localInstalledGames().then((r) => {
    installedAppIds = new Set((r && r.appids || []).map(Number)); installedAppsAt = Date.now();
    lastCardSig = ''; render();
  }).catch(() => {}).finally(() => { installedAppsRequest = null; });
  return installedAppsRequest;
}
const gamesSig = (a) => a.games.length + ':' + (a.games[0] ? a.games[0].appid : 0) + ':' + (a.games.length ? a.games[a.games.length - 1].appid : 0);
// Banned accounts (VAC / game / community ban) are shown in red in the account list, like the red player-check card.
let banMap = {};
const banText = (b) => [b.vac ? (b.vac > 1 ? 'VAC \u00d7' + b.vac : 'VAC ban') : '', b.game ? (b.game > 1 ? 'Game ban \u00d7' + b.game : 'Game ban') : '', b.community ? 'Community ban' : ''].filter(Boolean).join(', ');
async function refreshBans() {
  try { const m = await window.api.accountsBans(); if (m && typeof m === 'object') { banMap = m; updateSide(); } } catch { /* offline: keep the last answer */ }
}
setInterval(refreshBans, 10 * 60 * 1000);
function updateSide() {
  for (const a of accounts) {
    const d = document.querySelector(`#side .dot[data-d="${a.id}"]`); if (!d) continue;
    // green = Hour Booster is running, red = it is stopped
    const on = a.status === 'boosting' && !!(a.health ? a.health.ok : true);
    const c = 'dot ' + (on ? 'ok live' : 'bad');
    if (d.className !== c) d.className = c;
    const bn = banMap[a.id] && banMap[a.id].banned ? banMap[a.id] : null;
    const b = document.querySelector(`#side .sbtn[data-v="${a.id}"]`), t = `${a.personaName} \u00b7 ${statusLabel(a.persona)} \u00b7 Hour Booster ${on ? 'on' : 'off'}` + (bn ? ` \u00b7 BANNED (${banText(bn)})` : '');
    if (b && b.title !== t) b.title = t;
  }
}
function markActive() { document.querySelectorAll('#side .sbtn[data-v]').forEach((b) => b.classList.toggle('active', b.dataset.v === view)); }
function switchView(v) {
  if (v === view) return;
  view = v; markActive(); beamGo();
  const sb = document.querySelector(`#side .sbtn[data-v="${v}"]`);
  if (sb) { sb.classList.remove('pulse'); void sb.offsetWidth; sb.classList.add('pulse'); }
  switching = true;
  const c = $('#cards'); c.classList.add('leaving');
  clearTimeout(switchView.t);
  switchView.t = setTimeout(() => { c.classList.remove('leaving'); switching = false; animateNext = true; render(); }, 170);
}
// The lists are only rebuilt when something structural changed. The timers that tick every second are
// updated in place by tick(), so pictures and animations are not restarted all the time.
function render() {
  if (view !== 'all' && !accounts.find((a) => a.id === view)) view = 'all';
  if (accounts.length !== lastCount) { if (lastCount !== -1) animateNext = true; }
  const sideSig = JSON.stringify(accounts.map((a) => [a.id, a.avatar, a.personaName]));
  if (sideSig !== lastSideSig) {
    const first = lastSideSig === '' || accounts.length !== lastCount;
    lastSideSig = sideSig;
    const side = $('#side'); side.replaceChildren(); side.classList.toggle('anim', first);
    let i = 0;
    const item = (...kids) => h('div', { class: 'sitem', style: `--i:${i++}` }, ...kids);
    side.append(item(h('button', { class: 'sbtn', 'data-v': 'all', title: 'All accounts', onclick: () => switchView('all') }, clockSvg())));
    for (const a of accounts) {
      const btn = h('button', { class: 'sbtn', 'data-v': a.id, onclick: () => switchView(a.id) },
        a.avatar ? h('img', { src: a.avatar, draggable: 'false' }) : a.personaName[0].toUpperCase());
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); statusMenu(a, e.clientX, e.clientY); });
      side.append(item(btn, h('span', { class: 'dot', 'data-d': a.id })));
    }
    side.append(item(h('button', { class: 'sbtn addbtn', title: 'Add account', onclick: openAdd }, plusSvg(26))));
    markActive();
  }
  updateSide();
  const cardSig = JSON.stringify([view, accounts.map((a) => [a.id, a.avatar, a.personaName, a.persona, a.status, a.note, a.selected, a.favorites, gamesSig(a), a.cardsT])]);
  if (cardSig !== lastCardSig && !switching) {
    lastCardSig = cardSig;
    const cards = $('#cards'); cards.replaceChildren(); cards.classList.toggle('anim', animateNext);
    let i = 0;
    for (const a of accounts.filter((x) => view === 'all' || x.id === view)) { const el = card(a); el.style.setProperty('--i', i++); cards.append(el); loadSteamGameHours(a.id); }
    animateNext = false;
  }
  lastCount = accounts.length;
  tick();
}
function tick() {
  const boosting = accounts.filter((a) => a.status === 'boosting').length;
  const title = boosting ? `${boosting} account${boosting > 1 ? 's' : ''} boosting` : 'Nothing is boosting right now';
  if ($('#title').textContent !== title) $('#title').textContent = title;
  setPill(boosting > 0 && navigator.onLine);
  const cnt = `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${boosting} boosting`;
  if ($('#fCount').textContent !== cnt) $('#fCount').textContent = cnt;
  for (const el of document.querySelectorAll('[data-live]')) {
    const [k, id, gid] = el.dataset.live.split('|');
    const a = accounts.find((x) => x.id === id); if (!a) continue;
    const v = k === 's' ? fmtHM(a.sessionSeconds) : k === 't' ? fmtHM(a.totalSeconds) : ((a.gameSeconds[gid] || 0) / 3600).toFixed(1);
    if (el.textContent !== v) el.textContent = v;
  }
}

let pillState = null;
function setPill(on) {
  const el = $('#fStatus');
  if (pillState === on) return;
  const first = pillState === null;
  pillState = on;
  el.className = 'pill ' + (on ? 'on' : 'off');
  el.querySelector('b').textContent = on ? 'Online' : 'Offline';
  if (!first) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
}
window.addEventListener('online', () => render());
window.addEventListener('offline', () => render());
// replay the intro animation each time the window is shown (e.g. from the tray)
// (the opening animation plays only once, at start-up; showing the window from the tray does not replay it)


// Idle Master Extended style summary, read from the Steam badges page: "88 card drops remaining / 21 games left to idle, 19 idle now. / Currently in-game"
function cardSummary(a, on) {
  if (!a.cardsT) return null;
  const left = Object.entries(a.cardDrops || {}).filter(([, n]) => n > 0);
  const total = left.reduce((x, [, n]) => x + n, 0);
  const sel = new Set(a.selected || []);
  const idleNow = on ? left.filter(([id]) => sel.has(Number(id))).length : 0;
  return h('div', { class: 'cdsum', title: 'Read from the Steam badges page ' + agoText(a.cardsT) },
    h('b', {}, `${total.toLocaleString(uiLocale())} card drops remaining`),
    h('span', {}, `${left.length} game${left.length === 1 ? '' : 's'} left to idle, ${idleNow} idle now.`),
    on ? h('em', {}, 'Currently in-game') : null);
}
function card(a) {
  const on = a.status === 'boosting', busy = a.status === 'connecting';
  const fav = new Set(a.favorites);
  const sel = a.games.filter((g) => a.selected.includes(g.appid))
    .sort((x, y) => (fav.has(y.appid) - fav.has(x.appid)) || x.name.localeCompare(y.name));
  return h('div', { class: 'card' },
    h('div', { class: 'row' },
      h('div', { class: 'avw', title: (a.health ? a.health.why + ' \u00b7 ' : '') + 'Click to set status', onclick: (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); statusMenu(a, r.left, r.bottom + 6); } },
        a.avatar ? h('img', { class: 'av', src: a.avatar }) : h('div', { class: 'av' }),
        h('span', { class: 'dot ' + (a.health && a.health.ok ? 'ok live' : 'bad') })),
      h('div', { class: 'who clk', title: 'Account info', onclick: () => openAccount(a.id) }, h('b', {}, a.personaName),
        h('small', {}, `${a.selected.length} game${a.selected.length === 1 ? '' : 's'} · ${on ? statusLabel(a.persona) : busy ? 'Connecting…' : 'Not boosting'}`)),
      h('div', { class: 'stat' }, h('small', {}, 'This session'), h('div', { class: on ? '' : 'dim', 'data-live': `s|${a.id}` }, fmtHM(a.sessionSeconds))),
      h('div', { class: 'stat' }, h('small', {}, 'Total'), h('div', { 'data-live': `t|${a.id}` }, fmtHM(a.totalSeconds))),
      on ? h('button', { class: 'btn stop', onclick: () => window.api.stop(a.id) }, 'Stop')
         : h('button', { class: 'btn start', disabled: busy, onclick: async () => { const r = await window.api.start(a.id); if (r && r.error) toast(r.error, 'bad'); } }, busy ? 'Starting…' : 'Start'),
      h('button', { class: 'icon', title: 'Choose games', onclick: () => openPicker(a) }, '✎'),
      h('button', { class: 'icon', title: 'Remove account', onclick: () => { if (confirm(`Remove ${a.personaName}?`)) window.api.remove(a.id); } }, '🗑')),
    cardSummary(a, on),
    a.note ? h('div', { class: 'note' }, a.note) : (!on && !busy && a.health && a.health.why && a.health.why !== 'Hour Booster is not running' ? h('div', { class: 'note' }, a.health.why) : null),
    h('div', { class: 'games' },
      sel.length ? sel.map((g, j) => h('div', { class: 'g clk', title: 'Game info and actions', onclick: () => openGame(a.id, g.appid), style: `--j:${Math.min(j, 12)}` },
        gameImg(g),
        h('div', { class: 'gn' }, h('b', {}, (fav.has(g.appid) ? '★ ' : '') + g.name)),
        window.__WELLA_WEB && installedAppIds.has(Number(g.appid)) ? h('button', { class: 'btn red sm', title: 'Stop this account\'s Hour Booster and launch the installed game', onclick: async (e) => {
          e.stopPropagation(); const button = e.currentTarget; button.disabled = true; button.textContent = window.WellaI18n ? window.WellaI18n.t('Starting…') : 'Starting…';
          try {
            if (a.status === 'boosting' || a.status === 'connecting') {
              const stopped = await window.api.stop(a.id);
              if (stopped && stopped.error) throw new Error(stopped.error);
              await new Promise((resolve) => setTimeout(resolve, 1200));
            }
            const r = await window.api.gameLocal({ appid: Number(g.appid), action: 'launch' });
            if (r && r.error) { toast(r.error, 'bad'); refreshInstalledApps(true); }
            else toast(r && r.message ? r.message : 'Launching ' + g.name, 'ok');
          } catch (err) { toast(err.message || 'Could not launch this game from the web app.', 'bad'); }
          finally { button.disabled = false; button.textContent = window.WellaI18n ? window.WellaI18n.t('Play') : 'Play'; }
        } }, 'Play') : null,
        h('div', { class: 'hrs' }, h('span', { class: 'steamhrs', 'data-steam-hours-account': a.id, 'data-steam-hours-appid': g.appid }, steamGameHours.has(a.id) ? (steamGameHours.get(a.id)[g.appid] == null ? '\u2014' : Number(steamGameHours.get(a.id)[g.appid]).toLocaleString(uiLocale())) : '\u2026'), h('i', { class: 'steamunit' }, 'h'), h('span', { class: 'boostedhrs', 'data-live': `g|${a.id}|${g.appid}` }, ((a.gameSeconds[g.appid] || 0) / 3600).toFixed(1)), h('i', {}, 'h'))))
        : h('div', { class: 'empty' }, a.games.length ? 'No games selected. Click the pencil to choose.' : 'No games found on this account.')));
}

// ----- game picker -----
const agoText = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function openPicker(a) {
  const sel = new Set(a.selected), fav = new Set(a.favorites);
  let q = '', onlyCards = false, busy = false, scanErr = '';
  const cur = () => accounts.find((x) => x.id === a.id) || a;      // the state is refreshed after a card scan
  const known = () => !!cur().cardsT;                              // card drops were read from Steam at least once
  const left = (g) => (cur().cardDrops || {})[g.appid] || 0;
  const list = h('div', { class: 'plist' });
  const counter = h('small', {});
  const info = h('small', { class: 'cinfo' });
  // the games the list works on: everything, or (box ticked) only the games that still have card drops left, most cards first
  const base = () => {
    const g0 = sortedGames({ games: a.games, favorites: [...fav] });
    if (!onlyCards) return g0;
    return g0.filter((g) => (known() ? left(g) > 0 : g.cards))
      .sort((x, y) => (fav.has(y.appid) - fav.has(x.appid)) || (known() ? left(y) - left(x) : 0) || x.name.localeCompare(y.name));
  };
  const paintInfo = () => {
    const c = cur();
    if (busy) { info.replaceChildren(h('span', { class: 'spin' }), 'Reading card info from Steam…'); return; }
    if (scanErr) { info.replaceChildren(h('span', { class: 'err' }, scanErr + (onlyCards ? ' Showing every game that has trading cards.' : ''))); return; }
    if (known()) {
      const vals = Object.values(c.cardDrops || {}).filter((n) => n > 0);
      info.textContent = `${vals.length} game${vals.length === 1 ? '' : 's'} with card drops left · ${vals.reduce((x, y) => x + y, 0)} cards to get · updated ${agoText(c.cardsT)}`;
    } else info.textContent = 'Tick the box to read which games still have trading cards to drop.';
  };
  const draw = () => {
    list.replaceChildren();
    const games = base().filter((g) => g.name.toLowerCase().includes(q));
    const favs = games.filter((g) => fav.has(g.appid)), rest = games.filter((g) => !fav.has(g.appid));
    const row = (g) => h('label', { class: 'pi' },
      h('input', { type: 'checkbox', checked: sel.has(g.appid) ? 'checked' : null, onchange: (e) => {
        if (e.target.checked) { if (sel.size >= MAX) { e.target.checked = false; toast(`Max ${MAX} games`, 'bad'); return; } sel.add(g.appid); } else sel.delete(g.appid);
        counter.textContent = `${sel.size}/${MAX} selected`; } }),
      gameImg(g),
      h('span', {}, g.name),
      onlyCards && known() ? h('em', { class: 'cdrop', title: 'Trading card drops still to come' }, `${left(g)} card${left(g) === 1 ? '' : 's'} left`) : null,
      window.WellaExtra ? window.WellaExtra.hideBtn(g, draw) : null,
      h('button', { class: 'star' + (fav.has(g.appid) ? ' on' : ''), title: 'Favorite', onclick: (e) => { e.preventDefault(); fav.has(g.appid) ? fav.delete(g.appid) : fav.add(g.appid); draw(); } }, '★'));
    if (favs.length) list.append(h('div', { class: 'sec' }, 'Favorites'), ...favs.map(row));
    if (rest.length) list.append(h('div', { class: 'sec' }, favs.length ? 'All games' : `${rest.length} games`), ...rest.map(row));
    if (!games.length) list.append(h('div', { class: 'empty' }, onlyCards && known() ? 'No game has card drops left. Nice!' : 'No games found.'));
    counter.textContent = `${sel.size}/${MAX} selected`;
    paintInfo();
  };
  const scan = async () => {
    if (busy) return;
    busy = true; scanErr = ''; paintInfo();
    let r; try { r = await window.api.cardsScan(a.id); } catch (e) { r = { error: e.message || String(e) }; }
    busy = false; scanErr = r && r.error ? r.error : '';
    draw();
  };
  const box = h('input', { type: 'checkbox', onchange: async (e) => { onlyCards = e.target.checked; draw(); if (onlyCards && (!known() || Date.now() - cur().cardsT > 3600e3)) await scan(); } });
  draw();
  showModal(h('div', { class: 'modal' },
    h('h2', {}, `Games on ${a.personaName}`),
    h('input', { class: 'in', placeholder: 'Search games', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } }),
    h('div', { class: 'cfilter' },
      h('label', { class: 'chk' }, box, 'Only games with trading cards left'),
      h('button', { class: 'btn text sm', title: 'Read the card info from Steam again', onclick: scan }, '↻ Update')),
    info,
    h('div', { class: 'gtools' },
      h('button', { class: 'btn ghost', onclick: () => { sel.clear(); for (const g of base().slice(0, MAX)) sel.add(g.appid); draw(); } }, onlyCards ? `Select first ${MAX} with cards` : `Select first ${MAX}`),
      h('button', { class: 'btn text', onclick: () => { sel.clear(); draw(); } }, 'Clear')),
    list, counter,
    h('div', { class: 'mact' },
      h('button', { class: 'btn text', onclick: async (e) => { e.target.textContent = 'Refreshing…'; const r = await window.api.refreshGames(a.id); closeModal(); toast(r && r.error ? r.error : 'Game list updated', r && r.error ? 'bad' : 'ok'); } }, 'Refresh list'),
      h('button', { class: 'btn ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn red', onclick: async () => { await window.api.update({ id: a.id, selected: [...sel], favorites: [...fav] }); closeModal(); } }, 'Save'))));
}

// ----- add account -----
function openAdd() {
  const user = h('input', { class: 'in', placeholder: 'Steam username', autocomplete: 'off' });
  const pass = h('input', { class: 'in', type: 'password', placeholder: 'Password' });
  const status = h('div', {});
  const actions = h('div', { class: 'mact' });
  const qrBox = h('div', { class: 'qrbox hidden' });
  const intro = h('p', {});
  let mode = 'pass';
  const setActions = (...b) => actions.replaceChildren(...b);
  const cancel = h('button', { class: 'btn text', onclick: () => { window.api.loginCancel(); closeModal(); } }, 'Cancel');
  const go = h('button', { class: 'btn red', onclick: () => {
    if (!user.value || !pass.value) return;
    status.replaceChildren(h('span', { class: 'spin' }), 'Signing in…');
    window.api.loginStart({ accountName: user.value.trim(), password: pass.value });
  } }, 'Sign in');
  const startQr = () => {
    qrBox.classList.remove('hidden', 'dim'); qrBox.replaceChildren(h('span', { class: 'spin' }));
    status.replaceChildren(h('div', { class: 'qrhelp' }, 'Creating the QR code…'));
    setActions(cancel, newQr);
    window.api.loginQr().catch((e) => status.replaceChildren(h('span', { class: 'err' }, e.message || String(e))));
  };
  const newQr = h('button', { class: 'btn red', onclick: startQr }, 'New QR code');
  const bPass = h('button', { class: 'btn on', onclick: () => setMode('pass') }, 'Username & password');
  const bQr = h('button', { class: 'btn', onclick: () => setMode('qr') }, 'QR code');
  const setMode = (m) => {
    mode = m;
    bPass.classList.toggle('on', m === 'pass'); bQr.classList.toggle('on', m === 'qr');
    user.classList.toggle('hidden', m !== 'pass'); pass.classList.toggle('hidden', m !== 'pass');
    status.replaceChildren();
    if (m === 'pass') {
      window.api.loginCancel(); qrBox.classList.add('hidden'); qrBox.replaceChildren();
      intro.textContent = 'Sign in with Steam. If you use Steam Guard, approve the login in the Steam app on your phone. Your password is not saved.';
      setActions(cancel, go);
    } else {
      intro.textContent = 'No password needed: scan the code with the Steam app on your phone. Your login is not shared with anyone.';
      startQr();
    }
  };
  const box = h('div', { class: 'modal' }, h('h2', {}, 'Add account'), h('div', { class: 'seg' }, bPass, bQr), intro, user, pass, qrBox, status, actions);
  setMode('pass');
  window._loginUI = { status, setActions, cancel, go, box, qrBox, errActions: () => [cancel, mode === 'qr' ? newQr : go] };
  showModal(box);
  user.focus();
}
window.api.onLogin((m) => {
  const ui = window._loginUI; if (!ui || $('#modal').classList.contains('hidden')) return;
  if (m.stage === 'qr') {
    ui.qrBox.classList.remove('hidden', 'dim');
    ui.qrBox.replaceChildren(h('img', { src: m.image, alt: 'Steam QR code', draggable: 'false' }));
    ui.status.replaceChildren(h('div', { class: 'qrhelp' }, m.message));
  }
  else if (m.stage === 'approve' || m.stage === 'loading') { ui.qrBox.classList.add('dim'); ui.status.replaceChildren(h('span', { class: 'spin' }), m.message); }
  else if (m.stage === 'error') { ui.qrBox.classList.add('dim'); ui.status.replaceChildren(h('span', { class: 'err' }, m.message)); ui.setActions(...ui.errActions()); }
  else if (m.stage === 'code') {
    const code = h('input', { class: 'in', placeholder: 'Steam Guard code', maxlength: '8' });
    ui.status.replaceChildren(h('div', {}, m.message), code);
    ui.setActions(ui.cancel, h('button', { class: 'btn red', onclick: () => window.api.loginCode(code.value.trim()) }, 'Confirm'));
    code.focus();
  } else if (m.stage === 'done') { view = m.id; closeModal(); toast('Account added', 'ok'); }
});

let closeT = null;
function showModal(el) { clearTimeout(closeT); const m = $('#modal'); m.classList.remove('closing'); m.replaceChildren(el); m.classList.remove('hidden'); }
function closeModal() {
  const m = $('#modal'); window._loginUI = null;
  if (m.classList.contains('hidden') || m.classList.contains('closing')) return;
  m.classList.add('closing');
  clearTimeout(closeT);
  closeT = setTimeout(() => { m.classList.add('hidden'); m.classList.remove('closing'); m.replaceChildren(); }, 190);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
$('#modal').addEventListener('mousedown', (e) => { if (e.target === $('#modal') && !window._loginUI) closeModal(); });

$('#startAll').onclick = () => window.api.startAll();
$('#stopAll').onclick = () => window.api.stopAll();
const rotationButton = $('#rotationToggle');
function paintRotationToggle() {
  if (!rotationButton) return;
  rotationButton.classList.toggle('on', gameRotationOn);
  const label = `Rotate games: ${gameRotationOn ? 'On' : 'Off'}`;
  rotationButton.textContent = window.WellaI18n ? window.WellaI18n.t(label) : label;
  rotationButton.title = gameRotationOn ? 'Games rotate every 10 minutes. Click to turn off.' : 'Rotate through owned games every 10 minutes. Off by default when the app opens.';
}
if (rotationButton) rotationButton.onclick = async () => {
  rotationButton.disabled = true;
  try { const r = await window.api.setGameRotation(!gameRotationOn); gameRotationOn = !!(r && r.enabled); paintRotationToggle(); }
  catch (e) { toast(e.message || 'Could not change game rotation.', 'bad'); }
  finally { rotationButton.disabled = false; }
};
window.api.getGameRotation().then((r) => { gameRotationOn = !!(r && r.enabled); paintRotationToggle(); }).catch(() => paintRotationToggle());
window.api.onState((s) => { const n = accounts.length; accounts = s; render(); if (s.length !== n) refreshBans(); });
// once a second only the timers arrive (small message); the full state is sent only when something changes
(window.api.onTick || (() => {}))((list) => {
  for (const x of list) { const a = accounts.find((y) => y.id === x.id); if (a) { a.sessionSeconds = x.s; a.totalSeconds = x.t; a.gameSeconds = x.g; } }
  tick();
});
(async () => { // the colours are stored on the PC, so the phone and the desktop always match
  try { const t = await window.api.getTheme(); if (t) window.WellaTheme.load(t); else window.api.setTheme(window.WellaTheme.get()); } catch {}
})();
(window.api.onTheme || (() => {}))((t) => window.WellaTheme.load(t));
(async () => { accounts = await window.api.list(); $('#fVer').textContent = await window.api.version(); render(); splashReady(); refreshBans(); if (window.__WELLA_WEB) refreshInstalledApps(true); })();
if (window.__WELLA_WEB) setInterval(() => refreshInstalledApps(true), 5 * 60 * 1000);

// ================= tabs + Achievement Manager =================
let tab = 'boost', gamesAll = [], curGame = null, ach = [], achAcc = null;
const checked = new Set();
let bulkRunning = false, achSource = '';
const missInfo = new Map();      // appid -> { done, total } for the games found with missing achievements
let finding = false;

function moveInd() {
  const act = document.querySelector('.tab.active'), ind = document.querySelector('.tabs .ind');
  if (!act || !ind) return;
  ind.style.left = act.offsetLeft + 'px'; ind.style.width = act.offsetWidth + 'px';
}
window.addEventListener('resize', moveInd);
window.addEventListener('load', () => { moveInd(); setTimeout(moveInd, 120); });
const TAB_ORDER = ['ach', 'boost', 'free', 'util', 'fps', 'pcmon', 'remote'];                       // left to right
function setTab(t) {
  if (t === tab) return;
  const el = (x) => (x === 'boost' ? $('#viewBoost') : x === 'free' ? $('#viewFree') : x === 'pcmon' ? $('#viewPc') : x === 'fps' ? $('#viewFps') : x === 'util' ? $('#viewUtil') : x === 'remote' ? $('#viewRemote') : $('#viewAch'));
  const from = el(tab), to = el(t);
  const dir = TAB_ORDER.indexOf(t) < TAB_ORDER.indexOf(tab) ? 1 : -1; // moving to a tab on the left slides the content to the right
  from.style.setProperty('--lx', dir * 46 + 'px'); to.style.setProperty('--ex', -dir * 56 + 'px');
  const ind = document.querySelector('.tabs .ind'); ind.classList.remove('go'); void ind.offsetWidth; ind.classList.add('go');
  beamGo();
  tab = t;
  window.api.presenceTab(t);
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  moveInd();
  from.classList.add('leaving');
  setTimeout(() => {
    from.classList.add('hidden'); from.classList.remove('leaving');
    to.classList.remove('hidden', 'enter'); void to.offsetWidth; to.classList.add('enter');
    if (t === 'ach') loadAchGames();
    else if (t === 'util') { window.api.achClose(); curGame = null; drawUtilPage(); }
    else if (t === 'free') { window.api.achClose(); curGame = null; window.FreeGames && window.FreeGames.show(); }
    else if (t === 'remote') { window.api.achClose(); curGame = null; window.RemotePC && window.RemotePC.show(); }
    else { window.api.achClose(); curGame = null; animateNext = true; lastCardSig = ''; render(); if ((t === 'pcmon' || t === 'fps') && window.WellaMon) window.WellaMon.show(); }
  }, 170);
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
if (window.__WELLA_WEB) $('#tabRemote').classList.remove('hidden');

async function loadAchGames() {
  const accs = await window.api.achAccounts();
  const sel = $('#aAcc'); sel.replaceChildren(...accs.map((a) => h('option', { value: a.id }, `${a.name} (${a.count} games)`)));
  if (!accs.length) {
    gamesAll = []; drawGameList();
    $('#aMain').replaceChildren(h('div', { class: 'empty' }, 'Add an account in Hour Booster first. Its games will show up here.'));
    return;
  }
  if (!achAcc || !accs.find((a) => a.id === achAcc)) achAcc = accs[0].id;
  sel.value = achAcc;
  await loadAccGames();
}
async function checkMethod() {
  const el = $('#aMethod'); if (!el) return;
  if (!achAcc) { el.textContent = ''; return; }
  try { const m = await window.api.achMethod(achAcc); el.textContent = m.text; el.className = 'mnote ' + (m.ready ? 'ok' : 'warn'); }
  catch { el.textContent = ''; }
}
$('#aMethod').addEventListener('click', checkMethod);
window.addEventListener('focus', () => { if (tab === 'ach' && !bulkRunning) checkMethod(); });
// While the Achievement Manager tab is open: keep watching the Steam app, and start it if it is not running.
let steamWatchBusy = false;
setInterval(async () => {
  if (tab !== 'ach' || !achAcc || steamWatchBusy || document.hidden) return;
  steamWatchBusy = true;
  try {
    if (!bulkRunning && !finding) {
      const r = await window.api.achEnsureSteam(achAcc);
      if (r && r.status === 'failed' && r.error) toast(r.error, 'bad');
      else if (r && r.status === 'opened') toast('Steam opened. Log in with this account to unlock the Steam Achievement Manager way.', 'ok');
    }
    await checkMethod();
  } catch { /* ignore */ } finally { steamWatchBusy = false; }
}, 8000);
async function drawProfile() {
  const el = $('#aProf'); if (!el) return;
  const id = achAcc, a = accounts.find((x) => x.id === id);
  if (!a) { el.replaceChildren(); return; }
  const paint = (i) => {
    const av = a.avatar ? a.avatar.replace(/["\\()]/g, '') : '';
    const chips = [];
    if (i && i.level != null) chips.push(h('span', { class: 'pchip lvl' }, 'Level ' + i.level));
    if (i && i.vacBanned) chips.push(h('span', { class: 'pchip bad' }, i.vacCount > 1 ? 'VAC \u00d7' + i.vacCount : 'VAC'));
    if (i && i.gameBans) chips.push(h('span', { class: 'pchip bad' }, i.gameBans > 1 ? 'Game ban \u00d7' + i.gameBans : 'Game ban'));
    if (i && i.communityBanned) chips.push(h('span', { class: 'pchip bad' }, 'Community ban'));
    if (i && i.limited) chips.push(h('span', { class: 'pchip bad' }, 'Limited'));
    if (i && i.memberSince) chips.push(h('span', { class: 'pchip' }, 'Since ' + (/\d{4}/.exec(i.memberSince) || [i.memberSince])[0]));
    const stat = (k, v) => h('div', {}, h('b', {}, v == null || v === '' ? '—' : String(v)), h('small', {}, k));
    const done = i && i.ach && i.ach.total ? `${i.ach.done}/${i.ach.total}` : null;
    const pc = i && i.ach && i.ach.total ? Math.round(i.ach.done / i.ach.total * 100) : null;
    const bad = !!(i && (i.vacBanned || i.gameBans || i.communityBanned));
    el.classList.toggle('banned', bad);
    el.replaceChildren(
      av ? h('i', { class: 'pbg', style: `background-image:url("${av}")` }) : null,
      h('div', { class: 'prow' },
        a.avatar ? h('img', { class: 'pav', src: a.avatar, draggable: 'false' }) : h('div', { class: 'pav' }),
        h('div', { class: 'pwho' }, h('b', {}, a.personaName || a.accountName), h('small', {}, a.accountName))),
      chips.length ? h('div', { class: 'pchips' }, chips) : null,
      h('div', { class: 'pstats' }, stat('Games', i ? i.games : (a.games || []).length), done ? stat('Achievements', done) : null, i && i.ach && i.ach.perfect ? stat('100% games', i.ach.perfect) : null),
      pc != null ? h('div', { class: 'pbar', title: pc + '% of scanned achievements unlocked' }, h('i', { style: `width:${pc}%` })) : null);
  };
  paint(null);
  try { const i = await window.api.accountInfo(id); if (i && !i.error && achAcc === id) paint(i); } catch {}
}
async function loadAccGames() {
  drawProfile();
  checkMethod();
  gamesAll = await window.api.achGames(achAcc);
  checked.clear(); missInfo.clear(); findCarry = null; $('#gFind').textContent = ''; { const rb = $('#gResume'); if (rb) rb.classList.add('hidden'); } curGame = null; drawGameList(true);
  const bp = bulkPanel;
  if (bp && bp.accId === achAcc) {                                  // an unlock run is going (or just finished while you were away): show its status and game list again
    $('#aMain').replaceChildren(bp.head, bp.rows);
    if (bp.finished) bulkPanel = null;                              // finished: shown once, then it goes away
  } else $('#aMain').replaceChildren(h('div', { class: 'empty' }, 'Pick a game on the left. Achievements are changed through the account\'s own login, so the Steam app does not need to be open.'));
}
let bulkPanel = null;                                               // { accId, head, rows, finished }
$('#aAcc').addEventListener('change', (e) => { achAcc = e.target.value; window.api.achClose(); loadAccGames(); });

function drawGameList(anim) {
  const q = $('#gSearch').value.toLowerCase();
  const l = $('#gList'); l.replaceChildren(); l.classList.toggle('anim', !!anim);
  let gj = 0;
  for (const g of (window.WellaExtra ? window.WellaExtra.visible(gamesAll) : gamesAll).filter((x) => x.name.toLowerCase().includes(q))) {
    l.append(h('div', { class: 'gi' + (curGame && curGame.appid === g.appid ? ' active' : ''), style: `--j:${Math.min(gj++, 14)}`, onclick: () => openAchGame(g) },
      h('input', { type: 'checkbox', checked: checked.has(g.appid) ? 'checked' : null, onclick: (e) => e.stopPropagation(),
        onchange: (e) => { e.target.checked ? checked.add(g.appid) : checked.delete(g.appid); updateBulk(); } }),
      gameImg(g), h('span', {}, g.name), window.WellaExtra ? window.WellaExtra.hideBtn(g, () => drawGameList(false)) : null, missInfo.has(g.appid) ? h('small', { class: 'gmiss', title: 'unlocked / total achievements' }, `${missInfo.get(g.appid).done}/${missInfo.get(g.appid).total}`) : null));
  }
  updateBulk();
}
function updateBulk() {
  const b = $('#gBulk'); b.disabled = bulkRunning || finding || !checked.size; const mb = $('#gMissing'); if (mb && !finding) mb.disabled = bulkRunning;
  b.textContent = checked.size ? `Unlock all achievements (${checked.size} game${checked.size > 1 ? 's' : ''})` : 'Unlock all achievements';
}
$('#gSearch').addEventListener('input', drawGameList);
$('#gAll').addEventListener('click', () => {
  const q = $('#gSearch').value.toLowerCase();
  for (const g of gamesAll.filter((x) => x.name.toLowerCase().includes(q))) checked.add(g.appid);
  drawGameList();
});
$('#gNone').addEventListener('click', () => { checked.clear(); drawGameList(); });

const MISS_LABEL = 'Select games with missing achievements';
let findCarry = null;                                   // what earlier (stopped / partly failed) searches found: { missing: Map, complete, none, pending: [], failedIds: [] }
const showResume = () => { const r = $('#gResume'); if (!r) return; const n = findCarry ? findCarry.pending.length + findCarry.failedIds.length : 0; r.classList.toggle('hidden', !n); r.textContent = n ? `Resume search (${n} left)` : 'Resume search'; r.disabled = finding || bulkRunning; };
async function runFind(resume) {
  const b = $('#gMissing'), note = $('#gFind');
  if (bulkRunning || !achAcc || finding) return;
  const prev = resume && findCarry ? findCarry : null;
  const ids = prev ? [...prev.pending, ...prev.failedIds] : null;
  if (!prev) { findCarry = null; missInfo.clear(); }
  finding = true; showResume(); b.textContent = 'Stop (0/' + (ids ? ids.length : gamesAll.length) + ')'; note.className = 'fnote'; note.textContent = 'Reading the games, nothing is started or changed…';
  let r; try { r = await window.api.achFindMissing(ids ? { accountId: achAcc, appids: ids } : { accountId: achAcc }); } catch (e) { r = { error: e.message || String(e) }; }
  finding = false; b.disabled = false; b.textContent = MISS_LABEL;
  if (r.error) { note.className = 'fnote err'; note.textContent = r.error; showResume(); return; }
  const miss = new Map(prev ? prev.missing : []);
  for (const m of r.missing) miss.set(m.appid, m);
  findCarry = { missing: miss, complete: (prev ? prev.complete : 0) + r.complete, none: (prev ? prev.none : 0) + r.none, pending: r.pending || [], failedIds: r.failedIds || [] };
  missInfo.clear(); for (const [id, m] of miss) missInfo.set(id, m);
  checked.clear(); for (const id of miss.keys()) checked.add(id);
  drawGameList(); showResume();
  const all = [...miss.values()], left = all.reduce((n, m) => n + (m.total - m.done), 0), failed = findCarry.failedIds.length;
  const parts = [`${all.length} game${all.length === 1 ? '' : 's'} with ${left} missing achievement${left === 1 ? '' : 's'} (ticked)`, `${findCarry.complete} complete`, findCarry.none ? `${findCarry.none} without achievements` : '', failed ? `${failed} could not be read` : '', findCarry.pending.length ? `${findCarry.pending.length} not read yet` : ''].filter(Boolean);
  note.className = 'fnote' + (failed ? ' warn' : '');
  note.textContent = (r.stopped ? 'Stopped. ' : '') + parts.join(' · ') + '.' + (r.blocked ? ' Steam hides this profile’s game details (set Game details to Public).' : '') + (findCarry.pending.length || failed ? ' Press Resume search to continue.' : '');
  if (!all.length && !r.stopped && !failed) toast('Nothing missing: every game with achievements is complete.', 'ok');
}
$('#gMissing').addEventListener('click', () => { if (finding) { window.api.achFindCancel(); $('#gMissing').disabled = true; return; } runFind(false); });
$('#gResume').addEventListener('click', () => runFind(true));
$('#gBulk').addEventListener('click', async () => {
  const ids = gamesAll.filter((g) => checked.has(g.appid)).map((g) => g.appid);
  if (!ids.length || !confirm(`Unlock every achievement in ${ids.length} game${ids.length > 1 ? 's' : ''}?`)) return;
  bulkRunning = true; updateBulk(); curGame = null; drawGameList();
  const bar = h('i', { style: 'width:0%' }), line = h('small', {}, 'Connecting…'), rows = h('div', {});
  const cancel = h('button', { class: 'btn stop', onclick: () => window.api.achCancelBulk() }, 'Stop');
  const head = h('div', { class: 'ahead' }, h('div', {}, h('h2', {}, 'Unlocking achievements'), line, h('div', { class: 'bar' }, bar)), h('div', { class: 'btns' }, cancel));
  bulkPanel = { accId: achAcc, head, rows, finished: false };
  $('#aMain').replaceChildren(head, rows);
  const nameOf = (id) => (gamesAll.find((g) => g.appid === id) || {}).name || id;
  window._bulkUI = { bar, line, rows, nameOf };
  const res = await window.api.achBulk({ accountId: achAcc, appids: ids, value: true });
  bulkRunning = false; updateBulk(); cancel.remove(); window._bulkUI = null; checkMethod();
  const stillThere = () => tab === 'ach' && $('#aMain').contains(head);
  setTimeout(() => { if (bulkPanel && bulkPanel.head === head) { bulkPanel.finished = true; if (stillThere()) { /* you are looking at it: it stays until you pick something else */ bulkPanel = null; } } }, 0);
  if (res.error) { line.textContent = ''; rows.append(h('div', { class: 'empty err' }, res.error)); return; }
  const R = res.results, cnt = (f) => R.filter(f).length;
  const bits = [[cnt((r) => r.ok && !r.note), 'unlocked'], [cnt((r) => r.note === 'already complete'), 'already complete'], [cnt((r) => String(r.note || '').startsWith('no achievements')), 'without achievements'], [cnt((r) => !r.ok), 'failed']].filter((x) => x[0]);
  line.textContent = `Finished${R.length < ids.length ? ' (stopped early)' : ''}: ` + (bits.map((x) => `${x[0]} ${x[1]}`).join(' · ') || 'nothing to do') + '.';
  if (res.aborted) rows.prepend(h('div', { class: 'empty err' }, res.aborted));
});
window.api.onAchProgress((m) => {
  if (m.stage === 'find') { const b = $('#gMissing'); if (finding && b) { b.textContent = `Stop (${m.i}/${m.total})`; $('#gFind').textContent = `${m.i}/${m.total} read \u00b7 ${m.missing} with missing achievements`; } return; }
  const u = window._bulkUI; if (!u) { if (m.stage === 'note') { if (finding) { const f = $('#gFind'); if (f) f.textContent = m.note; } else toast(m.note, 'ok'); } return; }
  if (m.stage === 'note') u.line.textContent = m.note;
  else if (m.stage === 'working') u.line.textContent = `${m.i + 1}/${m.total} · ${u.nameOf(m.appid)}…`;
  else if (m.stage === 'done') {
    u.bar.style.width = (m.i / m.total * 100) + '%';
    const r = m.result;
    u.rows.append(h('div', { class: 'pgrow' }, h('span', {}, u.nameOf(m.appid)),
      r.ok ? h('small', { class: r.note ? '' : 'ok' }, r.note ? (r.total ? `${r.done}/${r.total} \u00b7 ${r.note}` : r.note) : `${r.done}/${r.total} unlocked` + (r.skipped ? ` (${r.skipped} could not be changed)` : '')) : h('small', { class: 'err' }, r.error)));
  }
});

async function openAchGame(g) {
  curGame = g; achQuery = ''; drawGameList();
  $('#aMain').replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spin' }), 'Connecting to Steam…'));
  const r = await window.api.achOpen({ accountId: achAcc, appid: g.appid });
  if (!curGame || curGame.appid !== g.appid) return;
  if (r.error) { $('#aMain').replaceChildren(h('div', { class: 'empty err' }, r.error, h('div', {}, diagBtn()))); return; }
  ach = r.achievements; achSource = r.source; drawAch(true);
  if (window.matchMedia('(max-width:820px)').matches) setTimeout(() => $('#aMain').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); // phone: jump to the achievements
}
function applyStates(states) { for (const a of ach) if (a.name in states) { if (states[a.name] && !a.unlocked) a._lit = true; a.unlocked = states[a.name]; } drawAch(); }
async function setAch(names, value, instant = false) {
  let r;
  try { r = await window.api.achSet({ accountId: achAcc, appid: curGame.appid, names, value, instant, all: ach.map((a) => a.name) }); }
  catch (e) { toast(String(e.message || e), 'bad'); return; }
  if (r.error) { toast(r.error, 'bad'); return; }
  applyStates(r.states);
  const n = names.length - (r.skipped || 0);
  toast(`${value ? 'Unlocked' : 'Locked'} ${n} achievement${n === 1 ? '' : 's'}` + (r.skipped ? `. ${r.skipped} could not be changed.` : '') + (r.method === 'steam' ? ' (through the Steam app)' : ''), 'ok');
}

let achFilter = 'all', achQuery = '';
const localCache = new Map();
async function localStatus(appid) {
  const c = localCache.get(appid);
  if (c && Date.now() - c.t < 15000) return c.v;
  let v = null; try { v = await window.api.gameLocal({ appid, action: 'status' }); } catch { v = null; }
  localCache.set(appid, { t: Date.now(), v }); return v;
}
async function runLocal(appid, action, confirmText) {
  if (confirmText && !confirm(confirmText)) return;
  try { const r = await window.api.gameLocal({ appid, action }); if (r && r.error) toast(r.error, 'bad'); else toast((r && r.message) || 'Done', 'ok'); }
  catch (e) { toast(e.message || String(e), 'bad'); }
  localCache.delete(appid);
}
function drawAch(anim) {
  const done = ach.filter((a) => a.unlocked).length;
  const main = $('#aMain'); const scroll = main.scrollTop; main.replaceChildren();
  const loc = h('span', { class: 'locbtns' });
  {                                                                 // The phone can launch installed games through the authenticated PC bridge.
    const appid = curGame.appid;
    localStatus(appid).then((li) => {
      if (!li || li.steamFound === false || !curGame || curGame.appid !== appid) return;
      loc.replaceChildren(...((li.installed && li.dirExists) ? [h('button', { class: 'btn ghost sm', onclick: () => runLocal(appid, 'launch') }, 'Launch')]
        : window.__WELLA_WEB ? [h('button', { class: 'btn ghost sm', disabled: 'disabled', title: 'Not installed on the PC' }, 'Launch')]
          : [h('button', { class: 'btn ghost sm', disabled: 'disabled', title: 'Not installed on this PC' }, 'Launch'),
             h('button', { class: 'btn ghost sm', title: 'Ask Steam to install this game', onclick: () => runLocal(appid, 'install') }, 'Install')]));
    });
  }
  main.append(h('div', { class: 'ahead' },
    gameImg(curGame),
    h('div', {}, h('h2', {}, curGame.name), h('small', {}, `${done} of ${ach.length} unlocked` + (achSource === 'web' ? ' \u00b7 read without starting the game' : '')),
      h('div', { class: 'bar' }, h('i', { style: `width:${ach.length ? (done / ach.length) * 100 : 0}%` }))),
    h('div', { class: 'btns' },
      h('button', { class: 'btn red', onclick: () => { if (confirm('Unlock all achievements for this game?')) setAch(ach.map((a) => a.name), true); } }, 'Unlock all'),
      h('button', { class: 'btn red', title: 'Sends all eligible achievements in one operation. Steam may still reject server-only achievements.', onclick: () => { if (confirm('Unlock all eligible achievements for this game in one fast operation? Steam may reject server-only achievements.')) setAch(ach.filter((a) => !a.unlocked).map((a) => a.name), true, true); } }, 'Unlock all instantly'),
      h('button', { class: 'btn stop', onclick: () => { if (confirm('Lock all achievements for this game?')) setAch(ach.map((a) => a.name), false); } }, 'Lock all'),
      loc, diagBtn())));
  const list = h('div', { class: 'alist' + (anim ? ' anim' : '') });
  const fillList = () => {
    list.replaceChildren();
    const q = achQuery.toLowerCase();
    let aj = 0;
    for (const a of ach) {
      if (achFilter === 'locked' && a.unlocked) continue;
      if (achFilter === 'done' && !a.unlocked) continue;
      if (q && !(a.displayName + ' ' + (a.description || '')).toLowerCase().includes(q)) continue;
      // two layers: the dim grey icon, and the colour icon on top that fades in (with a glow) when the achievement unlocks
      const lit = !!a._lit; delete a._lit;
      const ico = a.icon ? h('div', { class: 'aico' + (a.unlocked && !lit ? ' on' : '') },
        h('img', { class: 'g', src: a.iconGray || a.icon, loading: 'lazy' }), h('img', { class: 'c', src: a.icon, loading: 'lazy' })) : h('div', { class: 'ph' });
      if (lit) requestAnimationFrame(() => requestAnimationFrame(() => { ico.classList.add('on', 'lit'); }));
      list.append(h('div', { class: 'ai' + (a.unlocked ? ' done' : ''), style: `--j:${Math.min(aj++, 14)}` },
        ico,
        h('div', { class: 't' }, h('b', {}, a.displayName, a.protected ? h('span', { class: 'ptag', title: 'The game marks this achievement as server-only, Steam may refuse to change it from outside the game.' }, 'server-only') : null), h('small', {}, a.description || (a.hidden ? 'Hidden achievement' : a.name))),
        h('div', { class: 'pc' }, a.percent != null ? a.percent.toFixed(1) + '%' : ''),
        h('button', { class: 'btn sm ' + (a.unlocked ? 'stop' : 'start'), onclick: () => setAch([a.name], !a.unlocked) }, a.unlocked ? 'Lock' : 'Unlock')));
    }
    if (!list.children.length) list.append(h('div', { class: 'empty' }, ach.length ? 'No achievement matches.' : 'No achievements.'));
  };
  const chips = [['all', `All ${ach.length}`], ['locked', `Locked ${ach.length - done}`], ['done', `Unlocked ${done}`]];
  const chipEls = chips.map(([k, l]) => h('button', { class: 'chip' + (achFilter === k ? ' on' : ''), onclick: () => { achFilter = k; chipEls.forEach((c, i) => c.classList.toggle('on', chips[i][0] === k)); fillList(); } }, l));
  main.append(h('div', { class: 'atools' },
    h('input', { class: 'in', placeholder: 'Search achievements', value: achQuery, oninput: (e) => { achQuery = e.target.value; fillList(); } }),
    h('div', { class: 'chips' }, chipEls)));
  fillList();
  main.append(list); main.scrollTop = scroll;
}

// ================= settings =================
const PRESETS = ['#8b5cf6', '#e22045', '#ff7a1a', '#f5c518', '#2ecc71', '#14b8a6', '#3b82f6', '#ec4899'];
const START_PRESETS = ['#22c55e', '#2ecc71', '#14b8a6', '#3b82f6', '#a3e635', '#f5c518'];
const STOP_PRESETS = ['#ef4444', '#e22045', '#ff7a1a', '#ec4899', '#8b5cf6', '#f5c518'];
$('#gear').addEventListener('click', openSettings);
let settingsTab = 'general';
const toLocalInput = (ms) => ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
const DC_FIELDS = ['enabled', 'appId', 'name', 'details', 'state', 'showHours', 'startMode', 'customStart', 'hideIdle', 'largeKey', 'smallKey', 'smallText', 'btn1Label', 'btn1Url', 'btn2Label', 'btn2Url'];
const ico = (svg) => { const d = document.createElement('div'); d.innerHTML = svg; return d.firstChild; };
const ICON_GEAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
const ICON_DISCORD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5.5A16 16 0 0 0 16 4.2l-.5 1a14 14 0 0 0-7 0l-.5-1A16 16 0 0 0 4 5.5C1.5 9.300 .9 13 1.200 16.600a16 16 0 0 0 4.900 2.500l1.100-1.800a10 10 0 0 1-1.700-.8l.4-.3a11.500 11.500 0 0 0 11.200 0l.4.300a10 10 0 0 1-1.700.8l1.100 1.800a16 16 0 0 0 4.900-2.500C23.100 12.500 22 8.800 20 5.500z"/><circle cx="8.500" cy="12.500" r="1.300"/><circle cx="15.500" cy="12.500" r="1.300"/></svg>';

const ICON_UTIL = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>';
const ICON_PHONE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';

// ================= Utility tab (player stats, YouTube downloader, achievement timings) =================
const US = { sub: 'players', q: '', res: null, busy: false, keys: { faceit: false, leetify: false }, ytUrl: '', yt: null, fmt: 'mp4', height: 0, dir: '', run: false, last: '' };
if (window.api.onUtilProgress) window.api.onUtilProgress((m) => {
  const st = document.getElementById('ytStat'), bar = document.getElementById('ytBar');
  if (m.message && st) st.textContent = m.message;
  if (m.progress) {
    if (bar) bar.style.width = Math.min(100, m.progress.percent || 0) + '%';
    if (st) st.textContent = m.progress.phase || `${Math.round(m.progress.percent || 0)}%${m.progress.speed ? '  ·  ' + m.progress.speed : ''}${m.progress.eta ? '  ·  ETA ' + m.progress.eta : ''}`;
  }
});
const fmtDur = (s) => { s = Math.round(s || 0); const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60, p = (n) => String(n).padStart(2, '0'); return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`; };
const nz = (v, suf) => (v == null || v === '' || Number.isNaN(v)) ? '–' : v + (suf || '');
const money = (v, cur) => { try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur || 'USD' }).format(v); } catch { return Number(v).toFixed(2) + ' ' + (cur || ''); } };
const uRows = (title, items) => h('div', { class: 'ublk' }, h('b', {}, title), h('div', { class: 'ugrid' }, items.map(([k, v, c]) => h('div', {}, h('small', {}, k), h('span', { class: c || '' }, String(v))))));
// Everything the account window shows (profile, library, value, bans, most played), for ANY public profile: used by the player checker.
function accountBlocks(a) {
  if (!a) return [];
  if (a.error) return [h('small', { class: 'unote bad' }, 'Steam details: ' + a.error)];
  const D = '\u2014', num = (v) => (v == null ? D : Number(v).toLocaleString(uiLocale())), cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : D);
  const c = a.counts || {}, v = a.value, out = [];
  const prof = [['Level', a.level != null ? a.level : D], ['Member since', a.memberSince || D], ['Status', cap(a.status)], ['Profile', cap(a.privacy)],
    ['Friends', num(c.Friends)], ['Groups', num(c.Groups)], ['Badges', num(c.Badges)], ['Screenshots', num(c.Screenshots)]];
  if (c.Inventory != null) prof.push(['Inventory items', num(c.Inventory)]);
  if (a.location) prof.push(['Location', a.location]);
  if (a.realName) prof.push(['Real name', a.realName]);
  out.push(uRows('Steam profile', prof));
  const lib = [['Games', a.games != null ? num(a.games) : D], ['Never played', a.neverPlayed != null ? num(a.neverPlayed) : D],
    ['Playtime (all games)', a.hoursTotal != null ? Math.round(a.hoursTotal).toLocaleString(uiLocale()) + ' h' : D], ['Last 2 weeks', a.hours2w != null ? a.hours2w.toFixed(1) + ' h' : D]];
  if (v) lib.push(['Library value', money(v.value, v.currency)], ['Cost per hour', v.perHour != null ? money(v.perHour, v.currency) : D], ['Games with a price', num(v.priced)]);
  out.push(uRows('Library & hours', lib));
  if (v && v.partial) out.push(h('small', { class: 'unote' }, 'Some store prices could not be read, so the library value is incomplete.'));
  if (v && v.top && v.top.length) out.push(h('div', { class: 'ublk' }, h('b', {}, 'Most expensive games'), v.top.map((g) => h('div', { class: 'itop' }, h('span', {}, g.name || ('App ' + g.appid)), h('b', {}, money(g.price, v.currency) + (g.hours != null ? ' \u00b7 ' + Math.round(g.hours).toLocaleString(uiLocale()) + ' h' : ''))))));
  if (a.topGames && a.topGames.length) out.push(h('div', { class: 'ublk' }, h('b', {}, 'Most played'), a.topGames.map((g) => h('div', { class: 'itop' }, h('span', {}, g.name), h('b', {}, Math.round(g.hours).toLocaleString(uiLocale()) + ' h')))));
  const tb = !a.tradeBan || /none/i.test(a.tradeBan);
  out.push(uRows('Account health', [['VAC ban', a.vacBanned ? (a.vacCount > 1 ? a.vacCount + ' on record' : 'Yes') : 'None', a.vacBanned ? 'bad' : 'good'],
    ['Game ban', a.gameBans ? (a.gameBans > 1 ? a.gameBans + ' on record' : 'Yes') : 'None', a.gameBans ? 'bad' : 'good'],
    ...((a.vacBanned || a.gameBans) && a.daysSinceBan != null ? [['Since last ban', a.daysSinceBan + ' day' + (a.daysSinceBan === 1 ? '' : 's')]] : []),
    ...(a.communityBanned ? [['Community ban', 'Yes', 'bad']] : []),
    ['Trade ban', tb ? 'None' : a.tradeBan, tb ? 'good' : 'bad'], ['Limited account', a.limited ? 'Yes' : 'No', a.limited ? 'bad' : 'good']]));
  (a.notes || []).forEach((n) => out.push(h('small', { class: 'unote' }, n)));
  return out;
}
// opts.compact = only the verdict, ranks, FACEIT and Leetify (the account window already shows the Steam details itself)
function playerCard(r, opts) {
  opts = opts || {};
  const rows = uRows;
  const where = opts.compact ? 'in the Utility tab' : 'below';      // the key boxes live in the Utility tab; the Utility page shows them under the result
  const kids = [];
  const V = { banned: ['BANNED', 'bad'], suspicious: ['SUSPICIOUS' + (r.flags.length > 2 ? ' (' + r.flags.length + ' signals)' : ''), 'bad'], clean: ['Nothing flagged', 'ok'], unknown: ['Not enough data', 'mid'] }[r.verdict] || ['', 'mid'];
  kids.push(h('div', { class: 'uhead' },
    r.avatar ? h('img', { src: r.avatar, alt: '', draggable: 'false' }) : null,
    h('div', {}, h('b', {}, r.name || 'Unknown player'), h('small', {}, r.steamId ? 'SteamID64 ' + r.steamId : '')),
    h('span', { class: 'utag ' + V[1] }, V[0])));
  if (r.flags.length) kids.push(h('ul', { class: 'uflags' }, r.flags.map((f) => h('li', {}, f.text))));
  const l = r.leetify;
  // ranks first: CS Rating (Premier), Wingman, best Competitive map
  if (l && l.found && (l.premier != null || l.wingman != null || l.bestComp)) {
    kids.push(h('div', { class: 'uranks' },
      l.premier != null ? h('div', { class: 'rk prem', style: `--c:${l.premierTier.color}` }, h('small', {}, 'CS Rating (Premier)'), h('b', {}, l.premier.toLocaleString(uiLocale())), h('i', {}, l.premierTier.name)) : null,
      l.wingman != null ? h('div', { class: 'rk' }, h('small', {}, 'Wingman'), h('b', {}, l.wingmanName || ('Rank ' + l.wingman))) : null,
      l.bestComp ? h('div', { class: 'rk' }, h('small', {}, 'Competitive (best: ' + l.bestComp.map + ')'), h('b', {}, l.bestComp.name || ('Rank ' + l.bestComp.rank))) : null));
    if (l.competitive.length > 1) kids.push(h('div', { class: 'umaps' }, l.competitive.map((c) => h('span', {}, c.map + ': ' + (c.name || c.rank)))));
  }
  if (r.trust) {
    const T = r.trust, col = { high: '#3ddc84', medium: '#f5b942', low: '#ff4d4d' }[T.tier];
    kids.push(h('div', { class: 'utrust', style: `--c:${col}` },
      h('div', { class: 'thead' }, h('small', {}, 'CS2 Trust Factor (estimat)'), h('b', {}, T.pct + '% trusted'), h('i', {}, { high: 'High', medium: 'Medium', low: 'Low' }[T.tier])),
      h('div', { class: 'tbar' }, h('span', { style: `width:${T.pct}%` })),
      h('details', {}, h('summary', {}, 'Why this value'), h('ul', { class: 'uflags' }, T.reasons.map((x) => h('li', {}, x)))),
      h('small', { class: 'unote' }, 'Valve does not publish the real Trust Factor. This is an estimate from public data (hours, age, level, bans, rank).')));
  }
  if (r.account && !opts.compact) accountBlocks(r.account).forEach((n) => kids.push(n));
  else if (r.steam && !opts.compact) kids.push(rows('Steam', [['Member since', nz(r.steam.memberSince)], ['Profile', nz(r.steam.privacy)], ['VAC ban', r.steam.vacBanned ? 'Yes' : 'No'], ['Trade ban', r.steam.tradeBan ? 'Yes' : 'No'], ['Limited', r.steam.limited ? 'Yes' : 'No']]));
  const f = r.faceit;
  if (f && f.needsKey) kids.push(h('small', { class: 'unote' }, `Add a FACEIT API key ${where} to see level, ELO and FACEIT bans.`));
  else if (f && f.error) kids.push(h('small', { class: 'unote bad' }, 'FACEIT: ' + f.error));
  else if (f && f.found === false) kids.push(h('small', { class: 'unote' }, 'No FACEIT account linked to this Steam id.'));
  else if (f && f.found) kids.push(rows('FACEIT' + (f.nickname ? ' \u00b7 ' + f.nickname : ''), [['Level', nz(f.level)], ['ELO', nz(f.elo)], ['K/D', nz(f.kd)], ['Headshots', nz(f.hs, '%')], ['Win rate', nz(f.winRate, '%')], ['Matches', nz(f.matches)], ['Banned', f.banned ? 'Yes' : 'No']]));
  if (l && l.needsKey) kids.push(h('small', { class: 'unote' }, `Add a Leetify API key ${where} to see CS Rating, Wingman rank, aim and reaction time.`));
  else if (l && l.error) kids.push(h('small', { class: 'unote bad' }, 'Leetify: ' + l.error));
  else if (l && l.found === false) kids.push(h('small', { class: 'unote' }, 'No Leetify profile for this player.'));
  else if (l && l.found) kids.push(rows('Leetify', [['Leetify rating', nz(l.leetifyRating)], ['Aim', nz(l.aim)], ['Positioning', nz(l.positioning)], ['Utility', nz(l.utility)], ['Reaction', nz(l.reactionMs != null ? Math.round(l.reactionMs) : null, ' ms')],
    ['Headshot acc.', nz(l.hs, '%')], ['Accuracy (spotted)', nz(l.accSpotted, '%')], ['Spray acc.', nz(l.spray, '%')], ['Win rate', nz(l.winRate, '%')], ['Matches', nz(l.matches)]]));
  (r.notes || []).forEach((n) => kids.push(h('small', { class: 'unote' }, opts.compact ? n.replace(/ below\b/, ' in the Utility tab') : n)));
  kids.push(h('small', { class: 'unote' }, 'Red means banned or numbers far outside normal. Statistics are a hint, not proof: they cannot see players who only use wallhacks.'));
  return h('div', { class: 'ucard' + (r.suspect ? ' sus' : '') }, kids);
}
function utilityTab(redraw) {
  const muted = 'color:var(--mut)';
  const out = h('div', { class: 'uout' });
  const paintOut = () => { out.replaceChildren(...(US.busy ? [h('div', {}, h('span', { class: 'spin' }), 'Looking up...')] : US.res ? [playerCard(US.res)] : [])); };
  const q = h('input', { class: 'in', placeholder: 'steamcommunity.com/id/..., faceit.com/en/players/..., leetify link, SteamID64', value: US.q });
  q.addEventListener('input', () => { US.q = q.value; });
  const doLookup = async () => {
    US.q = q.value.trim(); if (!US.q) return;
    US.busy = true; US.res = null; paintOut();
    try { const r = await window.api.utilLookup(US.q); if (r.error) { toast(r.error, 'bad'); US.res = null; } else US.res = r; }
    catch (e) { toast(e.message, 'bad'); }
    US.busy = false; paintOut();
  };
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLookup(); });
  const keyBox = (name, label, hint) => {
    // Daca cheia e deja salvata, nu mai aratam inputul — e in General cu buton Remove
    if (US.keys[name]) return null;
    const inp = h('input', { class: 'in', type: 'password', placeholder: 'Pune cheia ' + label + ' API' });
    const msg = h('small', { style: 'color:var(--red);min-height:16px' });
    const saveBtn = h('button', { class: 'btn red sm', onclick: async () => {
      const v = inp.value.trim();
      if (!v) { msg.textContent = 'Introdu cheia mai intai.'; return; }
      saveBtn.disabled = true; saveBtn.textContent = 'Validez...'; msg.textContent = '';
      try {
        const vr = await window.api.utilKeysValidate({ name, key: v });
        if (!vr.valid) { msg.textContent = vr.error || 'Cheie invalida.'; saveBtn.disabled = false; saveBtn.textContent = 'Save'; return; }
        US.keys = await window.api.utilKeysSet({ [name]: v });
        inp.value = ''; toast(label + ' key salvata si valida', 'ok');
        redraw();
      } catch (e) { msg.textContent = e.message || 'Eroare.'; saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    } }, 'Save');
    return h('div', { class: 'setrow' }, h('b', {}, label + ' API key'),
      h('div', { class: 'lk' }, inp, saveBtn),
      msg,
      h('small', { style: muted }, hint));
  };

  // ---- YouTube ----
  const yt = h('div', { class: 'yt' });
  const web = !!window.__WELLA_WEB;
  const paintYt = () => {
    const kids = [];
    const url = h('input', { class: 'in', placeholder: 'https://www.youtube.com/watch?v=...', value: US.ytUrl });
    url.addEventListener('input', () => { US.ytUrl = url.value; });
    const analyze = async (btn) => {
      US.ytUrl = url.value.trim(); if (!US.ytUrl || US.checking) return;
      US.checking = true; btn.disabled = true; btn.textContent = 'Checking...'; US.yt = null; US.last = '';
      try {
        const r = await window.api.ytProbe(US.ytUrl);
        if (r.error) { US.err = r.error; toast(r.error, 'bad'); }
        else { US.err = ''; US.yt = r; const hs = r.heights; US.height = hs.find((x) => x <= 1080) || hs[hs.length - 1] || 0; }
      } catch (e) { toast(e.message, 'bad'); }
      US.checking = false; paintYt();
    };
    url.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !US.run) analyze(e.target.nextSibling || e.target); });
    kids.push(h('div', { class: 'lk' }, url, h('button', { class: 'btn red sm', onclick: (e) => analyze(e.currentTarget), disabled: US.run ? 'disabled' : null }, 'Check link')));
    // where the files go: always visible (not only after "Check link"), with a folder picker and a button that opens it
    kids.push(h('div', { class: 'setrow' }, h('b', {}, 'Save to'),
      h('div', { class: 'lk' }, h('input', { class: 'in', readonly: 'readonly', value: US.dir || '', title: US.dir || '' }),
        h('button', { class: 'btn ghost sm', disabled: US.run ? 'disabled' : null, onclick: async () => { const r = await window.api.ytFolder(); if (r && r.error) toast(r.error, 'bad'); else if (r && r.dir) { US.dir = r.dir; paintYt(); toast('Videos will be saved to ' + r.dir); } } }, 'Choose folder'),
        h('button', { class: 'btn ghost sm', onclick: () => window.api.ytShow('') }, 'Open'))));
    if (US.yt) {
      const v = US.yt;
      kids.push(h('div', { class: 'yinfo' }, v.thumbnail ? h('img', { src: v.thumbnail, alt: '', draggable: 'false' }) : null,
        h('div', {}, h('b', {}, v.title), h('small', {}, [v.channel, v.seconds ? fmtDur(v.seconds) : ''].filter(Boolean).join(' · ')))));
      const sel = h('select', { class: 'in', onchange: (e) => { US.height = parseInt(e.target.value, 10); } },
        (v.heights.length ? v.heights : [1080, 720, 480, 360]).map((x) => h('option', { value: String(x), selected: x === US.height ? 'selected' : null }, x + 'p')));
      kids.push(h('div', { class: 'setrow' }, h('b', {}, 'Resolution (MP4)'), sel));
    }
    // two direct buttons: no need to press "Check link" first (it only adds the title and the resolution list)
    const go = async (fmt) => {
      US.ytUrl = url.value.trim(); if (!US.ytUrl) { toast('Paste a YouTube link first', 'bad'); return; }
      US.fmt = fmt; US.run = true; US.last = ''; US.err = ''; paintYt();
      try {
        const r = await window.api.ytDownload({ url: US.ytUrl, format: fmt, height: US.height || 1080 });
        if (r.error) { if (r.error !== 'Cancelled.') { US.err = r.error; toast(r.error, 'bad'); } }
        else { US.last = r.file || ' '; toast('Download finished'); }
      } catch (e) { US.err = e.message; toast(e.message, 'bad'); }
      US.run = false; paintYt();
    };
    kids.push(h('div', { class: 'sbtns' },
      h('button', { class: 'btn start', disabled: US.run ? 'disabled' : null, onclick: () => go('mp4') }, US.run && US.fmt === 'mp4' ? 'Downloading...' : 'Download MP4'),
      h('button', { class: 'btn start', disabled: US.run ? 'disabled' : null, onclick: () => go('mp3') }, US.run && US.fmt === 'mp3' ? 'Downloading...' : 'Download MP3'),
      US.run ? h('button', { class: 'btn stop', onclick: () => window.api.ytCancel() }, 'Cancel') : null,
      US.last ? h('button', { class: 'btn ghost', onclick: () => window.api.ytShow(US.last.trim()) }, 'Show in folder') : null));
    kids.push(h('div', { class: 'ybar' + (US.run ? ' on' : '') }, h('i', { id: 'ytBar' })), h('small', { id: 'ytStat', style: muted }, US.run ? 'Starting...' : ''));
    if (US.err) kids.push(h('div', { class: 'unote bad' }, US.err),
      h('button', { class: 'btn ghost sm', onclick: async () => { try { await navigator.clipboard.writeText(await window.api.ytLog()); toast('Log copied'); } catch (e) { toast('Could not copy: ' + e.message, 'bad'); } } }, 'Copy log (send it to me)'));
    yt.replaceChildren(...kids);
  };
  if (!web) { window.api.ytState().then((s) => { US.dir = s.dir || ''; paintYt(); }).catch(() => {}); paintYt(); }

  // ---- Achievement Manager timings ----
  const pace = h('div', { class: 'pace' });
  const paintPace = async () => {
    let r; try { r = await window.api.achPaceGet(); } catch { pace.replaceChildren(h('small', { style: muted }, 'Could not load the timings.')); return; }
    const ins = {};
    const num = (key) => { const i = h('input', { class: 'in', type: 'number', min: '0.00000000000000001', max: '99999999999999', step: 'any', value: String(r.values[key]), style: 'width:120px;text-align:center' }); ins[key] = i; return i; };
    const row = (label, k, unit, step) => h('div', { class: 'setrow' }, h('b', {}, label),
      h('div', { class: 'lk' }, num(k + 'Min'), h('small', {}, 'to'), num(k + 'Max'), h('small', {}, unit)));
    const read = () => { const o = {}; for (const k in ins) o[k] = ins[k].value; return o; };
    const cap = h('input', { class: 'in', type: 'number', min: '1', max: '99999999999999', step: 'any', value: String(r.values.hourlyCap), style: 'width:120px;text-align:center' }); ins.hourlyCap = cap;
    pace.replaceChildren(
      h('small', { style: muted }, 'How slowly the Achievement Manager unlocks. Each pause is a random time between the two numbers, so it never looks like a bot. Any value from 0.00000000000000001 up to 99999999999999 is accepted (maximum per hour: 1 to 99999999999999). Lower numbers = faster but riskier for the account. Reset puts back the safe, fast defaults.'),
      row('Between two achievements', 'achGap', 'seconds', 0.5),
      row('Achievements in a row before a rest', 'burst', 'achievements', 1),
      row('Rest after each burst', 'rest', 'seconds', 5),
      row('Between two games (Unlock all)', 'gameGap', 'seconds', 1),
      h('div', { class: 'setrow' }, h('b', {}, 'Maximum per hour'), h('div', { class: 'lk' }, cap, h('small', {}, 'achievements'))),
      h('div', { class: 'lk' },
        h('button', { class: 'btn red sm', onclick: async () => { try { await window.api.achPaceSet(read()); toast('Timings saved', 'ok'); } catch (e) { toast(e.message || String(e), 'bad'); } paintPace(); } }, 'Save timings'),
        h('button', { class: 'btn ghost sm', onclick: async () => { try { await window.api.achPaceReset(); toast('Back to the safe default timings', 'ok'); } catch (e) { toast(e.message || String(e), 'bad'); } paintPace(); } }, 'Reset to default')));
  };
  paintPace();

  paintOut();
  const SUBS = [['players', 'Player stats'], ['compare', 'Profile Compare'], ['inv', 'Inventory'], ['health', 'Account Health'], ['pass', 'Password Generator'], ['speed', 'Speed Test'], ['pcmp', 'Compare players'], ['hist', 'Rank history'], ['badge', 'Badges'], ['sale', 'Steam sales'], ['daily', 'Daily report'], ['pchealth', 'PC health'], ['hook', 'Webhook'], ['yt', 'YouTube'], ['pace', 'Timings']];
  if (!SUBS.some((s) => s[0] === US.sub)) US.sub = 'players';
  const T = window.WellaTools || {};
  const body = {
    players: () => [
    h('b', {}, 'Player stats (CS2 / FACEIT)'),
    h('small', { style: muted }, 'Paste a profile link and see level, ELO, rank, K/D and bans. The card turns red when the account is banned or the numbers look unusually strong.'),
    h('div', { class: 'lk' }, q, h('button', { class: 'btn red sm', onclick: doLookup }, 'Look up')),
    out,
    keyBox('faceit', 'FACEIT', 'Free key: developers.faceit.com (create an app, copy the server-side API key). Needed for FACEIT level, ELO and bans.'),
    keyBox('leetify', 'Leetify', 'Free key from your Leetify account (leetify.com/app/developer). Needed for Premier rating, aim and reaction time.')
    ],
    pcmp: () => window.WellaExtra.comparePlayers(), hist: () => window.WellaExtra.rankHistory(), badge: () => window.WellaExtra.badges(), sale: () => window.WellaExtra.sales(), daily: () => window.WellaExtra.daily(), pchealth: () => window.WellaExtra.pcHealth(),
    compare: () => (T.compare ? T.compare() : []),
    inv: () => (T.inventory ? T.inventory() : []),
    health: () => (T.health ? T.health() : []),
    pass: () => (T.password ? T.password() : []),
    speed: () => (T.speed ? T.speed() : []),
    hook: () => (T.webhook ? T.webhook() : []),
    yt: () => [
    h('b', {}, 'YouTube downloader'),
    web ? h('small', { style: muted }, 'The downloader only works in the app on the PC, because the files are saved on the PC.')
      : h('small', { style: muted }, 'Paste a YouTube link, choose MP4 or MP3 and the resolution. The first download fetches yt-dlp and ffmpeg once (about 130 MB). Only download videos you own or have permission to save.'),
    web ? null : yt
    ],
    pace: () => [
    h('b', {}, 'Achievement Manager timings'),
    pace
    ]
  };
  const nav = h('div', { class: 'usubs' }, SUBS.map(([k, l]) => h('button', { class: 'chip' + (US.sub === k ? ' on' : ''), onclick: () => { US.sub = k; redraw(); } }, l)));
  return [nav, ...body[US.sub]()].filter(Boolean);
}
// Utility tab can be switched off in Settings > General (like the FPS Monitor tab)
function applyUtilTab(on) {
  const b = document.getElementById('tabUtil'); if (!b) return;
  b.classList.toggle('hidden', !on);
  if (!on && tab === 'util') setTab('boost');
  moveInd(); setTimeout(moveInd, 60);
}
function applyFreeTab(on) {
  const b = document.getElementById('tabFree'); if (!b) return;
  b.classList.toggle('hidden', !on);
  if (!on && tab === 'free') setTab('boost');
  moveInd(); setTimeout(moveInd, 60);
}
window.api.getPrefs().then((p) => applyUtilTab(p.utilTab !== false)).catch(() => {});
window.api.getPrefs().then((p) => applyFreeTab(p.freeTab !== false)).catch(() => {});
if (window.api.onPrefs) window.api.onPrefs((p) => { if (p && 'utilTab' in p) applyUtilTab(p.utilTab !== false); if (p && 'freeTab' in p) applyFreeTab(p.freeTab !== false); });   // the PC and the phone follow each other
// The Utility tab page: the same content that used to live in Settings > Utility.
function paintUtilPage() {
  const el = document.getElementById('utilBody'); if (!el) return;
  el.replaceChildren(h('div', { class: 'head' }, h('h1', {}, 'Utility')), ...utilityTab(paintUtilPage));
}
async function drawUtilPage() {
  try { US.keys = await window.api.utilKeysGet(); } catch {}
  paintUtilPage();
}

// ----- Background picker (Settings > General): built-in backgrounds, your own picture, blur and visibility -----
function bgSection(draw) {
  const B = window.WellaBg; if (!B) return h('span');
  const cur = B.get(), muted = 'color:var(--mut)';
  const tile = (id, name, extra) => h('button', { class: 'bgt' + (cur.id === id ? ' on' : '') + (extra ? ' ' + extra : ''), title: name,
    style: id !== 'none' ? `background-image:url("${B.thumb(id)}")` : '', onclick: () => { B.set({ id }); draw(); } }, h('span', {}, name));
  const slider = (label, key, min, max, unit) => {
    const out = h('output', {}, cur[key] + unit);
    const inp = h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(cur[key]), oninput: (e) => { const v = +e.target.value; out.textContent = v + unit; B.set({ [key]: v }); } });
    return h('div', { class: 'bgsl' }, h('b', {}, label), inp, out);
  };
  const file = h('input', { type: 'file', accept: 'image/*', style: 'display:none', onchange: async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try { await B.setCustom(f); toast('Background set', 'ok'); draw(); } catch (err) { toast(err.message || String(err), 'bad'); }
    e.target.value = '';
  } });
  const groups = [...new Set(B.list.map((b) => b.group))];
  return h('div', { class: 'bgsec' },
    h('b', {}, 'Background'),
    h('small', { style: muted }, 'Pick one of the built-in backgrounds or upload your own picture (for example a Hello Kitty wallpaper you like).'),
    h('div', { class: 'sbtns' },
      h('button', { class: 'btn red sm', onclick: () => file.click() }, 'Upload your own'),
      B.hasCustom() ? h('button', { class: 'btn ghost sm' + (cur.id === 'custom' ? ' on' : ''), onclick: () => { B.set({ id: 'custom' }); draw(); } }, 'Use my picture') : null,
      B.hasCustom() ? h('button', { class: 'btn stop sm', onclick: () => { B.removeCustom(); draw(); } }, 'Delete my picture') : null,
      file),
    slider('Blur', 'blur', 0, 40, ' px'),
    slider('Visibility', 'vis', 5, 100, ' %'),
    ...(window.WellaExtra ? window.WellaExtra.bgExtra(draw) : []),
    h('div', { class: 'bggrid' }, tile('none', 'No background', 'none'), B.list.map((b) => tile(b.id, b.name))),
    h('small', { style: muted }, groups.join(' \u00b7 ') + ' \u2014 ' + B.list.length + ' backgrounds.'));
}

async function openSettings() {
  const body = h('div', { class: 'modal wide settings' });
  let saved = await window.api.discordGet();       // what is stored
  let d = { ...saved };                            // what is being edited
  let prefs = await window.api.getPrefs();
  try { await window.WellaMon.load(); } catch {}
  try { US.keys = await window.api.utilKeysGet(); } catch {}
  let WG = { cfg: {}, accounts: [] }, FG = { cfg: {}, list: [], accounts: [] };
  try { WG = await window.api.widgetGet(); } catch {}
  try { FG = await window.api.freeGet(); } catch {}
  try { const ac = window.WellaTheme.get().accent; if (WG.cfg && WG.cfg.enabled && WG.cfg.accent !== ac) WG = { ...WG, cfg: (await window.api.widgetSet({ accent: ac })).cfg }; } catch {}
  const muted = 'color:var(--mut)';
  const dirty = () => DC_FIELDS.some((k) => (d[k] ?? '') !== (saved[k] ?? ''));
  const statusText = () => dirty() ? 'Unsaved changes. Press Save.' : !saved.enabled ? 'Off' : !saved.appId ? 'Paste your Application ID from the Discord Developer Portal.' : saved.connected ? 'Saved. Connected to Discord.' : 'Saved. Not connected: open the Discord desktop app (not the browser version).';
  const refreshStatus = () => { const s = document.getElementById('dcStatus'); if (s) { s.textContent = statusText(); s.style.color = dirty() ? 'var(--red)' : 'var(--mut)'; } };
  let pvTimer = null;
  const refreshPreview = () => {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(async () => {
      const el = document.getElementById('dcPv'); if (!el) return;
      const p = await window.api.discordPreview(d);
      el.replaceChildren(...[
        h('small', { class: 'pvk' }, 'PLAYING'),
        h('div', { class: 'pvrow' },
          h('div', { class: 'pvimg' }, h('img', { class: 'logoimg', src: 'assets/emblem-s.png', draggable: 'false' })),
          h('div', { class: 'pvtxt' },
            h('b', {}, p.name),
            p.details ? h('div', {}, p.details) : null,
            p.state ? h('div', {}, p.state) : null,
            p.timer ? h('div', { class: 'pvt' }, '\u25B6 00:12 elapsed') : null)),
        p.buttons.length ? h('div', { class: 'pvbtns' }, p.buttons.map((l) => h('span', {}, l))) : null].filter(Boolean));
    }, 150);
  };
  const touch = () => { refreshStatus(); refreshPreview(); };
  const text = (label, key, o = {}) => h('div', { class: 'setrow' }, h('b', {}, label),
    h('input', { class: 'in', placeholder: o.ph || '', value: d[key] || '', maxlength: o.max || '200', oninput: (e) => { d[key] = e.target.value; touch(); } }),
    o.hint ? h('small', { style: muted }, o.hint) : null);
  const check = (label, key, hint) => h('div', { class: 'setrow' }, h('label', { class: 'chk' },
    h('input', { type: 'checkbox', checked: d[key] ? 'checked' : null, onchange: (e) => { d[key] = e.target.checked; touch(); } }), label),
    hint ? h('small', { style: muted }, hint) : null);

  // colour picker row: presets + free picker + hex (+ "follow accent" for the main button colour)
  const colorRow = (label, key, presets, follow) => {
    const t = window.WellaTheme.get(), eff = t[key] || t.accent, following = follow && !t[key];
    const set = (v) => window.WellaTheme.set({ [key]: v });
    const hex = h('input', { class: 'in hex', value: eff, maxlength: '7', onchange: (e) => {
      const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) { set(v.toLowerCase()); draw(); } else e.target.value = eff; } });
    const picker = h('input', { type: 'color', value: eff, oninput: (e) => { set(e.target.value); hex.value = e.target.value; } });
    picker.addEventListener('change', draw);
    return h('div', { class: 'setrow' }, h('b', {}, label),
      h('div', { class: 'sw' },
        presets.map((c) => h('button', { class: !following && eff === c ? 'on' : '', style: `background:${c};color:${c}`, title: c, onclick: () => { set(c); draw(); } })),
        picker, hex,
        follow ? h('button', { class: 'btn ghost sm' + (following ? ' on' : ''), style: 'width:auto;height:auto;border-radius:10px;outline:0', onclick: () => { set(''); draw(); } }, following ? '\u2713 Follows accent' : 'Follow accent') : null));
  };

  // Steam Web API key: games, playtime, level and bans of any player. A built-in key works out of the box; a personal one can replace it.
  const steamKeyRow = () => {
    const custom = US.keys.steam === 'custom';
    const inp = h('input', { class: 'in', type: 'password', placeholder: 'Paste your own Steam Web API key (optional)' });
    const msg = h('small', { style: 'color:var(--red);min-height:16px' });
    const save = h('button', { class: 'btn red sm', onclick: async () => {
      const v = inp.value.trim(); if (!v) { msg.textContent = 'Paste the key first.'; return; }
      save.disabled = true; save.textContent = 'Checking...'; msg.textContent = '';
      try {
        const vr = await window.api.utilKeysValidate({ name: 'steam', key: v });
        if (!vr.valid) { msg.textContent = vr.error || 'Invalid key.'; save.disabled = false; save.textContent = 'Save'; return; }
        US.keys = await window.api.utilKeysSet({ steam: v }); toast('Steam API key saved', 'ok'); renderTab(null);
      } catch (e) { msg.textContent = e.message || 'Error.'; save.disabled = false; save.textContent = 'Save'; }
    } }, 'Save');
    if (custom) return h('div', { class: 'setrow' },
      h('div', {}, h('b', {}, 'Steam Web API Key'), h('small', { style: muted }, '\u2713 Salvat\u0103 \u0219i valid\u0103')),
      h('button', { class: 'btn stop sm', onclick: async () => {
        US.keys = await window.api.utilKeysSet({ steam: '' });
        toast('Cheia Steam \u0219tears\u0103, se folose\u0219te cea implicit\u0103'); renderTab(null);
      } }, 'Remove'));
    return h('div', { class: 'setrow' },
      h('div', {}, h('b', {}, 'Steam Web API Key'), h('small', { style: muted }, '\u2713 Cheie implicit\u0103 activ\u0103 (jocuri, ore, valoare, ban-uri). Po\u021bi pune propria cheie.')),
      h('div', { class: 'lk' }, inp, save),
      msg);
  };


  // ---- Mini widget: small always-on-top bar (hours + card drops), one account or all ----
  const widgetSection = () => {
    const c = WG.cfg || {};
    const upd = async (p) => { try { const r = await window.api.widgetSet({ accent: window.WellaTheme.get().accent, ...p }); WG.cfg = r.cfg; } catch (e) { toast(e.message || 'Error', 'bad'); } renderTab(null); };
    const chk = (label, key, hint) => h('label', { class: 'chk', title: hint || '' }, h('input', { type: 'checkbox', checked: c[key] ? 'checked' : null, onchange: (e) => upd({ [key]: e.target.checked }) }), label);
    const sl = (label, key, min, max, unit) => {
      const out = h('output', {}, c[key] + unit);
      const inp = h('input', { type: 'range', min: String(min), max: String(max), step: '1', value: String(c[key]), oninput: (e) => { out.textContent = e.target.value + unit; }, onchange: (e) => { window.api.widgetSet({ [key]: +e.target.value }).then((r) => { WG.cfg = r.cfg; }); } });
      return h('div', { class: 'bgsl' }, h('b', {}, label), inp, out);
    };
    const kids = [
      h('b', {}, 'Mini widget'),
      h('small', { style: muted }, 'A small bar that stays on top of everything and shows hours and card drops. Drag it anywhere; right-click it for a menu.'),
      chk('Show the mini widget', 'enabled')
    ];
    if (c.enabled) {
      const accs = WG.accounts || [];
      kids.push(
        h('div', { class: 'seg' }, [['all', 'All accounts'], ['one', 'One account']].map(([k, l]) => h('button', { class: 'btn' + ((c.mode || 'all') === k ? ' on' : ''), onclick: () => upd({ mode: k }) }, l))),
        c.mode === 'one' ? h('select', { class: 'in', onchange: (e) => upd({ account: e.target.value }) },
          accs.map((a) => h('option', { value: a.id, selected: (c.account || (accs[0] && accs[0].id)) === a.id ? 'selected' : null }, a.name))) : null,
        h('div', { class: 'seg' }, [['list', 'Rows (stacked)'], ['row', 'Side by side']].map(([k, l]) => h('button', { class: 'btn' + ((c.layout || 'list') === k ? ' on' : ''), onclick: () => upd({ layout: k }) }, l))),
        h('small', { style: muted }, 'What to show:'),
        h('div', { class: 'wgrid' },
          chk('Status dot', 'dot'), chk('Avatar', 'avatar'), chk('Name', 'name'), chk('Session time', 'session'),
          chk('Total hours', 'total'), chk('Card drops left', 'cards', 'From the Steam badges page'), chk('Games left / idle now', 'games'), chk('Sum row (all accounts)', 'sum')),
        sl('Size', 'scale', 60, 160, '%'), sl('Opacity', 'opacity', 30, 100, '%'),
        h('div', { class: 'wgrid' },
          chk('Always on top', 'onTop'), chk('Lock position', 'lock'), chk('Click-through (mouse passes over it)', 'clickThrough'), chk('Only while boosting', 'onlyBoosting')),
        c.clickThrough ? h('small', { style: 'color:var(--red)' }, 'Click-through is on: you cannot drag or right-click the widget. Untick it here to move it again.') : null,
        h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: () => upd({ resetPos: true }) }, 'Reset position'))
      );
    }
    return h('div', { class: 'wsec' }, kids.filter(Boolean));
  };

  // ---- Free games tracker ----
  const freeSection = () => {
    const c = FG.cfg || {}, accs = FG.accounts || [];
    const upd = async (p) => { try { FG = await window.api.freeSet(p); } catch (e) { toast(e.message || 'Error', 'bad'); } renderTab(null); };
    const chk = (label, key, hint) => h('label', { class: 'chk', title: hint || '' }, h('input', { type: 'checkbox', checked: c[key] ? 'checked' : null, onchange: (e) => upd({ [key]: e.target.checked }) }), label);
    const chosen = new Set(c.accounts || []);
    const kids = [
      h('b', {}, 'Free games tracker'),
      h('small', { style: muted }, 'Finds Steam games that are free to keep for a limited time (normally paid) and tells you. Free-to-play games are ignored.'),
      chk('Notify me when a game becomes free', 'notify'),
      chk('Add free games to my account automatically', 'autoClaim', 'Same as pressing "Add to account" on the store page'),
      accs.length > 1 ? h('div', { class: 'setrow' },
        h('small', { style: muted }, chosen.size ? 'Added to the ticked accounts only:' : 'Added to all accounts (tick some to limit it):'),
        h('div', { class: 'wgrid' }, accs.map((a) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: chosen.has(a.id) ? 'checked' : null, onchange: (e) => { const s = new Set(chosen); e.target.checked ? s.add(a.id) : s.delete(a.id); upd({ accounts: [...s] }); } }), a.name)))) : null
    ];
    const list = h('div', { class: 'fglist' });
    const paint = () => {
      const L = FG.list || [];
      const head = FG.busy ? 'Checking the Steam store\u2026' : FG.error ? 'Could not check: ' + FG.error : FG.at ? `${L.length ? L.length + ' free now' : 'Nothing free right now'} \u00b7 checked ${agoText(FG.at)}` : 'Not checked yet.';
      list.replaceChildren(h('small', { style: FG.error ? 'color:var(--red)' : muted }, head), ...L.map((g) => {
        const st = g.status || {}, ids = Object.keys(st);
        const done = ids.length && ids.every((i) => st[i] && (st[i].r === 'ok' || st[i].r === 'owned'));
        const bad = ids.map((i) => st[i]).find((x) => x && x.r === 'error');
        return h('div', { class: 'fgitem' },
          g.image ? h('img', { src: g.image, alt: '', draggable: 'false' }) : null,
          h('div', { class: 'fgi' }, h('b', {}, g.name), h('small', { style: muted }, (g.price ? 'Normally ' + g.price : 'Limited time') + (g.endsAt ? ' \u00b7 ends ' + new Date(g.endsAt * 1000).toLocaleDateString() : ''),
            done ? ' \u00b7 \u2713 in your account' : bad ? ' \u00b7 failed: ' + (bad.text || 'error') : '')),
          h('button', { class: 'btn ghost sm', onclick: () => window.open('https://store.steampowered.com/app/' + g.appid, '_blank') }, 'Store'),
          done ? null : h('button', { class: 'btn red sm', disabled: !g.subid, title: g.subid ? '' : 'No free package found: open the store page', onclick: async (e) => {
            e.currentTarget.disabled = true; const r = await window.api.freeClaim({ appid: g.appid, accountId: 'all' }); if (r && r.error) toast(r.error, 'bad'); else { FG = r; toast('Done. See the list for the result.', 'ok'); } paint();
          } }, 'Add to account'));
      }));
    };
    paint();
    kids.push(list, h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: async (e) => { e.currentTarget.disabled = true; FG = await window.api.freeCheck(); renderTab(null); } }, 'Check now')));
    return h('div', { class: 'wsec' }, kids.filter(Boolean));
  };

  const generalTab = () => {
    const t = window.WellaTheme.get();
    const hex = h('input', { class: 'in hex', value: t.accent, maxlength: '7', onchange: (e) => {
      const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) { window.WellaTheme.set({ accent: v.toLowerCase() }); draw(); } else e.target.value = t.accent; } });
    const picker = h('input', { type: 'color', value: t.accent, oninput: (e) => { window.WellaTheme.set({ accent: e.target.value }); hex.value = e.target.value; } });
    picker.addEventListener('change', draw);
    const pref = (label, key, hint) => h('div', { class: 'setrow' }, h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: prefs[key] ? 'checked' : null, onchange: async (e) => { prefs = await window.api.setPrefs({ [key]: e.target.checked }); if (key === 'freeTab') applyFreeTab(prefs.freeTab !== false); } }), label),
      hint ? h('small', { style: muted }, hint) : null);
    const S = (id, title, kids, open) => window.WellaExtra.section(id, title, kids, open);
    const keyRow = (name, label, msg) => US.keys[name] ? h('div', { class: 'setrow' },
      h('div', {}, h('b', {}, label + ' API Key'), h('small', { style: muted }, '\u2713 Salvat\u0103 \u0219i valid\u0103')),
      h('button', { class: 'btn stop sm', onclick: async () => { US.keys = await window.api.utilKeysSet({ [name]: '' }); toast(msg); renderTab(null); } }, 'Remove')) : null;
    return [
      S('look', 'Appearance', [
        ...window.WellaExtra.lookTab(draw),
        h('div', { class: 'setrow' }, h('b', {}, 'Theme'),
          h('div', { class: 'seg' }, ['dark', 'light'].map((m) => h('button', { class: 'btn' + (t.mode === m ? ' on' : ''), onclick: () => { window.WellaTheme.set({ mode: m }); draw(); } }, m === 'dark' ? 'Black' : 'White')))),
        h('div', { class: 'setrow' }, h('b', {}, 'Accent color (also recolours the logo)'),
          h('div', { class: 'sw' }, PRESETS.map((c) => h('button', { class: t.accent === c ? 'on' : '', style: `background:${c}`, title: c, onclick: () => { window.WellaTheme.set({ accent: c }); draw(); } })), picker, hex)),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: t.tint ? 'checked' : null, onchange: (e) => window.WellaTheme.set({ tint: e.target.checked }) }), 'Tint the whole app with the accent color'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: t.fx !== false ? 'checked' : null, onchange: (e) => window.WellaTheme.set({ fx: e.target.checked }) }), 'Animations')
      ], true),
      S('bg', 'Background', [bgSection(draw)]),
      S('btn', 'Buttons', [
        h('div', { class: 'sbtns' }, h('button', { class: 'btn red' }, 'Primary'), h('button', { class: 'btn start' }, 'Start'), h('button', { class: 'btn stop' }, 'Stop')),
        colorRow('Primary buttons (Save, Sign in, Done...)', 'btn', PRESETS, true),
        colorRow('Start button (glows on hover)', 'start', START_PRESETS, false),
        colorRow('Stop button (glows on hover)', 'stop', STOP_PRESETS, false),
        h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: () => { const df = window.WellaTheme.defaults; window.WellaTheme.set({ btn: '', start: df.start, stop: df.stop }); draw(); } }, 'Reset button colors'))
      ]),
      S('notif', 'Notifications', [
        h('div', { class: 'shapes' }, [['pill', 'Pill', '999px'], ['round', 'Rounded', '9px'], ['soft', 'Soft square', '5px'], ['square', 'Square', '1px'], ['oval', 'Oval', '50%']].map(([k, l, r]) =>
          h('button', { class: 'btn' + ((t.toastShape || 'pill') === k ? ' on' : ''), onclick: () => { window.WellaTheme.set({ toastShape: k }); draw(); toast('This is how notifications look.', 'ok', l); } }, h('i', { style: 'border-radius:' + r }), l))),
        h('div', { class: 'sbtns' },
          h('button', { class: 'btn ghost sm', onclick: () => toast('Hour Booster started', undefined, 'Wella Hub') }, 'Preview'),
          h('button', { class: 'btn ghost sm', onclick: () => toast('Something went wrong.', 'bad', 'Error') }, 'Preview error')),
        ...(window.WellaMon ? window.WellaMon.monitorTab(draw, 'notify') : [])
      ]),
      S('tabs', 'Tabs & monitor', [
        window.WellaMon ? window.WellaMon.generalToggle() : null,
        h('div', { class: 'setrow' }, h('label', { class: 'chk' },
          h('input', { type: 'checkbox', checked: prefs.utilTab !== false ? 'checked' : null, onchange: async (e) => { prefs = await window.api.setPrefs({ utilTab: e.target.checked }); applyUtilTab(prefs.utilTab); } }), 'Utility tab')),
        pref('Free Games tab', 'freeTab', 'Show or hide the Free Games tab from the main navigation.'),
        ...(window.WellaMon ? window.WellaMon.monitorTab(draw, 'monitor') : [])
      ]),
      S('startup', 'Startup', [
        pref('Start with Windows (straight to the system tray)', 'autostart'),
        pref('Start the hour booster automatically', 'autoBoost'),
        pref('Start Free Games auto discovery automatically', 'autoDiscovery', 'Search for current free Steam offers when Wella Hub starts and keep checking on the configured interval.'),
        window.__WELLA_WEB ? h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: () => window.api.logout() }, 'Log out of web access')) : null
      ]),
      S('widget', 'Mini widget', [widgetSection()]),
      S('keys', 'API keys', [steamKeyRow(), keyRow('faceit', 'FACEIT', 'Cheie FACEIT \u0219tears\u0103'), keyRow('leetify', 'Leetify', 'Cheie Leetify \u0219tears\u0103')])
    ].filter(Boolean);
  };

  const discordTab = () => [
    h('div', { class: 'auto' },
      h('div', {}, h('b', {}, 'Quick setup'), h('small', {}, 'Fills in the Application ID, name, logo (asset "wella"), texts and timer for Wella Hub, saves and connects.')),
      h('button', { class: 'btn red', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        saved = await window.api.discordAuto(); d = { ...saved };
        toast('Discord Rich Presence is set up', 'ok');
        renderTab(null);
        setTimeout(async () => { saved = await window.api.discordGet(); refreshStatus(); }, 2500);
      } }, '\u26A1 Auto setup')),
    h('div', { class: 'pv', id: 'dcPv' }),
    h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: d.enabled ? 'checked' : null, onchange: (e) => { d.enabled = e.target.checked; touch(); } }),
      'Show Discord Rich Presence'),
    h('small', { id: 'dcStatus', style: muted }, statusText()),
    h('div', { class: 'row2' },
      text('Application ID', 'appId', { ph: 'Discord Application ID', max: '30' }),
      text('Name', 'name', { ph: 'Wella Hub', max: '100', hint: 'Shown on the logo hover.' })),
    h('small', { style: muted }, 'The "Playing ..." title itself is the application name from the Discord Developer Portal.'),
    h('div', { class: 'sep' }),
    h('b', {}, 'Text'),
    text('First line', 'details', { ph: '{status}', max: '128' }),
    text('Second line', 'state', { ph: '{tab}', max: '128', hint: 'Placeholders: {status} {accounts} {games} {hours} {session} {tab}' }),
    check('Automatically add total hours farmed to the second line', 'showHours', 'Skipped when you already use {hours} yourself.'),
    h('div', { class: 'sep' }),
    h('b', {}, 'Timer'),
    h('div', { class: 'setrow' },
      h('select', { class: 'in', onchange: (e) => { d.startMode = e.target.value; touch(); renderTab(null); } },
        [['app', 'Elapsed since the app was opened'], ['boost', 'Elapsed since boosting started'], ['custom', 'Elapsed since a custom date and time'], ['off', 'No timer']]
          .map(([v, l]) => h('option', { value: v, selected: d.startMode === v ? 'selected' : null }, l))),
      d.startMode === 'custom' ? h('input', { class: 'in', type: 'datetime-local', value: toLocalInput(d.customStart), onchange: (e) => { const ms = new Date(e.target.value).getTime(); if (ms) { d.customStart = ms; touch(); } } }) : null),
    h('div', { class: 'sep' }),
    h('b', {}, 'Images'),
    h('div', { class: 'row2' },
      text('Large image key', 'largeKey', { ph: 'wella', max: '100', hint: 'Name of the asset in Art Assets.' }),
      text('Small image key', 'smallKey', { ph: '(none)', max: '100', hint: 'Optional second asset.' })),
    d.smallKey ? text('Small image text', 'smallText', { ph: 'Shown on hover', max: '100' }) : null,
    h('div', { class: 'sep' }),
    h('b', {}, 'Buttons (up to 2, https links)'),
    h('div', { class: 'row2' }, text('Button 1 label', 'btn1Label', { ph: 'Label', max: '32' }), text('Button 1 link', 'btn1Url', { ph: 'https://...', max: '300' })),
    h('div', { class: 'row2' }, text('Button 2 label', 'btn2Label', { ph: 'Label', max: '32' }), text('Button 2 link', 'btn2Url', { ph: 'https://...', max: '300' })),
    h('small', { style: muted }, 'Discord does not show your own buttons to you; other people see them.'),
    h('div', { class: 'sep' }),
    check('Hide the activity when nothing is boosting', 'hideIdle')
  ].filter(Boolean);

  // ----- web access (only shown in the desktop app) -----
  const remoteTab = () => {
    let st = null;
    const copy = async (t) => { try { await navigator.clipboard.writeText(t); toast('Link copied', 'ok'); } catch { toast('Could not copy. Select and copy it by hand.', 'bad'); } };
    const linkRow = (label, url) => h('div', { class: 'lrow' }, h('small', { style: muted }, label),
      h('div', { class: 'lk' }, h('code', {}, url), h('button', { class: 'btn ghost sm', onclick: () => copy(url) }, 'Copy')));
    const save = async (patch, okMsg) => {
      const r = await window.api.remoteSet(patch);
      if (r && r.error) { toast(r.error, 'bad'); return false; }
      st = r; if (okMsg) toast(okMsg, 'ok'); paint(); return true;
    };
    const dyn = h('div', { class: 'rdyn' });
    const deviceRows = h('div', { class: 'device-list' });
    const deviceNote = h('small', { class: 'device-note' }, 'Web sessions will appear here.');
    let deviceBusy = false;
    const drawDevices = (devices) => deviceRows.replaceChildren(...(devices.length ? devices.map((d) => {
      const seen = d.lastSeen ? new Date(d.lastSeen).toLocaleString(uiLocale()) : 'Unknown';
      const badge = h('small', { class: 'device-state' + (d.blocked ? ' blocked' : d.trusted ? ' trusted' : d.connected ? ' connected' : '') }, d.blocked ? 'Blocked' : d.trusted ? 'Whitelisted' : d.connected ? 'Connected' : 'Offline');
      const controls = d.blocked
        ? [h('button', { class: 'btn start sm', onclick: () => runDeviceAction(d, 'unblock') }, 'Unblock')]
        : [...(d.connected ? [h('button', { class: 'btn ghost sm', onclick: () => runDeviceAction(d, 'disconnect') }, 'Disconnect')] : []), h('button', { class: 'btn ' + (d.trusted ? 'ghost' : 'start') + ' sm', title: d.trusted ? 'This browser can sign in without asking for the password' : 'Allow this browser to sign in without asking for the password', onclick: () => runDeviceAction(d, d.trusted ? 'unwhitelist' : 'whitelist') }, d.trusted ? 'Remove whitelist' : 'Whitelist'), h('button', { class: 'btn stop sm', onclick: () => runDeviceAction(d, 'block') }, 'Block')];
      controls.push(h('button', { class: 'btn ghost sm', title: 'Forget this browser and remove it from the list', onclick: () => { if (confirm(`Delete ${d.name || 'this web device'} from the list? Its active session will be disconnected.`)) runDeviceAction(d, 'delete'); } }, 'Delete'));
      return h('div', { class: 'device-row' }, h('div', { class: 'device-ident' }, h('b', {}, d.name || 'Web browser'), h('small', {}, `${d.ip || 'Unknown IP'} · Last seen ${seen}`)), badge, ...controls);
    }) : [h('div', { class: 'empty' }, 'No web devices have logged in yet.')]));
    async function runDeviceAction(d, action) {
      try { const r = await window.api.remoteDevicesAction({ id: d.id, action }); if (r.error) throw new Error(r.error); const labels = { block: 'Web device blocked.', unblock: 'Web device unblocked.', disconnect: 'Web device disconnected and will need to log in again.', whitelist: 'Web device whitelisted.', unwhitelist: 'Web device removed from whitelist.', delete: 'Web device removed.' }; toast(labels[action] || 'Device updated.', 'ok'); drawDevices(r.devices || []); }
      catch (err) { toast(err.message || String(err), 'bad'); }
    }
    async function refreshDevices() {
      if (deviceBusy) return;
      deviceBusy = true;
      try {
        const r = await window.api.remoteDevicesGet(), devices = Array.isArray(r) ? r : [];
        drawDevices(devices);
        deviceNote.textContent = `${devices.filter((d) => d.connected).length} connected · ${devices.filter((d) => d.trusted).length} whitelisted · ${devices.filter((d) => d.blocked).length} blocked. Whitelisted browsers skip password entry on this device.`;
      } catch (err) { deviceNote.textContent = err.message || 'Could not read web sessions.'; deviceRows.replaceChildren(); }
      finally { deviceBusy = false; }
    }
    const deviceManager = h('section', { class: 'device-manager' }, h('div', { class: 'device-manager-head' }, h('div', {}, h('h2', {}, 'Web Device Manager'), h('small', {}, 'Phones and browsers connected to Wella Hub')), h('button', { class: 'btn ghost sm', onclick: refreshDevices }, 'Refresh')), deviceNote, deviceRows);
    const devicePoll = setInterval(() => { if (!deviceManager.isConnected) clearInterval(devicePoll); else refreshDevices(); }, 3000);
    refreshDevices();
    const enabled = h('input', { type: 'checkbox', onchange: async (e) => { if (!(await save({ enabled: e.target.checked }, e.target.checked ? 'Web access is on' : 'Web access is off'))) e.target.checked = !e.target.checked; } });
    const pw = h('input', { class: 'in', type: 'password', placeholder: 'New password (at least 8 characters)', autocomplete: 'new-password' });
    const port = h('input', { class: 'in', type: 'number', min: '1024', max: '65535', style: 'max-width:130px' });
    let ipText = '';
    const paint = () => {
      if (!st) return;
      if (document.activeElement !== port) port.value = st.port;
      enabled.checked = st.enabled;
      const t = st.tunnel || {};
      const line = !st.enabled ? 'Off.' : st.error ? st.error : st.running ? `On, port ${st.port}.` + (st.clients ? ` ${st.clients} device${st.clients > 1 ? 's' : ''} connected.` : '') : 'Starting...';
      const kids = [h('small', { style: st.error ? 'color:#ff6b81' : muted }, line)];
      if (st.enabled && st.running) {
        kids.push(h('div', { class: 'sep' }), h('b', {}, 'Open on your phone'));
        kids.push(linkRow('Same Wi-Fi / network as this PC', st.urls[0] || `http://localhost:${st.port}`));
        for (const u of st.urls.slice(1)) kids.push(linkRow('Other network card', u));
        kids.push(h('div', { class: 'sep' }), h('b', {}, 'Public link (works from anywhere, also on mobile data)'));
        kids.push(h('small', { style: muted }, 'Free Cloudflare tunnel: HTTPS, no router setup, no need to be on the same Wi-Fi. The link changes every time it is created. Keep this window open or use the checkbox below.'));
        if (t.status === 'on') kids.push(linkRow('Public link', t.url), h('div', { class: 'sbtns' }, h('button', { class: 'btn stop sm', onclick: async () => { st = await window.api.remoteTunnel(false); paint(); } }, 'Stop public link')));
        else if (t.status === 'downloading' || t.status === 'starting') kids.push(h('div', {}, h('span', { class: 'spin' }), t.message));
        else kids.push(...(t.status === 'error' ? [h('small', { style: 'color:#ff6b81' }, t.message)] : t.message ? [h('small', { style: muted }, t.message)] : []),
          h('div', { class: 'sbtns' }, h('button', { class: 'btn start sm', onclick: async () => { st = await window.api.remoteTunnel(true); paint(); } }, t.status === 'error' ? 'Try again' : 'Create public link')));
        kids.push(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.autoTunnel ? 'checked' : null, onchange: (e) => save({ autoTunnel: e.target.checked }) }), 'Create the public link automatically when Wella Hub starts'));
        kids.push(h('div', { class: 'sep' }), h('b', {}, 'Direct IP (advanced)'));
        kids.push(h('small', { style: muted }, `Forward TCP port ${st.port} on your router to this PC, then open http://YOUR-PUBLIC-IP:${st.port}. It is plain HTTP, so the password is not encrypted on the way. The public link above is safer.`));
        if (!ipText && st.cachedIp) ipText = st.cachedIp;
        kids.push(ipText
          ? linkRow('Direct IP link (forward TCP port on router)', `http://${ipText}:${st.port}`)
          : h('div', { class: 'sbtns' },
              h('button', { class: 'btn ghost sm', onclick: async (e) => { e.currentTarget.disabled = true; ipText = (await window.api.remoteIp()) || ''; if (!ipText) toast('Could not find the public IP.', 'bad'); paint(); } }, 'Show my public IP'),
              h('small', { style: muted }, 'Also forward TCP port ' + st.port + ' on your router and allow it in Windows Firewall.')));
      }
      dyn.replaceChildren(...kids);
    };
    const refresh = async () => { try { st = await window.api.remoteGet(); paint(); } catch {} };
    refresh();
    const poll = setInterval(() => { if (!dyn.isConnected) { clearInterval(poll); return; } refresh(); }, 1500);
    return [
      h('small', { style: muted }, 'Control Wella Hub from your phone or any browser. It shows the same screens and keeps working while this app is open (also when it sits in the tray).'),
      h('label', { class: 'chk' }, enabled, 'Enable web access'),
      h('div', { class: 'setrow' }, h('b', {}, 'Password'),
        h('div', { class: 'lk' }, pw, h('button', { class: 'btn red sm', onclick: async () => { if (await save({ password: pw.value }, 'Password saved. Devices that were logged in are logged out.')) pw.value = ''; } }, 'Set password')),
        h('small', { style: muted }, 'Required. Anyone with the link and this password controls your Steam accounts, so make it long.')),
      h('div', { class: 'setrow' }, h('b', {}, 'Port'),
        h('div', { class: 'lk' }, port, h('button', { class: 'btn ghost sm', onclick: () => save({ port: port.value }, 'Port saved') }, 'Apply')),
        h('small', { style: muted }, 'Windows may ask once to allow Wella Hub through the firewall. Allow it for private networks.')),
      h('div', { class: 'sep' }),
      dyn,
      h('div', { class: 'sep' }),
      deviceManager
    ];
  };

  const ICON_MON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 11l2-2 2 3 3-5 3 4"/></svg>';
  const TABS = [['general', 'General', ICON_GEAR], ['discord', 'Discord', ICON_DISCORD]];
  // Web access tab: mereu vizibil pe desktop; pe web doar daca parola e cea de administrator
  if (!window.__WELLA_WEB) {
    TABS.push(['remote', 'Web access', ICON_PHONE]);
  } else {
    window.api.remoteIsAdmin().then((isAdmin) => {
      if (isAdmin) {
        TABS.push(['remote', 'Web access', ICON_PHONE]);
        // re-render stabs ca sa apara noul tab
        if (document.contains(stabs)) {
          stabs.style.setProperty('--n', TABS.length);
          stabs.style.setProperty('--k', Math.max(0, TABS.findIndex((x) => x[0] === settingsTab)));
          TABS.forEach(([k, l, ic]) => { if (!stabs.querySelector('[data-k="' + k + '"]')) { stabs.append(h('button', { 'data-k': k, class: settingsTab === k ? 'on' : '', onclick: () => { const dir = TABS.findIndex((x) => x[0] === k) > TABS.findIndex((x) => x[0] === settingsTab) ? 1 : -1; settingsTab = k; renderTab(dir); } }, ico(ic), l)); } });
        }
      }
    }).catch(() => {});
  }
  const stabs = h('div', { class: 'stabs', style: `--n:${TABS.length};--k:${Math.max(0, TABS.findIndex((x) => x[0] === settingsTab))}` }, h('i', { class: 'ind' }),
    TABS.map(([k, l, ic]) => h('button', { 'data-k': k, class: settingsTab === k ? 'on' : '', onclick: () => {
      if (settingsTab === k) return;
      const dir = TABS.findIndex((x) => x[0] === k) > TABS.findIndex((x) => x[0] === settingsTab) ? 1 : -1;
      settingsTab = k; renderTab(dir);
    } }, ico(ic), l)));
  const content = h('div', { class: 'sbody' });
  const actions = h('div', { class: 'mact' });
  // renderTab(dir): dir = 1 / -1 slides the new page in from the right / left, null redraws in place without animation
  function renderTab(dir) {
    content.replaceChildren(...(settingsTab === 'discord' ? discordTab() : settingsTab === 'remote' ? remoteTab() : settingsTab === 'look' ? window.WellaExtra.lookTab(draw) : generalTab()));
    content.style.setProperty('--sx', (dir || 0) * 40 + 'px');
    content.classList.remove('fx');
    if (dir !== null) { void content.offsetWidth; content.classList.add('fx'); }
    [...content.children].forEach((c, i) => c.style.setProperty('--i', Math.min(i, 14)));
    stabs.style.setProperty('--k', Math.max(0, TABS.findIndex((x) => x[0] === settingsTab)));
    stabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.k === settingsTab));
    actions.replaceChildren(...[
      settingsTab === 'discord' ? h('button', { class: 'btn ghost', onclick: async (e) => {
        const btn = e.currentTarget; btn.disabled = true;
        saved = await window.api.discordSet(d); d = { ...saved };
        btn.disabled = false; btn.textContent = 'Saved \u2713'; setTimeout(() => { btn.textContent = 'Save'; }, 1500);
        refreshStatus(); refreshPreview(); setTimeout(async () => { saved = await window.api.discordGet(); refreshStatus(); }, 2500);
      } }, 'Save') : null,
      h('button', { class: 'btn red', onclick: closeModal }, 'Done')].filter(Boolean));
    if (settingsTab === 'discord') { refreshStatus(); refreshPreview(); }
  }
  const draw = () => renderTab(null);
  body.append(h('div', { class: 'sh' }, h('h2', {}, 'Settings'), h('small', { style: muted }, 'Wella Hub ' + (document.getElementById('fVer').textContent || ''))), stabs, content, actions);
  renderTab(0);
  showModal(body);
  // saved keys are re-checked in the background: one the server now refuses is removed and its input comes back
  window.api.onFree && window.api.onFree((v) => { FG = v; if (content.isConnected && settingsTab === 'general') renderTab(null); });
  window.api.onWidgetOff && window.api.onWidgetOff(() => { window.api.widgetGet().then((r) => { WG = r; if (content.isConnected && settingsTab === 'general') renderTab(null); }); });
  window.api.utilKeysCheck().then((k) => {
    if (!k) return;
    const changed = k.faceit !== US.keys.faceit || k.leetify !== US.keys.leetify || k.steam !== US.keys.steam;
    US.keys = { faceit: !!k.faceit, leetify: !!k.leetify, steam: k.steam };
    (k.invalid || []).forEach((n) => toast('Cheia ' + (n === 'faceit' ? 'FACEIT' : n === 'steam' ? 'Steam' : 'Leetify') + ' nu mai este validă. Introdu una nouă în Settings.', 'bad'));
    if (changed && content.isConnected && settingsTab === 'general') renderTab(null);
    if (changed && tab === 'util') paintUtilPage();
  }).catch(() => {});
}

function splashReady() { if (window.__splashReady) window.__splashReady(); }
document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));


// ================= button ripple =================
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest && e.target.closest('.btn, .tab, .icon, .add, .sbtn');
  if (!b || b.disabled) return;
  const r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2;
  const rip = h('span', { class: 'rip', style: `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px` });
  b.append(rip);
  setTimeout(() => rip.remove(), 650);
});


// ================= diagnostics, game panel, account panel (v1.3) =================
function diagBtn() {
  return h('button', { class: 'btn ghost sm', title: 'Copies what the achievement code did, so a problem can be diagnosed', onclick: async () => {
    try { const t = await window.api.achDiag(); await navigator.clipboard.writeText(t); toast('Log copied. Paste it where you report the problem.', 'ok'); }
    catch (e) { toast('Could not copy the log: ' + (e.message || e), 'bad'); }
  } }, 'Copy log');
}
const hrs1 = (sec) => (sec / 3600).toFixed(1) + ' h';
function cell(label, value, cls) { return h('div', { class: 'icell' }, label ? h('small', {}, label) : null, h('b', { class: cls || '' }, value)); }
const isWeb = () => !!window.__WELLA_WEB;

// Counter-Strike app IDs (toate versiunile)
const CS_APPIDS = new Set([10, 80, 240, 310, 320, 340, 730]);
// 10=CS1.6, 80=CZ, 240=CSS, 310/320/340=beta builds, 730=CS2/CSGO
function isCounterStrike(id) { return CS_APPIDS.has(Number(id)); }

function openGame(accId, appid) {
  const a = accounts.find((x) => x.id === accId); if (!a) return;
  const g = a.games.find((x) => x.appid === appid) || { appid, name: String(appid) };
  const grid = h('div', { class: 'igrid' });
  const notes = h('div', { class: 'inote' });
  const acts = h('div', { class: 'iacts' });
  const boosted = (a.gameSeconds[appid] || 0);
  const isCS = isCounterStrike(appid);
  // Sectiunea Player Stats — apare inline doar la CS
  const psSection = h('div', { class: 'igrid', style: 'margin-top:10px' });
  const psLoading = isCS ? h('div', { class: 'inote' }, h('span', { class: 'spin' }), ' Loading Player Stats…') : null;
  const dropTxt = (n) => (n == null ? '\u2014' : n > 0 ? `${n} card${n === 1 ? '' : 's'} left` : 'none left');
  const recentHours = h('div', { class: 'igrid', style: 'display:none' });
  const fill = (info) => {
    const hrs2w = info && info.steamHours2w != null ? info.steamHours2w.toFixed(1) + ' h' : '\u2014';
    grid.replaceChildren(
      cell('Steam playtime', info && info.steamHours != null ? info.steamHours.toFixed(1) + ' h' : '\u2014'),
      cell('Ultimele 2 săpt.', hrs2w),
      cell('Achievements', info && info.achievements ? (info.achievements.total ? `${info.achievements.done} / ${info.achievements.total}` : 'none') : '\u2014'),
      cell('Trading cards', info ? (info.cards.total ? `${info.cards.owned == null ? '?' : info.cards.owned} / ${info.cards.total}` : info.cards.has === true ? 'yes' : info.cards.has === false ? 'no' : '\u2014') : '\u2014'),
      cell('Card drops left', dropTxt(info ? info.dropsLeft : (a.cardDrops && a.cardDrops[appid] !== undefined ? a.cardDrops[appid] : null))),
      cell('App ID', String(appid)));
    // ore ultimele 2 sapt per joc (toate jocurile contului)
    if (info && info.recentGames && info.recentGames.length) {
      recentHours.style.display = '';
      recentHours.replaceChildren(
        h('div', { class: 'cell', style: 'grid-column:1/-1' }, h('b', {}, 'Ore ultimele 2 săptămâni — toate jocurile')),
        ...info.recentGames.map((rg) => cell(rg.name || String(rg.appid), rg.hours.toFixed(1) + ' h'))
      );
    } else { recentHours.style.display = 'none'; }
  };
  const loading = h('div', { class: 'inote' }, h('span', { class: 'spin' }), 'Loading info\u2026');
  fill(null);
  const act = (action, label, cls, confirmText) => h('button', { class: 'btn ' + cls, id: 'ga-' + action, disabled: 'disabled', onclick: async () => {
    if (confirmText && !confirm(confirmText)) return;
    try { const r = await window.api.gameLocal({ appid, action }); if (r && r.error) toast(r.error, 'bad'); else toast((r && r.message) || 'Done', 'ok'); }
    catch (e) { toast(e.message || String(e), 'bad'); }
  } }, label);
  const store = h('button', { class: 'btn ghost', onclick: () => window.open(`https://store.steampowered.com/app/${appid}`, '_blank') }, 'Store page');
  if (isWeb()) acts.append(h('div', { class: 'inote' }, 'Install, launch, uninstall and open folder only work in the app on the PC.'), store);
  else acts.append(act('install', 'Install', 'red'), act('launch', 'Launch', 'start'), act('folder', 'Open folder', 'ghost'), act('uninstall', 'Uninstall', 'stop', `Uninstall ${g.name} from this PC?\nSteam will ask you to confirm.`), store);
  showModal(h('div', { class: 'modal' },
    h('div', { class: 'ahead' }, gameImg(g), h('div', {}, h('h2', {}, g.name), h('small', {}, a.personaName))),
    grid, recentHours, loading, notes,
    isCS ? h('div', { class: 'modal-section' }, h('b', { style: 'display:block;margin-bottom:6px' }, 'Player Stats'), psLoading, psSection) : null,
    acts,
    h('div', { class: 'mact' }, h('button', { class: 'btn ghost', onclick: closeModal }, 'Close'))));
  window.api.gameInfo({ accountId: accId, appid }).then((info) => {
    loading.remove();
    if (info.error) { notes.textContent = info.error; return; }
    fill(info);
    if (info.steamId) a.steamId = info.steamId;
    const li = info.local || {};
    notes.replaceChildren(...info.notes.map((n) => h('div', {}, n)),
      !isWeb() ? h('div', {}, li.steamFound === false ? 'Steam was not found on this PC.' : li.installed ? 'Installed on this PC.' : 'Not installed on this PC.') : null);
    if (!isWeb()) {
      const on = (id, ok) => { const b = document.getElementById(id); if (b) b.disabled = !ok; };
      on('ga-install', li.steamFound !== false && !li.installed); on('ga-launch', !!(li.installed && li.dirExists)); on('ga-folder', !!(li.installed && li.dirExists)); on('ga-uninstall', !!li.installed);
    }
    // Daca e Counter-Strike, incarca Player Stats inline
    if (isCS && (info.steamId || a.steamId)) {
      const sid = info.steamId || a.steamId;
      if (info.steamId) a.steamId = info.steamId;
      window.api.utilLookup('https://steamcommunity.com/profiles/' + sid, { account: false }).then((r) => {
        if (psLoading && psLoading.parentNode) psLoading.remove();
        if (r && !r.error) psSection.replaceChildren(playerCard(r, { compact: true }));
        else psSection.replaceChildren(h('small', { class: 'unote' }, r && r.error ? r.error : 'Nu s-au putut incarca statisticile.'));
      }).catch((e) => { if (psLoading && psLoading.parentNode) psLoading.remove(); psSection.replaceChildren(h('small', { class: 'unote' }, e.message || 'Eroare la incarcare.')); });
    } else if (isCS) {
      if (psLoading && psLoading.parentNode) psLoading.remove();
      psSection.replaceChildren(h('small', { class: 'unote' }, 'Steam ID negasit pentru acest cont.'));
    }
  }).catch((e) => { loading.remove(); notes.textContent = e.message || String(e); });
}

function openAccount(accId) {
  const a = accounts.find((x) => x.id === accId); if (!a) return;
  const body = h('div', { class: 'isecs' });
  const notes = h('div', { class: 'inote' });
  const scanBox = h('div', { class: 'iscan' });
  const cardBox = h('div', { class: 'iscan' });
  const links = h('div', { class: 'iacts' });
  const csBox = h('div', { class: 'isec' });                 // CS2 player check of this account (same card as the Utility player checker)
  const valueBox = h('div', { class: 'isec valbox' });       // very bottom: library value + playtime
  const boostedAll = Object.values(a.gameSeconds || {}).reduce((x, y) => x + y, 0);
  const D = '\u2014', num = (v) => (v == null ? D : Number(v).toLocaleString(uiLocale()));
  const cap = (t) => (t ? t[0].toUpperCase() + t.slice(1) : D);
  let last = null;
  const sec = (title, cells) => { const c = cells.filter(Boolean); return c.length ? h('div', { class: 'isec' }, h('h3', {}, title), h('div', { class: 'igrid' }, c)) : null; };
  const fill = (i) => {
    const t = i && i.ach, c = (i && i.counts) || {}, drops = i ? i.drops : null;
    body.replaceChildren(...[
      sec('Profile', [
        cell('Level', i && i.level != null ? String(i.level) : D),
        cell('Member since', i && i.memberSince ? i.memberSince : D),
        cell('Status', i && i.status ? cap(i.status) : D),
        cell('Profile privacy', i && i.privacy ? cap(i.privacy) : D),
        cell('Friends', num(c.Friends)), cell('Groups', num(c.Groups)),
        cell('Badges', num(c.Badges)), cell('Screenshots', num(c.Screenshots)),
        c.Reviews != null ? cell('Reviews', num(c.Reviews)) : null,
        c.Inventory != null ? cell('Inventory items', num(c.Inventory)) : null,
        i && i.realName ? cell('Real name', i.realName) : null,
        i && i.location ? cell('Location', i.location) : null]),
      sec('Library', [
        cell('Games', String(a.games.length)),
        cell('Never played', i && i.neverPlayed != null ? String(i.neverPlayed) : D),
        cell('Steam playtime (all games)', i && i.steamHoursTotal != null ? Math.round(i.steamHoursTotal).toLocaleString(uiLocale()) + ' h' : D),
        cell('Last 2 weeks', i && i.hours2w != null ? i.hours2w.toFixed(1) + ' h' : D),
        cell('Games with trading cards', i ? (i.cardFlagKnown ? String(i.cardGames) : 'refresh game list') : D),
        cell('Card drops left', drops ? `${drops.total} in ${drops.games} games` : D)]),
      sec('Achievements', [
        cell('Unlocked', t && t.total ? `${t.done} / ${t.total}` : D),
        cell('Completion', t && t.total ? (t.done / t.total * 100).toFixed(1) + '%' : D),
        cell('Perfect games', t && t.games ? `${t.perfect} / ${t.games}` : D),
        cell('Games counted', t && t.scanned ? `${t.scanned} / ${t.of}` : D)]),
      sec('Wella Hub', [
        cell('Boosted hours (all games)', hrs1(boostedAll)),
        cell('Booster running time', hrs1(a.totalSeconds || 0)),
        cell('Boosting now', a.status === 'boosting' ? `${a.selected.length} game${a.selected.length === 1 ? '' : 's'}` : 'No'),
        cell('Games selected', String(a.selected.length))]),
      i && i.vacBanned !== undefined ? sec('Account health', [
        cell('VAC ban', i.vacBanned ? (i.vacCount > 1 ? i.vacCount + ' on record' : 'Yes') : 'None', i.vacBanned ? 'bad' : 'good'),
        cell('Game ban', i.gameBans ? (i.gameBans > 1 ? i.gameBans + ' on record' : 'Yes') : (i.gameBans === undefined ? 'Unknown' : 'None'), i.gameBans ? 'bad' : (i.gameBans === undefined ? '' : 'good')),
        (i.vacBanned || i.gameBans) && i.daysSinceBan != null ? cell('Since last ban', i.daysSinceBan + ' day' + (i.daysSinceBan === 1 ? '' : 's')) : null,
        i.communityBanned ? cell('Community ban', 'Yes', 'bad') : null,
        cell('Trade ban', !i.tradeBan || /none/i.test(i.tradeBan) ? 'None' : i.tradeBan, !i.tradeBan || /none/i.test(i.tradeBan) ? 'good' : 'bad'),
        cell('Limited account', i.limited ? 'Yes' : 'No', i.limited ? 'bad' : 'good')].filter(Boolean)) : null,
      i && i.topGames && i.topGames.length ? h('div', { class: 'isec' }, h('h3', {}, 'Most played'),
        i.topGames.map((g) => h('div', { class: 'itop' }, h('span', {}, g.name), h('b', {}, Math.round(g.hours).toLocaleString(uiLocale()) + ' h')))) : null
    ].filter(Boolean));
  };
  const drawCards = (msg) => {
    const b = h('button', { class: 'btn ghost sm', onclick: runCards }, 'Update trading card info');
    cardBox.replaceChildren(h('small', {}, msg || (a.cardsT ? `Card drops read ${agoText(a.cardsT)}. No game is started.` : 'Reads which games still have card drops left. No game is started.')), b);
  };
  const runCards = async () => {
    cardBox.replaceChildren(h('span', { class: 'spin' }), h('small', {}, 'Reading card info\u2026'));
    let r; try { r = await window.api.cardsScan(accId); } catch (e) { r = { error: e.message || String(e) }; }
    if (r.error) { drawCards(r.error); return; }
    if (last) last.drops = { games: r.games, total: r.total, t: r.t };
    fill(last); drawCards(`${r.games} games with card drops left, ${r.total} cards to get.`);
  };
  const drawScan = (t) => {
    const b = h('button', { class: 'btn red', onclick: runScan }, t && t.scanned ? 'Rescan achievements' : 'Scan achievements');
    scanBox.replaceChildren(h('small', {}, t && t.scanned ? `Counted from ${t.scanned} of ${t.of} games. Scanning reads your public profile; no game is started.` : 'Counts achievements in every game on this account. Takes a while for big libraries; no game is started.'), b);
  };
  const runScan = async () => {
    const bar = h('i', { style: 'width:0%' }), line = h('small', {}, 'Starting\u2026');
    const cancel = h('button', { class: 'btn stop sm', onclick: () => window.api.accountScanCancel() }, 'Stop');
    scanBox.replaceChildren(line, h('div', { class: 'bar wide' }, bar), cancel);
    window._scanUI = { bar, line };
    let r;
    try { r = await window.api.accountScan(accId); } catch (e) { r = { error: e.message || String(e) }; }
    window._scanUI = null;
    if (r.error) { scanBox.replaceChildren(h('small', { class: 'err' }, r.error)); return; }
    if (last) last.ach = r.totals;
    fill(last); drawScan(r.totals);
    if (r.blocked) toast('Steam hides this profile\u2019s game details, so the scan stopped. Set Game details to Public (or open games one by one in Achievement Manager).', 'bad');
  };
  const CCS = [['us', 'USD'], ['de', 'EUR'], ['gb', 'GBP'], ['ro', 'RON']];
  const drawValue = async (cc) => {
    const head = (extra) => h('div', { class: 'valhead' }, h('h3', {}, 'Library & hours value'), extra || null);
    valueBox.replaceChildren(head(), h('div', { class: 'inote' }, h('span', { class: 'spin' }), 'Reading store prices\u2026'));
    let v; try { v = await window.api.accountValue({ id: accId, cc }); } catch (e) { v = { error: e.message || String(e) }; }
    if (v.error) { valueBox.replaceChildren(head(), h('div', { class: 'inote err' }, v.error), h('button', { class: 'btn ghost sm', onclick: () => drawValue(cc) }, 'Try again')); return; }
    const sel = h('select', { class: 'in sm', title: 'Store currency', onchange: (e) => drawValue(e.target.value) }, CCS.map(([k, l]) => h('option', { value: k, selected: k === v.cc ? 'selected' : null }, l)));
    valueBox.replaceChildren(head(sel),
      h('div', { class: 'igrid' },
        cell('Library value', money(v.value, v.currency), 'good'),
        cell('Total playtime', v.hours != null ? Math.round(v.hours).toLocaleString(uiLocale()) + ' h' : D),
        cell('Cost per hour', v.perHour != null ? money(v.perHour, v.currency) : D),
        cell('Games', num(v.games)), cell('With a price', num(v.priced)), cell('Free / no price', num(v.noPrice))),
      v.top && v.top.length ? h('div', { class: 'ublk' }, h('b', {}, 'Most expensive games'), v.top.map((g) => h('div', { class: 'itop' }, h('span', {}, g.name || ('App ' + g.appid)), h('b', {}, money(g.price, v.currency) + (g.hours != null ? ' \u00b7 ' + Math.round(g.hours) + ' h' : ''))))) : null,
      h('small', { class: 'unote' }, 'Current Steam store price of every game today (the same method as the SteamDB calculator), not what was paid. Free and removed games count as 0.' + (v.partial ? ' Some prices could not be read, so the value is incomplete.' : '') + (v.note ? ' ' + v.note : '')));
  };
  const drawCs = async (sid) => {
    csBox.replaceChildren(h('h3', {}, 'Player check (CS2)'), h('div', { class: 'inote' }, h('span', { class: 'spin' }), 'Loading player stats\u2026'));
    let r; try { r = await window.api.utilLookup('https://steamcommunity.com/profiles/' + sid, { account: false }); } catch (e) { r = { error: e.message || String(e) }; }
    csBox.replaceChildren(h('h3', {}, 'Player check (CS2)'), r && !r.error ? playerCard(r, { compact: true }) : h('small', { class: 'unote' }, (r && r.error) || 'Could not load the player stats.'));
  };
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); toast(what + ' copied', 'ok'); } catch { toast('Could not copy', 'bad'); } };
  const drawLinks = (i) => links.replaceChildren(...(i && i.url ? [
    h('button', { class: 'btn ghost', onclick: () => window.open(i.url, '_blank') }, 'Open profile'),
    h('button', { class: 'btn ghost', onclick: () => copy(i.steamId, 'Steam ID') }, 'Copy Steam ID'),
    h('button', { class: 'btn ghost', onclick: () => copy(i.url, 'Link') }, 'Copy link')] : []));
  fill(null); drawScan(null); drawCards();
  showModal(h('div', { class: 'modal acc' },
    h('div', { class: 'ahead' }, a.avatar ? h('img', { class: 'av big', src: a.avatar }) : null, h('div', {}, h('h2', {}, a.personaName), h('small', {}, a.accountName))),
    links, body, notes, cardBox, scanBox, a.games.some((g) => isCounterStrike(g.appid)) ? csBox : null, valueBox,
    h('div', { class: 'mact' }, h('button', { class: 'btn ghost', onclick: closeModal }, 'Close'))));
  drawValue();
  window.api.accountInfo(accId).then((i) => {
    if (i.error) { notes.textContent = i.error; return; }
    last = i; fill(i); drawScan(i.ach); drawCards(); drawLinks(i);
    if (i.steamId && a.games.some((g) => isCounterStrike(g.appid))) drawCs(i.steamId);
    notes.replaceChildren(...i.notes.map((n) => h('div', {}, n)));
  }).catch((e) => { notes.textContent = e.message || String(e); });
}
(window.api.onScanProgress || (() => {}))((m) => {
  const u = window._scanUI; if (!u) return;
  u.bar.style.width = (m.i / m.total * 100) + '%';
  u.line.textContent = `${m.i}/${m.total} \u00b7 ${m.name}`;
});

// global clock: 24-hour time of the computer / phone running the app, i.e. the country where it is used
(function clock() {
  const el = document.getElementById('clk'); if (!el) return;
  const p = (n) => String(n).padStart(2, '0');
  const tick = () => { const d = new Date(); el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; el.title = 'Local time' + (Intl.DateTimeFormat().resolvedOptions().timeZone ? ' (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ')' : ''); };
  tick(); setInterval(tick, 1000);
})();
