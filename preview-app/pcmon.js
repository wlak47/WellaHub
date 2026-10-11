// Monitor tab + FPS Monitor tab + notifications (sound, in-app toast) + the monitor / notification options inside Settings > General.
// Loaded after app.js: it uses h(), $(), toast(), setTab() and the `tab` variable from there.
(function () {
  const svg = (inner, n = 20) => { const d = document.createElement('div'); d.innerHTML = `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`; return d.firstChild; };
  const IC = {
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    gpu: '<rect x="2" y="7" width="18" height="10" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M20 10h2M20 14h2M5 17v2"/>',
    ram: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v8M11 8v8M15 8v8M6 16v2M10 16v2M14 16v2M18 16v2"/>',
    disk: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    fps: '<path d="M3 17l5-6 4 4 4-8 5 6"/><path d="M3 21h18"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>'
  };
  const MUTED = 'color:var(--mut)';
  const gb = (b) => (b / 1073741824).toFixed(b >= 107374182400 ? 0 : 1) + ' GB';
  const lvl = (p) => (p >= 90 ? 'crit' : p >= 70 ? 'warn' : '');

  let cfg = null, snap = null, built = false, els = {};
  const hist = { cpu: [], gpu: [], ram: [] };

  // ================= sounds + in-app notification =================
  let actx = null;
  function beep(freq, start, dur, vol, type) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, actx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), actx.currentTime + start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + start + dur);
    o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + start); o.stop(actx.currentTime + start + dur + 0.05);
  }
  function play(n) {
    if (!n || !n.sound || !(n.volume > 0)) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const v = 0.25 * n.volume;
      const up = ['boostStart', 'achStart', 'webOn', 'webLink', 'loginOk', 'appStart'], down = ['boostStop', 'achStop', 'webOff', 'sessionEnd'];
      if (n.level === 'bad') { beep(330, 0, 0.16, v, 'square'); beep(247, 0.18, 0.16, v, 'square'); beep(330, 0.36, 0.2, v, 'square'); }
      else if (up.includes(n.key) || n.key === 'test') { beep(523, 0, 0.12, v); beep(659, 0.11, 0.12, v); beep(784, 0.22, 0.2, v); }
      else if (down.includes(n.key)) { beep(784, 0, 0.12, v); beep(659, 0.11, 0.12, v); beep(523, 0.22, 0.2, v); }
      else { beep(659, 0, 0.12, v); beep(880, 0.12, 0.22, v); }     // done / info
    } catch {}
  }
  const onNote = (n) => {
    if (!n) return;
    const tr = (s) => window.WellaI18n ? window.WellaI18n.t(s || '') : (s || '');
    toast(tr(n.body), n.level === 'bad' ? 'bad' : n.level === 'ok' ? 'ok' : undefined, tr(n.title));
    play(n);
  };
  if (window.api && window.api.onNotify) window.api.onNotify(onNote);

  // ================= tab visibility (Monitor + FPS Monitor, each switched on/off in Settings > General) =================
  const showTab = (id, key, on) => {
    const b = document.getElementById(id); if (!b) return;
    b.classList.toggle('hidden', !on);
    if (!on && typeof tab !== 'undefined' && tab === key) setTab('boost');
  };
  function applyTabs() {
    showTab('tabPc', 'pcmon', !!(window.__WELLA_WEB ? (cfg && (cfg.enabled || cfg.fpsTab)) : (cfg && cfg.enabled)));
    showTab('tabFps', 'fps', !window.__WELLA_WEB && !!(cfg && cfg.fpsTab));
    if (typeof moveInd === 'function') { moveInd(); setTimeout(moveInd, 60); }
    if (cfg && cfg.enabled) paint(); else { built = false; if (window.__WELLA_WEB && tab === 'pcmon') paint(); }
    if ((cfg && cfg.fpsTab) || (window.__WELLA_WEB && cfg && cfg.enabled)) paintFps(); else fbuilt = false;
  }
  const applyTab = applyTabs;

  // ================= the view =================
  const card = (title, icon, sub, ...body) => {
    const sm = h('small', {}, sub || '');
    return { root: h('div', { class: 'pcc' }, h('div', { class: 'ph' }, svg(icon), title, sm), ...body), sub: sm };
  };
  const bar = () => h('div', { class: 'pcbar' }, h('i'));
  const big = () => h('div', { class: 'pcbig' });
  const spark = () => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 120 44'); s.setAttribute('preserveAspectRatio', 'none'); s.setAttribute('class', 'pcspark'); s.innerHTML = '<path class="fill"/><path class="line"/>'; return s; };
  const row = (a) => { const v = h('b', {}, '\u2014'); return { root: h('div', { class: 'pcrow' }, h('span', {}, a), v), v }; };

  function build() {
    const host = document.getElementById('pcMain'); if (!host) return;
    els = {};
    const cpu = card('CPU', IC.cpu, '', null), gpu = card('GPU', IC.gpu, '', null), ram = card('RAM', IC.ram, '', null);
    // CPU
    els.cpuB = big(); els.cpuBar = bar(); els.cpuSp = spark(); els.cpuT = row('Temperature'); els.cpuC = row('Cores');
    cpu.root.append(els.cpuB, els.cpuBar, els.cpuSp, els.cpuT.root, els.cpuC.root, (els.cpuNote = h('div', { class: 'pcnote' })));
    els.cpuCard = cpu.root; els.cpuSub = cpu.sub;
    // GPU
    els.gpuB = big(); els.gpuBar = bar(); els.gpuSp = spark(); els.gpuT = row('Temperature'); els.gpuV = row('Video memory');
    gpu.root.append(els.gpuB, els.gpuBar, els.gpuSp, els.gpuT.root, els.gpuV.root, (els.gpuNote = h('div', { class: 'pcnote' })));
    els.gpuCard = gpu.root; els.gpuSub = gpu.sub;
    // RAM
    els.ramB = big(); els.ramBar = bar(); els.ramSp = spark(); els.ramU = row('Used'); els.ramF = row('Free');
    ram.root.append(els.ramB, els.ramBar, els.ramSp, els.ramU.root, els.ramF.root);
    els.ramCard = ram.root; els.ramSub = ram.sub;
    // Disks
    const dk = card('Disk space', IC.disk, '', (els.disks = h('div', { class: 'pcdisks' })));
    // Alerts
    els.alert = h('div', { class: 'pcnote' });
    const al = card('Alerts', IC.bell, '', els.alert); al.root.classList.add('pcwide');
    const remoteCtl = window.__WELLA_WEB ? h('div', { class: 'setrow' }, h('small', {}, 'Live PC readings are streamed from the connected desktop.'), h('button', { class: 'btn stop sm', onclick: () => setEnabled(false) }, 'Stop Monitor')) : null;
    const system = card('System activity', IC.cpu, '', (els.systemStats = h('div', { class: 'pcsystem-stats' })));
    system.root.classList.add('pcwide');
    const webFps = window.__WELLA_WEB && cfg && (cfg.enabled || cfg.fpsTab) ? h('div', { id: 'webFpsMount', class: 'pcwide' }) : null;
    const grid = h('div', { class: 'pcgrid' }, cpu.root, gpu.root, ram.root, dk.root, al.root, system.root, ...(webFps ? [webFps] : []));
    host.replaceChildren(...(remoteCtl ? [remoteCtl, grid] : [grid]));
    built = true;
  }
  const setBar = (b, p) => { const i = b.firstChild; i.style.width = Math.max(0, Math.min(100, p || 0)) + '%'; i.className = lvl(p || 0); };
  function drawSpark(s, arr) {
    if (arr.length < 2) return;
    const n = 60, a = arr.slice(-n), step = 120 / (n - 1), off = (n - a.length) * step;
    const pts = a.map((v, i) => [off + i * step, 42 - (Math.max(0, Math.min(100, v)) / 100) * 40]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    s.querySelector('.line').setAttribute('d', d);
    s.querySelector('.fill').setAttribute('d', d + ` L${pts[pts.length - 1][0].toFixed(1)} 44 L${pts[0][0].toFixed(1)} 44 Z`);
  }
  const NA = 'Not available';

  function paint() {
    const host = document.getElementById('pcMain'); if (!host) return;
    if (!cfg || (!cfg.enabled && !(window.__WELLA_WEB && cfg.fpsTab))) { built = false; const off = h('div', { class: 'empty' }, 'Monitor is off. Turn it on to stream readings from this PC.'); const start = window.__WELLA_WEB ? h('button', { class: 'btn start', style: 'margin:0 auto', onclick: () => setEnabled(true) }, 'Start Monitor') : null; host.replaceChildren(...(start ? [off, start] : [off])); return; }
    if (!built) build();
    if (!snap) { els.cpuB.textContent = '\u2026'; els.gpuB.textContent = '\u2026'; els.ramB.textContent = '\u2026'; return; }
    const lim = cfg || {};
    // CPU
    const c = snap.cpu || {};
    els.cpuSub.textContent = c.name || '';
    if (c.usage != null) { els.cpuB.replaceChildren(c.usage + '', h('small', {}, '%')); setBar(els.cpuBar, c.usage); hist.cpu.push(c.usage); if (hist.cpu.length > 60) hist.cpu.shift(); drawSpark(els.cpuSp, hist.cpu); }
    els.cpuT.v.textContent = c.temp != null ? c.temp + ' \u00B0C' : NA;
    els.cpuC.v.textContent = c.cores ? c.cores + ' threads' : '\u2014';
    els.cpuNote.textContent = c.temp == null ? 'Windows does not expose the CPU temperature on many PCs. When it is hidden, a tool such as LibreHardwareMonitor is needed.' : '';
    els.cpuCard.classList.toggle('hot', c.temp != null && c.temp >= lim.cpuTemp);
    // GPU
    const g = snap.gpu;
    els.gpuSub.textContent = g ? g.name : '';
    if (g && g.usage != null) { els.gpuB.replaceChildren(Math.round(g.usage) + '', h('small', {}, '%')); setBar(els.gpuBar, g.usage); hist.gpu.push(g.usage); if (hist.gpu.length > 60) hist.gpu.shift(); drawSpark(els.gpuSp, hist.gpu); }
    else { els.gpuB.replaceChildren(NA); setBar(els.gpuBar, 0); }
    els.gpuT.v.textContent = g && g.temp != null ? g.temp + ' \u00B0C' : NA;
    els.gpuV.v.textContent = g && g.vramTotal ? `${(g.vramUsed / 1024).toFixed(1)} / ${(g.vramTotal / 1024).toFixed(1)} GB` : NA;
    els.gpuNote.textContent = g ? (g.temp == null ? 'This graphics card does not report its temperature to the app.' : '') : 'No readable GPU sensor was found (NVIDIA cards work best).';
    els.gpuCard.classList.toggle('hot', !!(g && g.temp != null && g.temp >= lim.gpuTemp));
    // RAM
    const r = snap.ram;
    if (r) {
      els.ramB.replaceChildren(r.percent + '', h('small', {}, '%')); setBar(els.ramBar, r.percent); hist.ram.push(r.percent); if (hist.ram.length > 60) hist.ram.shift(); drawSpark(els.ramSp, hist.ram);
      els.ramSub.textContent = gb(r.total);
      els.ramU.v.textContent = gb(r.used); els.ramF.v.textContent = gb(r.total - r.used);
      els.ramCard.classList.toggle('hot', r.percent >= lim.ram);
    }
    // disks
    const ds = snap.disks || [];
    els.disks.replaceChildren(...(ds.length ? ds.map((d) => h('div', {}, h('div', { class: 'pcrow' }, h('span', {}, d.id), h('b', {}, `${gb(d.total - d.free)} used \u00B7 ${gb(d.free)} free of ${gb(d.total)}`)), (() => { const b = bar(); setBar(b, d.percent); b.style.marginTop = '6px'; return b; })())) : [h('div', { class: 'pcnote' }, 'No disk information available.')]));
    // alerts
    const warn = [];
    if (c.temp != null && c.temp >= lim.cpuTemp) warn.push(`CPU ${c.temp}\u00B0C`);
    if (g && g.temp != null && g.temp >= lim.gpuTemp) warn.push(`GPU ${g.temp}\u00B0C`);
    if (r && r.percent >= lim.ram) warn.push(`RAM ${r.percent}%`);
    ds.forEach((d) => { if (d.percent >= lim.disk) warn.push(`Disk ${d.id} ${d.percent}%`); });
    els.alert.textContent = !lim.alerts ? 'Alerts are off. Turn them on in Settings > General.'
      : warn.length ? 'Over the limit now: ' + warn.join(', ') + '.'
      : `Alerts are on. You are told when the CPU or GPU gets over ${lim.cpuTemp}/${lim.gpuTemp} \u00B0C, RAM over ${lim.ram}% or a disk over ${lim.disk}% full.`;
    const sys = snap.system || {}, uptime = Math.max(0, Number(sys.uptimeSeconds) || 0);
    const time = uptime >= 86400 ? `${Math.floor(uptime / 86400)}d ${Math.floor(uptime % 86400 / 3600)}h` : `${Math.floor(uptime / 3600)}h ${Math.floor(uptime % 3600 / 60)}m`;
    const battery = sys.battery ? `Battery ${sys.battery.percent}%` : 'No battery';
    const top = (sys.topProcesses || []).slice(0, 6);
    els.systemStats.replaceChildren(
      h('div', { class: 'pcrow' }, h('span', {}, 'Uptime'), h('b', {}, time)),
      h('div', { class: 'pcrow' }, h('span', {}, 'Power'), h('b', {}, battery)),
      h('div', { class: 'pcprocess-head' }, 'Top processes'),
      ...(top.length ? top.map((p) => h('div', { class: 'pcrow' }, h('span', {}, p.name), h('b', {}, `${Number(p.cpu || 0).toFixed(1)}% · ${gb(p.memory || 0)}`))) : [h('div', { class: 'pcnote' }, 'Process details are loading…')])
    );
  }

  // ================= FPS Monitor view =================
  let fbuilt = false, fe = {};
  const fhist = [];
  function buildFps() {
    const host = window.__WELLA_WEB && tab === 'pcmon' ? document.getElementById('webFpsMount') : document.getElementById('fpsMain'); if (!host) return;
    fe = {};
    fe.big = h('div', { class: 'fbig' }, '\u2014'); fe.game = h('div', { class: 'fgame' });
    fe.fr = h('b', {}, '\u2014'); fe.lo = h('b', {}, '\u2014'); fe.av = h('b', {}, '\u2014');
    const sp = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sp.setAttribute('viewBox', '0 0 120 44'); sp.setAttribute('preserveAspectRatio', 'none'); sp.setAttribute('class', 'fpsspark'); sp.innerHTML = '<path class="fill"/><path class="line"/>'; fe.sp = sp;
    fe.note = h('div', { class: 'pcnote' });
    fe.btn = h('button', { class: 'btn ghost sm hidden', style: 'align-self:center', onclick: () => { try { window.api.pcmonTools(); } catch (e) { toast(e.message || String(e), 'bad'); } } }, 'Open tools folder');
    fe.root = h('div', { class: 'pcc fpshero' },
      h('div', { class: 'ph', style: 'align-self:stretch' }, svg(IC.fps), 'FPS Monitor', (fe.sub = h('small', {}, ''))),
      fe.big, fe.game,
      h('div', { class: 'fpsstats' }, h('div', {}, h('small', {}, 'Frametime'), fe.fr), h('div', {}, h('small', {}, '1% low'), fe.lo), h('div', {}, h('small', {}, 'Average'), fe.av)),
      sp, fe.note, fe.btn);
    host.replaceChildren(h('div', { class: 'pcgrid' }, fe.root));
    fbuilt = true;
  }
  function paintFps() {
    const embedded = window.__WELLA_WEB && tab === 'pcmon';
    const host = embedded ? document.getElementById('webFpsMount') : document.getElementById('fpsMain'); if (!host) return;
    if (!cfg || (!(cfg.fpsTab) && !(embedded && cfg.enabled))) { fbuilt = false; host.replaceChildren(h('div', { class: 'empty' }, 'FPS Monitor is off. Turn it on in Settings > General.')); return; }
    if (!fbuilt) buildFps();
    const f = (snap && snap.fps) || { status: 'waiting' };
    fe.btn.classList.toggle('hidden', f.status !== 'missing' || !!window.__WELLA_WEB);
    fe.sub.textContent = f.game || '';
    if (f.status === 'ok' && f.fps != null) {
      fhist.push(f.fps); if (fhist.length > 90) fhist.shift();
      fe.root.classList.add('fpsok');
      fe.big.replaceChildren(String(f.fps), h('small', {}, 'FPS'));
      fe.game.textContent = '';
      fe.fr.textContent = f.frame + ' ms'; fe.lo.textContent = String(f.low);
      fe.av.textContent = String(Math.round(fhist.reduce((x, y) => x + y, 0) / fhist.length));
      fe.note.textContent = '';
      const mx = Math.max(60, ...fhist) * 1.1, a = fhist, step = 120 / 89, off = (90 - a.length) * step;
      const pts = a.map((v, i) => [off + i * step, 42 - (v / mx) * 40]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (pts.length > 1) { fe.sp.querySelector('.line').setAttribute('d', d); fe.sp.querySelector('.fill').setAttribute('d', d + ` L${pts[pts.length - 1][0].toFixed(1)} 44 L${pts[0][0].toFixed(1)} 44 Z`); }
    } else {
      fe.root.classList.remove('fpsok'); fhist.length = 0;
      fe.big.replaceChildren('\u2014'); fe.game.textContent = ''; fe.fr.textContent = fe.lo.textContent = fe.av.textContent = '\u2014';
      fe.sp.querySelector('.line').setAttribute('d', ''); fe.sp.querySelector('.fill').setAttribute('d', '');
      fe.note.textContent = f.status === 'downloading' ? (f.note || 'Downloading and setting up the FPS capture tool…')
        : f.status === 'missing' ? (f.note || 'FPS capture tool not found. It will be installed automatically when FPS Monitor starts.')
        : f.status === 'error' ? (f.note || 'FPS could not start.') : (f.note || 'Start a game: FPS shows here.');
    }
  }

  async function show() {
    try { const r = await window.api.pcmonGet(); cfg = r.cfg; if (r.snapshot) snap = r.snapshot; } catch {}
    paint(); paintFps();
  }

  // ================= events + start-up =================
  if (window.api && window.api.onPcmon) window.api.onPcmon((s) => { snap = s; if (typeof tab === 'undefined') return; if (tab === 'pcmon') { paint(); if (window.__WELLA_WEB) paintFps(); } else if (tab === 'fps') paintFps(); });
  if (window.api && window.api.onPcmonCfg) window.api.onPcmonCfg((c) => { cfg = c; applyTabs(); });
  (async () => { try { const r = await window.api.pcmonGet(); cfg = r.cfg; snap = r.snapshot || null; applyTabs(); } catch {} })();

  // ================= Settings > General: the switch =================
  async function setEnabled(on) {
    const r = await window.api.pcmonSet({ enabled: !!on }); cfg = r.cfg; snap = r.snapshot || snap; applyTabs();
    return cfg;
  }
  async function setKey(key, on) {
    const r = await window.api.pcmonSet({ [key]: !!on }); cfg = r.cfg; snap = r.snapshot || snap; applyTabs();
    return cfg;
  }
  function generalToggle() {
    const sw = (label, key, hint) => h('div', { class: 'setrow' }, h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: cfg && cfg[key] ? 'checked' : null, onchange: async (e) => { try { await setKey(key, e.target.checked); } catch (err) { toast(err.message || String(err), 'bad'); e.target.checked = !e.target.checked; } } }),
      label), h('small', { style: MUTED }, hint));
    return h('div', { class: 'setgroup' },
      sw('FPS Monitor tab', 'fpsTab', 'Adds an FPS Monitor tab (FPS, frametime, 1% low) next to Achievement Manager and Hour Booster. The free FPS capture tool is downloaded automatically when needed. Off = the tab is hidden.'),
      sw('Monitor tab', 'enabled', 'Adds a Monitor tab (CPU, GPU, RAM, disk, temperatures, alerts). Off = the tab is hidden and nothing is measured.'));
  }

  // ================= Monitor + notification settings (shown inside Settings > General) =================
  const state = { pc: null, nt: null, events: [] };
  async function load() {
    try { const r = await window.api.pcmonGet(); state.pc = r; cfg = r.cfg; } catch {}
    try { const r = await window.api.notifyGet(); state.nt = r.cfg; state.events = r.events || []; } catch {}
  }
  // part: 'monitor' = limits / alerts / FPS, 'notify' = sound, desktop pop-up and the "Tell me when" list. Both now live in Settings > General (no Monitor tab any more).
  function monitorTab(redraw, part) {
    const pc = state.pc && state.pc.cfg, nt = state.nt;
    if (!pc || !nt) return part ? [] : [h('div', { class: 'empty' }, 'Could not load the settings.')];
    const setPc = async (p) => { try { const r = await window.api.pcmonSet(p); state.pc = r; cfg = r.cfg; applyTabs(); } catch (e) { toast(e.message || String(e), 'bad'); } };
    const setNt = async (p) => { try { const r = await window.api.notifySet(p); state.nt = r.cfg; } catch (e) { toast(e.message || String(e), 'bad'); } };
    const chk = (label, val, fn, hint) => h('div', { class: 'setrow' }, h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: val ? 'checked' : null, onchange: async (e) => { await fn(e.target.checked); redraw(); } }), label), hint ? h('small', { style: MUTED }, hint) : null);
    const num = (label, key, unit, lo, hi) => h('div', { class: 'setrow' }, h('b', {}, label), h('div', { class: 'pcnum' },
      h('input', { class: 'in', type: 'number', min: lo, max: hi, value: String(pc[key]), onchange: async (e) => { await setPc({ [key]: Number(e.target.value) }); e.target.value = String(state.pc.cfg[key]); } }), h('small', {}, unit)));
    const vol = h('input', { class: 'vol', type: 'range', min: '0', max: '100', value: String(Math.round(nt.volume * 100)), onchange: (e) => setNt({ volume: Number(e.target.value) / 100 }) });
    const monitorPart = (pc.enabled || pc.fpsTab) ? [
      h('div', { class: 'sep' }),
      h('b', {}, 'Monitor and FPS'),
      chk('FPS and frametime for games', pc.fps, (v) => setPc({ fps: v }), 'The free FPS capture tool is downloaded automatically when needed.'),
      window.__WELLA_WEB ? null : h('div', { class: 'setrow' }, h('button', { class: 'btn ghost sm', style: 'align-self:flex-start', onclick: () => window.api.pcmonTools() }, 'Open tools folder')),
      chk('Alert when something is too high', pc.alerts, (v) => setPc({ alerts: v })),
      num('CPU temperature limit', 'cpuTemp', '\u00B0C', 40, 110),
      num('GPU temperature limit', 'gpuTemp', '\u00B0C', 40, 110),
      num('RAM usage limit', 'ram', '%', 50, 100),
      num('Disk full limit', 'disk', '%', 50, 100),
      num('Repeat the same alert after', 'cooldown', 'minutes', 1, 120)
    ] : [];
    const notifyPart = [
      chk('Notifications on', nt.enabled, (v) => setNt({ enabled: v })),
      chk('Desktop notifications', nt.desktop, (v) => setNt({ desktop: v }), 'Windows pop-up, shown when the app window is not in front.'),
      chk('Sound', nt.sound, (v) => setNt({ sound: v })),
      h('div', { class: 'setrow' }, h('b', {}, 'Volume'), vol),
      h('div', { class: 'setrow', style: 'flex-direction:row;gap:8px;flex-wrap:wrap' },
        h('button', { class: 'btn ghost sm', onclick: () => window.api.notifyTest('ok') }, 'Test notification'),
        h('button', { class: 'btn ghost sm', onclick: () => window.api.notifyTest('bad') }, 'Test alert')),
      h('b', {}, 'Tell me when\u2026'),
      h('div', { class: 'nlist' }, state.events.map((ev) => h('label', { class: 'chk' },
        h('input', { type: 'checkbox', checked: nt.events[ev.key] ? 'checked' : null, onchange: async (e) => { await setNt({ events: { [ev.key]: e.target.checked } }); } }), ev.label)))
    ];
    return (part === 'monitor' ? monitorPart : part === 'notify' ? notifyPart : [...monitorPart, h('div', { class: 'sep' }), ...notifyPart]).filter(Boolean);
  }

  window.WellaMon = { applyTab, show, load, generalToggle, monitorTab, icon: IC.cpu };
})();
