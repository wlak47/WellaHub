// Web version bridge. In the desktop app, preload.js already defines window.api and this file does nothing.
// In a browser (phone) it defines the SAME window.api, but the calls go over HTTP to the PC and events arrive live (SSE).
(function () {
  if (window.api) return;
  window.__WELLA_WEB = true;
  document.documentElement.classList.add('web-client');

  async function call(ch, d) {
    let r;
    try { r = await fetch('/api/' + encodeURIComponent(ch), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ d: d === undefined ? null : d }) }); }
    catch { throw new Error('Cannot reach the PC. Is Wella Hub running and web access on?'); }
    if (r.status === 401) { location.reload(); return new Promise(() => {}); }
    const j = await r.json().catch(() => ({}));
    if (j.e) throw new Error(j.e);
    return j.r;
  }
  const inv = (ch) => (d) => call(ch, d);
  const listeners = {};
  const on = (ev) => (cb) => { (listeners[ev] = listeners[ev] || []).push(cb); };
  const emit = (ev, data) => (listeners[ev] || []).forEach((cb) => { try { cb(data); } catch (e) { console.error(e); } });

  let es = null, lost = false;
  function connect() {
    es = new EventSource('/events');
    for (const ev of ['state', 'tick', 'login', 'ach:progress', 'scan:progress', 'theme', 'pcmon', 'pcmon:cfg', 'notify', 'prefs', 'free', 'remote:frame', 'remote:screen-state']) {
      es.addEventListener(ev, (m) => { try { emit(ev, JSON.parse(m.data)); } catch {} });
    }
    es.onopen = () => { lost = false; };
    es.onerror = () => { // connection dropped: EventSource retries by itself; if the login expired, go back to the login page
      lost = true;
      setTimeout(async () => { try { const r = await fetch('/auth/check'); if (r.status === 401) location.reload(); } catch {} }, 2500);
    };
  }
  connect();
  document.addEventListener('visibilitychange', () => { // phones freeze background tabs: reconnect when the page comes back
    if (!document.hidden && (lost || !es || es.readyState === 2)) { try { es.close(); } catch {} connect(); }
  });

  const noPc = async () => { throw new Error('The YouTube downloader only works in the app on the PC.'); };
  window.api = {
    list: inv('accounts:list'), version: inv('app:version'),
    loginStart: inv('login:start'), loginCode: inv('login:code'), loginCancel: inv('login:cancel'), loginQr: inv('login:qr'),
    start: inv('boost:start'), stop: inv('boost:stop'), startAll: inv('boost:startAll'), stopAll: inv('boost:stopAll'), getGameRotation: inv('boost:rotation:get'), setGameRotation: inv('boost:rotation:set'),
    update: inv('account:update'), remove: inv('account:remove'), refreshGames: inv('account:refreshGames'), setStatus: inv('account:setStatus'),
    achAccounts: inv('ach:accounts'), achGames: inv('ach:games'), achOpen: inv('ach:open'), achSet: inv('ach:set'), achEnsureSteam: inv('ach:ensureSteam'), achPaceGet: inv('ach:pace:get'), achPaceSet: inv('ach:pace:set'), achPaceReset: inv('ach:pace:reset'),
    achBulk: inv('ach:bulk'), achCancelBulk: inv('ach:cancelBulk'), achClose: inv('ach:close'), achFindMissing: inv('ach:findMissing'), achFindCancel: inv('ach:findCancel'),
    onAchProgress: on('ach:progress'),
    achDiag: inv('ach:diag'), achMethod: inv('ach:method'), cardsScan: inv('cards:scan'), gameInfo: inv('game:info'), gameHours: inv('game:hours'), accountInfo: inv('account:info'), accountsBans: inv('accounts:bans'), accountValue: inv('account:value'), accountScan: inv('account:scan'), accountScanCancel: inv('account:scanCancel'),
    onScanProgress: on('scan:progress'),
    gameLocal: inv('game:local'),
    localInstalledGames: inv('game:local:installed'),
    discordGet: inv('discord:get'), discordSet: inv('discord:set'), discordPreview: inv('discord:preview'), discordAuto: inv('discord:auto'),
    getPrefs: inv('app:getPrefs'), setPrefs: inv('app:setPrefs'),
    onShown: () => {}, presenceTab: inv('presence:tab'),
    onState: on('state'), onTick: on('tick'), onLogin: on('login'),
    getTheme: inv('theme:get'), setTheme: inv('theme:set'), onTheme: on('theme'),
    getCustomThemes: inv('theme:custom:get'), saveCustomTheme: inv('theme:custom:save'), deleteCustomTheme: inv('theme:custom:delete'),
    hookGet: inv('hook:get'), hookSet: inv('hook:set'), hookTest: inv('hook:test'), onPrefs: on('prefs'),
    utilCompare: inv('util:compare'), utilInventory: inv('util:inventory'),
    utilKeysGet: inv('util:keys:get'), utilKeysSet: inv('util:keys:set'), utilKeysValidate: inv('util:keys:validate'), utilKeysCheck: inv('util:keys:check'), utilLookup: (u, o) => call('util:lookup', o ? { q: u, ...o } : u),
    remoteIsAdmin: async () => {
      try { const r = await fetch('/auth/isadmin', { method: 'POST' }); const j = await r.json(); return j.admin === true; } catch { return false; }
    },
    remoteScreenStart: inv('remote:screen-start'), remoteScreenStop: inv('remote:screen-stop'), remoteScreenInput: inv('remote:screen-input'), remoteScreenMonitors: inv('remote:screen-monitors'), onRemoteFrame: on('remote:frame'), onRemoteScreenState: on('remote:screen-state'),
    remoteDevicesGet: inv('remote:devices:get'), remoteDevicesAction: inv('remote:devices:action'),
    pcmonGet: inv('pcmon:get'), pcmonSet: inv('pcmon:set'), pcmonTools: noPc, onPcmon: on('pcmon'), onPcmonCfg: on('pcmon:cfg'),
    freeGet: inv('free:get'), freeSet: inv('free:set'), freeCheck: inv('free:check'), freeSearch: inv('free:search'), freeClaim: inv('free:claim'), onFree: on('free'),
    notifyGet: inv('notify:get'), notifySet: inv('notify:set'), notifyTest: inv('notify:test'), onNotify: on('notify'),
    ytState: async () => ({ dir: '' }), ytFolder: noPc, ytProbe: noPc, ytDownload: noPc, ytCancel: noPc, ytShow: noPc, onUtilProgress: () => {},
    feat: (n, d) => call('feat:call', { n, d }),
    logout: async () => { try { await fetch('/auth/logout', { method: 'POST' }); } catch {} location.reload(); }
  };
})();
