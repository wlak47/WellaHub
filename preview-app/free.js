(function () {
  let data = { cfg: {}, list: [], accounts: [], busy: false }, mode = 'browse', query = '', accountId = '', historyAccount = 'all', sort = 'relevance', page = 0, catalog = [], total = 0, hasMore = false, searchBusy = false, timer = 0, requestId = 0, browseNodes = null;
  const $ = (s) => document.querySelector(s);
  const uiLocale = () => window.WellaI18n ? window.WellaI18n.locale() : 'en-US';
  const types = [['game', 'Games'], ['dlc', 'DLC'], ['software', 'Software'], ['mod', 'Mods']];
  const sortOptions = [['relevance', 'Relevance'], ['newest', 'Newest'], ['oldest', 'Oldest'], ['popular', 'Most downloads (estimated)'], ['unpopular', 'Least downloads (estimated)']];
  function apply(v) { if (v) data = v; render(); }
  async function searchCatalog(reset = true) {
    const id = ++requestId, requestQuery = query.trim(), requestSort = sort, requestPage = reset ? 0 : page;
    if (reset) { page = 0; catalog = []; total = 0; hasMore = false; }
    searchBusy = true; updateBrowse();
    try {
      const r = await window.api.freeSearch({ query: requestQuery, page: requestPage, sort: requestSort });
      if (id !== requestId || requestQuery !== query.trim() || requestSort !== sort) return;
      if (r.error) throw new Error(r.error);
      const matchingNames = (r.games || []).filter((g) => !requestQuery || String(g.name || '').toLocaleLowerCase().includes(requestQuery.toLocaleLowerCase()));
      catalog = reset ? matchingNames : catalog.concat(matchingNames);
      page = requestPage; total = Number(r.total) || 0; hasMore = !!r.hasMore;
    } catch (e) { if (id === requestId) { catalog = []; hasMore = false; toast(e.message || String(e), 'bad'); } }
    finally { if (id === requestId) { searchBusy = false; updateBrowse(); } }
  }
  function updateBrowse() {
    if (!browseNodes) return;
    const { grid, info, more, moreButton } = browseNodes;
    const cards = catalog.length ? catalog.map((g) => resultCard(g, false)) : [h('div', { class: 'empty free-empty' }, searchBusy ? 'Loading free games from Steam…' : 'No games match this search.')];
    grid.replaceChildren(...cards);
    info.textContent = searchBusy ? 'Loading Steam catalog…' : `${total ? `${total.toLocaleString(uiLocale())} results` : catalog.length + ' results'} · Popularity uses Steam review counts as an estimate.`;
    more.classList.toggle('hidden', !hasMore && !searchBusy);
    moreButton.disabled = searchBusy || !hasMore;
    moreButton.textContent = searchBusy ? 'Loading…' : 'Load more';
  }
  function resultCard(g, promo = false) {
    const st = g.status || {}, acctStatus = accountId ? st[accountId] : null, owned = acctStatus && ['ok', 'owned'].includes(acctStatus.r);
    const meta = promo ? `${g.type === 'dlc' ? 'DLC' : 'Free to keep'}${g.price ? ' · normally ' + g.price : ''}${g.endsAt ? ' · ends ' + new Date(g.endsAt * 1000).toLocaleDateString(uiLocale()) : ''}` : `${g.type === 'dlc' ? 'DLC' : 'Free to play'}${g.releaseAt ? ' · ' + new Date(g.releaseAt).getFullYear() : ''}${g.reviews ? ' · ' + g.reviews.toLocaleString(uiLocale()) + ' reviews' : ''}`;
    return h('article', { class: 'free-card' },
      h('img', { class: 'free-cover', src: g.image || `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`, alt: '', loading: 'lazy', draggable: 'false' }),
      h('div', { class: 'free-card-body' }, h('b', { title: g.name }, g.name), h('small', {}, meta),
        h('div', { class: 'free-card-actions' },
          h('button', { class: 'btn ghost sm', onclick: () => window.open(`https://store.steampowered.com/${g.type === 'dlc' ? 'dlc' : 'app'}/${g.appid}`, '_blank') }, 'Store'),
          promo ? h('button', { class: 'btn red sm', disabled: !accountId || owned, onclick: async (e) => { e.currentTarget.disabled = true; try { const r = await window.api.freeClaim({ appid: g.appid, accountId, name: g.name, freeToPlay: false }); if (r.error) toast(r.error, 'bad'); else { data = r; if (mode === 'browse') await searchCatalog(true); else render(); toast('Claim sent to Steam.', 'ok'); } } catch (err) { toast(err.message || String(err), 'bad'); } } }, owned ? 'In library' : 'Add to account')
            : h('button', { class: 'btn red sm', disabled: !accountId || owned, onclick: async (e) => { e.currentTarget.disabled = true; try { const r = await window.api.freeClaim({ appid: g.appid, accountId, name: g.name, freeToPlay: true }); if (r.error) toast(r.error, 'bad'); else { await searchCatalog(true); toast('Free-to-play license requested from Steam.', 'ok'); } } catch (err) { toast(err.message || String(err), 'bad'); } } }, owned ? 'In library' : 'Add to library'))));
  }
  function render() {
    const host = $('#freeMain'); if (!host) return;
    const cfg = data.cfg || {}, accounts = data.accounts || [];
    if (!accounts.some((a) => a.id === accountId)) accountId = accounts[0] && accounts[0].id || '';
    const tabs = h('div', { class: 'free-tabs' }, [['browse', 'Browse games'], ['discover', 'Auto discovery']].map(([k, label]) => h('button', { class: 'btn' + (mode === k ? ' on' : ''), onclick: () => { mode = k; if (mode === 'browse' && !catalog.length) searchCatalog(); else render(); } }, label)));
    const top = h('div', { class: 'free-top' }, h('div', {}, h('h1', {}, 'Free Games'), h('small', {}, mode === 'browse' ? 'Free-to-play games and current Steam offers' : 'Find and claim temporary Steam giveaways')), tabs);
    const account = h('select', { class: 'in free-account', onchange: (e) => { accountId = e.target.value; render(); } }, accounts.map((a) => h('option', { value: a.id, selected: accountId === a.id ? 'selected' : null }, a.name)));
    const search = h('input', { class: 'in free-search', placeholder: 'Search all free games by name…', value: query, oninput: (e) => { query = e.target.value; requestId++; searchBusy = true; page = 0; catalog = []; total = 0; hasMore = false; updateBrowse(); clearTimeout(timer); timer = setTimeout(() => searchCatalog(), 350); } });
    const sortSel = h('select', { class: 'in free-sort', onchange: (e) => { sort = e.target.value; searchCatalog(); } }, sortOptions.map(([key, label]) => h('option', { value: key, selected: sort === key ? 'selected' : null }, label)));
    let body;
    if (mode === 'browse') {
      const toolbar = h('div', { class: 'free-toolbar' }, search, sortSel, account);
      const info = h('small', { class: 'free-info' });
      const grid = h('div', { class: 'free-grid' });
      const moreButton = h('button', { class: 'btn ghost', disabled: true, onclick: () => { if (!searchBusy && hasMore) { page++; searchCatalog(false); } } }, 'Load more');
      const more = h('div', { class: 'free-more hidden' }, moreButton);
      browseNodes = { grid, info, more, moreButton };
      body = h('section', { class: 'free-catalog' }, toolbar, info, grid, more);
      updateBrowse();
    } else {
      const typeChecks = h('div', { class: 'free-types' }, types.map(([key, label]) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: (cfg.types || []).includes(key) ? 'checked' : null, onchange: async (e) => { const set = new Set(cfg.types || []); e.target.checked ? set.add(key) : set.delete(key); data = await window.api.freeSet({ types: [...set] }); render(); } }), label)));
      const startStop = cfg.autoClaim
        ? h('button', { class: 'btn stop', onclick: async () => { data = await window.api.freeSet({ autoClaim: false }); render(); } }, 'Stop automatic adding')
        : h('button', { class: 'btn start', onclick: async () => { data = await window.api.freeSet({ autoClaim: true }); data = await window.api.freeCheck(); render(); toast('Automatic free-game discovery started.', 'ok'); } }, 'Start automatic adding');
      const accountsPick = h('div', { class: 'free-auto-accounts' }, accounts.map((a) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: (cfg.accounts || []).includes(a.id) ? 'checked' : null, onchange: async (e) => { const set = new Set(cfg.accounts || []); e.target.checked ? set.add(a.id) : set.delete(a.id); data = await window.api.freeSet({ accounts: [...set] }); render(); } }), a.name)));
      const autoSearch = h('input', { class: 'in', placeholder: 'Optional: only auto-add offers whose names match…', value: cfg.autoQuery || '', onchange: async (e) => { data = await window.api.freeSet({ autoQuery: e.target.value }); toast('Automatic discovery filter saved.', 'ok'); } });
      const historyRows = (data.history || []).filter((r) => historyAccount === 'all' || r.accountId === historyAccount);
      const historyFilter = h('select', { class: 'in free-history-filter', onchange: (e) => { historyAccount = e.target.value; render(); } }, [h('option', { value: 'all', selected: historyAccount === 'all' ? 'selected' : null }, 'All accounts'), ...accounts.map((a) => h('option', { value: a.id, selected: historyAccount === a.id ? 'selected' : null }, a.name))]);
      const history = h('div', { class: 'free-history' }, h('div', { class: 'free-history-head' }, h('h2', {}, 'Added games in'), historyFilter), ...(historyRows.length ? historyRows.map((r) => h('div', { class: 'free-history-row' }, h('b', {}, r.name), h('span', {}, r.account), h('small', {}, `${r.result === 'ok' ? 'Added' : r.result === 'owned' ? 'Already owned' : 'Failed'} · ${r.time ? new Date(r.time).toLocaleString(uiLocale()) : ''}${r.text ? ' · ' + r.text : ''}`))) : [h('div', { class: 'empty' }, 'No games have been added yet.')]));
      const intervalValue = Number(cfg.intervalValue) || 60, intervalUnit = cfg.intervalUnit || 'minutes';
      const intervalUnitSelect = h('select', { class: 'in', onchange: async (e) => { data = await window.api.freeSet({ intervalUnit: e.target.value }); render(); } }, [['seconds','seconds'],['minutes','minutes'],['hours','hours']].map(([value, label]) => h('option', { value, selected: intervalUnit === value ? 'selected' : null }, label)));
      const config = h('div', { class: 'free-config' }, h('b', {}, 'Offer name filter (optional)'), autoSearch, h('b', {}, 'Offer types'), typeChecks, h('b', {}, 'Accounts for automatic adding'), accountsPick,
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: cfg.autoFreeToPlay !== false ? 'checked' : null, onchange: async (e) => { data = await window.api.freeSet({ autoFreeToPlay: e.target.checked }); render(); } }), 'Also find and add free-to-play games'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: cfg.notify ? 'checked' : null, onchange: async (e) => { data = await window.api.freeSet({ notify: e.target.checked }); render(); } }), 'Notify me about new offers'),
        h('label', { class: 'free-interval' }, 'Games per check', h('input', { class: 'in', type: 'number', min: '1', value: String(cfg.autoGameCount || 10), onchange: async (e) => { const n = Math.max(1, Number.parseInt(e.target.value, 10) || 1); data = await window.api.freeSet({ autoGameCount: n }); e.target.value = String(data.cfg.autoGameCount); } })),
        h('label', { class: 'free-interval' }, 'Check every', h('input', { class: 'in', type: 'number', min: intervalUnit === 'seconds' ? '10' : '1', max: '720', value: String(intervalValue), onchange: async (e) => { data = await window.api.freeSet({ intervalValue: Number(e.target.value) }); render(); } }), intervalUnitSelect));
      body = h('section', { class: 'free-discovery' }, h('div', { class: 'free-automation' }, h('div', {}, h('h2', {}, 'Find free offers and add them automatically'), h('small', {}, 'Scans Steam giveaways. While running, eligible games are claimed for the accounts you select.')), startStop, config), history);
    }
    host.replaceChildren(top, body);
    if (mode !== 'browse') browseNodes = null;
  }
  async function show() { try { data = await window.api.freeGet(); render(); if (!data.at) window.api.freeCheck().then((v) => { data = v; if (document.querySelector('.tab[data-tab="free"].active')) render(); }); if (!catalog.length) searchCatalog(); } catch {} }
  if (window.api && window.api.onFree) window.api.onFree((v) => { data = v; if (mode === 'discover' && document.querySelector('.tab[data-tab="free"].active')) render(); });
  window.FreeGames = { apply, show, render };
  show();
})();
