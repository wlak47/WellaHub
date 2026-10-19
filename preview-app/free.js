(function () {
  let data = { cfg: {}, list: [], accounts: [], busy: false }, mode = 'browse', query = '', accountId = '', browseAccountId = '', historyAccount = 'all', sort = 'relevance', page = 0, catalog = [], total = 0, hasMore = false, searchBusy = false, timer = 0, requestId = 0, browseNodes = null;
  let stats = null, statsAccount = 'all', statsBusy = false, statsPanelOpen = false, historyRows = [], historyTotal = 0, historyOffset = 0, historyBusy = false, ownershipFilter = 'all';
  const localGamePages = new Map();
  const historyFilterState = { accountId: 'all', status: 'all', type: 'all', mode: 'all', from: '', to: '' };
  const $ = (s) => document.querySelector(s);
  const uiLocale = () => window.WellaI18n ? window.WellaI18n.locale() : 'en-US';
  const types = [['game', 'Games'], ['dlc', 'DLC'], ['software', 'Software'], ['mod', 'Mods']];
  const sortOptions = [['relevance', 'Relevance'], ['newest', 'Newest'], ['oldest', 'Oldest'], ['popular', 'Most downloads (estimated)'], ['unpopular', 'Least downloads (estimated)'], ['name', 'Name A–Z'], ['nameDesc', 'Name Z–A']];
  let kind = 'f2p';                                   // what the Browse tab lists: free-to-play games, demos, DLC, software
  const browseKinds = [['f2p', 'Free Games'], ['keep', 'Free to Keep'], ['zero', 'Discounted to 0'], ['dlc', 'DLCs'], ['software', 'Software'], ['soundtrack', 'Soundtracks'], ['other', 'Other']];
  const autoKinds = [
    ['f2p', 'Free-to-play games', 'Games that stay free forever (like Counter-Strike 2, Dota 2, Team Fortress 2)'],
    ['free', 'Other free games', 'Games Steam lists with a price of 0 that are not free-to-play'],
    ['demo', 'Free demos', 'Playable demos and betas of games'],
    ['dlc', 'Free DLC', 'Free add-ons and expansions for games'],
    ['software', 'Free software', 'Free tools, apps and soundtracks'],
    ['new', 'New free releases', 'Games that were just released and are free right now']];
  function apply(v) { if (v) data = v; render(); }
  function localProfilePanel(profile, status) {
    if (!profile) {
      const message = status === 'not-running' ? 'Steam is not running. Open Steam and sign in to the account added to Wella Hub.'
        : status === 'signed-out' ? 'Steam is open, but no account is signed in. Sign in with an account added to Wella Hub.'
        : status === 'unmatched' ? 'The signed-in Steam account is not added to Wella Hub yet.'
          : 'Steam is open, but Wella Hub could not verify which account is signed in.';
      return h('div', { class: 'free-local-empty' }, message);
    }
    const avatar = profile.avatar ? h('img', { class: 'free-local-avatar', src: profile.avatar, alt: '', loading: 'lazy' }) : h('div', { class: 'free-local-avatar free-local-avatar-empty' }, 'S');
    const metric = (label, value, detail) => h('div', { class: 'free-local-metric' }, h('small', {}, label), h('b', {}, value), detail ? h('span', {}, detail) : null);
    const gameRow = (game) => h('div', { class: 'free-local-game' },
      game.image ? h('img', { src: game.image, alt: '', loading: 'lazy' }) : h('div', { class: 'free-local-game-placeholder' }, '🎮'),
      h('div', {}, h('b', { title: game.name }, game.name), h('small', {}, game.hours != null ? `${Number(game.hours).toLocaleString(uiLocale(), { maximumFractionDigits: 1 })} h recorded on this PC` : 'No local playtime record'), game.installed ? h('small', { class: 'free-local-installed' }, 'Installed on this PC') : null));
    const gameKey = `${profile.gameCount}:${profile.gamesUpdatedAt}`;
    const previous = localGamePages.get(profile.id), games = previous && previous.key === gameKey ? previous.rows : (profile.games || []);
    if (!previous || previous.key !== gameKey) localGamePages.set(profile.id, { key: gameKey, rows: games });
    const gameList = h('div', { class: 'free-local-games' }, ...games.map(gameRow));
    const gameProgress = h('small', { class: 'free-local-disclaimer' }, `Showing ${games.length.toLocaleString(uiLocale())} of ${Number(profile.gameCount || 0).toLocaleString(uiLocale())} games.`);
    const loadMore = h('button', { class: 'btn ghost sm', hidden: games.length >= Number(profile.gameCount || 0) ? 'hidden' : null, onclick: async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try {
        const current = localGamePages.get(profile.id), shown = current && current.key === gameKey ? current.rows : (profile.games || []);
        const result = await window.api.freeLocalGames({ accountId: profile.id, offset: shown.length, limit: 40 });
        if (result && result.error) throw new Error(result.error);
        const nextRows = shown.concat(result && result.rows || []);
        localGamePages.set(profile.id, { key: gameKey, rows: nextRows });
        gameList.append(...nextRows.slice(shown.length).map(gameRow));
        gameProgress.textContent = `Showing ${nextRows.length.toLocaleString(uiLocale())} of ${Number(profile.gameCount || 0).toLocaleString(uiLocale())} games.`;
        button.hidden = nextRows.length >= Number(profile.gameCount || 0);
      } catch (e) { toast(e.message || String(e), 'bad'); }
      finally { button.disabled = false; }
    } }, 'Load 40 more games');
    return h('div', { class: 'free-local-profile' },
      h('div', { class: 'free-local-profile-head' }, avatar, h('div', {}, h('b', {}, profile.name), h('small', {}, profile.steamId ? `SteamID ${profile.steamId}` : 'Detected local Steam account')),
        profile.gamesUpdatedAt ? h('small', { class: 'free-local-updated' }, `Library refreshed ${new Date(profile.gamesUpdatedAt).toLocaleDateString(uiLocale())}`) : null),
      h('div', { class: 'free-local-metrics' }, metric('Games in library cache', Number(profile.gameCount || 0).toLocaleString(uiLocale()), 'from the saved Steam library'), metric('Playtime recorded here', Number(profile.playtimeRecorded || 0).toLocaleString(uiLocale()), `${Number(profile.localPlaytimeHours || 0).toLocaleString(uiLocale())} h on this PC`), metric('Installed here', Number(profile.installedCount || 0).toLocaleString(uiLocale())), metric('Never played', 'Not verified', 'Steam does not confirm this from local cache')),
      h('small', { class: 'free-local-disclaimer' }, `No local playtime record for ${Number(profile.noLocalRecord || 0).toLocaleString(uiLocale())} cached games. That does not prove they were never played.`),
      Number(profile.gameCount || 0) ? h('div', { class: 'free-local-game-browser' }, gameProgress, gameList, loadMore) : h('small', { class: 'free-local-disclaimer' }, 'No saved game list is available for this account yet.'));
  }
  async function searchCatalog(reset = true) {
    const id = ++requestId, requestQuery = query.trim(), requestSort = sort, requestPage = reset ? 0 : page;
    if (reset) { page = 0; catalog = []; total = 0; hasMore = false; }
    searchBusy = true; updateBrowse();
    try {
      const requestKind = kind;
      let r;
      if (requestKind === 'keep' || requestKind === 'zero') {
        if (!data.at || Date.now() - data.at > 180000) data = await window.api.freeCheck();
        const offers = (data.list || []).filter((g) => Number(g.originalCents) > 0 && (requestKind !== 'keep' || Number(g.endsAt) > Date.now() / 1000));
        if (id !== requestId || requestQuery !== query.trim() || requestSort !== sort || requestKind !== kind) return;
        const matching = offers.filter((g) => !requestQuery || String(g.name || '').toLocaleLowerCase().includes(requestQuery.toLocaleLowerCase()) || String(g.appid) === requestQuery).sort((a, b) => requestSort === 'nameDesc' ? b.name.localeCompare(a.name) : requestSort === 'name' ? a.name.localeCompare(b.name) : (b.endsAt || 0) - (a.endsAt || 0));
        catalog = matching; total = matching.length; hasMore = false; page = 0; return;
      }
      r = await window.api.freeSearch({ query: requestQuery, page: requestPage, sort: requestSort, kind: requestKind });
      if (requestKind !== kind) return;
      if (id !== requestId || requestQuery !== query.trim() || requestSort !== sort) return;
      if (r.error) throw new Error(r.error);
      const matchingNames = (r.games || []).filter((g) => !requestQuery || String(g.name || '').toLocaleLowerCase().includes(requestQuery.toLocaleLowerCase()) || String(g.appid) === requestQuery);
      catalog = reset ? matchingNames : catalog.concat(matchingNames);
      page = requestPage; total = Number(r.total) || 0; hasMore = !!r.hasMore;
    } catch (e) { if (id === requestId) { catalog = []; hasMore = false; toast(e.message || String(e), 'bad'); } }
    finally { if (id === requestId) { searchBusy = false; updateBrowse(); } }
  }
  function updateBrowse() {
    if (!browseNodes) return;
    const { grid, info, more, moreButton } = browseNodes;
    const visible = catalog.filter((g) => { const status = browseAccountId && g.status && g.status[browseAccountId]; const owned = status && ['ok', 'owned'].includes(status.r), verifiedNotOwned = status && status.r === 'not-owned'; return ownershipFilter === 'all' || (ownershipFilter === 'owned' ? owned : !owned && verifiedNotOwned); });
    const cards = visible.length ? visible.map((g) => resultCard(g, false)) : [h('div', { class: 'empty free-empty' }, searchBusy ? 'Loading free games from Steam…' : 'No games match this search.')];
    grid.replaceChildren(...cards);
    info.textContent = searchBusy ? 'Loading Steam catalog…' : `${total ? `${total.toLocaleString(uiLocale())} results` : catalog.length + ' results'} · Popularity uses Steam review counts as an estimate.`;
    more.classList.toggle('hidden', !hasMore && !searchBusy);
    moreButton.disabled = searchBusy || !hasMore;
    moreButton.textContent = searchBusy ? 'Loading…' : 'Load more';
  }
  function resultCard(g, promo = false) {
    const targetAccountId = mode === 'browse' ? browseAccountId : accountId;
    const st = g.status || {}, acctStatus = targetAccountId ? st[targetAccountId] : null, owned = acctStatus && ['ok', 'owned'].includes(acctStatus.r);
    const isPromo = promo || kind === 'keep' || kind === 'zero';
    const manualOnly = isPromo || data.cfg.mode === 'local' || String(g.type || '').toLowerCase() !== 'game' || g.freeToPlayVerified !== true;
    const typeLabel = ({ game: 'Game', dlc: 'DLC', software: 'Software', music: 'Soundtrack', soundtrack: 'Soundtrack', demo: 'Demo', mod: 'Mod' })[String(g.type || kind).toLowerCase()] || String(g.type || 'Other');
    let price = g.price || '';
    if (!price && Number(g.originalCents) > 0) { try { price = new Intl.NumberFormat(uiLocale(), { style: 'currency', currency: g.currency || 'USD' }).format(g.originalCents / 100); } catch {} }
    const meta = isPromo ? `${typeLabel} · ${kind === 'zero' ? 'Discounted to 0' : 'Free to keep'}${price ? ' · normally ' + price : ''}${g.endsAt ? ' · ends ' + new Date(g.endsAt * 1000).toLocaleDateString(uiLocale()) : ''}` : `${typeLabel}${g.releaseAt ? ' · ' + new Date(g.releaseAt).getFullYear() : ''}${g.reviews ? ' · ' + g.reviews.toLocaleString(uiLocale()) + ' reviews' : ''}${g.freeToPlay ? ' · Free to play' : ''}`;
    const storeUrl = `https://store.steampowered.com/${String(g.type || '').toLowerCase() === 'dlc' ? 'dlc' : 'app'}/${g.appid}`;
    return h('article', { class: 'free-card' },
      h('img', { class: 'free-cover', src: g.image || `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg`, alt: '', loading: 'lazy', draggable: 'false' }),
      h('div', { class: 'free-card-body' }, h('b', { title: g.name }, g.name), h('small', {}, meta),
        h('small', { class: 'free-appid' }, `AppID ${g.appid} · ${typeLabel} · ${owned ? 'Already owned' : acctStatus && acctStatus.r === 'not-owned' ? 'Not in verified library' : 'Library status unknown'}`),
        h('div', { class: 'free-card-actions' },
          h('button', { class: 'btn ghost sm', onclick: () => window.open(storeUrl, '_blank', 'noopener') }, 'Official Steam page'),
          manualOnly ? h('button', { class: 'btn red sm', disabled: !targetAccountId || (data.cfg.mode === 'local' && targetAccountId !== data.localAccountId), title: data.cfg.mode === 'local' && targetAccountId !== data.localAccountId ? 'Local Steam can only claim for the account currently signed in.' : '', onclick: async () => { const r = await window.api.freeManual({ appid: g.appid, accountId: targetAccountId, name: g.name, type: g.type }); if (r && r.error) return toast(r.error, 'bad'); data = r; window.open(storeUrl, '_blank', 'noopener'); toast('Manual claim required: Steam opened in your browser.', 'ok'); } }, 'Claim on Steam')
          : h('button', { class: 'btn red sm', disabled: !targetAccountId || owned, onclick: async (e) => { e.currentTarget.disabled = true; try { const r = await window.api.freeClaim({ appid: g.appid, accountId: targetAccountId, name: g.name, type: g.type, freeToPlay: g.freeToPlayVerified === true }); if (r.error) toast(r.error, 'bad'); else { data = r; await searchCatalog(true); toast('Steam response received.', 'ok'); } } catch (err) { toast(err.message || String(err), 'bad'); } } }, owned ? 'In library' : 'Add to library'))));
  }
  async function loadStats(force = false) {
    statsBusy = true; render();
    try { stats = await window.api.freeStats({ accountId: data.cfg && data.cfg.mode === 'local' ? (data.localAccountId || '') : statsAccount, force }); }
    catch (e) { stats = { status: 'error', note: e.message || String(e), categories: [] }; }
    finally { statsBusy = false; if (mode === 'stats' || statsPanelOpen) render(); }
  }
  async function loadHistory(reset = false) {
    if (historyBusy) return;
    if (reset) { historyOffset = 0; historyRows = []; }
    historyBusy = true; render();
    try {
      const f = historyFilterState;
      const r = await window.api.freeHistory({ ...f, from: f.from ? Date.parse(f.from) : 0, to: f.to ? Date.parse(f.to) : 0, offset: historyOffset, limit: 50 });
      if (reset) historyRows = [];
      historyRows = historyRows.concat(r.rows || []); historyTotal = Number(r.total) || 0; historyOffset = historyRows.length;
    } catch (e) { toast(e.message || String(e), 'bad'); }
    finally { historyBusy = false; if (mode === 'added') render(); }
  }
  async function setFreeMode(value) {
    data = await window.api.freeSet({ mode: value });
    accountId = value === 'local' ? (data.localAccountId || '') : (accountId && data.accounts.some((a) => a.id === accountId) ? accountId : (data.accounts[0] && data.accounts[0].id || ''));
    statsAccount = value === 'local' ? (data.localAccountId || '') : accountId || 'all';
    stats = null; render(); if (mode === 'browse') searchCatalog(true); else if (mode === 'stats' || statsPanelOpen) loadStats(true); else if (mode === 'added') loadHistory(true);
  }
  async function controlJob(action) {
    const r = await window.api.freeJobControl(action);
    if (r && r.error) toast(r.error, 'bad');
    data = await window.api.freeGet(); render();
  }
  function render() {
    const host = $('#freeMain'); if (!host) return;
    const cfg = data.cfg || {}, accounts = data.accounts || [];
    const localMode = cfg.mode === 'local';
    const localHeaderStatus = data.localAccountId ? `Steam local: ${accounts.find((a) => a.id === data.localAccountId)?.name || 'signed in'}` : data.localStatus === 'signed-out' ? 'Steam is open; sign in to continue' : data.localStatus === 'unmatched' ? 'Signed-in Steam account is not added' : data.localStatus === 'not-running' ? 'Steam is not running' : 'Steam account could not be verified';
    if (localMode) accountId = data.localAccountId || '';
    else if (!accounts.some((a) => a.id === accountId)) accountId = accounts[0] && accounts[0].id || '';
    if (!accounts.some((a) => a.id === browseAccountId)) browseAccountId = (data.localAccountId && accounts.some((a) => a.id === data.localAccountId) ? data.localAccountId : accountId) || (accounts[0] && accounts[0].id) || '';
    const tabs = h('div', { class: 'free-tabs' }, [['browse', 'Browse Games'], ['discover', 'Auto Add']].map(([k, label]) => h('button', { class: 'btn' + ((k === 'browse' ? mode === 'browse' : mode !== 'browse') ? ' on' : ''), onclick: () => { mode = k; if (mode === 'browse') statsPanelOpen = false; else { statsAccount = localMode ? (data.localAccountId || '') : (accountId || 'all'); } if (mode === 'browse' && !catalog.length) searchCatalog(); else render(); } }, label)));
    const subtitle = mode === 'browse' ? 'Steam Free Games catalog and current offers' : mode === 'discover' ? 'Add available products automatically after pressing Start' : mode === 'stats' ? 'Verified account library summary' : 'Persistent history of product operations';
    const miniStats = stats && stats.categories || [];
    const statsPopover = statsPanelOpen ? h('div', { class: 'free-stats-popover' },
      h('div', { class: 'free-stats-popover-head' }, h('b', {}, 'Owned library'), localMode ? h('small', {}, 'Local account') : h('select', { class: 'in', value: statsAccount, onchange: (e) => { statsAccount = e.target.value; loadStats(); } }, [h('option', { value: 'all', selected: statsAccount === 'all' ? 'selected' : null }, 'All selected accounts'), ...accounts.filter((a) => (cfg.accounts || []).includes(a.id)).map((a) => h('option', { value: a.id, selected: statsAccount === a.id ? 'selected' : null }, a.name))])),
      h('div', { class: 'free-mini-stats' }, ...['Paid Games', 'Owned Games', 'Free Games', 'Software', 'DLCs', 'Soundtracks', 'Other'].map((name) => { const row = miniStats.find((x) => x.name === name); return h('div', {}, h('small', {}, name), h('b', {}, row && row.value != null ? Number(row.value).toLocaleString(uiLocale()) : statsBusy ? 'Reading…' : 'Unknown')); })),
      h('small', { class: 'free-mini-note' }, statsBusy ? 'Synchronizing…' : stats && stats.status === 'ok' ? 'Synchronized' : 'Incomplete / not verified'),
      stats && stats.checkedAt ? h('small', { class: 'free-mini-note' }, 'Last checked: ' + new Date(stats.checkedAt).toLocaleString(uiLocale())) : null,
      stats && stats.note ? h('small', { class: 'free-mini-note' }, stats.note) : null,
      h('button', { class: 'btn ghost sm', disabled: statsBusy ? 'disabled' : null, onclick: () => loadStats(true) }, statsBusy ? 'Refreshing…' : 'Refresh')) : null;
    const processActive = !!((data.job && data.job.running) || (data.loop && data.loop.running));
    const autoHeader = mode === 'browse' ? null : h('div', { class: 'free-auto-header' }, h('div', { class: 'free-mode-toggle' }, h('button', { class: 'btn sm' + (localMode ? ' on' : ''), disabled: processActive ? 'disabled' : null, onclick: () => { if (!localMode) setFreeMode('local'); } }, 'Local Steam Mode ' + (localMode ? 'ON' : '')), h('button', { class: 'btn sm' + (!localMode ? ' on' : ''), disabled: processActive ? 'disabled' : null, onclick: () => { if (localMode) setFreeMode('api'); } }, 'API Mode ' + (!localMode ? 'ON' : '')), h('small', {}, localMode ? localHeaderStatus : 'Uses selected Wella Hub accounts')), h('div', { class: 'free-stats-corner' }, h('button', { class: 'btn ghost sm', onclick: () => { statsPanelOpen = !statsPanelOpen; if (statsPanelOpen && !stats) { statsAccount = localMode ? (data.localAccountId || '') : (accountId || 'all'); loadStats(); } else render(); } }, statsPanelOpen ? 'Hide library stats' : 'Library stats'), statsPopover));
    const top = h('div', { class: 'free-top free-top-new' }, h('div', {}, h('h1', {}, 'Free Games'), h('small', {}, subtitle)), h('div', { class: 'free-top-actions' }, autoHeader, tabs));
    const account = accounts.length ? h('select', { class: 'in free-account', 'aria-label': 'Steam account for Browse Games', onchange: (e) => { browseAccountId = e.target.value; updateBrowse(); } }, accounts.map((a) => h('option', { value: a.id, selected: browseAccountId === a.id ? 'selected' : null }, a.name))) : null;
    const search = h('input', { class: 'in free-search', placeholder: 'Search by name…', value: query, oninput: (e) => { query = e.target.value; requestId++; searchBusy = true; page = 0; catalog = []; total = 0; hasMore = false; updateBrowse(); clearTimeout(timer); timer = setTimeout(() => searchCatalog(), 350); } });
    const sortSel = h('select', { class: 'in free-sort', onchange: (e) => { sort = e.target.value; searchCatalog(); } }, sortOptions.map(([key, label]) => h('option', { value: key, selected: sort === key ? 'selected' : null }, label)));
    const ownershipSel = h('select', { class: 'in free-sort', onchange: (e) => { ownershipFilter = e.target.value; updateBrowse(); } }, [['all', 'All products'], ['owned', 'Already owned'], ['not-owned', 'Not owned yet']].map(([key, label]) => h('option', { value: key, selected: ownershipFilter === key ? 'selected' : null }, label)));
    let body;
    if (mode === 'browse') {
      const toolbar = h('div', { class: 'free-toolbar' }, search, sortSel, ownershipSel, ...(account ? [account] : []), h('button', { class: 'btn ghost sm', onclick: async () => { data = await window.api.freeCheck(); await searchCatalog(true); render(); } }, 'Refresh'));
      const info = h('small', { class: 'free-info' });
      const grid = h('div', { class: 'free-grid' });
      const moreButton = h('button', { class: 'btn ghost', disabled: true, onclick: () => { if (!searchBusy && hasMore) { page++; searchCatalog(false); } } }, 'Load more');
      const more = h('div', { class: 'free-more hidden' }, moreButton);
      browseNodes = { grid, info, more, moreButton };
      const kindBar = h('div', { class: 'free-kindbar' }, browseKinds.map(([k, label]) => h('button', { class: 'btn' + (kind === k ? ' on' : ''), onclick: () => { if (kind === k) return; kind = k; query = ''; page = 0; catalog = []; total = 0; hasMore = false; render(); searchCatalog(); } }, label)));
      body = h('section', { class: 'free-catalog' }, kindBar, toolbar, info, grid, more);
      updateBrowse();
    } else if (mode === 'discover') {
      const loop = data.loop || {}, job = data.job || {}, loopRunning = !!loop.running, jobRunning = !!job.running, running = loopRunning || jobRunning, kindsCfg = cfg.kinds || {}, selected = new Set(localMode ? (data.localAccountId ? [data.localAccountId] : []) : (cfg.accounts || []));
      const set = async (p) => { const next = await window.api.freeSet(p); if (next && next.error) { toast(next.error, 'bad'); return false; } data = next; render(); return true; };
      const addedBy = {}; for (const r of data.history || []) if (r.result === 'ok') addedBy[r.accountId] = (addedBy[r.accountId] || 0) + 1;
      const accState = Object.fromEntries((loop.accounts || []).map((x) => [x.id, x]));
      const waitText = (sec) => sec >= 90 ? Math.ceil(sec / 60) + ' min' : sec + ' s';
      const noAccount = localMode ? !data.localAccountId : !selected.size;
      const stopAutoAdd = async () => {
        if (loopRunning) await set({ autoClaim: false });
        if (jobRunning) await controlJob('stop');
      };
      const startStop = running
        ? h('button', { class: 'btn stop fd-go', onclick: stopAutoAdd }, 'Stop')
        : h('button', { class: 'btn start fd-go', disabled: noAccount ? 'disabled' : null, title: noAccount ? (localMode ? 'Sign in to the Steam account added to Wella Hub.' : 'Choose at least one account first') : '', onclick: async () => { if (await set({ autoClaim: true })) toast(localMode ? 'Local Steam account detected. Local Mode records manual claim links; API Mode is required to add games automatically.' : 'Auto Add started. It keeps going until you press Stop.', 'ok'); } }, 'Start');
      const tile = (label, value, cls) => h('div', { class: 'ctile' }, h('small', {}, label), h('b', { class: cls || '' }, String(value || 0)));
      const hero = h('div', { class: 'fd-hero' + (running ? ' on' : '') },
        h('div', { class: 'fd-state' }, h('i', { class: 'fd-dot' }), h('div', {}, h('b', {}, loopRunning ? 'Running' : jobRunning ? (job.paused ? 'Paused' : 'Processing') : 'Stopped'),
          h('small', {}, loopRunning ? (loop.note || 'Working…') : jobRunning ? (job.note || 'Processing saved work…') : (noAccount ? (localMode ? 'Open Steam and sign in to the account added to Wella Hub.' : 'Choose at least one account below, then press Start.') : localMode ? 'Local Mode detects the signed-in account and saves manual claim links. Use API Mode for automatic adding.' : 'Press Start. It adds free games to your accounts until you press Stop.')))),
        startStop,
        loopRunning || loop.checked ? h('div', { class: 'fd-tiles' }, tile('Added', loop.added, 'good'), tile('Already owned', loop.owned), tile('Manual claim', loop.manual), tile('Refused', loop.refused), tile('Failed', loop.failed)) : null,
        running && loop.last ? h('small', { class: 'fd-last' }, loop.last) : null);
      // 1) accounts
      const accountRows = localMode ? accounts.filter((a) => a.id === data.localAccountId) : accounts;
      const pills = h('div', { class: 'fd-pills' }, accountRows.map((a) => {
        const on = selected.has(a.id), st = accState[a.id];
        const info = !on ? 'not used' : !running ? (addedBy[a.id] ? addedBy[a.id] + ' added so far' : 'ready') : st && st.state === 'limited' ? 'Steam limit · resting ' + waitText(st.waitSec) : st && st.state === 'waiting' ? 'next batch in ' + waitText(st.waitSec) : 'adding…';
        return h(localMode ? 'div' : 'button', { class: 'fd-pill' + (on ? ' on' : '') + (on && st ? ' ' + st.state : ''), title: localMode ? 'Detected signed-in Steam account' : (on ? 'Click to stop using this account' : 'Click to use this account'), onclick: localMode ? null : () => { const n = new Set(selected); on ? n.delete(a.id) : n.add(a.id); set({ accounts: [...n] }); } },
          h('i', {}), h('span', {}, h('b', {}, a.name), h('small', {}, info)));
      }));
      const step1 = localMode
        ? h('div', { class: 'fd-card' }, h('div', { class: 'fd-head' }, h('b', {}, 'Local Steam account')), localProfilePanel(data.localProfile, data.localStatus))
        : h('div', { class: 'fd-card' }, h('div', { class: 'fd-head' }, h('b', {}, 'Process for'), h('div', { class: 'fd-links' },
          h('button', { class: 'btn ghost sm', onclick: () => set({ accounts: accounts.map((a) => a.id) }) }, 'Select All'), h('button', { class: 'btn ghost sm', onclick: () => set({ accounts: [] }) }, 'Deselect All'))), pills);
      // 2) what to add
      const kindOn = (k) => k === 'f2p' || k === 'free' || k === 'new' ? kindsCfg[k] !== false : kindsCfg[k] === true;
      const kindCard = (k, title, desc, on, stat, toggle) => h('button', { class: 'fd-kind' + (on ? ' on' : ''), title: on ? 'Click to switch off (also while it runs)' : 'Click to switch on (also while it runs)', onclick: toggle },
        h('span', { class: 'fd-kt' }, h('b', {}, title), h('em', {}, on ? 'ON' : 'OFF')), h('small', {}, desc), stat ? h('small', { class: 'fd-ks' }, stat) : null);
      const kindCards = h('div', { class: 'fd-kinds' }, autoKinds.map(([k, label, desc]) => {
        const on = kindOn(k), st = (loop.byKind || {})[k];
        return kindCard(k, label, desc, on, on && running && st ? `${st.added} added · ${st.owned} already owned · ${st.refused} refused` : '', () => set({ kinds: { [k]: !on } }));
      }).concat([kindCard('giveaways', 'Limited-time giveaways', 'Normally paid games that are 100% off for a short time (checked every few minutes)', cfg.giveaways !== false, '', () => set({ giveaways: !(cfg.giveaways !== false) }))]));
      const nameFilter = h('input', { class: 'in', placeholder: 'Only add games whose name contains… (optional)', value: cfg.autoQuery || '', onchange: async (e) => { data = await window.api.freeSet({ autoQuery: e.target.value }); toast('Filter saved.', 'ok'); } });
      const step2 = h('div', { class: 'fd-card' }, h('div', { class: 'fd-head' }, h('b', {}, '2 · What to add'), h('small', {}, `${autoKinds.filter(([k]) => kindOn(k)).length + (cfg.giveaways !== false ? 1 : 0)} of ${autoKinds.length + 1} switched on`)), kindCards,
        h('small', { class: 'fd-note' }, 'Click a card to switch it on or off. You can change this while it is running.'), nameFilter);
      // advanced
      const intervalValue = Number(cfg.intervalValue) || 60, intervalUnit = cfg.intervalUnit || 'minutes';
      const intervalUnitSelect = h('select', { class: 'in', onchange: (e) => set({ intervalUnit: e.target.value }) }, [['seconds', 'seconds'], ['minutes', 'minutes'], ['hours', 'hours']].map(([value, label]) => h('option', { value, selected: intervalUnit === value ? 'selected' : null }, label)));
      const adv = h('details', { class: 'fd-card fd-adv' }, h('summary', {}, 'Advanced options'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: cfg.notify ? 'checked' : null, onchange: (e) => set({ notify: e.target.checked }) }), 'Notify me about new giveaways'),
        h('label', { class: 'free-interval' }, 'Giveaways per check', h('input', { class: 'in', type: 'number', min: '1', value: String(cfg.autoGameCount || 10), onchange: async (e) => { const n = Math.max(1, Number.parseInt(e.target.value, 10) || 1); data = await window.api.freeSet({ autoGameCount: n }); e.target.value = String(data.cfg.autoGameCount); } })),
        h('label', { class: 'free-interval' }, 'Check giveaways every', h('input', { class: 'in', type: 'number', min: intervalUnit === 'seconds' ? '10' : '1', max: '720', value: String(intervalValue), onchange: (e) => set({ intervalValue: Number(e.target.value) }) }), intervalUnitSelect));
      // history
      const rows = (data.history || []).filter((r) => localMode ? r.accountId === data.localAccountId : (historyAccount === 'all' || r.accountId === historyAccount)).sort((x, y) => (y.time || 0) - (x.time || 0));
      const historyFilter = localMode ? null : h('select', { class: 'in free-history-filter', onchange: (e) => { historyAccount = e.target.value; render(); } }, [h('option', { value: 'all', selected: historyAccount === 'all' ? 'selected' : null }, 'All accounts'), ...accounts.map((a) => h('option', { value: a.id, selected: historyAccount === a.id ? 'selected' : null }, a.name))]);
      const label = { ok: 'Added', owned: 'Already owned', refused: 'Refused', error: 'Failed', manual: 'Manual Claim Required' };
      const history = h('div', { class: 'fd-card fd-history' }, h('div', { class: 'fd-head' }, h('b', {}, 'Added games'), h('small', {}, `${rows.filter((r) => r.result === 'ok').length} added`), historyFilter),
        rows.length ? h('div', { class: 'fd-rows' }, rows.slice(0, 150).map((r) => h('div', { class: 'fd-row' }, h('span', { class: 'fd-badge ' + (r.result || 'error') }, label[r.result] || 'Failed'), h('b', {}, r.name), h('small', {}, r.account), h('small', { class: 'fd-time', title: r.text || '' }, r.time ? new Date(r.time).toLocaleString(uiLocale()) : '')))) : h('div', { class: 'empty' }, 'No games have been added yet.'));
      body = h('section', { class: 'free-discovery fd' }, hero, h('div', { class: 'fd-steps' }, step1, step2), adv, history);
    } else if (mode === 'stats') {
      const select = localMode ? h('small', { class: 'free-stat-source' }, 'Local Steam account') : h('select', { class: 'in free-account', onchange: (e) => { statsAccount = e.target.value; loadStats(); } }, [h('option', { value: 'all', selected: statsAccount === 'all' ? 'selected' : null }, 'All selected accounts'), ...accounts.filter((a) => (cfg.accounts || []).includes(a.id)).map((a) => h('option', { value: a.id, selected: statsAccount === a.id ? 'selected' : null }, a.name))]);
      const cats = stats && stats.categories || [];
      const cards = ['Paid Games', 'Owned Games', 'Free Games', 'Software', 'DLCs', 'Soundtracks', 'Other'].map((name) => {
        const item = cats.find((x) => x.name === name);
        return h('div', { class: 'free-stat-card' }, h('small', {}, name), h('b', {}, item && item.value != null ? Number(item.value).toLocaleString(uiLocale()) : statsBusy ? 'Reading…' : 'Unknown'), h('span', {}, item && item.complete ? 'Verified' : 'Incomplete'));
      });
      body = h('section', { class: 'free-stats-view' }, h('div', { class: 'free-stats-head' }, h('div', {}, h('h2', {}, 'Owned library statistics'), h('small', {}, 'Counts are shown only where Steam provides enough account data.')), select, h('button', { class: 'btn ghost', disabled: statsBusy ? 'disabled' : null, onclick: () => loadStats(true) }, statsBusy ? 'Refreshing…' : 'Refresh')), localMode ? localProfilePanel(data.localProfile, data.localStatus) : null, h('div', { class: 'free-stats-grid' }, ...cards), h('div', { class: 'free-stat-note' }, h('b', {}, statsBusy ? 'Synchronizing…' : stats && stats.status === 'ok' ? 'Synchronized' : 'Incomplete / not verified'), h('small', {}, stats && stats.note || 'Press Refresh to read the selected account.'), h('small', {}, stats && stats.checkedAt ? 'Last checked: ' + new Date(stats.checkedAt).toLocaleString(uiLocale()) : 'Not checked yet.'), stats && stats.uniqueGames != null ? h('small', {}, `Unique games: ${stats.uniqueGames} · ownership records: ${stats.ownerships}`) : null));
    } else {
      const choose = (key, label, options) => h('select', { class: 'in', value: historyFilterState[key], onchange: (e) => { historyFilterState[key] = e.target.value; loadHistory(true); } }, [h('option', { value: 'all', selected: historyFilterState[key] === 'all' ? 'selected' : null }, 'All ' + label), ...options.map(([v, t]) => h('option', { value: v, selected: historyFilterState[key] === v ? 'selected' : null }, t))]);
      const filters = h('div', { class: 'free-history-filters' }, ...(localMode ? [] : [choose('accountId', 'accounts', accounts.map((a) => [a.id, a.name]))]), choose('status', 'statuses', [['ok', 'Added'], ['owned', 'Already Owned'], ['error', 'Failed'], ['pending', 'Pending'], ['manual', 'Manual Claim Required'], ['refused', 'Refused']]), choose('type', 'categories', types.concat([['music', 'Soundtracks'], ['demo', 'Demos'], ['other', 'Other']])), choose('mode', 'modes', [['Local', 'Local'], ['API', 'API']]), h('label', {}, 'From', h('input', { class: 'in', type: 'date', value: historyFilterState.from, onchange: (e) => { historyFilterState.from = e.target.value; loadHistory(true); } })), h('label', {}, 'To', h('input', { class: 'in', type: 'date', value: historyFilterState.to, onchange: (e) => { historyFilterState.to = e.target.value; loadHistory(true); } })));
      const statusLabel = { ok: 'Added', owned: 'Already Owned', error: 'Failed', pending: 'Pending', manual: 'Manual Claim Required', refused: 'Failed' };
      const rows = historyRows.map((r) => h('article', { class: 'free-history-row' }, h('img', { src: `https://cdn.akamai.steamstatic.com/steam/apps/${r.appid}/header.jpg`, alt: '', loading: 'lazy' }), h('div', {}, h('b', {}, r.name), h('small', {}, `AppID ${r.appid} · ${r.type || 'game'} · ${r.account || r.accountId}`), h('small', {}, `${r.mode || 'API'} · ${r.time ? new Date(r.time).toLocaleString(uiLocale()) : '—'}`), r.text ? h('small', { class: 'free-history-note' }, r.text) : null), h('span', { class: 'fd-badge ' + (r.result || 'error') }, statusLabel[r.result] || 'Failed'), h('button', { class: 'btn ghost sm', onclick: () => window.open(`https://store.steampowered.com/${r.type === 'dlc' ? 'dlc' : 'app'}/${r.appid}`, '_blank', 'noopener') }, 'Steam')));
      body = h('section', { class: 'free-added-view' }, h('div', { class: 'free-stats-head' }, h('div', {}, h('h2', {}, 'Added Games'), h('small', {}, `${historyRows.length.toLocaleString(uiLocale())} of ${historyTotal.toLocaleString(uiLocale())} records`)), h('button', { class: 'btn ghost', onclick: () => loadHistory(true) }, 'Refresh')), filters, rows.length ? h('div', { class: 'free-history-grid' }, ...rows) : h('div', { class: 'empty' }, historyBusy ? 'Loading history…' : 'No matching products.'), historyOffset < historyTotal ? h('button', { class: 'btn ghost', disabled: historyBusy ? 'disabled' : null, onclick: () => loadHistory(false) }, historyBusy ? 'Loading…' : 'Load more') : null);
    }
    const autoNav = h('div', { class: 'free-subnav' }, [['discover', 'Auto Add'], ['stats', 'Owned Stats'], ['added', 'Added Games']].map(([k, label]) => h('button', { class: 'btn sm' + (mode === k ? ' on' : ''), onclick: () => { mode = k; if (mode === 'stats' && !stats) loadStats(); else if (mode === 'added' && !historyRows.length) loadHistory(true); else render(); } }, label)));
    host.replaceChildren(top, ...(mode === 'browse' ? [] : [autoNav]), body);
    if (mode !== 'browse') browseNodes = null;
  }
  async function show() { try { data = await window.api.freeGet(); if (data.cfg && data.cfg.mode === 'local') accountId = data.localAccountId || ''; render(); if (!data.at) window.api.freeCheck().then((v) => { data = v; if (document.querySelector('.tab[data-tab="free"].active')) render(); }); if (!catalog.length) searchCatalog(); } catch {} }
  let localRefreshBusy = false;
  async function refreshLocalAccount() {
    if (localRefreshBusy || !document.querySelector('.tab[data-tab="free"].active') || !data.cfg || data.cfg.mode !== 'local') return;
    localRefreshBusy = true;
    const previousStatus = data.localStatus, previousId = data.localAccountId || '', previousProfileAt = data.localProfile && data.localProfile.checkedAt || 0;
    try {
      const next = await window.api.freeGet();
      if (!next || !next.cfg || next.cfg.mode !== 'local') return;
      data = next; accountId = next.localAccountId || '';
      const changed = previousStatus !== next.localStatus || previousId !== (next.localAccountId || '');
      const profileUpdated = previousProfileAt !== (next.localProfile && next.localProfile.checkedAt || 0);
      if (changed) {
        stats = null; statsAccount = accountId;
        render();
        if ((mode === 'stats' || statsPanelOpen) && accountId) await loadStats(true);
      } else if (profileUpdated) render();
    } catch {} finally { localRefreshBusy = false; }
  }
  setInterval(refreshLocalAccount, 10000);
  window.addEventListener('focus', refreshLocalAccount);
  if (window.api && window.api.onShown) window.api.onShown(refreshLocalAccount);
  if (window.api && window.api.onFree) window.api.onFree((v) => { data = v; if (!document.querySelector('.tab[data-tab="free"].active')) return; if (mode === 'added') loadHistory(true); else render(); });
  setInterval(() => { if ((mode === 'stats' || statsPanelOpen) && !statsBusy && (!stats || Date.now() - (stats.checkedAt || 0) > 5 * 60e3)) loadStats(); }, 60000);
  window.FreeGames = { apply, show, render };
  show();
})();
