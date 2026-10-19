// Utility tools (shown as sections of the Utility tab):
//   Profile Compare - two public Steam profiles side by side
//   Inventory Overview - public inventories + links to the official Steam pages
//   Account Health - is Steam connected, do the processes run, any login errors
//   Password Generator - strong passwords, made on this device, never saved
//   Speed Test - opens the speed-test service the user picks
// Uses h(), toast() and accounts from app.js (they are only needed when a section is drawn).
(function () {
  'use strict';
  const muted = 'color:var(--mut)';
  const D = '\u2014';
  const uiLocale = () => window.WellaI18n ? window.WellaI18n.locale() : 'en-US';
  const num = (v, dec) => (v == null || !isFinite(v) ? D : Number(v).toLocaleString(uiLocale(), dec ? { maximumFractionDigits: dec } : undefined));
  const hrs = (v) => (v == null ? D : (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString(uiLocale()) + ' h');
  const link = (href, text, cls) => h('a', { class: 'btn ' + (cls || 'ghost sm'), href, target: '_blank', rel: 'noopener noreferrer' }, text);
  const spinner = (t) => h('div', {}, h('span', { class: 'spin' }), t || 'Loading...');
  const hint = (t) => h('small', { style: muted }, t);

  // ================= Profile Compare =================
  const CS = { a: '', b: '', res: null, busy: false };
  function compare() {
    const out = h('div', { class: 'uout' });
    const paint = () => {
      if (CS.busy) { out.replaceChildren(spinner('Reading both profiles and their shared games...')); return; }
      const r = CS.res; if (!r) { out.replaceChildren(); return; }
      const win = (x, y, hi = true) => (x == null || y == null || x === y ? ['', ''] : (hi ? x > y : x < y) ? ['win', ''] : ['', 'win']);
      const row = (label, x, y, fx, hi) => { const [wa, wb] = win(x, y, hi !== false); return [h('small', {}, label), h('span', { class: wa }, fx(x)), h('span', { class: wb }, fx(y))]; };
      const head = (s) => h('a', { class: 'cmph', href: s.url, target: '_blank', rel: 'noopener noreferrer', title: 'Open the Steam profile' },
        s.avatar ? h('img', { src: s.avatar, alt: '', draggable: 'false' }) : h('i', {}), h('b', {}, s.name), h('small', {}, s.privacy ? (s.privacy === 'public' ? 'Public profile' : 'Private profile') : ''));
      const ach = (r.shared || []).some((g) => g.achA || g.achB);
      const kids = [
        h('div', { class: 'cmp' },
          h('span', {}), head(r.a), head(r.b),
          ...row('Steam level', r.a.level, r.b.level, num),
          ...row('Games owned', r.a.games, r.b.games, num),
          ...row('Games played', r.a.played, r.b.played, num),
          ...row('Playtime (all games)', r.a.hoursTotal, r.b.hoursTotal, hrs),
          ...row('Last 2 weeks', r.a.hours2w, r.b.hours2w, hrs),
          ...(ach && r.achTotals ? row('Achievements (top shared games)', r.achTotals.a, r.achTotals.b, num) : []),
          h('small', {}, 'Member since'), h('span', {}, r.a.memberSince || D), h('span', {}, r.b.memberSince || D),
          ...row('VAC bans', r.a.vac, r.b.vac, num, false),
          ...row('Game bans', r.a.gameBans, r.b.gameBans, num, false))
      ];
      if (r.sharedCount) {
        kids.push(h('div', { class: 'ublk' }, h('b', {}, `Shared games: ${r.sharedCount.toLocaleString(uiLocale())} (top ${r.shared.length} by playtime)`),
          h('div', { class: 'cmpg' },
            h('small', {}, 'Game'), h('small', {}, r.a.name), h('small', {}, r.b.name),
            ...r.shared.flatMap((g) => {
              const cell = (hh, a, other) => h('span', { class: hh > other ? 'win' : '' }, hrs(hh) + (a ? ` \u00b7 ${a.done}/${a.total} \u2605` : ''));
              return [h('span', { class: 'gn' }, g.name), cell(g.hoursA, g.achA, g.hoursB), cell(g.hoursB, g.achB, g.hoursA)];
            }))));
      } else if (!r.notes.length) kids.push(hint('No games in common (or the game lists are hidden).'));
      (r.notes || []).forEach((n) => kids.push(h('small', { class: 'unote' }, n)));
      kids.push(h('small', { class: 'unote' }, 'Green = the better number. The achievement counts cover the most played shared games only, to keep Steam from rate-limiting the request.'));
      out.replaceChildren(...kids);
    };
    const a = h('input', { class: 'in', placeholder: 'Profile 1: steamcommunity.com/id/... or SteamID64', value: CS.a, oninput: (e) => { CS.a = e.target.value; } });
    const b = h('input', { class: 'in', placeholder: 'Profile 2: steamcommunity.com/id/... or SteamID64', value: CS.b, oninput: (e) => { CS.b = e.target.value; } });
    const go = async () => {
      if (!CS.a.trim() || !CS.b.trim()) { toast('Fill in both profiles.', 'bad'); return; }
      CS.busy = true; CS.res = null; paint();
      try { const r = await window.api.utilCompare({ a: CS.a, b: CS.b }); if (r.error) toast(r.error, 'bad'); else CS.res = r; }
      catch (e) { toast(e.message || String(e), 'bad'); }
      CS.busy = false; paint();
    };
    [a, b].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); }));
    paint();
    return [h('b', {}, 'Steam Profile Compare'),
      hint('Compare two public profiles by games, hours, achievements and Steam level. Private profiles only show what they make public.'),
      h('div', { class: 'cmpin' }, a, b, h('button', { class: 'btn red sm', onclick: go }, 'Compare')), out];
  }

  // ================= Inventory Overview =================
  const IS = { q: '', res: null, busy: false, filter: '', last: null };
  function inventory() {
    const out = h('div', { class: 'uout invall' });
    const applyFilter = () => {
      const f = IS.filter.trim().toLowerCase();
      out.querySelectorAll('.invit').forEach((el) => { el.style.display = !f || (el.dataset.n || '').includes(f) ? '' : 'none'; });
      out.querySelectorAll('.invg').forEach((card) => {
        const items = card.querySelectorAll('.invit'); if (!items.length) return;
        const shown = [...items].filter((el) => el.style.display !== 'none').length;
        const c = card.querySelector('.invshown'); if (c) c.textContent = f ? shown + ' / ' + items.length + ' shown' : '';
      });
    };
    const paint = () => {
      if (IS.busy) { out.replaceChildren(spinner('Reading the full inventories (one request at a time so Steam does not block you, this can take a little while)...')); return; }
      const r = IS.res; if (!r) { out.replaceChildren(); return; }
      const msg = { private: 'Inventory is private.', limit: 'Steam says too many requests. Wait a minute, then press Refresh.', empty: 'Empty or not available.', error: 'Could not be read.' };
      const search = h('input', { class: 'in invsearch', placeholder: 'Search items...', value: IS.filter, oninput: (e) => { IS.filter = e.target.value; applyFilter(); } });
      const kids = [
        h('div', { class: 'cmph row' }, r.avatar ? h('img', { src: r.avatar, alt: '', draggable: 'false' }) : h('i', {}), h('b', {}, r.name),
          h('button', { class: 'btn ghost sm', style: 'margin-left:auto', onclick: () => run(IS.last, true) }, 'Refresh')),
        h('div', { class: 'sbtns' }, link(r.links.profile, 'Profile'), link(r.links.inventory, 'Inventory'), link(r.links.tradeOffers, 'Trade offers'), link(r.links.market, 'Community Market'), search),
        hint('These links open the official Steam pages in your browser. Wella Hub never trades or moves items for you. Results are kept for 10 minutes so Steam is not asked again and again.')
      ];
      for (const g of r.games) {
        const ok = g.status === 'ok';
        const items = ok ? (g.items || g.top || []) : [];
        kids.push(h('div', { class: 'ucard invg' },
          h('div', { class: 'invh' }, h('b', {}, g.name), ok ? h('span', { class: 'chip' }, num(g.total) + ' items') : h('span', { class: 'chip' }, msg[g.status] || D),
            h('small', { class: 'invshown', style: muted }), link(g.url, 'Open on Steam', 'ghost sm')),
          ok && g.total ? h('small', { style: muted }, `${num(g.tradable)} tradable \u00b7 ${num(g.marketable)} marketable \u00b7 ${num(g.unique)} different items` + (g.more ? ' \u00b7 Steam stopped the read early, press Refresh later for the rest' : '') + (g.stale ? ' \u00b7 showing the last saved copy' : '')) : (g.error ? h('small', { class: 'unote' }, g.error) : null),
          items.length ? h('div', { class: 'invi' }, items.map((t) => h('div', { class: 'invit', title: t.full || t.name, 'data-n': (t.full || t.name || '').toLowerCase() },
            t.icon ? h('img', { src: t.icon, alt: '', draggable: 'false', loading: 'lazy' }) : h('i', {}),
            h('span', t.color ? { style: 'color:' + t.color } : {}, t.name), t.count > 1 ? h('b', {}, '\u00d7' + t.count) : null))) : null));
      }
      out.replaceChildren(...kids);
      applyFilter();
    };
    const q = h('input', { class: 'in', placeholder: 'steamcommunity.com/id/... or SteamID64', value: IS.q, oninput: (e) => { IS.q = e.target.value; } });
    const run = async (payload, force) => {
      IS.busy = true; IS.res = null; IS.last = payload; paint();
      try { const r = await window.api.utilInventory(force ? { ...payload, force: true } : payload); if (r.error) toast(r.error, 'bad'); else IS.res = r; }
      catch (e) { toast(e.message || String(e), 'bad'); }
      IS.busy = false; paint();
    };
    const go = () => { if (!IS.q.trim()) return; run({ q: IS.q.trim() }); };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    paint();
    const own = (typeof accounts !== 'undefined' ? accounts : []);
    return [h('b', {}, 'Inventory Overview'),
      hint('See the full inventories that work with Steam (CS2, Dota 2, TF2, Rust and Steam items), with links to the official trading pages. Needs a public inventory (your own accounts are read with their own login).'),
      h('div', { class: 'lk' }, q, h('button', { class: 'btn red sm', onclick: go }, 'Look up')),
      own.length ? h('div', { class: 'sbtns' }, h('small', { style: muted }, 'My accounts:'), own.map((a) => h('button', { class: 'btn ghost sm', onclick: () => run({ accountId: a.id }) }, a.personaName || a.accountName))) : null,
      out].filter(Boolean);
  }

  // ================= Account Health =================
  const AUTH_RE = /log ?in|password|guard|token|session|credential|expired|denied|refused|invalid|auth/i;
  function health() {
    const box = h('div', { class: 'uout' });
    let bans = {};
    const paint = () => {
      const list = (typeof accounts !== 'undefined' ? accounts : []);
      const online = navigator.onLine;
      const rows = [h('div', { class: 'hrow' }, h('i', { class: 'hd ' + (online ? 'ok' : 'bad') }), h('b', {}, 'Internet'), h('span', {}, online ? 'Connected' : 'No internet connection'))];
      if (!list.length) { box.replaceChildren(...rows, hint('No accounts yet. Add one from the Hour Booster tab.')); return; }
      const cards = list.map((a) => {
        const hl = a.health || { ok: false, why: '' }, run = a.status === 'boosting', conn = a.status === 'connecting';
        const reason = a.note || (!hl.ok ? hl.why : '');
        const authErr = !hl.ok && AUTH_RE.test(reason) && !/not running|connecting|playing/i.test(reason) ? reason : '';
        const bn = bans[a.id] && bans[a.id].banned ? bans[a.id] : null;
        const line = (ok, label, text) => h('div', { class: 'hrow' }, h('i', { class: 'hd ' + (ok === null ? 'mid' : ok ? 'ok' : 'bad') }), h('b', {}, label), h('span', {}, text));
        return h('div', { class: 'ucard' },
          h('div', { class: 'cmph row' }, a.avatar ? h('img', { src: a.avatar, alt: '', draggable: 'false' }) : h('i', {}), h('b', {}, a.personaName || a.accountName), h('small', {}, a.accountName)),
          line(run && hl.ok ? true : conn || (run && !hl.ok) ? null : false, 'Steam connection', run && hl.ok ? 'Connected' : run ? (reason || 'Reconnecting...') : conn ? 'Connecting...' : 'Not connected'),
          line(run ? hl.ok : false, 'Hour Booster process', run ? (hl.ok ? 'Running' : 'Running, but ' + (reason || 'not working properly').replace(/\.$/, '')) : 'Stopped'),
          line(!authErr, 'Login / authentication', authErr || 'No errors'),
          line(!bn, 'Bans', bn ? [bn.vac ? 'VAC' : '', bn.game ? 'Game ban' : '', bn.community ? 'Community ban' : ''].filter(Boolean).join(', ') : 'None on record'));
      });
      box.replaceChildren(h('div', { class: 'ucard' }, ...rows), ...cards, hint('This page refreshes by itself every few seconds.'));
    };
    const loadBans = async () => { try { const m = await window.api.accountsBans(); if (m && typeof m === 'object') bans = m; } catch {} paint(); };
    paint(); loadBans();
    const t = setInterval(() => { if (!document.body.contains(box)) { clearInterval(t); return; } paint(); }, 3000);
    return [h('b', {}, 'Account Health'),
      hint('Checks if Steam is connected, if the processes are working and if there are login errors, for every account.'),
      h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', onclick: loadBans }, 'Check again')), box];
  }

  // ================= Password Generator =================
  const PW = { len: 20, upper: true, lower: true, digits: true, symbols: true, ambiguous: false, value: '' };
  const SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!@#$%^&*()-_=+[]{};:,.?/~' };
  const AMBIG = /[O0Il1|`'"]/g;
  function rand(n) {                                   // unbiased random integer 0..n-1 (rejection sampling on crypto randomness)
    const lim = Math.floor(4294967296 / n) * n, b = new Uint32Array(1);
    do { crypto.getRandomValues(b); } while (b[0] >= lim);
    return b[0] % n;
  }
  function makePassword(o) {
    const sets = ['upper', 'lower', 'digits', 'symbols'].filter((k) => o[k]).map((k) => (o.ambiguous ? SETS[k].replace(AMBIG, '') : SETS[k]));
    if (!sets.length) return { value: '', bits: 0 };
    const all = sets.join(''), chars = [];
    sets.forEach((s) => chars.push(s[rand(s.length)]));                       // at least one of every chosen kind
    while (chars.length < o.len) chars.push(all[rand(all.length)]);
    for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    return { value: chars.slice(0, o.len).join(''), bits: Math.round(o.len * Math.log2(all.length)) };
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch {}
    try { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok; } catch { return false; }
  }
  function password() {
    const view = h('code', { class: 'pwv' }), meter = h('div', { class: 'pwm' }, h('i', {})), meterTx = h('small', { style: muted });
    const lenOut = h('output', {});
    const gen = () => {
      const r = makePassword(PW); PW.value = r.value;
      view.textContent = r.value || 'Pick at least one kind of character';
      const lvl = r.bits >= 110 ? ['Excellent', 100, '#22c55e'] : r.bits >= 80 ? ['Strong', 75, '#84cc16'] : r.bits >= 60 ? ['Okay', 50, '#f5b301'] : r.bits ? ['Weak', 25, '#ef4444'] : ['', 0, '#777'];
      meter.firstChild.style.cssText = `width:${lvl[1]}%;background:${lvl[2]}`;
      meterTx.textContent = r.bits ? `${lvl[0]} \u00b7 about ${r.bits} bits of randomness` : '';
      lenOut.textContent = PW.len + ' characters';
    };
    const opt = (label, key) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: PW[key] ? 'checked' : null, onchange: (e) => { PW[key] = e.target.checked; gen(); } }), label);
    const slider = h('input', { type: 'range', min: '8', max: '64', step: '1', value: String(PW.len), oninput: (e) => { PW.len = +e.target.value; gen(); } });
    gen();
    return [h('b', {}, 'Password Generator'),
      hint('Strong passwords made on this device with secure randomness. Nothing is saved, sent or logged: close the page and it is gone.'),
      h('div', { class: 'pwbox' }, view,
        h('div', { class: 'sbtns' },
          h('button', { class: 'btn red sm', onclick: async () => { if (!PW.value) return; const ok = await copyText(PW.value); toast(ok ? 'Password copied' : 'Could not copy. Select it and press Ctrl+C.', ok ? 'ok' : 'bad'); } }, 'Copy'),
          h('button', { class: 'btn ghost sm', onclick: gen }, 'Generate another'))),
      meter, meterTx,
      h('div', { class: 'bgsl' }, h('b', {}, 'Length'), slider, lenOut),
      h('div', { class: 'pwopts' }, opt('A-Z', 'upper'), opt('a-z', 'lower'), opt('0-9', 'digits'), opt('Symbols', 'symbols'), opt('Avoid look-alikes (O 0 I l 1)', 'ambiguous'))];
  }

  // ================= Internet Speed Test =================
  const SPEED = [
    ['cloudflare', 'Cloudflare Speed Test', 'https://speed.cloudflare.com/', 'Speed, latency and jitter. No account needed.'],
    ['fast', 'Fast.com (Netflix)', 'https://fast.com/', 'Very simple: download speed in one number.'],
    ['ookla', 'Speedtest by Ookla', 'https://www.speedtest.net/', 'The best-known one: download, upload and ping.'],
    ['mlab', 'Measurement Lab (M-Lab)', 'https://speed.measurementlab.net/', 'Open-source test, also used by Google search.'],
    ['nperf', 'nPerf', 'https://www.nperf.com/en/', 'Download, upload, latency and browsing quality.']
  ];
  function speed() {
    let pick = 'cloudflare';
    try { const v = localStorage.getItem('wella-speedsvc'); if (SPEED.some((s) => s[0] === v)) pick = v; } catch {}
    const info = h('small', { style: muted }), open = h('a', { class: 'btn red sm', target: '_blank', rel: 'noopener noreferrer' }, 'Start test');
    const sel = h('select', { class: 'in', onchange: (e) => { pick = e.target.value; try { localStorage.setItem('wella-speedsvc', pick); } catch {} sync(); } },
      SPEED.map((s) => h('option', { value: s[0], selected: s[0] === pick ? 'selected' : null }, s[1])));
    const sync = () => { const s = SPEED.find((x) => x[0] === pick); open.href = s[2]; info.textContent = s[3] + ' It opens in your browser.'; };
    sync();
    return [h('b', {}, 'Internet Speed Test'),
      hint('Measures your connection through the testing service you choose. The test runs on that service\u2019s page, not inside Wella Hub.'),
      h('div', { class: 'lk' }, sel, open), info,
      hint('Tip: pause downloads and close streams while testing, and test on a cable if you can.')];
  }

  // ================= Webhook (Discord) =================
  function webhook() {
    const box = h('div', { class: 'uout' });
    const paint = (st) => {
      const chk = (label, key, hintTx) => h('div', { class: 'setrow' }, h('label', { class: 'chk' },
        h('input', { type: 'checkbox', checked: st[key] ? 'checked' : null, onchange: async (e) => { try { st = await window.api.hookSet({ [key]: e.target.checked }); } catch (er) { toast(er.message || String(er), 'bad'); } paint(st); } }), label),
        hintTx ? hint(hintTx) : null);
      const url = h('input', { class: 'in', type: 'password', placeholder: st.hasUrl ? 'Saved (' + st.tail + '). Paste a new link to replace it.' : 'https://discord.com/api/webhooks/...' });
      const save = h('button', { class: 'btn red sm', onclick: async () => {
        const v = url.value.trim(); if (!v) { toast('Paste the webhook link first.', 'bad'); return; }
        try { const r = await window.api.hookSet({ url: v }); if (r.error) { toast(r.error, 'bad'); return; } toast('Webhook saved', 'ok'); paint(r); } catch (e) { toast(e.message || String(e), 'bad'); }
      } }, 'Save');
      const name = h('input', { class: 'in', value: st.name || '', placeholder: st.host || 'Computer name', maxlength: '60' });
      name.addEventListener('change', async () => { try { st = await window.api.hookSet({ name: name.value }); toast('Saved', 'ok'); } catch (e) { toast(e.message || String(e), 'bad'); } });
      const message = h('textarea', { class: 'in', maxlength: '1900', placeholder: 'Write a message to send to your Discord channel', rows: '4', style: 'resize:vertical' });
      const exportPhone = h('button', { class: 'btn ghost sm', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { const r = await window.api.phoneSetupExport(); if (r.error) toast(r.error, 'bad'); else if (r.ok) toast(`Exported ${r.count} account setups. Copy the JSON file to your phone and import it in Hour Boost.`, 'ok'); }
        catch (er) { toast(er.message || String(er), 'bad'); }
        b.disabled = false;
      } }, 'Export accounts and game selections for Android');
      const importPhone = h('button', { class: 'btn ghost sm', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        try { const r = await window.api.phoneSetupImport(); if (r.error) toast(r.error, 'bad'); else if (r.ok) toast(`Imported ${r.applied} account setups${r.skipped ? `; ${r.skipped} account(s) did not match` : ''}.`, 'ok'); }
        catch (er) { toast(er.message || String(er), 'bad'); }
        b.disabled = false;
      } }, 'Import setup from Android');
      const sendMessage = h('button', { class: 'btn red sm', disabled: st.hasUrl ? null : 'disabled', onclick: async (e) => {
        const text = message.value.trim(); if (!text) { toast('Write a message first.', 'bad'); return; }
        const b = e.currentTarget; b.disabled = true;
        try { const r = await window.api.hookSendMessage(text); if (r.error) toast(r.error, 'bad'); else { toast('Message sent to Discord', 'ok'); message.value = ''; } }
        catch (er) { toast(er.message || String(er), 'bad'); }
        b.disabled = !st.hasUrl;
      } }, 'Send message');
      box.replaceChildren(
        h('div', { class: 'lk' }, url, save, st.hasUrl ? h('button', { class: 'btn stop sm', onclick: async () => { try { paint(await window.api.hookSet({ url: '' })); toast('Webhook removed'); } catch (e) { toast(e.message || String(e), 'bad'); } } }, 'Remove') : null),
        hint('Discord: channel settings > Integrations > Webhooks > New webhook > Copy webhook URL. Save the webhook for the action logs. The URL is kept on this PC.'),
        chk('Webhook on', 'enabled'),
        chk('Log when Wella Hub starts', 'onStart', 'Computer, location, public IP and the direct link.'),
        chk('Send Cloudflare link changes to default Web webhook', 'onLink', 'The new link arrives on your phone by itself.'),
        chk('Log when badges are crafted', 'onBadge', 'Utility > Badges.'),
        chk('Send daily summary', 'onDaily', 'Hours, cards and achievements of the day (Utility > Daily report).'),
        chk('Send Steam sale countdown messages', 'onSale', 'A day before, one hour before and when it starts.'),
        chk('Send PC health warnings', 'onHealth', 'CPU or network over the limit (Utility > PC health).'),
        h('div', { class: 'setrow' }, h('b', {}, 'Computer name'), name, hint('Shown in the message. Empty = ' + (st.host || 'the PC name') + '.')),
        h('div', { class: 'setrow' }, h('b', {}, 'Send a custom message'), hint('Send a one-time message through the saved Discord webhook.'), message, sendMessage),
        h('div', { class: 'setrow' }, h('b', {}, 'Android setup transfer'), hint('Moves account names, selected games, and favorites. Steam login sessions are never included. Import updates accounts with matching Steam usernames.'), h('div', { class: 'sbtns' }, exportPhone, importPhone)),
        h('div', { class: 'sbtns' }, h('button', { class: 'btn ghost sm', disabled: st.hasUrl ? null : 'disabled', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { const r = await window.api.hookTest(); if (r.error) toast(r.error, 'bad'); else toast('Test message sent', 'ok'); } catch (er) { toast(er.message || String(er), 'bad'); }
          b.disabled = false;
        } }, 'Send test message')));
    };
    window.api.hookGet().then(paint).catch((e) => box.replaceChildren(hint(e.message || String(e))));
    return [h('b', {}, 'Action log webhook (Discord)'),
      hint('This webhook receives safe action logs for boosts, achievements, free games, and selected Utility actions. Web-access password and Cloudflare link/control messages use the separate default Web webhook.'),
      box];
  }

  window.WellaTools = { compare, inventory, health, password, speed, webhook };
})();
