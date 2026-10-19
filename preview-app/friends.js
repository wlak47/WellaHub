// Manage Friends (test build): Steam friend list of a saved account, add / remove friends. The tab is shown or hidden from Settings > Tabs.
// The work happens in main.js ('friends:' channels); on the web Admin Panel remote.js only lets the administrator call them.
(function () {
  const $ = (s) => document.querySelector(s);
  let accounts = [], accountId = '', friends = [], query = '', busy = false, loading = false, error = '', loaded = false;

  async function boot() {
    try {
      const r = await window.api.friendsGet();
      accounts = (r && r.accounts) || [];
    } catch (e) { error = e.message || String(e); }
    if (!accounts.some((a) => a.id === accountId)) accountId = (accounts[0] && accounts[0].id) || '';
  }

  async function load() {
    if (!accountId) { friends = []; loaded = true; draw(); return; }
    loading = true; error = ''; draw();
    try {
      const r = await window.api.friendsList({ accountId });
      if (r && r.error) { error = r.error; friends = []; } else friends = (r && r.friends) || [];
    } catch (e) { error = e.message || String(e); friends = []; }
    loading = false; loaded = true; draw();
  }

  async function add() {
    if (busy) return;
    const inp = $('#frAddInput'), target = inp ? inp.value.trim() : '';
    if (!target) { toast('Type a SteamID64, a profile link or a custom URL name.', 'bad'); return; }
    busy = true; draw();
    try {
      const r = await window.api.friendsAdd({ accountId, target });
      if (r && r.error) toast(r.error, 'bad');
      else { toast('Friend request sent' + (r && r.name ? ' to ' + r.name : '') + ' (if they had invited you, you are friends now)', 'ok'); if (inp) inp.value = ''; }
    } catch (e) { toast(e.message || String(e), 'bad'); }
    busy = false; load();
  }

  async function remove(f) {
    if (busy) return;
    busy = true; draw();
    try {
      const r = await window.api.friendsRemove({ accountId, id: f.id });
      if (r && r.error) toast(r.error, 'bad'); else { toast(f.name + ' removed', 'ok'); friends = friends.filter((x) => x.id !== f.id); }
    } catch (e) { toast(e.message || String(e), 'bad'); }
    busy = false; draw();
  }

  function draw() {
    const host = $('#friendsMain'); if (!host) return;
    const q = query.trim().toLowerCase();
    const shown = q ? friends.filter((f) => f.name.toLowerCase().includes(q) || f.id.includes(q)) : friends;
    const head = h('div', { class: 'remote-head' },
      h('div', {}, h('h1', {}, 'Manage Friends'), h('small', {}, 'Add or remove Steam friends of a saved account. Test feature.')),
      h('button', { class: 'btn ghost sm', onclick: load, disabled: loading || busy ? 'disabled' : null }, 'Refresh'));
    if (!accounts.length) { host.replaceChildren(head, h('div', { class: 'empty' }, 'Add a Steam account first.')); return; }
    const sel = h('select', { class: 'in fr-account', onchange: (e) => { accountId = e.target.value; friends = []; query = ''; load(); } },
      accounts.map((a) => h('option', { value: a.id, selected: a.id === accountId ? 'selected' : null }, a.name)));
    const addRow = h('div', { class: 'fr-add' },
      h('input', { class: 'in', id: 'frAddInput', placeholder: 'SteamID64, profile link or custom URL name', onkeydown: (e) => { if (e.key === 'Enter') add(); } }),
      h('button', { class: 'btn start sm', onclick: add, disabled: busy ? 'disabled' : null }, 'Add friend'));
    const search = h('input', { class: 'in fr-search', placeholder: 'Search friends', value: query, oninput: (e) => { query = e.target.value; const pos = e.target.selectionStart; draw(); const n = $('.fr-search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } });
    const row = (f) => h('div', { class: 'dev-row' },
      f.avatar ? h('img', { class: 'fr-avatar', src: f.avatar, alt: '', draggable: 'false' }) : h('span', { class: 'dev-dot' }),
      h('div', { class: 'dev-info' }, h('b', {}, f.name), h('small', {}, f.id + (f.status ? ' \u00b7 ' + f.status : ''))),
      h('button', { class: 'btn red sm', onclick: () => remove(f), disabled: busy ? 'disabled' : null }, f.pending ? 'Cancel' : 'Remove'));
    host.replaceChildren(head, h('div', { class: 'fr-bar' }, sel), addRow,
      error ? h('div', { class: 'empty' }, error)
        : loading ? h('div', { class: 'empty' }, 'Loading friends\u2026')
        : h('div', { class: 'dev-sec' }, h('h3', {}, `Friends (${friends.filter((x) => !x.pending).length})` + (friends.some((x) => x.pending) ? ` \u00b7 ${friends.filter((x) => x.pending).length} pending` : '')), friends.length ? search : null,
          shown.length ? h('div', { class: 'fr-grid' }, shown.map(row)) : h('div', { class: 'empty' }, friends.length ? 'No friend matches the search.' : 'This account has no friends yet.')));
  }

  async function show() {
    const host = $('#friendsMain'); if (!host) return;
    host.replaceChildren(h('div', { class: 'empty' }, 'Loading\u2026'));
    await boot();
    await load();
  }

  window.ManageFriends = { show, load };
})();
