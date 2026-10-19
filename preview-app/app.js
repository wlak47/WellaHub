const $ = (s) => document.querySelector(s);
const MAX = 32;
const uiLocale = () => window.WellaI18n ? window.WellaI18n.locale() : 'en-US';
let accounts = [];
let gameRotationOn = false;
let installedAppIds = new Set(), installedAppsAt = 0, installedAppsRequest = null;
const steamGameHours = new Map(), steamGameHoursPending = new Set(), steamGameHoursAt = new Map();
let view = 'all'; // 'all' or account id

function paintSteamHours(accountId) {
  const hours = steamGameHours.get(accountId) || {};
  document.querySelectorAll(`[data-steam-hours-account="${CSS.escape(accountId)}"]`).forEach((el) => {
    const value = hours[el.dataset.steamHoursAppid];
    el.textContent = value == null ? '\u2014' : Number(value).toLocaleString(uiLocale(), { maximumFractionDigits: 1 });
  });
}
function loadSteamGameHours(accountId) {
  if (steamGameHoursPending.has(accountId) || !window.api.gameHours) return;
  if (steamGameHours.has(accountId) && Date.now() - (steamGameHoursAt.get(accountId) || 0) < 5 * 60 * 1000) return;
  steamGameHoursPending.add(accountId);
  window.api.gameHours(accountId).then((hours) => {
    const ok = hours && !hours.error && Object.keys(hours).length;
    if (ok) { steamGameHours.set(accountId, hours); steamGameHoursAt.set(accountId, Date.now()); paintSteamHours(accountId); }
    else { paintSteamHours(accountId); setTimeout(() => loadSteamGameHours(accountId), 30000); }   // could not read it now: try again in 30 s
  }).catch(() => { setTimeout(() => loadSteamGameHours(accountId), 30000); }).finally(() => steamGameHoursPending.delete(accountId));
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
// ---------- inline icons (replace emoji) ----------
const ICONS = {
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  cards: '<rect x="4" y="3" width="11" height="15" rx="2"/><path d="M9 21h8a2 2 0 0 0 2-2V8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
function svgIco(name, size = 16) {
  const s = document.createElement('span'); s.className = 'ico';
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  return s;
}
const closeX = () => h('button', { class: 'dclose', title: 'Close', onclick: closeModal }, svgIco('close', 18));
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
  const img = h('img', { ...props, alt: '', draggable: 'false', decoding: 'async' });
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
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const title = boosting ? `${boosting} account${boosting > 1 ? 's' : ''} boosting` : 'Nothing is boosting right now';
  if ($('#title').textContent !== title) $('#title').textContent = title;
  setPill(boosting > 0 && navigator.onLine);
  const cnt = `${accounts.length} account${accounts.length === 1 ? '' : 's'} · ${boosting} boosting`;
  if ($('#fCount').textContent !== cnt) $('#fCount').textContent = cnt;
  for (const el of document.querySelectorAll('[data-live]')) {
    const [k, id, gid] = el.dataset.live.split('|');
    const a = byId.get(id); if (!a) continue;
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


// Trading cards summary on the account card (numbers come from the Steam badges page read with the account's login). Click = full cards panel.
const durText = (min) => { min = Math.round(Number(min) || 0); if (min <= 0) return '0 min'; if (min < 60) return min + ' min'; const hh = Math.floor(min / 60), m = min % 60; if (hh < 48) return m ? `${hh} h ${m} min` : `${hh} h`; return `${Math.floor(hh / 24)} d ${hh % 24} h`; };
function cardSummary(a, on) {
  const s = a.cardsSum;
  return h('div', { class: 'cdsum clk', title: 'Open the trading cards of this account', onclick: () => openCards(a.id) },
    s ? [h('b', {}, s.drops > 0 ? `${s.drops.toLocaleString(uiLocale())} free cards left in ${s.games} game${s.games === 1 ? '' : 's'}` : 'No free cards left'),
        h('span', {}, `${s.drops > 0 ? 'About ' + durText(s.minutes) + ' to get them all' : 'Every card drop already came'}${s.cardsOwned != null ? ' \u00b7 you hold ' + s.cardsOwned.toLocaleString(uiLocale()) + ' cards' : ''}`),
        on ? h('em', {}, 'Currently in-game') : null]
      : [h('b', {}, 'Trading cards'), h('span', {}, 'Click to read the cards of this account from Steam')]);
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
      h('div', { class: 'who clk', title: (window.__WELLA_WEB && document.body.classList.contains('admin-panel')) ? 'Edit Steam account data' : 'Account info', onclick: () => ((window.__WELLA_WEB && document.body.classList.contains('admin-panel')) ? openProfileEditor(a.id) : openAccount(a.id)) }, h('b', {}, a.personaName),
        h('small', {}, `${a.selected.length} game${a.selected.length === 1 ? '' : 's'} · ${on ? statusLabel(a.persona) : busy ? 'Connecting…' : 'Not boosting'}`)),
      h('div', { class: 'stat' }, h('small', {}, 'This session'), h('div', { class: on ? '' : 'dim', 'data-live': `s|${a.id}` }, fmtHM(a.sessionSeconds))),
      h('div', { class: 'stat' }, h('small', {}, 'Total'), h('div', { 'data-live': `t|${a.id}` }, fmtHM(a.totalSeconds))),
      on ? h('button', { class: 'btn stop', onclick: () => window.api.stop(a.id) }, 'Stop')
         : h('button', { class: 'btn start', disabled: busy, onclick: async () => { const r = await window.api.start(a.id); if (r && r.error) toast(r.error, 'bad'); } }, busy ? 'Starting…' : 'Start'),
      (!on && !busy) ? h('button', { class: 'btn ghost sm ico-btn', title: 'Select only the games that still have card drops and start boosting', onclick: async () => {
        const r = await window.api.boostStartCards(a.id);
        if (r && r.error) toast(r.error, 'bad');
        else if (r && !r.started && r.note) toast(r.note, 'bad');
        else if (r && r.ok) toast(`Boosting ${r.games} game${r.games === 1 ? '' : 's'} with card drops`, 'ok');
      } }, svgIco('cards'), 'Cards') : null,
      h('button', { class: 'icon', title: 'Choose games', onclick: () => openPicker(a) }, '✎'),
      h('button', { class: 'icon', title: 'Remove account', onclick: () => { if (confirm(`Remove ${a.personaName}?`)) window.api.remove(a.id); } }, svgIco('trash', 17))),
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
        h('div', { class: 'hrs' }, h('span', { class: 'steamhrs', title: 'Total hours on Steam for this game', 'data-steam-hours-account': a.id, 'data-steam-hours-appid': g.appid }, steamGameHours.has(a.id) ? (steamGameHours.get(a.id)[g.appid] == null ? '\u2014' : Number(steamGameHours.get(a.id)[g.appid]).toLocaleString(uiLocale(), { maximumFractionDigits: 1 })) : '\u2026'), h('i', { class: 'steamunit' }, 'h'), h('span', { class: 'boostedhrs', title: 'Hours added by the Hour Booster', 'data-live': `g|${a.id}|${g.appid}` }, ((a.gameSeconds[g.appid] || 0) / 3600).toFixed(1)), h('i', {}, 'h'))))
        : h('div', { class: 'empty' }, a.games.length ? 'No games selected. Click the pencil to choose.' : 'No games found on this account.')));
}

// ----- game picker -----
const agoText = (t) => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function openPicker(a) {
  const sel = new Set(a.selected), fav = new Set(a.favorites);
  let q = '', selTop = false, sortMode = 'hours', filterCards = false;
  try { selTop = localStorage.getItem('wella-sel-top') === '1'; } catch {}
  try { sortMode = localStorage.getItem('wella-picker-sort') || 'hours'; } catch {}
  const list = h('div', { class: 'plist' });
  const counter = h('small', {});
  // sort game list according to current sortMode / filterCards
  const base = () => {
    let games = a.games.map((g) => ({ ...g, boostedHours: (a.gameSeconds && a.gameSeconds[g.appid] ? a.gameSeconds[g.appid] / 3600 : 0), dropsLeft: a.cardDrops ? (a.cardDrops[g.appid] != null ? a.cardDrops[g.appid] : null) : null }));
    if (filterCards) games = games.filter((g) => g.dropsLeft != null && g.dropsLeft > 0);
    if (sortMode === 'alpha') games.sort((x, y) => x.name.localeCompare(y.name));
    else if (sortMode === 'noHours') games.sort((x, y) => (x.boostedHours === 0 ? -1 : y.boostedHours === 0 ? 1 : 0) || x.name.localeCompare(y.name));
    else games.sort((x, y) => (y.boostedHours - x.boostedHours) || x.name.localeCompare(y.name));  // 'hours'
    // keep favorites grouped only in non-alpha modes
    if (sortMode !== 'alpha') games = [...games.filter((g) => fav.has(g.appid)), ...games.filter((g) => !fav.has(g.appid))];
    return games;
  };
  const draw = () => {
    list.replaceChildren();
    const games = base().filter((g) => g.name.toLowerCase().includes(q));
    const onTop = selTop ? games.filter((g) => sel.has(g.appid)) : [], onSet = new Set(onTop.map((g) => g.appid));
    const favs = games.filter((g) => fav.has(g.appid) && !onSet.has(g.appid)), rest = games.filter((g) => !fav.has(g.appid) && !onSet.has(g.appid));
    const row = (g) => h('label', { class: 'pi' },
      h('input', { type: 'checkbox', checked: sel.has(g.appid) ? 'checked' : null, onchange: (e) => {
        if (e.target.checked) { if (sel.size >= MAX) { e.target.checked = false; toast(`Max ${MAX} games`, 'bad'); return; } sel.add(g.appid); } else sel.delete(g.appid);
        counter.textContent = `${sel.size}/${MAX} selected`; } }),
      gameImg(g),
      h('span', {}, g.name),
      window.WellaExtra ? window.WellaExtra.hideBtn(g, draw) : null,
      h('button', { class: 'star' + (fav.has(g.appid) ? ' on' : ''), title: 'Favorite', onclick: (e) => { e.preventDefault(); fav.has(g.appid) ? fav.delete(g.appid) : fav.add(g.appid); draw(); } }, '\u2605'));
    if (onTop.length) list.append(h('div', { class: 'sec' }, 'Activated'), ...onTop.map(row));
    if (favs.length) list.append(h('div', { class: 'sec' }, 'Favorites'), ...favs.map(row));
    if (rest.length) list.append(h('div', { class: 'sec' }, favs.length || onTop.length ? 'All games' : `${rest.length} games`), ...rest.map(row));
    if (!games.length) list.append(h('div', { class: 'empty' }, 'No games found.'));
    counter.textContent = `${sel.size}/${MAX} selected`;
  };
  draw();
  // sort toggle buttons — built outside so they can reference each other
  const SORTS = [['hours', 'Most played'], ['alpha', 'A–Z'], ['noHours', '0 hours first']];
  let sortBtns;
  const mkSortBtn = (mode, label) => h('button', { class: 'btn ghost sm' + (sortMode === mode ? ' on' : ''), title: `Sort: ${label}`, onclick: () => {
    sortMode = mode; try { localStorage.setItem('wella-picker-sort', mode); } catch {}
    sortBtns.forEach((b, i) => b.classList.toggle('on', SORTS[i][0] === mode));
    draw(); list.scrollTop = 0;
  } }, label);
  sortBtns = SORTS.map(([m, l]) => mkSortBtn(m, l));
  let filterBtn;
  filterBtn = h('button', { class: 'btn ghost sm ico-btn' + (filterCards ? ' on' : ''), title: 'Show only games that still have card drops', onclick: () => {
    filterCards = !filterCards; filterBtn.classList.toggle('on', filterCards); draw(); list.scrollTop = 0;
  } }, svgIco('cards', 15), 'Cards only');
  showModal(h('div', { class: 'modal' },
    h('h2', {}, `Games on ${a.personaName}`),
    h('input', { class: 'in', placeholder: 'Search games', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } }),
    h('div', { class: 'gtools' },
      (() => { const b = h('button', { class: 'btn ghost' + (selTop ? ' on' : ''), title: 'Show the games that are switched on at the top of the list', onclick: () => { selTop = !selTop; try { localStorage.setItem('wella-sel-top', selTop ? '1' : '0'); } catch {} b.classList.toggle('on', selTop); draw(); list.scrollTop = 0; } }, 'Activated on top'); return b; })(),
      h('button', { class: 'btn ghost', onclick: () => { sel.clear(); for (const g of base().slice(0, MAX)) sel.add(g.appid); draw(); } }, `Select first ${MAX}`),
      h('button', { class: 'btn ghost', title: 'Pick the games that still have free trading cards to drop', onclick: () => openCards(a.id) }, 'Trading cards\u2026'),
      h('button', { class: 'btn text', onclick: () => { sel.clear(); draw(); } }, 'Clear')),
    h('div', { class: 'gtools', style: 'margin-top:4px' }, ...sortBtns, filterBtn),
    list, counter,
    h('div', { class: 'mact' },
      h('button', { class: 'btn text', onclick: async (e) => { e.target.textContent = 'Refreshing\u2026'; const r = await window.api.refreshGames(a.id); closeModal(); toast(r && r.error ? r.error : 'Game list updated', r && r.error ? 'bad' : 'ok'); } }, 'Refresh list'),
      h('button', { class: 'btn ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn red', onclick: async () => { await window.api.update({ id: a.id, selected: [...sel], favorites: [...fav] }); closeModal(); } }, 'Save'))));
}

// ----- Trading cards panel: every game of the account that still drops cards, read from the badges page with the account's login -----
function openCards(accId) {
  const cur = () => accounts.find((x) => x.id === accId);
  const a0 = cur(); if (!a0) return;
  let view = null, busy = false, err = '', q = '', flt = null;
  const body = h('div', { class: 'cards-body' });
  const list = h('div', { class: 'plist cards-list' });
  const chips = h('div', { class: 'cflt' });
  const tile = (label, value, cls) => h('div', { class: 'ctile' }, h('small', {}, label), h('b', { class: cls || '' }, value));
  const num = (n) => (n == null ? '\u2014' : Number(n).toLocaleString(uiLocale()));
  const kind = (g) => (g.noCards ? 'nocards' : g.drops > 0 ? 'drops' : 'none');
  const FLT = [['drops', 'Free cards left'], ['none', 'No free cards left'], ['nocards', 'No trading cards'], ['all', 'All games']];
  const paintChips = () => {
    const all = (view && view.games) || [];
    const n = (k) => (k === 'all' ? all.length : all.filter((g) => kind(g) === k).length);
    chips.replaceChildren(...FLT.map(([k, label]) => h('button', { class: 'chip' + (flt === k ? ' on' : ''), onclick: () => { flt = k; paintChips(); paintList(); } }, `${label} (${n(k)})`)));
  };
  const paintList = () => {
    list.replaceChildren();
    const games = ((view && view.games) || []).filter((g) => (flt === 'all' || kind(g) === flt) && g.name.toLowerCase().includes(q));
    for (const g of games) {
      const k = kind(g), hrs = g.hours ? g.hours.toLocaleString(uiLocale()) + ' h on record' : 'not played yet';
      const sub = k === 'nocards' ? hrs : k === 'drops' ? `${hrs} \u00b7 about ${durText(g.drops * ((view.estimate && view.estimate.minPerDrop) || 30))} for the rest${g.total ? ' \u00b7 set of ' + g.total : ''}` : `${hrs}${g.total ? ' \u00b7 set of ' + g.total : ''}`;
      list.append(h('div', { class: 'pi crow' }, gameImg({ appid: g.appid, name: g.name }),
        h('div', { class: 'cname' }, h('b', {}, g.name), h('small', {}, sub)),
        k === 'nocards' ? null : h('span', { class: 'chave', title: 'Different cards you hold / cards in the set' }, g.total ? `${g.have}/${g.total}` : `${g.have}`),
        k === 'drops' ? h('em', { class: 'cdrop', title: 'Free card drops still to come' }, `${g.drops} left`)
          : k === 'nocards' ? h('em', { class: 'cdone', title: 'This game has no trading cards' }, 'No trading cards')
          : h('em', { class: 'cdone', title: 'Steam says: No card drops remaining' }, 'No free cards left')));
    }
    if (!games.length) list.append(h('div', { class: 'empty' }, view ? (flt === 'drops' ? 'No free cards left on this account.' : 'No game matches.') : ''));
  };
  const paint = () => {
    const kids = [];
    if (busy) kids.push(h('div', { class: 'cinfo' }, h('span', { class: 'spin' }), 'Reading badges, cards and set sizes from Steam\u2026 this can take a minute.'));
    if (err) kids.push(h('div', { class: 'cinfo' }, h('span', { class: 'err' }, err)));
    if (view) {
      const e = view.estimate;
      kids.push(h('div', { class: 'ctiles' },
        tile('Free cards still to drop', num(e.drops), 'good'), tile('Games with drops left', num(e.games)),
        tile('Estimated time', e.games ? durText(e.minutes) : 'Nothing left'),
        tile('Cards you hold', num(view.cardsOwned)), tile('Sets you can finish free', num(view.freeSets)), tile('Complete sets held', num(view.setsComplete))));
      kids.push(h('small', { class: 'unote' }, e.games
        ? `Estimate: about ${e.minPerDrop} min per card for each game, with ${e.parallel} game${e.parallel === 1 ? '' : 's'} idling at once (Steam allows ${MAX}). Steam does not publish its drop rate, so this is a rough guide. Read ${agoText(view.t)}.`
        : `Read ${agoText(view.t)}.`));
      if (view.note) kids.push(h('small', { class: 'unote' }, view.note));
    } else if (!busy && !err) kids.push(h('div', { class: 'empty' }, 'Nothing read yet.'));
    body.replaceChildren(...kids);
    if (view && flt == null) flt = view.estimate && view.estimate.games ? 'drops' : 'all';
    chips.style.display = view ? '' : 'none';
    paintChips(); paintList();
  };
  const scan = async () => {
    if (busy) return;
    busy = true; err = ''; paint();
    let r; try { r = await window.api.cardsScan(accId); } catch (e) { r = { error: e.message || String(e) }; }
    busy = false;
    if (r && r.error) err = r.error; else if (r && r.view) view = r.view;
    paint();
  };
  const boost = async () => {
    const acc = cur(); if (!acc || !view) return;
    const mine = new Set((acc.games || []).map((g) => g.appid));
    const picks = view.games.filter((g) => g.drops > 0 && mine.has(g.appid)).slice(0, MAX).map((g) => g.appid);
    if (!picks.length) { toast('No game with free cards left on this account.', 'bad'); return; }
    await window.api.update({ id: accId, selected: picks });
    closeModal(); toast(`${picks.length} game${picks.length === 1 ? '' : 's'} with the most free cards selected. Press Start to boost them.`, 'ok');
  };
  paint();
  showModal(h('div', { class: 'modal cardsm' },
    h('div', { class: 'ahead' }, a0.avatar ? h('img', { class: 'av big', src: a0.avatar }) : null, h('div', {}, h('h2', {}, 'Trading cards'), h('small', {}, a0.personaName))),
    body,
    h('input', { class: 'in', placeholder: 'Search games', oninput: (e) => { q = e.target.value.toLowerCase(); paintList(); } }),
    chips,
    list,
    h('div', { class: 'mact' },
      h('button', { class: 'btn ghost', onclick: scan }, '\u21bb Read from Steam'),
      h('button', { class: 'btn ghost', title: `Select the ${MAX} games with the most free cards left for boosting`, onclick: boost }, `Select top ${MAX} to boost`),
      h('button', { class: 'btn red', onclick: closeModal }, 'Close'))));
  window.api.cardsGet(accId).then((r) => { if (r && r.view) { view = r.view; paint(); } if (!view || Date.now() - view.t > 3600e3) scan(); }).catch(() => scan());
}

// ----- Steam profile editor: opens on its own, changes go to Steam only when "Commit changes" is pressed -----
// Text, avatar and privacy are edited right here. Background, mini profile, theme, featured badge, favorite group and showcases open Steam's own edit page inside the app, already signed in as the account.
function openProfileEditor(accId) {
  const a = accounts.find((x) => x.id === accId); if (!a) return;
  let orig = null, origPriv = null, saving = false, avatarPick = null;
  const status = h('div', { class: 'pe-status' });
  const fields = {};
  const mk = (key, label, el, hint) => { fields[key] = el; return h('div', { class: 'pe-field' }, h('label', {}, label), el, hint ? h('small', {}, hint) : null); };
  const input = (key, ph, max) => h('input', { class: 'in', placeholder: ph, maxlength: String(max), oninput: refresh });
  const name = input('personaName', 'Profile name', 32), real = input('realName', 'Real name', 32), url = input('customURL', 'custom_url', 32);
  const sum = h('textarea', { class: 'in pe-sum', placeholder: 'Summary shown on the profile', maxlength: '2000', oninput: refresh });
  const count = h('small', { class: 'pe-count' });
  const commit = h('button', { class: 'btn red', disabled: true, onclick: () => doCommit() }, 'Commit changes');
  const discard = h('button', { class: 'btn ghost', disabled: true, onclick: () => { fill(orig, origPriv); } }, 'Discard');

  // avatar: pick a file now, it is uploaded on Commit
  const avPrev = h('img', { class: 'av big pe-av', src: a.avatar || '' });
  const avNote = h('small', {}, 'JPG, PNG or GIF up to 1 MB. Steam shows it at 184\u00d7184.');
  const avBtn = h('button', { class: 'btn ghost sm', onclick: async () => {
    let r; try { r = await window.api.profilePickAvatar(); } catch (e) { r = { error: e.message || String(e) }; }
    if (!r || r.canceled) return;
    if (r.error) { status.replaceChildren(h('span', { class: 'err' }, r.error)); return; }
    avatarPick = r; avPrev.src = r.preview; avNote.textContent = `${r.name} \u00b7 ${Math.round(r.size / 1024)} KB \u00b7 uploaded when you press Commit changes`; status.replaceChildren(); refresh();
  } }, 'Choose image\u2026');
  const avatarBox = window.__WELLA_WEB ? null : h('div', { class: 'pe-field', id: 'pe-avatar' }, h('label', {}, 'Avatar'), h('div', { class: 'pe-avrow' }, avPrev, h('div', { class: 'pe-avcol' }, avBtn, avNote)));

  // privacy: 1 private, 2 friends only, 3 public (comments: 0 friends only, 1 public, 2 private)
  const PRIV = [['profile', 'My profile'], ['ownedGames', 'Game details'], ['playtime', 'Total playtime'], ['inventory', 'Inventory'], ['gifts', 'Gifts in inventory'], ['friends', 'Friends list']];
  const OPT3 = [[3, 'Public'], [2, 'Friends only'], [1, 'Private']];
  const sel = (opts) => h('select', { class: 'in pe-sel', onchange: refresh }, opts.map(([v, l]) => h('option', { value: String(v) }, l)));
  const privSel = {}; for (const [k] of PRIV) privSel[k] = sel(OPT3);
  privSel.comments = sel([[1, 'Public'], [0, 'Friends only'], [2, 'Private']]);
  const privBox = h('div', { class: 'pe-field hidden', id: 'pe-privacy' }, h('label', {}, 'Privacy settings'),
    h('div', { class: 'pe-privgrid' }, [...PRIV, ['comments', 'Comments']].map(([k, l]) => h('div', { class: 'pe-privrow' }, h('span', {}, l), privSel[k]))));

  // Steam's own pages
  const WEBP = [['background', 'Profile background'], ['miniprofile', 'Mini profile'], ['theme', 'Profile theme'], ['badge', 'Featured badge'], ['favoritegroup', 'Favorite group'], ['showcases', 'Showcases'], ['avatar', 'Avatar frame']];
  const openWeb = async (page) => {
    status.replaceChildren(h('span', { class: 'spin' }), 'Opening Steam\u2019s editor\u2026');
    let r; try { r = await window.api.profileOpenWeb({ id: accId, page }); } catch (e) { r = { error: e.message || String(e) }; }
    if (r && r.error) status.replaceChildren(h('span', { class: 'err' }, r.error)); else status.replaceChildren();
  };
  const webBox = window.__WELLA_WEB ? null : h('div', { class: 'pe-field' }, h('label', {}, 'More on Steam'),
    h('div', { class: 'pe-web' }, WEBP.map(([pg, l]) => h('button', { class: 'chip', onclick: () => openWeb(pg) }, l))),
    h('small', {}, 'Opens Steam\u2019s own page for this in a window of the app, signed in as this account. The login is not kept after you close it.'));

  const form = h('div', { class: 'pe-form hidden' },
    avatarBox,
    mk('personaName', 'Profile name', name), mk('realName', 'Real name', real),
    mk('customURL', 'Custom URL', url, 'steamcommunity.com/id/\u2026 (3 to 32 letters, digits, _ or -)'),
    mk('summary', 'Summary', sum), count, privBox, webBox);
  const values = () => ({ personaName: name.value, realName: real.value, customURL: url.value, summary: sum.value });
  const diff = () => { if (!orig) return {}; const v = values(), out = {}; for (const k of Object.keys(v)) if (v[k] !== orig[k]) out[k] = v[k]; return out; };
  const privDiff = () => { if (!origPriv) return {}; const out = {}; for (const k of Object.keys(privSel)) if (k in origPriv && Number(privSel[k].value) !== Number(origPriv[k])) out[k] = Number(privSel[k].value); return out; };
  const total = () => Object.keys(diff()).length + Object.keys(privDiff()).length + (avatarPick ? 1 : 0);
  function refresh() {
    const d = diff(), pd = privDiff(), n = total();
    for (const k of Object.keys(fields)) fields[k].classList.toggle('changed', k in d);
    privBox.classList.toggle('changed', Object.keys(pd).length > 0);
    if (avatarBox) avatarBox.classList.toggle('changed', !!avatarPick);
    count.textContent = `${[...sum.value].length}/2000`;
    commit.disabled = saving || !n; discard.disabled = saving || !n;
    commit.textContent = saving ? 'Saving\u2026' : n ? `Commit changes (${n})` : 'Commit changes';
  }
  function fill(p, pr) {
    name.value = p.personaName; real.value = p.realName; url.value = p.customURL; sum.value = p.summary;
    if (pr) for (const k of Object.keys(privSel)) if (k in pr) privSel[k].value = String(pr[k]);
    privBox.classList.toggle('hidden', !pr);
    avatarPick = null; { const ca = accounts.find((x) => x.id === accId); avPrev.src = (ca && ca.avatar) || a.avatar || ''; } avNote.textContent = 'JPG, PNG or GIF up to 1 MB. Steam shows it at 184\u00d7184.';
    refresh();
  }
  async function doCommit() {
    const d = diff(), pd = privDiff(); if (!total() || saving) return;
    saving = true; status.replaceChildren(h('span', { class: 'spin' }), 'Sending the changes to Steam\u2026'); refresh();
    const errs = []; let verified = true;
    if (Object.keys(d).length) {
      let r; try { r = await window.api.profileSave({ id: accId, changes: d }); } catch (e) { r = { error: e.message || String(e) }; }
      if (r && r.error) errs.push(r.error); else { orig = { ...orig, ...r.profile }; verified = verified && r.verified; }
    }
    if (Object.keys(pd).length) {
      let r; try { r = await window.api.profilePrivacySave({ id: accId, changes: pd }); } catch (e) { r = { error: e.message || String(e) }; }
      if (r && r.error) errs.push(r.error); else { origPriv = { ...origPriv, ...r.privacy }; verified = verified && r.verified; }
    }
    let newAv = false;
    if (avatarPick) {
      let r; try { r = await window.api.profileAvatar(accId); } catch (e) { r = { error: e.message || String(e) }; }
      if (r && r.error) errs.push(r.error); else { newAv = true; avatarPick = null; }
    }
    saving = false;
    const cur = accounts.find((x) => x.id === accId);
    if (newAv && cur && cur.avatar) avPrev.src = cur.avatar;
    const keepPick = avatarPick; fill(orig, origPriv); if (keepPick) { avatarPick = keepPick; refresh(); }
    if (errs.length) { status.replaceChildren(...errs.map((m) => h('div', { class: 'err' }, m))); return; }
    status.replaceChildren(h('span', { class: 'okk' }, verified ? 'Saved. Steam now shows these values.' : 'Saved. Steam accepted the changes.'));
    toast('Steam profile updated', 'ok');
  }
  async function load() {
    form.classList.add('hidden'); status.replaceChildren(h('span', { class: 'spin' }), 'Reading the profile from Steam\u2026');
    let r; try { r = await window.api.profileGet(accId); } catch (e) { r = { error: e.message || String(e) }; }
    if (r && r.error) { status.replaceChildren(h('span', { class: 'err' }, r.error), h('button', { class: 'btn text sm', onclick: load }, 'Try again')); return; }
    orig = r.profile; origPriv = r.privacy || null; status.replaceChildren(); form.classList.remove('hidden'); fill(orig, origPriv);
  }
  showModal(h('div', { class: 'modal pe' },
    h('div', { class: 'ahead' }, a.avatar ? h('img', { class: 'av big', src: a.avatar }) : null, h('div', {}, h('h2', {}, 'Edit Steam profile'), h('small', {}, `${a.personaName} \u00b7 changes are sent to Steam only when you press Commit changes`))),
    status, form,
    h('div', { class: 'mact' },
      h('button', { class: 'btn text', onclick: () => openAccount(accId) }, 'Back'),
      discard, commit)));
  load();
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

// ----- Find game button -----
const searchBtn = h('button', { class: 'btn ghost sm ico-btn', title: 'Find a game across all accounts', onclick: openGlobalSearch }, svgIco('search'), 'Find game');
document.querySelector('.head-actions').prepend(searchBtn);
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
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const x of list) {
    const a = byId.get(x.id);
    if (a) { a.sessionSeconds = x.s; a.totalSeconds = x.t; a.gameSeconds = a.gameSeconds || {}; Object.assign(a.gameSeconds, x.g || {}); }
  }
  tick();
});
(async () => { // the colours are stored on the PC, so the phone and the desktop always match
  try { const t = await window.api.getTheme(); if (t) window.WellaTheme.load(t); else window.api.setTheme(window.WellaTheme.get()); } catch {}
})();
(window.api.onTheme || (() => {}))((t) => window.WellaTheme.load(t));
(async () => { accounts = await window.api.list(); $('#fVer').textContent = await window.api.version(); render();
  try { const pf = await window.api.getPrefs(); if (pf && pf.dashTab !== false && tab === 'boost' && !(window.__WELLA_WEB && document.body.classList.contains('admin-panel'))) setTab('dash'); } catch {}   // the app opens on the Dashboard
  splashReady(); refreshBans(); if (window.__WELLA_WEB) refreshInstalledApps(true); })();
if (window.__WELLA_WEB) setInterval(() => refreshInstalledApps(true), 5 * 60 * 1000);

// ================= Dashboard (all accounts: overview + boost history) =================
async function buildDashboard(host, startTab) {
  let tabKey = startTab === 'history' ? 'history' : 'overview';
  let sortKey = 'name', filterKey = 'all';
  let rows = [], log = [];
  const steam = new Map();            // accountId -> { hours, played } | null (could not be read)
  const steamAt = new Map();
  const steamBusy = new Set();
  const body = h('div', { class: 'dbody' });
  const tabBtns = {};
  const tabsEl = h('div', { class: 'dtabs' });
  for (const [k, l] of [['overview', 'Overview'], ['history', 'History']]) {
    tabBtns[k] = h('button', { class: 'btn ghost sm' + (k === tabKey ? ' on' : ''), onclick: () => {
      tabKey = k; for (const x in tabBtns) tabBtns[x].classList.toggle('on', x === k); body.scrollTop = 0; paint();
    } }, l);
    tabsEl.append(tabBtns[k]);
  }
  const root = h('div', { class: 'dashpage' },
    h('div', { class: 'dhead' }, h('div', {}, h('h2', {}, 'Dashboard'), h('small', {}, 'All accounts in one place')), tabsEl),
    body);

  const num = (n, d = 0) => Number(n || 0).toLocaleString(uiLocale(), { maximumFractionDigits: d });
  const stat = (label, value, sub, good) => h('div', { class: 'dstat' },
    h('small', {}, label), h('b', { class: good ? 'good' : '' }, value), sub ? h('em', {}, sub) : null);
  const tile = (label, value, good, extra) => h('div', { class: 'ctile' + (extra ? ' ' + extra : '') }, h('small', {}, label), h('b', { class: good ? 'good' : '' }, value));

  const merge = () => {
    const today = (log.find((e) => e.today) || {}).accounts || {};
    return rows.map((r) => {
      const a = accounts.find((x) => x.id === r.id) || {};
      const st = a.status || r.status;
      const t = today[r.id] || {};
      return { ...r, games: (a.games || []).length, selected: (a.selected || []).length, session: a.sessionSeconds || 0,
        boosting: st === 'boosting', connecting: st === 'connecting', healthy: a.health ? !!a.health.ok : null,
        hToday: t.hours || 0, cToday: t.cards || 0,
        steamLoaded: steam.has(r.id), steamHours: steam.get(r.id) ? steam.get(r.id).hours : null, steamPlayed: steam.get(r.id) ? steam.get(r.id).played : null };
    });
  };

  const buildOverview = () => {
    const all = merge();
    if (!all.length) return h('div', { class: 'empty' }, 'No accounts added yet.');
    const sum = (f) => all.reduce((s, r) => s + (f(r) || 0), 0);
    const boosting = all.filter((r) => r.boosting).length;
    const steamRead = all.filter((r) => r.steamHours != null).length;
    const steamSum = all.reduce((s, r) => s + (r.steamHours || 0), 0);
    const longest = Math.max(0, ...all.filter((r) => r.drops > 0 && r.estimateMinutes != null).map((r) => r.estimateMinutes));
    const summary = h('div', { class: 'dsum' },
      stat('Accounts', num(all.length)),
      stat('Boosting now', `${boosting} / ${all.length}`, null, boosting > 0),
      stat('Steam hours (all time)', steamRead ? num(steamSum, 0) : (steamBusy.size ? 'Loading\u2026' : '\u2014'), steamRead && steamRead < all.length ? `${steamRead} of ${all.length} accounts returned playtime data` : (steamRead ? 'from Steam playtime records' : null), steamRead > 0),
      stat('Boosted hours', num(sum((r) => r.totalHours), 1)),
      stat('Hours today', num(sum((r) => r.hToday), 1)),
      stat('Cards left', num(sum((r) => r.drops)), `${num(sum((r) => r.gamesWithDrops))} games`, sum((r) => r.drops) > 0),
      stat('Longest est. time', longest ? durText(longest) : '\u2014'),
      stat('Cards today', num(sum((r) => r.cToday))),
      stat('Games owned', num(sum((r) => r.games))),
      stat('Games selected', num(sum((r) => r.selected))),
      stat('Complete sets', num(sum((r) => r.setsComplete))),
      stat('Cards held', num(sum((r) => r.cardsOwned))));

    const sorters = {
      name: (x, y) => x.name.localeCompare(y.name),
      hours: (x, y) => y.totalHours - x.totalHours,
      cards: (x, y) => y.drops - x.drops,
      boosting: (x, y) => (y.boosting - x.boosting) || x.name.localeCompare(y.name),
    };
    const filters = { all: () => true, boosting: (r) => r.boosting, idle: (r) => !r.boosting, cards: (r) => r.drops > 0 };
    const sortSel = h('select', { class: 'in dsort', onchange: (e) => { sortKey = e.target.value; paint(); } },
      ...[['name', 'Name'], ['boosting', 'Boosting first'], ['hours', 'Most hours'], ['cards', 'Most cards left']].map(([v, l]) => h('option', { value: v, selected: v === sortKey ? 'selected' : null }, l)));
    const chips = h('div', { class: 'dchips' }, ...[['all', 'All'], ['boosting', 'Boosting'], ['idle', 'Idle'], ['cards', 'With cards left']].map(([k, l]) =>
      h('button', { class: 'btn ghost sm' + (filterKey === k ? ' on' : ''), onclick: () => { filterKey = k; paint(); } }, l)));
    const bar = h('div', { class: 'dbar' }, chips, sortSel);

    const list = all.filter(filters[filterKey]).sort(sorters[sortKey]);
    const grid = h('div', { class: 'dgrid' }, ...(list.length ? list.map(accCard) : [h('div', { class: 'empty' }, 'No accounts match this filter.')]));
    return h('div', { class: 'dwrap' }, summary, bar, grid);
  };

  const accCard = (r) => {
    const est = r.estimateText || (r.estimateMinutes != null ? durText(r.estimateMinutes) : null);
    const state = r.boosting ? 'Boosting' : r.connecting ? 'Connecting\u2026' : 'Idle';
    return h('div', { class: 'dacc' + (r.boosting ? ' on' : '') },
      h('div', { class: 'dtop' },
        h('div', { class: 'dav' }, r.avatar ? h('img', { src: r.avatar, draggable: 'false' }) : h('div', { class: 'dph' }, (r.name || '?')[0].toUpperCase()),
          h('i', { class: 'ddot' + (r.boosting ? (r.healthy === false ? ' warn' : ' live') : '') })),
        h('div', { class: 'dwho' },
          h('b', {}, r.name),
          h('small', {}, `${r.games} games \u00b7 ${r.selected} selected`)),
        h('span', { class: 'dpill' + (r.boosting ? ' on' : '') }, state)),
      h('div', { class: 'ctiles dtiles' },
        tile('Steam hours (all time)', r.steamHours != null ? num(r.steamHours, 0) + ' h' : (r.steamLoaded ? 'Hidden' : 'Loading\u2026'), r.steamHours != null, 'wide'),
        tile('Games played', r.steamPlayed != null ? `${num(r.steamPlayed)} / ${num(r.games)}` : (r.steamLoaded ? '\u2014' : 'Loading\u2026'), false, 'wide'),
        tile('Session', r.boosting ? fmtHM(r.session) : '\u2014'),
        tile('Today', num(r.hToday, 1) + ' h'),
        tile('Boosted hours', num(r.totalHours, 1)),
        tile('Cards left', r.drops > 0 ? `${r.drops} (${r.gamesWithDrops} games)` : 'None', r.drops > 0),
        tile('Est. time', r.drops > 0 ? (est || '\u2014') : '\u2014'),
        tile('Complete sets', r.setsComplete != null ? r.setsComplete : '\u2014'),
        tile('Cards held', r.cardsOwned != null ? num(r.cardsOwned) : '\u2014'),
        tile('Cards today', num(r.cToday))),
      h('div', { class: 'dact' },
        r.boosting
          ? h('button', { class: 'btn stop sm', onclick: async () => { await window.api.stop(r.id); setTimeout(refresh, 800); } }, 'Stop')
          : h('button', { class: 'btn start sm', disabled: r.connecting ? 'disabled' : null, onclick: async () => { const x = await window.api.start(r.id); if (x && x.error) toast(x.error, 'bad'); setTimeout(refresh, 800); } }, 'Start'),
        h('button', { class: 'btn ghost sm', onclick: () => openCards(r.id) }, 'Cards'),
        h('button', { class: 'btn ghost sm', onclick: async () => {
          const g = await window.api.cardsCraftGuide(r.id);
          if (g && g.error) toast(g.error, 'bad'); else openCraftGuide(r.name, g);
        } }, 'Craft guide')));
  };

  const buildHistory = () => {
    if (!log.length) return h('div', { class: 'empty' }, 'No history yet. Data is saved at the end of each day.');
    const ids = [...new Set(log.flatMap((e) => Object.keys(e.accounts || {})))];
    const nameOf = (id) => { const e = [...log].reverse().find((x) => x.accounts && x.accounts[id]); return e ? e.accounts[id].name : id; };
    const sums = log.map((e) => ({ h: Object.values(e.accounts || {}).reduce((s, a) => s + (a.hours || 0), 0), c: Object.values(e.accounts || {}).reduce((s, a) => s + (a.cards || 0), 0), e }));
    const totH = sums.reduce((s, x) => s + x.h, 0), totC = sums.reduce((s, x) => s + x.c, 0);
    const best = sums.reduce((b, x) => (x.h > (b ? b.h : -1) ? x : b), null);
    const summary = h('div', { class: 'dsum' },
      stat('Days recorded', num(log.length)),
      stat('Boosted hours', num(totH, 1)),
      stat('Total cards', num(totC)),
      stat('Average per day', num(totH / log.length, 1) + ' h'),
      stat('Best day', best ? best.e.day : '\u2014', best ? num(best.h, 1) + ' h' : null));
    const head = h('tr', {}, h('th', {}, 'Day'), ...ids.map((id) => h('th', {}, nameOf(id))), h('th', {}, 'Total'));
    const trs = [...sums].reverse().map(({ e, h: th, c: tc }) => h('tr', { class: e.today ? 'today' : '' },
      h('td', {}, h('b', {}, e.day), e.today ? h('small', {}, 'Today') : null),
      ...ids.map((id) => { const a = (e.accounts || {})[id]; return a
        ? h('td', {}, h('b', {}, num(a.hours, 2) + ' h'), a.cards ? h('small', {}, `${a.cards} ${a.cards === 1 ? 'card' : 'cards'}`) : null)
        : h('td', { class: 'dim' }, '\u2014'); }),
      h('td', {}, h('b', {}, num(th, 2) + ' h'), tc ? h('small', {}, `${tc} ${tc === 1 ? 'card' : 'cards'}`) : null)));
    return h('div', { class: 'dwrap' }, summary,
      h('div', { class: 'dtablewrap' }, h('table', { class: 'dhist' }, h('thead', {}, head), h('tbody', {}, ...trs))));
  };

  const paint = () => {
    const top = body.scrollTop;
    body.replaceChildren(tabKey === 'history' ? buildHistory() : buildOverview());
    body.scrollTop = top;
  };
  // all-time playtime straight from Steam (what the Steam profile shows as "played"), summed over every game of the account
  const loadSteam = () => {
    for (const r of rows) {
      const cachedAt = steamAt.get(r.id) || 0, cacheTtl = steam.get(r.id) ? 5 * 60 * 1000 : 2 * 60 * 1000;
      if (steamBusy.has(r.id) || (steam.has(r.id) && Date.now() - cachedAt < cacheTtl)) continue;
      steamBusy.add(r.id);
      Promise.resolve().then(() => window.api.gameHours(r.id)).then((hrs) => {
        const vals = hrs && !hrs.error ? Object.values(hrs).map(Number).filter((v) => Number.isFinite(v) && v >= 0) : [];
        steam.set(r.id, vals.length ? { hours: vals.reduce((x, y) => x + y, 0), played: vals.filter((v) => v > 0).length } : null);
        steamAt.set(r.id, Date.now());
      }).catch(() => { steam.set(r.id, null); steamAt.set(r.id, Date.now()); }).finally(() => { steamBusy.delete(r.id); if (document.body.contains(root)) paint(); });
    }
  };
  const refresh = async () => {
    const [r, l] = await Promise.all([window.api.cardsDashboard(), Promise.resolve().then(() => window.api.dailyLog()).catch(() => null)]);
    rows = Array.isArray(r) ? r : []; log = Array.isArray(l) ? l : [];
  };

  body.append(h('div', { class: 'cinfo' }, h('span', { class: 'spin' }), 'Loading\u2026'));
  host.replaceChildren(root);
  try { await refresh(); paint(); loadSteam(); }
  catch (e) { body.replaceChildren(h('div', { class: 'cinfo' }, h('span', { class: 'err' }, e.message || 'Could not load dashboard.'))); return; }
  const timer = setInterval(async () => {
    if (!document.body.contains(root)) { clearInterval(timer); return; }
    if (root.offsetParent === null) return;                     // tab not visible: do not ask again
    try { await refresh(); paint(); loadSteam(); } catch {}
  }, 8000);
}

// ================= Craft guide modal =================
function openCraftGuide(accName, data) {
  const { sets, totalSets, note } = data || { sets: [], totalSets: 0, note: '' };
  const rows = sets && sets.length
    ? sets.map((s) => h('div', { class: 'pi crow' },
        gameImg({ appid: s.appid, name: s.name }),
        h('div', { class: 'cname' }, h('b', {}, s.name), h('small', {}, `Set of ${s.setSize} cards`)),
        h('em', { class: 'cdrop', title: 'Number of complete sets you can craft' }, `${s.setsAvailable} set${s.setsAvailable !== 1 ? 's' : ''}`)))
    : [h('div', { class: 'empty' }, 'No complete sets in inventory.')];
  showModal(h('div', { class: 'modal cardsm' },
    closeX(),
    h('div', { class: 'ahead' }, h('div', {}, h('h2', {}, 'Craft guide'), h('small', {}, accName))),
    h('div', { class: 'cinfo' }, note),
    h('div', { class: 'plist cards-list' }, ...rows),
    h('div', { class: 'mact' },
      h('button', { class: 'btn red', onclick: closeModal }, 'Close'))));
}

// ================= Global game search =================
function openGlobalSearch() {
  let q = '';
  const body = h('div', { class: 'plist' });
  const runSearch = async () => {
    if (!q) { body.replaceChildren(h('div', { class: 'empty' }, 'Type to search across all accounts.')); return; }
    body.replaceChildren(h('div', { class: 'cinfo' }, h('span', { class: 'spin' }), 'Searching…'));
    let r; try { r = await window.api.gamesSearch(q); } catch (e) { r = { error: e.message || String(e) }; }
    if (r && r.error) { body.replaceChildren(h('div', { class: 'cinfo' }, h('span', { class: 'err' }, r.error))); return; }
    body.replaceChildren();
    if (!r.results || !r.results.length) { body.append(h('div', { class: 'empty' }, `"${q}" not found on any account.`)); return; }
    for (const acc of r.results) {
      body.append(h('div', { class: 'sec' }, acc.accountName + (acc.boosting ? ' · boosting' : '')));
      for (const g of acc.games) {
        body.append(h('div', { class: 'pi crow' },
          gameImg(g),
          h('div', { class: 'cname' },
            h('b', {}, g.name),
            h('small', {}, `${g.hours.toFixed(1)} h boosted${g.dropsLeft != null ? ' · ' + g.dropsLeft + ' drops left' : ''}${g.selected ? ' · selected' : ''}`)),
          h('button', { class: 'btn ghost sm', onclick: () => { closeModal(); openGame(acc.accountId, g.appid); } }, 'Info')));
      }
    }
  };
  const inp = h('input', { class: 'in', placeholder: 'Game name (searches all accounts)…', oninput: (e) => { q = e.target.value.toLowerCase().trim(); runSearch(); } });
  body.append(h('div', { class: 'empty' }, 'Type to search across all accounts.'));
  showModal(h('div', { class: 'modal cardsm' },
    closeX(),
    h('h2', {}, 'Find game'),
    inp,
    body,
    h('div', { class: 'mact' }, h('button', { class: 'btn red', onclick: closeModal }, 'Close'))));
  setTimeout(() => inp.focus(), 50);
}

// ================= tabs + Achievement Manager =================
let tab = 'boost', gamesAll = [], curGame = null, ach = [], achAcc = null, gameStats = [], achCommitBusy = false;
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
const TAB_ORDER = ['dash', 'devices', 'ach', 'boost', 'free', 'util', 'friends', 'fps', 'pcmon', 'taskmgr', 'execscan', 'remote'];                       // left to right
let dashStart = 'overview';
function setTab(t) {
  if (t === tab) return;
  const el = (x) => (x === 'boost' ? $('#viewBoost') : x === 'free' ? $('#viewFree') : x === 'pcmon' ? $('#viewPc') : x === 'fps' ? $('#viewFps') : x === 'util' ? $('#viewUtil') : x === 'dash' ? $('#viewDash') : x === 'remote' ? $('#viewRemote') : x === 'friends' ? $('#viewFriends') : x === 'devices' ? $('#viewDevices') : x === 'taskmgr' ? $('#viewTaskManager') : x === 'execscan' ? $('#viewExecScanner') : $('#viewAch'));
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
    else if (t === 'dash') { window.api.achClose(); curGame = null; buildDashboard($('#dashMain'), dashStart); dashStart = 'overview'; }
    else if (t === 'util') { window.api.achClose(); curGame = null; drawUtilPage(); }
    else if (t === 'free') { window.api.achClose(); curGame = null; window.FreeGames && window.FreeGames.show(); }
    else if (t === 'friends') { window.api.achClose(); curGame = null; window.ManageFriends && window.ManageFriends.show(); }
    else if (t === 'devices') { window.api.achClose(); curGame = null; window.DeviceManager && window.DeviceManager.show(); }
    else if (t === 'remote') { window.api.achClose(); curGame = null; window.RemotePC && window.RemotePC.show(); }
    else if (t === 'taskmgr') { window.api.achClose(); curGame = null; window.WellaMon && window.WellaMon.showTaskManager(); }
    else if (t === 'execscan') { window.api.achClose(); curGame = null; window.ExecScanner && window.ExecScanner.show(); }
    else { window.api.achClose(); curGame = null; animateNext = true; lastCardSig = ''; render(); if ((t === 'pcmon' || t === 'fps') && window.WellaMon) window.WellaMon.show(); }
  }, 170);
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
if (window.__WELLA_WEB) {
  // Admin-only browser tools. The server independently enforces every protected API.
  const adminTabs = ['#tabDevices', '#tabFriends', '#tabTaskManager', '#tabExecScanner', '#tabRemote'];
  adminTabs.forEach((s) => { const b = $(s); if (b) b.classList.add('hidden'); });
  const applyAdminMode = (isAdmin) => {
    adminTabs.filter((x) => x !== '#tabFriends').forEach((s) => { const b = $(s); if (b) b.classList.toggle('hidden', !isAdmin); });
    document.body.classList.toggle('admin-panel', !!isAdmin);
    if (window.__applyFriendsTab) window.__applyFriendsTab(isAdmin ? window.__friendsLocal() : false);
    const brand = document.querySelector('.brand');
    if (isAdmin) {
      if (brand) brand.textContent = 'Admin Panel';
      document.title = 'Admin Panel';
      const splashTitle = document.querySelector('.sp-title');
      if (splashTitle) { splashTitle.textContent = 'Admin Panel'; splashTitle.setAttribute('aria-label', 'Admin Panel'); }
      const metaTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (metaTitle) metaTitle.content = 'Admin Panel';
    } else {
      if (brand) brand.innerHTML = 'Wella<b>Hub</b>';
      document.title = 'Wella Hub v0.7.0';
      const splashTitle = document.querySelector('.sp-title');
      if (splashTitle) { splashTitle.textContent = 'Wella Hub'; splashTitle.setAttribute('aria-label', 'Wella Hub'); }
      const metaTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
      if (metaTitle) metaTitle.content = 'Wella Hub';
      if (['remote', 'taskmgr', 'execscan', 'devices', 'friends'].includes(tab)) setTab('dash');
    }
    if (typeof moveInd === 'function') { moveInd(); setTimeout(moveInd, 80); }
  };
  window.__applyWellaAdminMode = applyAdminMode;
  window.api.remoteIsAdmin().then(applyAdminMode).catch(() => applyAdminMode(false));
} else {
  // Never expose browser-admin-only tools in the normal desktop UI.
  ['#tabDevices', '#tabTaskManager', '#tabExecScanner', '#tabRemote'].forEach((s) => { const b = $(s); if (b) b.classList.add('hidden'); });
}

async function loadAchGames() {
  const accs = await window.api.achAccounts();
  const sel = $('#aAcc'); sel.replaceChildren(...accs.map((a) => h('option', { value: a.id }, `${a.name} (${a.count} games)`)));
  if (!accs.length) {
    gamesAll = []; drawGameList();
    $('#aMain').replaceChildren(h('div', { class: 'empty' }, 'Add an account in Hour Booster first. Its games will show up here.'));
    return;
  }
  if (!achAcc || !accs.find((a) => a.id === achAcc)) achAcc = (accs.find((a) => a.local) || accs[0]).id;
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
const profAuto = new Map();                                        // account id -> when its achievement numbers were last refreshed (they come from a few quick requests)
let profNote = '';                                                  // why the quick count did not work (shown on the card)
let profScan = null;                                               // { id, i, total } while the card is counting achievements
async function drawProfile() {
  const el = $('#aProf'); if (!el) return;
  const id = achAcc, a = accounts.find((x) => x.id === id);
  if (!a) { el.replaceChildren(); return; }
  let info = null;
  const scanNow = async (auto) => {                                // counts the achievements (the whole library in a few requests)
    if (profScan) return;
    profScan = { id, i: 0, total: 0 }; paint(info);
    let r; try { r = await window.api.accountScan(auto === true ? { id, auto: true } : { id, missing: true }); } catch (e) { r = { error: e.message || String(e) }; }
    profScan = null;
    if (achAcc !== id) return;
    profNote = r && r.note && !(info && info.ach && info.ach.scanned) ? r.note : '';
    if (r && r.totals && info) info.ach = r.totals;
    else { try { const i2 = await window.api.accountInfo(id); if (i2 && !i2.error) info = i2; } catch {} }
    paint(info);
  };
  function paint(i) {
    const av = a.avatar ? a.avatar.replace(/["\\()]/g, '') : '';
    const chips = [];
    if (i && i.level != null) chips.push(h('span', { class: 'pchip lvl' }, 'Level ' + i.level));
    if (i && i.vacBanned) chips.push(h('span', { class: 'pchip bad' }, i.vacCount > 1 ? 'VAC \u00d7' + i.vacCount : 'VAC'));
    if (i && i.gameBans) chips.push(h('span', { class: 'pchip bad' }, i.gameBans > 1 ? 'Game ban \u00d7' + i.gameBans : 'Game ban'));
    if (i && i.communityBanned) chips.push(h('span', { class: 'pchip bad' }, 'Community ban'));
    if (i && i.limited) chips.push(h('span', { class: 'pchip bad' }, 'Limited'));
    if (i && i.memberSince) chips.push(h('span', { class: 'pchip' }, 'Since ' + (/\d{4}/.exec(i.memberSince) || [i.memberSince])[0]));
    const stat = (k, v) => h('div', {}, h('b', {}, v == null || v === '' ? '\u2014' : String(v)), h('small', {}, k));
    const t = i && i.ach ? i.ach : null, counted = !!(t && t.scanned);
    const pc = t && t.total ? Math.round(t.done / t.total * 100) : null;
    const bad = !!(i && (i.vacBanned || i.gameBans || i.communityBanned));
    el.classList.toggle('banned', bad);
    const ownGames = i ? i.games : (a.games || []).length;
    let scanLine = null;
    if (profScan && profScan.id === id) scanLine = h('div', { class: 'pscan' }, h('span', { class: 'spin' }), h('span', { id: 'profScanTxt' }, profScan.total ? `Counting achievements ${profScan.i}/${profScan.total}\u2026` : 'Counting achievements\u2026'));
    else if (t && t.scanned < t.of) scanLine = h('div', { class: 'pscan', style: 'flex-wrap:wrap' }, h('span', {}, `Counted ${t.scanned} of ${t.of} games`), h('button', { class: 'btn ghost sm', onclick: () => scanNow(false) }, 'Count the rest'));
    const noteLine = profNote && !(profScan && profScan.id === id) ? h('div', { class: 'pscan' }, h('span', {}, 'Steam local: ' + profNote)) : null;
    const kids = [
      av ? h('i', { class: 'pbg', style: `background-image:url("${av}")` }) : null,
      h('div', { class: 'prow' },
        a.avatar ? h('img', { class: 'pav', src: a.avatar, draggable: 'false' }) : h('div', { class: 'pav' }),
        h('div', { class: 'pwho' }, h('b', {}, a.personaName || a.accountName), h('small', {}, a.accountName))),
      chips.length ? h('div', { class: 'pchips' }, chips) : null,
      h('div', { class: 'pstats' },
        stat('Games', ownGames),
        stat('Achievements', counted && t.total ? `${t.done}/${t.total}` : null),
        stat('Completed (100%)', counted ? `${t.perfect}/${t.games}` : null),
        stat('No achievements', counted ? t.none : null)),
      pc != null ? h('div', { class: 'pbar', title: pc + '% of counted achievements unlocked' }, h('i', { style: `width:${pc}%` })) : null,
      scanLine, noteLine
    ];
    el.replaceChildren(...kids.filter(Boolean));                   // replaceChildren(null) would print the word "null"
  }
  window._profPaint = () => paint(info);
  window._profScanUpdated = (scanId, totals) => { if (scanId === id && achAcc === id && info && totals) { info.ach = totals; paint(info); } };
  paint(null);
  try {
    const i = await window.api.accountInfo(id);
    if (i && !i.error && achAcc === id) {
      info = i; paint(i);
      if (Date.now() - (profAuto.get(id) || 0) > 120000) { profAuto.set(id, Date.now()); scanNow(true); }   // display only counts from completed local Steamworks reads
    }
  } catch {}
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
  const unlock = $('#gUnlock'), lock = $('#gLock'), disabled = bulkRunning || finding || !checked.size;
  if (unlock) { unlock.disabled = disabled; unlock.textContent = checked.size ? `Unlock (${checked.size})` : 'Unlock'; unlock.title = `Unlock achievements in ${checked.size} selected games`; }
  if (lock) { lock.disabled = disabled; lock.textContent = checked.size ? `Lock (${checked.size})` : 'Lock'; lock.title = `Lock achievements in ${checked.size} selected games`; }
  const mb = $('#gMissing'); if (mb && !finding) mb.disabled = bulkRunning;
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
$('#gStopAll').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  button.disabled = true;
  try {
    await window.api.achStopAll();
    if (finding) $('#gMissing').disabled = true;
    const bulkStop = bulkPanel && bulkPanel.head && bulkPanel.head.querySelector('.btn.stop');
    if (bulkStop) { bulkStop.disabled = true; bulkStop.textContent = 'Stopping…'; }
    toast('Stop requested. The unfinished work is saved so it can be checked again.', 'ok');
  } catch (error) { toast(error.message || String(error), 'bad'); }
  finally { button.disabled = false; }
});
async function runBulkAchievements(value) {
  const ids = gamesAll.filter((g) => checked.has(g.appid)).map((g) => g.appid);
  const verb = value ? 'Unlock' : 'Lock';
  if (!ids.length || !confirm(`${verb} every achievement in ${ids.length} game${ids.length > 1 ? 's' : ''}?`)) return;
  bulkRunning = true; updateBulk(); curGame = null; drawGameList();
  const bar = h('i', { style: 'width:0%' }), line = h('small', {}, 'Connecting…'), rows = h('div', {});
  const cancel = h('button', { class: 'btn stop', onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Stopping\u2026'; window.api.achCancelBulk(); } }, 'Stop');
  const head = h('div', { class: 'ahead' }, h('div', {}, h('h2', {}, `${verb}ing achievements`), line, h('div', { class: 'bar' }, bar)), h('div', { class: 'btns' }, cancel));
  bulkPanel = { accId: achAcc, head, rows, finished: false };
  $('#aMain').replaceChildren(head, rows);
  const nameOf = (id) => (gamesAll.find((g) => g.appid === id) || {}).name || id;
  window._bulkUI = { bar, line, rows, nameOf, value };
  let res;
  try { res = await window.api.achBulk({ accountId: achAcc, appids: ids, value }); }
  catch (e) { res = { error: e.message || String(e) }; }
  bulkRunning = false; updateBulk(); cancel.remove(); window._bulkUI = null; checkMethod();
  const stillThere = () => tab === 'ach' && $('#aMain').contains(head);
  setTimeout(() => { if (bulkPanel && bulkPanel.head === head) { bulkPanel.finished = true; if (stillThere()) { /* you are looking at it: it stays until you pick something else */ bulkPanel = null; } } }, 0);
  if (res.error) { line.textContent = ''; rows.append(h('div', { class: 'empty err' }, res.error)); return; }
  const R = res.results, cnt = (f) => R.filter(f).length;
  const bits = [[cnt((r) => r.ok && !r.note), value ? 'unlocked' : 'locked'], [cnt((r) => r.note === (value ? 'already complete' : 'already locked')), value ? 'already complete' : 'already locked'], [cnt((r) => String(r.note || '').startsWith('no achievements')), 'without achievements'], [cnt((r) => !r.ok), 'failed']].filter((x) => x[0]);
  line.textContent = `Finished${res.aborted ? ' (stopped early)' : ''}: ` + (bits.map((x) => `${x[0]} ${x[1]}`).join(' · ') || 'nothing to do') + (res.failedAfterRetry ? ` · ${res.failedAfterRetry} still failed after one retry (hidden)` : '') + '.';
  drawProfile(); // reload saved per-game counts so Completed and Achievements stay current
  if (res.aborted) rows.prepend(h('div', { class: 'empty err' }, res.aborted));
}
$('#gUnlock').addEventListener('click', () => runBulkAchievements(true));
$('#gLock').addEventListener('click', () => runBulkAchievements(false));
window.api.onAchProgress((m) => {
  if (m.stage === 'find') { const b = $('#gMissing'); if (finding && b) { b.textContent = `Stop (${m.i}/${m.total})`; $('#gFind').textContent = `${m.i}/${m.total} read \u00b7 ${m.missing} with missing achievements`; } return; }
  const u = window._bulkUI; if (!u) { if (m.stage === 'note') { if (finding) { const f = $('#gFind'); if (f) f.textContent = m.note; } else toast(m.note, 'ok'); } return; }
  if (m.stage === 'note') u.line.textContent = m.note;
  else if (m.stage === 'working') u.line.textContent = `${m.i + 1}/${m.total} · ${u.nameOf(m.appid)}…`;
  else if (m.stage === 'done') {
    u.bar.style.width = (m.i / m.total * 100) + '%';
    const r = m.result;
    u.rows.append(h('div', { class: 'pgrow' }, h('span', {}, u.nameOf(m.appid)),
      r.ok ? h('small', { class: r.note ? '' : 'ok' }, r.note ? (r.total ? `${r.done}/${r.total} \u00b7 ${r.note}` : r.note) : `${r.done}/${r.total} ${u.value ? 'unlocked' : 'locked'}` + (r.skipped ? ` (${r.skipped} could not be changed)` : '')) : h('small', { class: 'err' }, r.error)));
  } else if (m.stage === 'checked') u.bar.style.width = (m.i / m.total * 100) + '%';
});

async function openAchGame(g) {
  curGame = g; achQuery = ''; ach = []; gameStats = []; drawGameList();
  $('#aMain').replaceChildren(h('div', { class: 'empty' }, h('span', { class: 'spin' }), 'Connecting to Steam…'));
  const r = await window.api.achOpen({ accountId: achAcc, appid: g.appid });
  if (!curGame || curGame.appid !== g.appid) return;
  if (r.error) { $('#aMain').replaceChildren(h('div', { class: 'empty err' }, r.error, h('div', {}, diagBtn()))); return; }
  ach = Array.isArray(r.achievements) ? r.achievements : []; gameStats = Array.isArray(r.statistics) ? r.statistics : []; achSource = r.source; drawAch(true);
  if (window.matchMedia('(max-width:820px)').matches) setTimeout(() => $('#aMain').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); // phone: jump to the achievements
}
function pendingAchChanges() { return ach.filter((a) => a._desired !== undefined && !!a._desired !== !!a.unlocked).map((a) => ({ name: a.name, value: !!a._desired })); }
function pendingStatChanges() { return gameStats.filter((s) => s._desired !== undefined && Number.isFinite(Number(s._desired)) && Number(s._desired) !== Number(s.value)).map((s) => ({ name: s.name, value: s.type === 'int' ? Math.round(Number(s._desired)) : Number(s._desired) })); }
function stageAch(name, value) { const a = ach.find((x) => x.name === name); if (!a) return; a._desired = !!value; drawAch(); }
function stageAllAch(value) { for (const a of ach) a._desired = !!value; drawAch(); }
async function commitAchChanges() {
  if (!curGame || achCommitBusy) return;
  const changes = pendingAchChanges(), statChanges = pendingStatChanges();
  if (!changes.length && !statChanges.length) { toast('No changes to commit.', 'ok'); return; }
  achCommitBusy = true; drawAch();
  let r;
  try { r = await window.api.achSet({ accountId: achAcc, appid: curGame.appid, changes, statChanges }); }
  catch (e) { r = { error: e.message || String(e) }; }
  achCommitBusy = false;
  if (r && r.error) { drawAch(); toast(r.error, 'bad'); return; }
  if (Array.isArray(r.achievements)) ach = r.achievements;
  if (Array.isArray(r.statistics)) gameStats = r.statistics;
  for (const a of ach) if (r.states && a.name in r.states) a.unlocked = !!r.states[a.name];
  drawAch();
  const skipped = Number(r.skipped) || 0;
  toast(`Committed ${Number(r.changedAchievementCount) || 0} achievements and ${Number(r.changedStatCount) || 0} stats through Steam${skipped ? `; ${skipped} achievement${skipped === 1 ? '' : 's'} were refused` : ''}.`, skipped ? 'bad' : 'ok');
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
  const pendingCount = pendingAchChanges().length + pendingStatChanges().length;
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
    h('div', {}, h('h2', {}, curGame.name), h('small', {}, `${done} of ${ach.length} unlocked \u00b7 local Steam client`),
      h('div', { class: 'bar' }, h('i', { style: `width:${ach.length ? (done / ach.length) * 100 : 0}%` }))),
    h('div', { class: 'btns' },
      h('button', { class: 'btn red', onclick: () => stageAllAch(true) }, 'Unlock all'),
      h('button', { class: 'btn stop', onclick: () => stageAllAch(false) }, 'Lock all'),
      h('button', { id: 'aCommit', class: 'btn red', disabled: achCommitBusy || !pendingCount ? 'disabled' : null, onclick: commitAchChanges }, achCommitBusy ? 'Committing\u2026' : `Commit Changes${pendingCount ? ` (${pendingCount})` : ''}`),
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
      const desired = a._desired === undefined ? !!a.unlocked : !!a._desired;
      const staged = desired !== !!a.unlocked;
      const actionLabel = staged ? `Pending ${desired ? 'unlock' : 'lock'}` : (a.unlocked ? 'Lock' : 'Unlock');
      list.append(h('div', { class: 'ai' + (a.unlocked ? ' done' : '') + (staged ? ' pending' : ''), style: `--j:${Math.min(aj++, 14)}` },
        ico,
        h('div', { class: 't' }, h('b', {}, a.displayName, a.protected ? h('span', { class: 'ptag', title: 'Steam marks this achievement as protected; the game may refuse changes.' }, 'protected') : null), h('small', {}, a.description || (a.hidden ? 'Hidden achievement' : a.name))),
        h('div', { class: 'pc' }, a.percent != null ? a.percent.toFixed(1) + '%' : ''),
        h('button', { class: 'btn sm ' + (desired ? 'stop' : 'start'), title: staged ? 'This change is staged. Press Commit Changes to send it to Steam.' : 'Stage the change for Steam.', onclick: () => stageAch(a.name, !desired) }, actionLabel)));
    }
    if (!list.children.length) list.append(h('div', { class: 'empty' }, ach.length ? 'No achievement matches.' : 'No achievements.'));
  };
  const chips = [['all', `All ${ach.length}`], ['locked', `Locked ${ach.length - done}`], ['done', `Unlocked ${done}`]];
  const chipEls = chips.map(([k, l]) => h('button', { class: 'chip' + (achFilter === k ? ' on' : ''), onclick: () => { achFilter = k; chipEls.forEach((c, i) => c.classList.toggle('on', chips[i][0] === k)); fillList(); } }, l));
  main.append(h('div', { class: 'atools' },
    h('input', { class: 'in', placeholder: 'Search achievements', value: achQuery, oninput: (e) => { achQuery = e.target.value; fillList(); } }),
    h('div', { class: 'chips' }, chipEls)));
  if (gameStats.length) {
    const panel = h('details', { class: 'samstats' }, h('summary', {}, `Statistics (${gameStats.length})`));
    const rows = h('div', { class: 'samstatlist' });
    for (const s of gameStats) {
      const input = h('input', { class: 'in sm', type: 'number', step: s.type === 'int' ? '1' : 'any', value: s._desired === undefined ? s.value : s._desired, oninput: (e) => {
        s._desired = e.target.value;
        const button = $('#aCommit'); if (button) button.disabled = achCommitBusy || !(pendingAchChanges().length + pendingStatChanges().length);
        if (button && !achCommitBusy) button.textContent = `Commit Changes (${pendingAchChanges().length + pendingStatChanges().length})`;
      } });
      rows.append(h('label', { class: 'samstatrow' }, h('span', {}, h('b', {}, s.displayName || s.name), h('small', {}, `${s.type === 'int' ? 'Integer' : 'Float'} \u00b7 ${s.name}`)), input));
    }
    panel.append(rows); main.append(panel);
  }
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

const ICON_PHONE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/></svg>';

// ================= Utility tab (player stats, YouTube downloader, achievement timings) =================
const US = { sub: 'players', q: '', res: null, busy: false, keys: { faceit: false, leetify: false }, ytUrl: '', yt: null, fmt: 'mp4', height: 0, dir: '', cookieBrowser: '', run: false, last: '' };
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
    if (!web) {
      const browsers = [['', 'Do not use browser login'], ['chrome', 'Google Chrome'], ['edge', 'Microsoft Edge'], ['firefox', 'Firefox'], ['brave', 'Brave'], ['opera', 'Opera'], ['vivaldi', 'Vivaldi']];
      const browser = h('select', { class: 'in', disabled: US.run ? 'disabled' : null, onchange: async (e) => {
        const previous = US.cookieBrowser; US.cookieBrowser = e.target.value;
        try {
          const r = await window.api.ytCookieBrowserSet(US.cookieBrowser);
          if (r && r.error) throw new Error(r.error);
          toast(US.cookieBrowser ? 'YouTube browser login saved for music and downloads.' : 'YouTube browser login turned off.', 'ok');
        } catch (err) { US.cookieBrowser = previous; toast(err.message || String(err), 'bad'); paintYt(); }
      } }, browsers.map(([v, label]) => h('option', { value: v, selected: v === US.cookieBrowser ? 'selected' : null }, label)));
      kids.push(h('div', { class: 'setrow' }, h('b', {}, 'YouTube sign-in for music'), browser,
        h('small', { style: muted }, 'If YouTube says “confirm you’re not a bot”, choose the browser where you are signed in to YouTube. yt-dlp reads that browser session on this PC for music and downloads; it is not sent to Discord.')));
    }
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
  if (!web) { window.api.ytState().then((s) => { US.dir = s.dir || ''; US.cookieBrowser = s.cookieBrowser || ''; paintYt(); }).catch(() => {}); paintYt(); }

  // ---- Achievement Manager timings ----
  const pace = h('div', { class: 'pace' });
  const paintPace = async () => {
    let r; try { r = await window.api.achPaceGet(); } catch { pace.replaceChildren(h('small', { style: muted }, 'Could not load the timings.')); return; }
    const ins = {};
    const num = (key) => { const isTime = /^(achGap|rest|gameGap)/.test(key); const i = h('input', { class: 'in', type: 'number', min: isTime ? '0.001' : '1', max: isTime ? '0.1' : '99999999999999', step: 'any', value: String(r.values[key]), style: 'width:120px;text-align:center' }); ins[key] = i; return i; };
    const row = (label, k, unit, step) => h('div', { class: 'setrow' }, h('b', {}, label),
      h('div', { class: 'lk' }, num(k + 'Min'), h('small', {}, 'to'), num(k + 'Max'), h('small', {}, unit)));
    const read = () => { const o = {}; for (const k in ins) o[k] = ins[k].value; return o; };
    pace.replaceChildren(
      h('small', { style: muted }, 'Safe Mode uses very short pauses (up to 0.1 seconds). There is no hourly achievement cap. Achievement progress is saved locally for this account and reused on the next launch. Reset restores the defaults.'),
      row('Between two achievements', 'achGap', 'seconds', 0.5),
      row('Achievements in a row before a rest', 'burst', 'achievements', 1),
      row('Rest after each burst', 'rest', 'seconds', 5),
      row('Between two games (Unlock all)', 'gameGap', 'seconds', 1),
      h('div', { class: 'lk' },
        h('button', { class: 'btn red sm', onclick: async () => { try { await window.api.achPaceSet(read()); toast('Timings saved', 'ok'); } catch (e) { toast(e.message || String(e), 'bad'); } paintPace(); } }, 'Save timings'),
        h('button', { class: 'btn ghost sm', onclick: async () => { try { await window.api.achPaceReset(); toast('Back to the safe default timings', 'ok'); } catch (e) { toast(e.message || String(e), 'bad'); } paintPace(); } }, 'Reset to default')));
  };
  paintPace();

  paintOut();
  const SUBS = [['players', 'Player stats'], ['compare', 'Profile Compare'], ['inv', 'Inventory'], ['health', 'Account Health'], ['pass', 'Password Generator'], ['speed', 'Speed Test'], ['pcmp', 'Compare players'], ['hist', 'Rank history'], ['badge', 'Badges'], ['sale', 'Steam sales'], ['daily', 'Daily report'], ['pchealth', 'PC health'], ['yt', 'YouTube'], ['pace', 'Timings']];
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
function applyAchTab(on) {
  const b = document.getElementById('tabAch'); if (!b) return;
  b.classList.toggle('hidden', !on);
  if (!on && tab === 'ach') setTab('boost');
  moveInd(); setTimeout(moveInd, 60);
}
function applyDashTab(on) {
  const b = document.getElementById('tabDash'); if (!b) return;
  b.classList.toggle('hidden', !on);
  if (!on && tab === 'dash') setTab('boost');
  moveInd(); setTimeout(moveInd, 60);
}
// Manage Friends is an admin-only tab on the web, so there it also stays hidden for everybody who is not the administrator
function applyFriendsTab(on) {
  const b = document.getElementById('tabFriends'); if (!b) return;
  const adminOnly = !!window.__WELLA_WEB && !document.body.classList.contains('admin-panel');
  b.classList.toggle('hidden', !on || adminOnly);
  if ((!on || adminOnly) && tab === 'friends') setTab('boost');
  moveInd(); setTimeout(moveInd, 60);
}
window.__applyFriendsTab = applyFriendsTab;
window.__friendsLocal = () => { try { return localStorage.getItem('wella-admin-tab-friendsTab') !== '0'; } catch { return true; } };
window.api.getPrefs().then((p) => applyFriendsTab(window.__WELLA_WEB ? window.__friendsLocal() : p.friendsTab !== false)).catch(() => {});
window.api.getPrefs().then((p) => applyDashTab(p.dashTab !== false)).catch(() => {});
window.api.getPrefs().then((p) => applyAchTab(p.achTab !== false)).catch(() => {});
window.api.getPrefs().then((p) => applyUtilTab(p.utilTab !== false)).catch(() => {});
window.api.getPrefs().then((p) => applyFreeTab(p.freeTab !== false)).catch(() => {});
if (window.api.onPrefs) window.api.onPrefs((p) => { if (p && 'utilTab' in p) applyUtilTab(p.utilTab !== false); if (p && 'freeTab' in p) applyFreeTab(p.freeTab !== false); if (p && 'dashTab' in p) applyDashTab(p.dashTab !== false); if (p && 'achTab' in p) applyAchTab(p.achTab !== false); if (p && 'friendsTab' in p && !window.__WELLA_WEB) applyFriendsTab(p.friendsTab !== false); });   // the PC and the phone follow each other
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
  let WG = { cfg: {}, accounts: [] };
  try { WG = await window.api.widgetGet(); } catch {}
  try { const ac = window.WellaTheme.get().accent; if (WG.cfg && WG.cfg.enabled && WG.cfg.accent !== ac) WG = { ...WG, cfg: (await window.api.widgetSet({ accent: ac })).cfg }; } catch {}
  const muted = 'color:var(--mut)';
  // collapsible section helper: used by BOTH the General and the Discord tab (it used to live inside generalTab, so the Discord tab crashed with "S is not defined")
  const S = (id, title, kids, open) => window.WellaExtra.section(id, title, kids, open);
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

  let lookCat = 'themes';
  const generalTab = () => {
    const t = window.WellaTheme.get();
    const hex = h('input', { class: 'in hex', value: t.accent, maxlength: '7', onchange: (e) => {
      const v = e.target.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) { window.WellaTheme.set({ accent: v.toLowerCase() }); draw(); } else e.target.value = t.accent; } });
    const picker = h('input', { type: 'color', value: t.accent, oninput: (e) => { window.WellaTheme.set({ accent: e.target.value }); hex.value = e.target.value; } });
    picker.addEventListener('change', draw);
    const isAdminPanelWeb = () => !!(window.__WELLA_WEB && document.body.classList.contains('admin-panel'));
    const localAdminTabValue = (key, fallback = true) => { try { const v = localStorage.getItem('wella-admin-tab-' + key); return v === null ? fallback : v === '1'; } catch { return fallback; } };
    const pref = (label, key, hint) => h('div', { class: 'setrow' }, h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: (isAdminPanelWeb() && ['dashTab','achTab','freeTab','friendsTab'].includes(key) ? localAdminTabValue(key, true) : prefs[key] !== false) ? 'checked' : null, onchange: async (e) => {
        if (isAdminPanelWeb() && ['dashTab','achTab','freeTab','friendsTab'].includes(key)) {
          try { localStorage.setItem('wella-admin-tab-' + key, e.target.checked ? '1' : '0'); } catch {}
          if (key === 'freeTab') applyFreeTab(e.target.checked); if (key === 'dashTab') applyDashTab(e.target.checked); if (key === 'achTab') applyAchTab(e.target.checked); if (key === 'friendsTab') applyFriendsTab(e.target.checked);
          return;
        }
        prefs = await window.api.setPrefs({ [key]: e.target.checked }); if (key === 'freeTab') applyFreeTab(prefs.freeTab !== false); if (key === 'dashTab') applyDashTab(prefs.dashTab !== false); if (key === 'achTab') applyAchTab(prefs.achTab !== false); if (key === 'friendsTab') applyFriendsTab(prefs.friendsTab !== false);
      } }), label),
      hint ? h('small', { style: muted }, hint) : null);
    const keyRow = (name, label, msg) => US.keys[name] ? h('div', { class: 'setrow' },
      h('div', {}, h('b', {}, label + ' API Key'), h('small', { style: muted }, '\u2713 Salvat\u0103 \u0219i valid\u0103')),
      h('button', { class: 'btn stop sm', onclick: async () => { US.keys = await window.api.utilKeysSet({ [name]: '' }); toast(msg); renderTab(null); } }, 'Remove')) : null;
    // ---- Appearance is split in categories: Themes, Colors, Background, Fonts, Settings ----
    const LOOK_CATS = [['themes', 'Themes'], ['colors', 'Colors'], ['bg', 'Background'], ['fonts', 'Fonts'], ['settings', 'Settings']];
    const lookCatBar = () => h('div', { class: 'lookcats' }, LOOK_CATS.map(([k, label]) => h('button', { class: 'btn' + (lookCat === k ? ' on' : ''), onclick: () => { lookCat = k; draw(); } }, label)));
    const hexOf = (v) => { v = String(v || '').trim(); if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase(); const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v); return m ? ('#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toLowerCase() : null; };
    const cssHex = (name, fallback) => hexOf(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
    // one colour line: picker + hex + reset
    const colRow = (label, tip, eff, onSet, onReset, resetLabel) => {
      const hexIn = h('input', { class: 'in hex', value: eff, maxlength: '7', onchange: (e) => { const v = hexOf(e.target.value); if (v) { onSet(v); draw(); } else e.target.value = eff; } });
      const pick = h('input', { type: 'color', value: eff, oninput: (e) => { onSet(e.target.value); hexIn.value = e.target.value; } });
      pick.addEventListener('change', draw);
      return h('div', { class: 'colrow' }, pick, h('div', {}, h('b', {}, label), tip ? h('small', {}, tip) : null), hexIn,
        onReset ? h('button', { class: 'btn ghost sm', title: resetLabel || 'Back to the normal color', onclick: () => { onReset(); draw(); } }, 'Reset') : null);
    };
    const palRow = (key, label, tip) => {
      const T = window.WellaTheme, t0 = T.get(), eff = (t0.pal && hexOf(t0.pal[key])) || cssHex('--' + key, '#000000');
      const dflt = t0.mode === 'dark' && T.defaults.pal ? T.defaults.pal[key] : null;
      return colRow(label, tip, eff, (v) => { T.set({ pal: { ...(T.get().pal || {}), [key]: v }, preset: '' }); },
        () => { const pal = { ...(T.get().pal || {}) }; if (dflt) pal[key] = dflt; else delete pal[key]; T.set({ pal, preset: '' }); });
    };
    const extraRow = (key, label, tip, dflt) => {
      const T = window.WellaTheme, t0 = T.get(), eff = hexOf(t0[key]) || (dflt === 'accent' ? t0.accent : dflt);
      return colRow(label, tip, eff, (v) => T.set({ [key]: v, preset: '' }), () => T.set({ [key]: '', preset: '' }), dflt === 'accent' ? 'Follow the accent color' : 'Back to the normal color');
    };
    const hsl = (hh, ss, ll) => { ss /= 100; ll /= 100; const k = (n) => (n + hh / 30) % 12, a2 = ss * Math.min(ll, 1 - ll), f = (n) => ll - a2 * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); const x = (v) => Math.round(v * 255).toString(16).padStart(2, '0'); return '#' + x(f(0)) + x(f(8)) + x(f(4)); };
    const makePal = (hh, sat) => ({ bg0: hsl(hh, sat * .6, 3), panel0: hsl(hh, sat * .55, 6), panel20: hsl(hh, sat * .5, 8), line0: hsl(hh, sat * .5, 14), line2: hsl(hh, sat * .5, 22), text: hsl(hh, sat * .9, 96), mut: hsl(hh, sat * .3, 58), chip: hsl(hh, sat * .55, 7), chip2: hsl(hh, sat * .5, 9), chip3: hsl(hh, sat * .45, 11), hover: hsl(hh, sat * .55, 8), modal: hsl(hh, sat * .6, 4.5), sec: hsl(hh, sat * .55, 5.5), faint: hsl(hh, sat * .35, 30) });
    const PALETTES = [['Pink Noir', 320, 70, '#ff3d9a'], ['Purple', 268, 60, '#8b5cf6'], ['Blue', 215, 65, '#3b82f6'], ['Cyan', 188, 65, '#06b6d4'], ['Green', 150, 55, '#22c55e'], ['Red', 355, 65, '#ef4444'], ['Orange', 24, 65, '#f97316'], ['Gold', 45, 60, '#eab308'], ['OLED black', 0, 0, '#ffffff'], ['Slate', 220, 18, '#94a3b8']];
    const colorsCat = () => {
      const T = window.WellaTheme, t1 = T.get();
      const palCards = h('div', { class: 'palgrid' }, PALETTES.map(([name, hh, sat, acc]) => { const pal = makePal(hh, sat); return h('button', { class: 'palcard', title: 'Sets the background, panels, text and accent together', onclick: () => { T.set({ mode: 'dark', pal, accent: acc, preset: '' }); toast('Palette: ' + name, 'ok'); draw(); } },
        h('div', { class: 'palsw', style: `background:${pal.bg0}` }, h('div', { class: 'palsw-box', style: `background:${pal.panel0};border-color:${pal.line2}` },
          h('div', { class: 'palsw-l', style: `background:${pal.text}` }), h('div', { class: 'palsw-l s', style: `background:${pal.mut}` }), h('div', { class: 'palsw-b', style: `background:${acc}` }))), h('small', {}, name)); }));
      const group = (title, rows, tip) => h('div', { class: 'bgsec' }, h('b', {}, title), tip ? h('small', { style: muted }, tip) : null, h('div', { class: 'colgrid' }, rows));
      return [
        h('div', { class: 'bgsec' }, h('b', {}, 'Quick palettes'), h('small', { style: muted }, 'One click sets the background, panels, text and accent together. Then fine tune below.'), palCards),
        h('div', { class: 'setrow' }, h('b', {}, 'Mode'),
          h('div', { class: 'seg' }, ['dark', 'light'].map((m) => h('button', { class: 'btn' + (t1.mode === m ? ' on' : ''), onclick: () => { T.set({ mode: m }); draw(); } }, m === 'dark' ? 'Black' : 'White')))),
        h('div', { class: 'setrow' }, h('b', {}, 'Accent color (also recolours the logo)'),
          h('div', { class: 'sw' }, PRESETS.map((c) => h('button', { class: t1.accent === c ? 'on' : '', style: `background:${c}`, title: c, onclick: () => { T.set({ accent: c }); draw(); } })), picker, hex)),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: t1.tint ? 'checked' : null, onchange: (e) => T.set({ tint: e.target.checked }) }), 'Tint the whole app with the accent color'),
        h('div', { class: 'bgsec' }, h('b', {}, 'Buttons'),
          h('div', { class: 'sbtns' }, h('button', { class: 'btn red' }, 'Primary'), h('button', { class: 'btn start' }, 'Start'), h('button', { class: 'btn stop' }, 'Stop')),
          colorRow('Primary buttons (Save, Sign in, Done...)', 'btn', PRESETS, true),
          colorRow('Start button (glows on hover)', 'start', START_PRESETS, false),
          colorRow('Stop button (glows on hover)', 'stop', STOP_PRESETS, false),
          h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: () => { const df = T.defaults; T.set({ btn: '', start: df.start, stop: df.stop }); draw(); } }, 'Reset button colors'))),
        group('Surfaces', [
          palRow('bg0', 'Background', 'Behind everything'), palRow('panel0', 'Cards and panels', 'Account cards, boxes'), palRow('panel20', 'Inner panels', 'Game lists, rows'),
          palRow('chip', 'Small boxes', 'Tiles, chips, inputs'), palRow('chip2', 'Small boxes (hover)'), palRow('hover', 'Hover highlight', 'When the mouse is over a row'),
          palRow('modal', 'Pop-up windows', 'Settings, game info'), palRow('sec', 'Section headers')]),
        group('Text and borders', [
          palRow('text', 'Text', 'Titles and normal text'), palRow('mut', 'Soft text', 'Labels and small notes'), palRow('faint', 'Faint text', 'Hints, disabled things'),
          palRow('line0', 'Borders', 'Thin lines around boxes'), palRow('line2', 'Strong borders', 'Inputs and buttons')]),
        group('Status and effects', [
          extraRow('good', 'Success / online', 'Green dots, “Boosting”, “Added”', '#22c55e'), extraRow('warn', 'Warning', 'Yellow / orange notes', '#eab308'), extraRow('bad', 'Error / stop', 'Red errors and bans', '#ef4444'),
          extraRow('glowc', 'Glow color', 'Soft light around cards and buttons', 'accent'), extraRow('sel', 'Text selection', 'When you select text', 'accent'), extraRow('scrollc', 'Scrollbar', 'The thin bar at the side', 'accent')]),
        h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost', onclick: () => { const df = T.defaults; T.set({ pal: t1.mode === 'dark' ? df.pal : null, accent: df.accent, btn: '', start: df.start, stop: df.stop, good: '', bad: '', warn: '', glowc: '', sel: '', scrollc: '', tint: false, preset: '' }); toast('Colors reset', 'ok'); draw(); } }, 'Reset all colors'))
      ];
    };
    const lookBody = () => lookCat === 'colors' ? colorsCat() : lookCat === 'bg' ? [bgSection(draw)] : window.WellaExtra.lookTab(draw, lookCat);
    const sections = [
      S('look', 'Appearance', [lookCatBar(), ...lookBody()], true),
      S('notif', 'Notifications', [
        h('div', { class: 'shapes' }, [['pill', 'Pill', '999px'], ['round', 'Rounded', '9px'], ['soft', 'Soft square', '5px'], ['square', 'Square', '1px'], ['oval', 'Oval', '50%']].map(([k, l, r]) =>
          h('button', { class: 'btn' + ((t.toastShape || 'pill') === k ? ' on' : ''), onclick: () => { window.WellaTheme.set({ toastShape: k }); draw(); toast('This is how notifications look.', 'ok', l); } }, h('i', { style: 'border-radius:' + r }), l))),
        h('div', { class: 'sbtns' },
          h('button', { class: 'btn ghost sm', onclick: () => toast('Hour Booster started', undefined, 'Wella Hub') }, 'Preview'),
          h('button', { class: 'btn ghost sm', onclick: () => toast('Something went wrong.', 'bad', 'Error') }, 'Preview error')),
        ...(window.WellaMon ? window.WellaMon.monitorTab(draw, 'notify') : [])
      ]),
      S('tabs', 'Tabs', [
        window.WellaMon ? window.WellaMon.generalToggle() : null,
        h('div', { class: 'setrow' }, h('label', { class: 'chk' },
          h('input', { type: 'checkbox', checked: (isAdminPanelWeb() ? localAdminTabValue('utilTab', true) : prefs.utilTab !== false) ? 'checked' : null, onchange: async (e) => { if (isAdminPanelWeb()) { try { localStorage.setItem('wella-admin-tab-utilTab', e.target.checked ? '1' : '0'); } catch {} applyUtilTab(e.target.checked); return; } prefs = await window.api.setPrefs({ utilTab: e.target.checked }); applyUtilTab(prefs.utilTab !== false); } }), 'Utility tab')),
        pref('Dashboard tab', 'dashTab', 'Show or hide the Dashboard tab (all accounts, Steam hours, cards and boost history) before the Achievement Manager.'),
        pref('Achievement Manager tab', 'achTab', 'Show or hide the Achievement Manager tab from the main navigation.'),
        pref('Free Games tab', 'freeTab', 'Show or hide the Free Games tab from the main navigation.'),
        (!window.__WELLA_WEB || isAdminPanelWeb()) ? pref('Manage Friends tab', 'friendsTab', 'Show or hide the Manage Friends tab from the main navigation.') : null,
        ...(window.WellaMon ? window.WellaMon.monitorTab(draw, 'monitor') : [])
      ]),
      S('widget', 'Mini widget', [widgetSection()]),
      S('startup', 'Startup & API keys', [
        pref('Start with Windows (straight to the system tray)', 'autostart'),
        pref('Start the hour booster automatically (on by itself)', 'autoBoost', 'On by default: the Hour Booster starts by itself every time Wella Hub opens.'),
        pref('Start Free Games auto discovery automatically', 'autoDiscovery', 'Off by default. When this is on, auto discovery starts by itself every time Wella Hub opens. Leave it off to start it yourself from the Free Games tab.'),
        window.__WELLA_WEB ? h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: () => window.api.logout() }, 'Log out of web access')) : null,
        h('div', { class: 'sep' }),
        h('b', {}, 'API keys'),
        steamKeyRow(), keyRow('faceit', 'FACEIT', 'Cheie FACEIT \u0219tears\u0103'), keyRow('leetify', 'Leetify', 'Cheie Leetify \u0219tears\u0103')
      ], true),
    ].filter(Boolean);
    return sections;
  };

  // The previous top-level Accounts page managed Discord bot accounts. Keep that feature,
  // but place it under Discord as AI Bot so it is separate from personal-account management.
  const aiBotSection = () => window.WellaDcBots ? S('dcbots', 'AI Bot', window.WellaDcBots.section(), true) : S('dcbots', 'AI Bot', [
    h('small', { style: muted }, 'Discord bot management is unavailable in this build.')
  ], true);
  const accountsSection = () => {
    const openAdd = () => {
      const clientId = h('input', { class: 'in', placeholder: 'Discord OAuth2 Client ID', autocomplete: 'off' });
      const redirect = h('input', { class: 'in', value: 'http://127.0.0.1:43821/discord/callback', readonly: 'readonly' });
      const info = h('div', { class: 'modal wide' },
        h('h2', {}, 'Add Discord account'),
        h('p', { style: muted }, 'Connect through Discord OAuth2. Discord opens its secure authorization screen and returns to Wella Hub; the app must never ask for your Discord password or user token.'),
        h('div', { class: 'bgsec' },
          h('b', {}, 'Connect account'),
          h('small', { style: muted }, 'Enter the Client ID of your Discord application. The OAuth2 redirect URI must be registered exactly as shown below. This is configuration only; account linking requires the OAuth callback handler to be enabled in this build.'),
          clientId,
          h('label', {}, 'Redirect URI'), redirect,
          h('div', { class: 'sbtns' },
            h('button', { class: 'btn ghost sm', onclick: () => { clientId.value = ''; toast('Client ID cleared'); } }, 'Clear'),
            h('a', { class: 'btn ghost sm', href: 'https://discord.com/developers/applications', target: '_blank', rel: 'noopener noreferrer' }, 'Configure OAuth2'))),
        h('div', { class: 'bgsec' },
          h('b', {}, 'What can be managed?'),
          h('small', { style: muted }, 'OAuth2 can identify an account and grant explicitly approved scopes. It cannot turn Wella Hub into a personal-account self-bot, change personal username/avatar through the public API, or force user-account Rich Presence. For Rich Presence, use the supported application presence integration already available in the Discord tab.')),
        h('div', { class: 'mact' }, h('button', { class: 'btn red', onclick: closeModal }, 'Close')));
      showModal(info);
    };
    return S('discord-accounts', 'Accounts', [
      h('div', { class: 'auto' },
        h('div', {}, h('b', {}, 'Discord accounts'), h('small', {}, 'Account connections and profile information authorized through Discord.')),
        h('button', { class: 'btn red', onclick: openAdd }, '＋ Add Account')),
      h('div', { class: 'bgsec' }, h('b', {}, 'Connected accounts'),
        h('small', { style: muted }, 'No account connections are active. This build does not yet include the OAuth2 callback and secure account-linking backend, so it will not falsely show an account as connected.')),
      h('div', { class: 'bgsec' }, h('b', {}, 'Profile and presence'),
        h('small', { style: muted }, 'Wella Hub can configure its own supported Discord Rich Presence integration. Personal-account avatar/username editing and self-bot presence automation are not supported by Discord’s public API.'))
    ], true);
  };
  const adminTab = () => [];
  const discordTab = () => [
    S('rpc', 'Rich Presence', [
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
    ], true),
    aiBotSection(),
    accountsSection()
  ].filter(Boolean);

  // ----- web access (only shown in the desktop app) -----
  const remoteTab = () => {
    let st = null;
    const copy = async (t, label = 'Link') => { try { await navigator.clipboard.writeText(t); toast(label + ' copied', 'ok'); } catch { toast('Could not copy. Select and copy it by hand.', 'bad'); } };
    const linkRow = (label, url) => h('div', { class: 'lrow' }, h('small', { style: muted }, label),
      h('div', { class: 'lk' }, h('code', {}, url), h('button', { class: 'btn ghost sm', onclick: () => copy(url) }, 'Copy')));
    const save = async (patch, okMsg) => {
      const r = await window.api.remoteSet(patch);
      if (r && r.error) { toast(r.error, 'bad'); return false; }
      st = r; if (okMsg) toast(okMsg, 'ok'); paint(); return true;
    };
    const dyn = h('div', { class: 'rdyn' });
    const enabled = h('input', { type: 'checkbox', onchange: async (e) => { if (!(await save({ enabled: e.target.checked }, e.target.checked ? 'Web access is on' : 'Web access is off'))) e.target.checked = !e.target.checked; } });
    const pw = h('input', { class: 'in', type: 'text', readonly: 'readonly', autocomplete: 'off', spellcheck: 'false' });
    const paint = () => {
      if (!st) return;
      pw.value = st.accessPassword || '';
      enabled.checked = st.enabled;
      const t = st.tunnel || {};
      const line = !st.enabled ? 'Off.' : st.error ? st.error : st.running ? `On, port ${st.port}.` + (st.clients ? ` ${st.clients} device${st.clients > 1 ? 's' : ''} connected.` : '') : 'Starting...';
      const kids = [h('small', { style: st.error ? 'color:#ff6b81' : muted }, line)];
      if (st.enabled && st.running) {
        kids.push(h('div', { class: 'sep' }), h('b', {}, 'Password'));
        kids.push(h('div', { class: 'setrow' }, h('div', { class: 'lk' }, pw,
          h('button', { class: 'btn ghost sm', onclick: () => copy(pw.value, 'Password') }, 'Copy')),
          h('small', { style: muted }, '8 characters (a–z, 0–9). Generated automatically if none is set. Passwords are never sent to Discord.')));
        kids.push(h('div', { class: 'sep' }), h('b', {}, 'Open on your phone'));
        kids.push(linkRow('Same Wi-Fi / network as this PC', st.urls[0] || `http://localhost:${st.port}`));
        for (const u of st.urls.slice(1)) kids.push(linkRow('Other network card', u));
        kids.push(h('div', { class: 'sep' }), h('b', {}, 'Public link (works from anywhere, also on mobile data)'));
        kids.push(h('small', { style: muted }, 'Free Cloudflare tunnel: HTTPS, no router setup. Web access on this PC remains separate.'));
        if (t.status === 'on') kids.push(linkRow('Public link', t.url), h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: async () => { st = await window.api.remoteTunnel('refresh'); paint(); } }, 'Refresh link'), ...(st.lockPublicLink ? [h('small', { style: muted }, 'Public link is protected from accidental stopping.')] : [h('button', { class: 'btn danger sm', onclick: async () => { const r = await window.api.remoteTunnel(false); if (r && r.error) toast(r.error, 'bad'); st = r; paint(); } }, 'Stop public link')])));
        else if (t.status === 'downloading' || t.status === 'starting') kids.push(h('div', {}, h('span', { class: 'spin' }), t.message || 'Starting public link...'));
        else kids.push(...(t.status === 'error' ? [h('small', { style: 'color:#ff6b81' }, t.message)] : t.message ? [h('small', { style: muted }, t.message)] : []),
          h('div', { class: 'sbtns' }, h('button', { class: 'btn start sm', onclick: async () => { st = await window.api.remoteTunnel(true); paint(); } }, t.status === 'error' ? 'Try again' : 'Start public link'), ...(t.status === 'starting' || t.status === 'downloading' ? [h('button', { class: 'btn ghost sm', onclick: async () => { st = await window.api.remoteTunnel(false); paint(); } }, 'Cancel')] : [])));
        kids.push(h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: st.autoTunnel ? 'checked' : null, onchange: (e) => save({ autoTunnel: e.target.checked }) }), 'Create the public link automatically when Wella Hub starts'));
      }
      dyn.replaceChildren(...kids);
    };
    const refresh = async () => { try { st = await window.api.remoteGet(); paint(); } catch {} };
    refresh();
    const poll = setInterval(() => { if (!dyn.isConnected) { clearInterval(poll); return; } refresh(); }, 3000);
    return [
      h('small', { style: muted }, 'Control Wella Hub from your phone or any browser. Same screens as the desktop app. Web access starts with the app; if no password is set, an 8-character password (letters and numbers) is generated automatically.'),
      h('div', { class: 'sep' }),
      dyn,
      h('div', { class: 'sep' }),
      h('label', { class: 'chk' }, enabled, 'Enable web access')
    ];
  };

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
  body.append(h('div', { class: 'sh' },
    h('h2', {}, 'Settings'),
    h('div', { style: 'display:flex;align-items:center;gap:10px;flex-wrap:wrap' },
      h('small', { style: muted }, 'Wella Hub ' + (document.getElementById('fVer').textContent || '')),
      h('button', { class: 'btn ghost sm', title: 'Verifică pe GitHub dacă există o versiune mai nouă', onclick: async (e) => {
        const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Verific…';
        try {
          const r = await window.api.checkUpdate();
          if (r && r.upToDate) toast('Ești la zi (' + (r.local || '') + ')', 'ok');
          else if (r && r.skipped) toast('Update amânat', 'ok');
          else if (r && r.applying) toast('Se aplică update-ul…', 'ok');
          else if (r && r.error) toast(r.error, 'bad');
        } catch (err) { toast(String(err && err.message || err), 'bad'); }
        finally { btn.disabled = false; btn.textContent = 'Verifică update'; }
      } }, 'Verifică update')
    )
  ), stabs, content, actions);
  renderTab(0);
  showModal(body);
  // saved keys are re-checked in the background: one the server now refuses is removed and its input comes back
  window.api.onWidgetOff && window.api.onWidgetOff(() => { window.api.widgetGet().then((r) => { WG = r; if (content.isConnected && settingsTab === 'general') renderTab(null); }); });
  window.api.utilKeysCheck().then((k) => {
    if (!k) return;
    const changed = k.faceit !== US.keys.faceit || k.leetify !== US.keys.leetify || k.steam !== US.keys.steam;
    US.keys = { faceit: !!k.faceit, leetify: !!k.leetify, steam: k.steam };
    (k.invalid || []).forEach((n) => toast('Cheia ' + (n === 'faceit' ? 'FACEIT' : n === 'steam' ? 'Steam' : 'Leetify') + ' nu mai este validă. Introdu una nouă în Settings.', 'bad'));
    if (changed && content.isConnected && (settingsTab === 'general' || settingsTab === 'startup')) renderTab(null);
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
        cell('Free cards left', a.cardsSum ? `${a.cardsSum.drops} in ${a.cardsSum.games} games` : D)]),
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
  const drawScan = (t) => {
    const b = h('button', { class: 'btn red', onclick: runScan }, t && t.scanned ? 'Rescan achievements' : 'Scan achievements');
    scanBox.replaceChildren(h('small', {}, t && t.scanned ? `Counted from ${t.scanned} of ${t.of} games. Reads the signed-in Steam client; no game is launched.` : 'Reads achievement schemas and states from the signed-in Steam client. Large libraries can take a while; no game is launched.'), b);
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
  const drawLinks = (i) => links.replaceChildren(
    h('button', { class: 'btn red', title: 'Edit the Steam profile of this account', onclick: () => openProfileEditor(accId) }, 'Edit profile'),
    h('button', { class: 'btn ghost', title: 'Free trading cards left, time estimate', onclick: () => openCards(accId) }, 'Trading cards'),
    ...(i && i.url ? [
    h('button', { class: 'btn ghost', onclick: () => window.open(i.url, '_blank') }, 'Open profile'),
    h('button', { class: 'btn ghost', onclick: () => copy(i.steamId, 'Steam ID') }, 'Copy Steam ID'),
    h('button', { class: 'btn ghost', onclick: () => copy(i.url, 'Link') }, 'Copy link')] : []));
  fill(null); drawScan(null); drawLinks(null);
  showModal(h('div', { class: 'modal acc' },
    h('div', { class: 'ahead' }, a.avatar ? h('img', { class: 'av big', src: a.avatar }) : null, h('div', {}, h('h2', {}, a.personaName), h('small', {}, a.accountName))),
    links, body, notes, scanBox, a.games.some((g) => isCounterStrike(g.appid)) ? csBox : null, valueBox,
    h('div', { class: 'mact' }, h('button', { class: 'btn ghost', onclick: closeModal }, 'Close'))));
  drawValue();
  window.api.accountInfo(accId).then((i) => {
    if (i.error) { notes.textContent = i.error; return; }
    last = i; fill(i); drawScan(i.ach); drawLinks(i);
    if (i.steamId && a.games.some((g) => isCounterStrike(g.appid))) drawCs(i.steamId);
    notes.replaceChildren(...i.notes.map((n) => h('div', {}, n)));
  }).catch((e) => { notes.textContent = e.message || String(e); });
}
(window.api.onScanProgress || (() => {}))((m) => {
  if (profScan && m.id === profScan.id) { profScan.i = m.i; profScan.total = m.total; const tx = document.getElementById('profScanTxt'); if (tx) tx.textContent = `Counting achievements ${m.i}/${m.total}\u2026`; }
  if (m.totals && window._profScanUpdated) window._profScanUpdated(m.id, m.totals);
  const u = window._scanUI; if (!u) return;
  u.bar.style.width = (m.i / m.total * 100) + '%';
  u.line.textContent = `${m.i}/${m.total} \u00b7 ${m.name}`;
});

// global clock: 24-hour time of the computer / phone running the app, i.e. the country where it is used
(function clock() {
  const el = document.getElementById('clk'); if (!el) return;
  const p = (n) => String(n).padStart(2, '0');
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const title = 'Local time' + (zone ? ` (${zone})` : '');
  const tick = () => { const d = new Date(); el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; if (el.title !== title) el.title = title; };
  tick(); setInterval(tick, 1000);
})();
