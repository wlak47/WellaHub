// DeviceManager (Admin Panel only): shows the browsers/phones connected to this PC and signs them out.
// The server enforces admin rights ('pcadmin:' channels), so this tab is only a front-end for them.
(function () {
  const $ = (s) => document.querySelector(s);
  let timer = 0, busy = false, last = [], hw = [], hwErr = '', hwBusy = false, hwLoading = false;

  const ago = (t) => {
    if (!t) return '\u2014';
    const s = Math.max(0, Math.round((Date.now() - Number(t)) / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return s + ' s ago';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Date(Number(t)).toLocaleDateString();
  };

  async function load() {
    const host = $('#devicesMain'); if (!host) return;
    let list;
    try { list = await window.api.pcAdminDevicesGet(); }
    catch (e) { host.replaceChildren(h('div', { class: 'empty' }, e.message || String(e))); return; }
    last = Array.isArray(list) ? list : [];
    draw();
  }

  async function disconnect(d) {
    if (busy) return;
    if (d.self && !confirm('This is the device you are using right now. You will be signed out of the Admin Panel. Continue?')) return;
    busy = true;
    try {
      const r = await window.api.pcAdminDevicesAction({ id: d.id, action: 'disconnect' });
      if (r && r.error) toast(r.error, 'bad'); else toast((d.name || 'Device') + ' disconnected', 'ok');
    } catch (e) { toast(e.message || String(e), 'bad'); }
    busy = false;
    if (!d.self) load();
  }

  async function disconnectOthers() {
    if (busy) return;
    if (!confirm('Disconnect every other connected device? They will have to log in again.')) return;
    busy = true;
    try {
      const r = await window.api.pcAdminDevicesAction({ action: 'disconnect-others' });
      if (r && r.error) toast(r.error, 'bad'); else toast(r && r.disconnected ? r.disconnected + ' device(s) disconnected' : 'No other device was connected', 'ok');
    } catch (e) { toast(e.message || String(e), 'bad'); }
    busy = false;
    load();
  }

  // PC hardware (mouse / keyboard / monitors): disconnect = Windows disables the device, reconnect = enables it again
  async function hwLoad() {
    hwLoading = true; draw();
    try {
      const r = await window.api.pcAdminHwList();
      if (r && r.error) { hwErr = r.error; hw = []; } else { hwErr = ''; hw = (r && r.devices) || []; }
    } catch (e) { hwErr = e.message || String(e); hw = []; }
    hwLoading = false; draw();
  }
  async function hwSet(d, enable) {
    if (hwBusy) return;
    hwBusy = true; draw();
    try {
      const r = await window.api.pcAdminHwSet(d.group ? { cls: d.cls, enable } : { id: d.id, enable });
      if (r && r.devices) { hw = r.devices; hwErr = ''; }
      if (r && r.error) toast(r.error, 'bad'); else toast(d.name + (enable ? ' reconnected' : ' disconnected'), 'ok');
    } catch (e) { toast(e.message || String(e), 'bad'); }
    hwBusy = false; draw();
  }
  function hwSection() {
    const groups = [['Mouse', 'Mouse'], ['Keyboard', 'Keyboard'], ['Monitor', 'Monitors']];
    const one = (cls) => { const l = hw.filter((x) => x.cls === cls); return l.length ? { group: true, cls, name: cls, enabled: l.some((x) => x.enabled), count: l.length, first: l[0].name } : null; };   // one row for the mouse and one for the keyboard, however many Windows entries there are
    const row = (d) => h('div', { class: 'dev-row' + (d.enabled ? ' on' : '') },
      h('span', { class: 'dev-dot ' + (d.enabled ? 'on' : 'off') }),
      h('div', { class: 'dev-info' }, h('b', {}, d.name, d.enabled ? null : h('span', { class: 'dev-self bad' }, 'Disconnected')), h('small', {}, d.group ? d.first + (d.count > 1 ? ' +' + (d.count - 1) + ' more' : '') : d.cls + (d.status ? ' \u00b7 ' + d.status : ''))),
      h('button', { class: 'btn ' + (d.enabled ? 'red' : 'start') + ' sm', disabled: hwBusy ? 'disabled' : null, onclick: () => hwSet(d, !d.enabled) }, d.enabled ? 'Disconnect' : 'Reconnect'));
    return h('div', { class: 'dev-sec hw-sec' },
      h('div', { class: 'remote-head' }, h('div', {}, h('h3', {}, 'PC hardware'), h('small', {}, 'Mouse, keyboard and monitors plugged into this PC. Admin Panel uses a separate helper with approval once; the app and games remain standard users.')),
        h('button', { class: 'btn ghost sm', disabled: hwLoading || hwBusy ? 'disabled' : null, onclick: hwLoad }, 'Refresh')),
      hwLoading && !hw.length ? h('div', { class: 'empty' }, 'Reading devices\u2026')
        : hwErr ? h('div', { class: 'empty' }, hwErr)
        : [one('Mouse'), one('Keyboard')].filter(Boolean).map(row).concat(hw.some((x) => x.cls === 'Monitor') ? [h('small', { class: 'hw-title' }, 'Monitors (' + hw.filter((x) => x.cls === 'Monitor').length + ')'), ...hw.filter((x) => x.cls === 'Monitor').map(row)] : []));
  }

  function draw() {
    const host = $('#devicesMain'); if (!host) return;
    const online = last.filter((d) => d.connected), offline = last.filter((d) => !d.connected);
    const row = (d) => h('div', { class: 'dev-row' + (d.connected ? ' on' : '') },
      h('span', { class: 'dev-dot' + (d.connected ? ' on' : '') }),
      h('div', { class: 'dev-info' },
        h('b', {}, d.name || 'Web browser', d.self ? h('span', { class: 'dev-self' }, 'This device') : null, d.blocked ? h('span', { class: 'dev-self bad' }, 'Blocked') : null),
        h('small', {}, `${d.ip || 'IP unknown'} \u00b7 ${d.connected ? 'connected now' : 'last seen ' + ago(d.lastSeen)}`)),
      h('button', { class: 'btn ' + (d.connected ? 'red' : 'ghost') + ' sm', disabled: d.connected ? null : 'disabled', title: d.connected ? 'Sign this device out' : 'This device is not connected', onclick: () => disconnect(d) }, 'Disconnect'));
    host.replaceChildren(
      h('div', { class: 'remote-head' },
        h('div', {}, h('h1', {}, 'DeviceManager'), h('small', {}, 'Devices connected to this PC through Web access. Disconnecting one signs it out until it logs in again.')),
        h('button', { class: 'btn ghost sm', onclick: load }, 'Refresh'),
        h('button', { class: 'btn red sm', disabled: online.some((d) => !d.self) ? null : 'disabled', onclick: disconnectOthers }, 'Disconnect all others')),
      h('div', { class: 'dev-sec' }, h('h3', {}, `Connected now (${online.length})`),
        online.length ? online.map(row) : h('div', { class: 'empty' }, 'No device is connected right now.')),
      offline.length ? h('div', { class: 'dev-sec' }, h('h3', {}, `Known devices (${offline.length})`), offline.slice(0, 30).map(row)) : null,
      hwSection());
  }

  function show() {
    const host = $('#devicesMain'); if (!host) return;
    host.replaceChildren(h('div', { class: 'empty' }, 'Loading devices\u2026'));
    load();
    hwLoad();
    clearInterval(timer);
    timer = setInterval(() => {                                // live refresh while this tab is open
      if (typeof tab !== 'undefined' && tab !== 'devices') { clearInterval(timer); timer = 0; return; }
      if (!busy && !document.hidden) load();
    }, 4000);
  }

  window.DeviceManager = { show, load };
})();
