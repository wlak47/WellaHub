// Safe, local-only API for the website preview. It never contacts Steam or the host PC.
(function () {
  'use strict';
  window.__WELLA_WEB = true;
  document.documentElement.classList.add('web-client');
  const games = [
    { appid: 570, name: 'Dota 2' }, { appid: 730, name: 'Counter-Strike 2' },
    { appid: 1172470, name: 'Apex Legends' }, { appid: 230410, name: 'Warframe' },
    { appid: 440, name: 'Team Fortress 2' }, { appid: 2767030, name: 'Marvel Rivals' },
    { appid: 1086940, name: 'Baldur’s Gate 3' }, { appid: 1091500, name: 'Cyberpunk 2077' }
  ].map((g, i) => ({ ...g, playtime: [1240, 895, 420, 310, 265, 152, 86, 44][i] }));
  const accounts = ['wella.demo', 'PinkOrbit', 'NeonPlayer', 'LunaByte', 'PixelMuse', 'NovaCloud', 'Starfall'].map((personaName, i) => ({
    id: `demo-${i + 1}`, name: personaName, count: games.length, local: i === 0, accountName: personaName, personaName, persona: 'Online', avatar: '', games,
    selected: games.slice(0, 6).map((g) => g.appid), favorites: [570, 730], totalSeconds: [284400, 181200, 93600, 211200, 199800, 171000, 146400][i],
    gameSeconds: Object.fromEntries(games.map((g, j) => [g.appid, (j + 2) * 3600])), cardDrops: 4, cardsT: Date.now(),
    status: 'boosting', sessionSeconds: 3720 + i * 91, note: '', health: { ok: true, why: '' }
  }));
  let prefs = { freeTab: true, utilTab: true, fpsTab: true, monitorTab: true };
  let remote = { enabled: true, running: true, port: 6767, urls: ['http://demo.local:6767'], autoTunnel: false, tunnel: { status: 'off' } };
  let devices = [{ id: 'demo-phone', name: 'Preview phone', ip: '192.0.2.10', connected: true, trusted: false, blocked: false }];
  let pcCfg = { enabled: true, fpsTab: true, fps: true, alerts: false, cpuTemp: 85, gpuTemp: 85, ram: 90, disk: 90, cooldown: 10 };
  let notify = { enabled: false, desktop: false, sound: false, volume: 0.2, events: {} };
  let free = { accounts: accounts.map((a) => ({ id: a.id, name: a.personaName })), cfg: { types: ['game', 'dlc', 'software', 'mod'], accounts: [], autoFreeToPlay: true, autoClaim: false }, history: [] };
  const catalog = games.map((g) => ({ ...g, image: `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`, type: 'game', status: {} }));
  const friendSamples = [
    { id: '76561198010000111', name: 'Mira', status: 'Online' },
    { id: '76561198010000222', name: 'Kitsune', status: 'In-Game · Counter-Strike 2' },
    { id: '76561198010000333', name: 'Dracul', status: 'Last online 2 hours ago' },
    { id: '76561198010000444', name: 'Rex', status: 'Online' },
    { id: '76561198010000555', name: 'Luna', status: 'Last online yesterday' },
    { id: '76561198010000666', name: 'Pixel', status: 'In-Game · Dota 2' }
  ];
  const dailyLog = () => {
    const day = new Date().toLocaleDateString('en-CA');
    const accountsToday = Object.fromEntries(accounts.map((a, i) => [a.id, { name: a.personaName, hours: a.status === 'boosting' ? 1.2 + i * 0.15 : 0, cards: i < 2 ? 1 : 0 }]));
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA');
    const accountsYesterday = Object.fromEntries(accounts.map((a, i) => [a.id, { name: a.personaName, hours: 2.1 + i * 0.22, cards: i % 3 === 0 ? 1 : 0 }]));
    return [{ day: yesterday, accounts: accountsYesterday }, { day, today: true, accounts: accountsToday }];
  };
  const listeners = Object.create(null);
  const on = (event) => (cb) => { (listeners[event] ||= []).push(cb); };
  const emit = (event, value) => (listeners[event] || []).forEach((cb) => { try { cb(value); } catch {} });
  const notice = (action) => {
    const box = document.getElementById('toast');
    if (!box) return;
    box.textContent = `Preview only · ${action} is simulated.`;
    box.classList.remove('hidden');
    clearTimeout(notice.timer);
    notice.timer = setTimeout(() => box.classList.add('hidden'), 2600);
  };
  const fakeDiscord = { enabled: false, appId: '', name: 'Wella Hub', first: '{status}', second: '{tab}', autoHours: true };
  const methods = {
    list: async () => accounts, version: async () => 'v0.7.0 · Preview', accountsBans: async () => ({}),
    getPrefs: async () => prefs, setPrefs: async (v) => (prefs = { ...prefs, ...v }),
    start: async (id) => { const a = accounts.find((x) => x.id === id); if (a) a.status = 'boosting'; emit('state', accounts); notice('Start'); return {}; },
    stop: async (id) => { const a = accounts.find((x) => x.id === id); if (a) a.status = 'stopped'; emit('state', accounts); notice('Stop'); return {}; },
    startAll: async () => { accounts.forEach((a) => a.status = 'boosting'); emit('state', accounts); notice('Start all'); return {}; },
    stopAll: async () => { accounts.forEach((a) => a.status = 'stopped'); emit('state', accounts); notice('Stop all'); return {}; },
    getGameRotation: async () => ({ enabled: false }), setGameRotation: async (enabled) => ({ enabled }),
    cardsDashboard: async () => accounts.map((a, i) => ({ id: a.id, name: a.personaName, avatar: '', status: a.status, totalHours: Math.round(a.totalSeconds / 360) / 10, drops: i < 4 ? 2 + (i % 3) : 0, gamesWithDrops: i < 4 ? 2 : 0, cardsScannedAt: Date.now() - i * 3600000, estimateMinutes: i < 4 ? 60 + i * 25 : null, estimateText: i < 4 ? `${1 + i}h ${i * 5}m` : null, cardsOwned: 12 + i * 3, setsComplete: i % 3 })),
    dailyLog: async () => dailyLog(),
    cardsCraftGuide: async () => ({ sets: [{ appid: 730, name: 'Counter-Strike 2', setSize: 5, setsAvailable: 1, copies: 1 }, { appid: 570, name: 'Dota 2', setSize: 5, setsAvailable: 2, copies: 2 }], totalSets: 3, note: 'Sample card inventory. Nothing is crafted in preview mode.' }),
    cardsGet: async () => ({ view: { games: games.map((g, i) => ({ ...g, drops: i % 2 ? 1 : 0, have: i % 3, total: 5, copies: 1 })), cardsOwned: 18 } }),
    cardsScan: async () => ({ view: { games: [], cardsOwned: 0 } }),
    gamesSearch: async (query = '') => { const q = String(query).toLowerCase(); return { results: accounts.filter((a) => a.games.some((g) => g.name.toLowerCase().includes(q))).slice(0, 3).map((a) => ({ accountId: a.id, accountName: a.personaName, boosting: a.status === 'boosting', games: a.games.filter((g) => g.name.toLowerCase().includes(q)).map((g) => ({ ...g, hours: a.gameSeconds[g.appid] / 3600, selected: a.selected.includes(g.appid), dropsLeft: 2 })) })) }; },
    onState: on('state'), onTick: on('tick'), onTheme: on('theme'), onPrefs: on('prefs'), onFree: on('free'), onLogin: on('login'), onAchProgress: on('ach'), onScanProgress: on('scan'), onRemoteFrame: on('remote:frame'), onRemoteScreenState: on('remote:screen-state'), onUtilProgress: () => {}, onNotify: () => {}, onPcmon: () => {}, onPcmonCfg: () => {}, onWidgetOff: () => {},
    getTheme: async () => null, setTheme: async () => ({}), getCustomThemes: async () => [], saveCustomTheme: async () => ({}), deleteCustomTheme: async () => ({}),
    achAccounts: async () => accounts, achGames: async () => games.map((g) => ({ ...g, achievements: 24, unlocked: 18, percentage: 75 })),
    achMethod: async () => ({ ready: true, text: 'Preview data' }), achPaceGet: async () => ({ values: {}, defaults: {} }), achDiag: async () => 'Preview only',
    achOpen: async () => ({ source: 'preview', achievements: Array.from({ length: 12 }, (_, i) => ({ name: `SAMPLE_${i + 1}`, displayName: `Sample achievement ${i + 1}`, description: 'Example achievement shown in preview mode.', unlocked: i < 7, percent: 48.2 })) }),
    achSet: async ({ names = [], value = false }) => ({ states: Object.fromEntries(names.map((name) => [name, !!value])), skipped: 0 }),
    achBulk: async () => ({ done: true, changed: 1 }), achStopAll: async () => ({ ok: true }), achFindMissing: async () => ({ games: [], done: true }),
    achEnsureSteam: async () => ({ ok: true }), achPaceSet: async () => ({ values: {} }), achPaceReset: async () => ({ values: {} }),
    accountInfo: async () => ({ level: 12, memberSince: '2022', status: 'Online', privacy: 'Public', friends: 48, groups: 3, badges: 6, screenshots: 12, reviews: 5, realName: 'WellaHub', location: 'Demo profile', games: 581, playtime: 820, last2Weeks: 24, unlocked: 11462, totalAchievements: 12465, completion: 92 }),
    gameInfo: async ({ appid }) => ({ appid, name: games.find((g) => g.appid === appid)?.name || 'Sample game', playtime: 1240, achievements: 24, unlocked: 18 }),
    gameLocal: async ({ action }) => { notice(action === 'launch' ? 'Play game' : 'Game action'); return { message: 'Preview only · this game was not launched.' }; },
    gameHours: async () => Object.fromEntries(games.map((g) => [g.appid, g.playtime])), localInstalledGames: async () => ({ appids: games.slice(0, 3).map((g) => g.appid) }),
    freeGet: async () => free, freeSearch: async ({ query = '' } = {}) => { const rows = catalog.filter((g) => g.name.toLowerCase().includes(query.toLowerCase())); return { games: rows, total: rows.length, hasMore: false }; },
    freeSet: async (v) => (free = { ...free, cfg: { ...free.cfg, ...v } }), freeCheck: async () => free,
    discordGet: async () => ({ ...fakeDiscord }), discordPreview: async () => ({ name: 'Wella Hub', details: 'Browsing the demo', state: 'Sample account', buttons: [], timer: true }),
    utilKeysGet: async () => ({}), utilKeysCheck: async () => ({}), utilKeysSet: async () => ({}), utilKeysValidate: async () => ({ valid: true }),
    widgetGet: async () => ({ cfg: { enabled: false }, accounts }), widgetSet: async () => ({ cfg: { enabled: false }, accounts }),
    notifyGet: async () => ({ cfg: notify, events: [] }), notifySet: async (v) => (notify = { ...notify, ...v, events: { ...notify.events, ...(v.events || {}) } }, { cfg: notify, events: [] }),
    pcmonGet: async () => ({ cfg: pcCfg, snapshot: { cpu: 24, gpu: 38, ram: 45, disk: 62 } }), pcmonSet: async (v) => (pcCfg = { ...pcCfg, ...v }, { cfg: pcCfg, snapshot: { cpu: 24, gpu: 38, ram: 45, disk: 62 } }), pcmonTools: async () => notice('Tools folder'),
    remoteIsAdmin: async () => false, remoteGet: async () => remote,
    remoteSet: async (v) => (remote = { ...remote, ...v }), remoteTunnel: async (on) => (remote = { ...remote, tunnel: on ? { status: 'on', url: 'https://preview.example.invalid' } : { status: 'off' } }),
    remoteDevicesGet: async () => devices,
    remoteDevicesAction: async ({ id, action }) => { devices = devices.map((d) => d.id !== id ? d : ({ ...d, trusted: action === 'whitelist' ? true : action === 'unwhitelist' ? false : d.trusted, blocked: action === 'block' ? true : action === 'unblock' ? false : d.blocked, connected: action === 'disconnect' ? false : d.connected })); notice('Device action'); return { devices }; },
    remoteScreenMonitors: async () => [{ id: 'demo-display', name: 'Preview display', width: 1920, height: 1080, primary: true }],
    remoteScreenStart: async () => { const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><defs><linearGradient id="g"><stop stop-color="#190c18"/><stop offset="1" stop-color="#6d1d53"/></linearGradient></defs><rect width="960" height="540" fill="url(#g)"/><rect x="30" y="30" width="900" height="480" rx="18" fill="#110b12" stroke="#e83b98"/><text x="70" y="100" fill="#ff8dc5" font-family="sans-serif" font-size="34">Wella Hub · Preview PC</text><text x="70" y="165" fill="#fff" font-family="sans-serif" font-size="24">Sample desktop screen</text><rect x="70" y="205" width="820" height="210" rx="14" fill="#291329"/><text x="105" y="275" fill="#fff" font-family="sans-serif" font-size="28">Remote controls are simulated</text><text x="105" y="330" fill="#ce9abb" font-family="sans-serif" font-size="20">This preview cannot see or control your computer.</text></svg>'; emit('remote:frame', `data:image/svg+xml,${encodeURIComponent(svg)}`); emit('remote:screen-state', { on: true, fps: 5, maxWidth: 960, maxHeight: 540 }); return { ok: true }; }, remoteScreenStop: async () => { emit('remote:screen-state', { on: false }); notice('Screen sharing'); return { ok: true }; }, remoteScreenInput: async () => ({ ok: true }),
    remoteScreenFrame: async () => null, remoteScreenSource: async () => [], remoteIp: async () => '192.0.2.1',
    ytState: async () => ({ dir: '' }), ytFolder: async () => ({ error: 'Unavailable in preview mode.' }), ytProbe: async () => ({ error: 'Unavailable in preview mode.' }),
    utilLookup: async () => ({ error: 'Connect an account in the desktop app to load live profile data.' }), utilCompare: async () => ({ error: 'Sample comparison data only.' }), utilInventory: async () => ({ error: 'Sample inventory data only.' }),
    friendsGet: async () => ({ accounts: accounts.map((a) => ({ id: a.id, name: a.personaName })) }),
    friendsList: async () => ({ friends: friendSamples }),
    friendsAdd: async ({ target = '' } = {}) => ({ name: target, preview: true }),
    friendsRemove: async () => ({ preview: true }),
    dcBotsGet: async () => ({ bots: [], ai: { enabled: false } }),
    discordSet: async (d) => ({ ...d, connected: false }), discordAuto: async () => ({ ...fakeDiscord }),
    logout: async () => notice('Sign out')
  };
  const actions = new Set(['start', 'stop', 'startAll', 'stopAll', 'remove', 'update', 'refreshGames', 'gameLocal', 'achSet', 'achBulk', 'achFindMissing', 'freeClaim', 'discordSet', 'discordAuto', 'notifySet', 'notifyTest', 'pcmonSet', 'remoteSet', 'remoteTunnel', 'remoteDevicesAction', 'utilCompare', 'utilInventory', 'ytDownload', 'ytCancel', 'ytShow', 'hookSet', 'hookTest', 'cardsScan', 'accountScan', 'accountValue']);
  window.api = new Proxy({}, { get(_target, key) {
    if (key === 'then') return undefined;
    if (methods[key]) return methods[key];
    if (typeof key === 'symbol') return undefined;
    return async (...args) => { if (actions.has(key)) notice(String(key).replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)); return {}; };
  }});
  // Keep browser-native dialogs and external navigation out of the preview.
  window.confirm = () => { notice('Confirmation'); return true; };
  window.alert = () => notice('Message');
  window.open = () => { notice('External page'); return null; };
  window.__WELLA_PREVIEW_ONLY = true;
  window.__WELLA_MOCK_EMIT = emit;
})();

