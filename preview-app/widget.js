// Mini widget: draws what the main process sends every second. No Steam logic here.
(function () {
  const w = document.getElementById('w');
  let cfg = null, data = [], lastSig = '', lastSize = '';
  const WORDS = {
    en: {session:'Session',total:'Total',drops:'Drops left',games:'Games',online:'Boosting',busy:'Connecting',offline:'Stopped',all:'All',none:'No account'},
    ro: {session:'Sesiune',total:'Total',drops:'Cărți rămase',games:'Jocuri',online:'Boost activ',busy:'Conectare',offline:'Oprit',all:'Toate',none:'Niciun cont'},
    es: {session:'Sesión',total:'Total',drops:'Cartas',games:'Juegos',online:'En marcha',busy:'Conectando',offline:'Detenido',all:'Todas',none:'Sin cuenta'},
    fr: {session:'Session',total:'Total',drops:'Cartes',games:'Jeux',online:'En cours',busy:'Connexion',offline:'Arrêté',all:'Tous',none:'Aucun compte'},
    de: {session:'Sitzung',total:'Gesamt',drops:'Karten übrig',games:'Spiele',online:'Aktiv',busy:'Verbindung',offline:'Gestoppt',all:'Alle',none:'Kein Konto'},
    ru: {session:'Сессия',total:'Всего',drops:'Карточек',games:'Игры',online:'Запущено',busy:'Подключение',offline:'Остановлено',all:'Все',none:'Нет аккаунта'}
  };
  const hm = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
  const hrs = (s) => (s / 3600).toFixed(s >= 360000 ? 0 : 1) + ' h';
  const el = (tag, cls, txt, title) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; if (title) e.title = title; return e; };
  const stat = (label, value, title, cls) => { const s = el('span', 'v' + (cls ? ' ' + cls : ''), null, title); s.append(el('span', '', label), el('b', '', value)); return s; };
  function draw() {
    if (!cfg) return;
    const tr = WORDS[cfg.lang] || WORDS.en;
    document.documentElement.style.setProperty('--ac', /^#[0-9a-f]{6}$/i.test(cfg.accent) ? cfg.accent : '#8b5cf6');
    w.className = (cfg.layout === 'row' ? 'row' : '') + (cfg.lock || cfg.clickThrough ? ' nodrag' : '');
    const kids = [];
    for (const a of data) {
      const row = el('div', 'a');
      if (cfg.dot) row.append(el('span', 'dot ' + (a.ok ? 'ok' : a.status === 'connecting' ? 'mid' : ''), null, a.status));
      if (cfg.avatar && a.avatar) { const i = el('img', 'av'); i.src = a.avatar; i.draggable = false; row.append(i); }
      if (cfg.name) { const who = el('div','who'); who.append(el('span','nm',a.name),el('span','state'+(a.status==='boosting'?' on':''),a.status==='boosting'?tr.online:a.status==='connecting'?tr.busy:tr.offline)); row.append(who); }
      if (cfg.session) row.append(stat(tr.session, a.status === 'boosting' ? hm(a.s) : '\u2014', tr.session));
      if (cfg.total) row.append(stat(tr.total, hrs(a.t), tr.total));
      if (cfg.cards) row.append(stat(tr.drops, a.cards ? a.cards.total.toLocaleString() : '\u2014', tr.drops, 'ac'));
      if (cfg.games) row.append(stat(tr.games, a.cards ? `${a.cards.left}/${a.cards.idle}` : String(a.games), tr.games));
      kids.push(row);
    }
    if (cfg.sum && data.length > 1) {
      const t = data.reduce((x, a) => x + a.t, 0), c = data.reduce((x, a) => x + (a.cards ? a.cards.total : 0), 0), n = data.filter((a) => a.status === 'boosting').length;
      const row = el('div', 'a sum');
      row.append(el('span', 'nm', `${tr.all} (${n}/${data.length})`));
      if (cfg.total) row.append(stat(tr.total, hrs(t)));
      if (cfg.cards) row.append(stat(tr.drops, c.toLocaleString(), '', 'ac'));
      kids.push(row);
    }
    if (!kids.length) kids.push(el('span', 'empty', tr.none));
    w.replaceChildren(...kids);
    const r = w.getBoundingClientRect(), sz = Math.ceil(r.width) + 'x' + Math.ceil(r.height);
    if (sz !== lastSize) { lastSize = sz; window.wapi.size(Math.ceil(r.width), Math.ceil(r.height)); }
  }
  window.wapi.onData((d) => { data = d || []; draw(); });
  window.wapi.onCfg((c) => { cfg = c; draw(); });
  window.wapi.init().then((r) => { cfg = r.cfg; data = r.data; draw(); });
  document.addEventListener('contextmenu', (e) => { e.preventDefault(); window.wapi.menu(); });
  document.addEventListener('dblclick', () => window.wapi.open());
})();
