// Settings > Discord > Accounts: keep several Discord BOT accounts online and pick one as the AI bot.
// Uses h() and toast() from app.js. Tokens/keys are sent to the main process once and never come back (only the last 4 characters).
(function () {
  'use strict';
  const muted = 'color:var(--mut)';
  const hint = (t) => h('small', { style: muted }, t);
  const STATUS = [['online', 'Online'], ['idle', 'Idle'], ['dnd', 'Do not disturb'], ['invisible', 'Invisible']];
  const ACT = [['playing', 'Playing'], ['listening', 'Listening to'], ['watching', 'Watching'], ['competing', 'Competing in'], ['streaming', 'Streaming']];
  const STATE = { online: ['#22c55e', 'Online'], connecting: ['#eab308', 'Connecting...'], error: ['#ef4444', 'Error'], offline: ['#9ca3af', 'Offline'], off: ['#9ca3af', 'Off'] };
  const err = (e) => toast((e && e.message) || String(e), 'bad');
  const sel = (opts, val, onchange) => h('select', { class: 'in', onchange: (e) => onchange(e.target.value) },
    opts.map(([v, l]) => h('option', { value: v, selected: v === val ? 'selected' : null }, l)));

  function section() {
    const box = h('div', { class: 'uout' });
    let data = null, draft = { token: '', label: '', status: 'online', activityType: 'playing', activityText: '' }, aiDraft = {}, sig = '';

    const call = async (fn, okMsg) => {
      try { const r = await fn(); if (r && r.error) { toast(r.error, 'bad'); return null; } if (okMsg) toast(okMsg, 'ok'); if (r && r.accounts) { data = r; paint(); } return r || true; }
      catch (e) { err(e); return null; }
    };

    function row(a) {
      const st = STATE[a.state] || STATE.offline;
      const dot = h('span', { class: 'dcdot', style: 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' + st[0] });
      const stTxt = h('small', { class: 'dcst', 'data-id': a.id, style: 'color:' + st[0] }, st[1]);
      const name = h('input', { class: 'in', value: a.label || '', placeholder: 'Name', maxlength: '40', style: 'max-width:170px' });
      name.addEventListener('change', () => call(() => window.api.dcBotsUpdate(a.id, { label: name.value })));
      const act = h('input', { class: 'in', value: a.activityText || '', placeholder: 'Activity text (optional)', maxlength: '100' });
      act.addEventListener('change', () => call(() => window.api.dcBotsUpdate(a.id, { activityText: act.value }), 'Saved'));
      return h('div', { class: 'setrow', style: 'border:1px solid var(--line2);border-radius:12px;padding:12px;gap:10px' },
        h('div', { class: 'lk', style: 'flex-wrap:wrap' }, dot, name, stTxt,
          h('small', { style: muted }, (a.tag ? a.tag + ' \u00b7 ' : '') + a.tokenTail),
          a.isAi ? h('b', { style: 'color:var(--red)' }, 'AI bot') : null),
        a.error && a.state !== 'online' ? h('small', { class: 'dcerr', 'data-id': a.id, style: 'color:var(--red)' }, a.error) : null,
        h('div', { class: 'row2' }, sel(STATUS, a.status, (v) => call(() => window.api.dcBotsUpdate(a.id, { status: v }))),
          sel(ACT, a.activityType, (v) => call(() => window.api.dcBotsUpdate(a.id, { activityType: v })))),
        act,
        h('div', { class: 'sbtns' },
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: a.enabled ? 'checked' : null, onchange: (e) => call(() => window.api.dcBotsUpdate(a.id, { enabled: e.target.checked })) }), 'Keep online'),
          h('button', { class: 'btn ghost sm', onclick: () => call(() => window.api.dcBotsSetAi({ botId: a.isAi ? '' : a.id }), a.isAi ? 'AI bot turned off' : 'This is now the AI bot') }, a.isAi ? 'Stop being AI bot' : 'Make AI bot'),
          h('button', { class: 'btn ghost sm', onclick: () => call(() => window.api.dcBotsReconnect(a.id)) }, 'Reconnect'),
          h('button', { class: 'btn stop sm', onclick: () => { if (confirm('Remove this account from Wella Hub?')) call(() => window.api.dcBotsRemove(a.id), 'Removed'); } }, 'Remove')));
    }

    function addForm() {
      const token = h('input', { class: 'in', type: 'password', placeholder: 'Bot token (Developer Portal > Bot > Reset Token)', value: draft.token, autocomplete: 'off' });
      token.addEventListener('input', () => { draft.token = token.value; });
      const label = h('input', { class: 'in', placeholder: 'Name (optional)', maxlength: '40', value: draft.label });
      label.addEventListener('input', () => { draft.label = label.value; });
      const text = h('input', { class: 'in', placeholder: 'Activity text (optional)', maxlength: '100', value: draft.activityText });
      text.addEventListener('input', () => { draft.activityText = text.value; });
      const add = h('button', { class: 'btn red sm', onclick: async (e) => {
        if (!draft.token.trim()) { toast('Paste the bot token first.', 'bad'); return; }
        const b = e.currentTarget; b.disabled = true;
        const r = await call(() => window.api.dcBotsAdd(draft), 'Account added, connecting...');
        b.disabled = false;
        if (r) { draft = { token: '', label: '', status: draft.status, activityType: draft.activityType, activityText: '' }; paint(); }
      } }, 'Add account');
      return h('div', { class: 'setrow' }, h('b', {}, 'Add a Discord account'),
        token, h('div', { class: 'row2' }, label, text),
        h('div', { class: 'row2' }, sel(STATUS, draft.status, (v) => { draft.status = v; }), sel(ACT, draft.activityType, (v) => { draft.activityType = v; })),
        h('div', { class: 'sbtns' }, add),
        hint('These are official Discord bot accounts (Discord Developer Portal > New Application > Bot). Add the bot to your server with OAuth2 > URL Generator (scope "bot"). Normal user-account tokens are not supported: automating a user account is against Discord\u2019s Terms and gets it banned.'));
    }

    function aiForm() {
      const a = data.ai, d = aiDraft;
      const v = (k) => (k in d ? d[k] : (k === 'fallbackModels' && Array.isArray(a[k]) ? a[k].join('\n') : a[k]));
      const input = (k, ph, o = {}) => { const el = h('input', { class: 'in', placeholder: ph, value: v(k) == null ? '' : String(v(k)), maxlength: o.max || '120', type: o.type || 'text' }); el.addEventListener('input', () => { d[k] = el.value; }); return el; };
      const key = h('input', { class: 'in', type: 'password', autocomplete: 'off', placeholder: a.hasKey ? 'Saved (' + a.keyTail + '). Paste a new key to replace it.' : 'API key' });
      key.addEventListener('input', () => { d.apiKey = key.value; });
      const sys = h('textarea', { class: 'in', rows: '4', maxlength: '1500', style: 'resize:vertical' }); sys.value = v('system');
      sys.addEventListener('input', () => { d.system = sys.value; });
      const fallback = h('textarea', { class: 'in', rows: '3', maxlength: '700', placeholder: 'Modele de rezervă, câte unul pe rând (aceeași cheie și același furnizor)', style: 'resize:vertical' }); fallback.value = v('fallbackModels') || '';
      fallback.addEventListener('input', () => { d.fallbackModels = fallback.value; });
      const dms = h('input', { type: 'checkbox', checked: v('dms') ? 'checked' : null, onchange: (e) => { d.dms = e.target.checked; } });
      const ai = data.accounts.find((x) => x.isAi);
      const save = h('button', { class: 'btn red sm', onclick: async () => {
        const p = { ...d }; if (!('apiKey' in p) || !String(p.apiKey).trim()) delete p.apiKey;
        if (await call(() => window.api.dcBotsSetAi(p), 'AI settings saved')) { aiDraft = {}; paint(); }
      } }, 'Save AI settings');
      const test = h('button', { class: 'btn ghost sm', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true;
        const r = await call(() => window.api.dcBotsAiTest()); b.disabled = false;
        if (r && r.text) toast('AI answered: ' + r.text, 'ok');
      } }, 'Test AI');
      return h('div', { class: 'setrow', style: 'gap:10px' }, h('b', {}, 'AI bot'),
        hint(ai ? 'Folosește `w help` pentru comenzi, `w play <link YouTube>` pentru muzică sau menționează ' + (ai.tag || ai.label || 'botul AI') + ' cu @ pentru conversație. Asistentul răspunde numai în română.' : 'Alege un cont cu „Make AI bot”. Apoi folosește `w help` ori menționează botul cu @ pentru conversație în română.'),
        h('div', { class: 'row2' }, sel([['anthropic', 'Claude (Anthropic)'], ['openai', 'OpenAI-compatible']], v('provider'), (x) => { d.provider = x; paint(); }), input('model', 'Model', { max: '80' })),
        v('provider') === 'openai' ? input('baseUrl', 'API address (empty = https://api.openai.com/v1)', { max: '200' }) : null,
        key,
        fallback,
        hint('Modelele de rezervă sunt încercate doar când API-ul raportează lipsă de credite/cotă.'), sys,
        h('div', { class: 'row2' },
          h('div', { class: 'setrow' }, h('small', { style: muted }, 'Earlier messages the AI reads (0-20)'), input('history', '8', { max: '2', type: 'number' })),
          h('div', { class: 'setrow' }, h('small', { style: muted }, 'Seconds between answers per person'), input('cooldown', '4', { max: '3', type: 'number' }))),
        h('label', { class: 'chk' }, dms, 'Also answer direct messages'),
        a.lastError ? h('small', { style: 'color:var(--red)' }, 'Last AI error: ' + a.lastError) : null,
        h('div', { class: 'sbtns' }, save, test),
        hint('Botul nu răspunde altor boți. Pentru comenzi cu prefix, activează „Message Content Intent” în Discord Developer Portal > Bot. Pentru muzică, invită botul cu permisiunile Connect și Speak.'));
    }

    function paint() {
      if (!data) return;
      sig = data.accounts.map((a) => a.id + a.isAi + a.enabled + a.status + a.activityType).join('|') + data.ai.hasKey + data.libOk;
      box.replaceChildren(...[
        !data.libOk ? h('small', { style: 'color:var(--red)' }, 'The Discord library is missing. Open a terminal in the Wella Hub folder, run "npm install", then restart the app.') : null,
        hint(data.accounts.length ? 'Accounts stay online while Wella Hub runs (also when the window is in the tray).' : 'No account yet. Add a bot below.'),
        ...data.accounts.map(row),
        h('div', { class: 'sep' }), addForm(), h('div', { class: 'sep' }), aiForm()].filter(Boolean));
    }

    // live status without redrawing the forms (so typing is never lost)
    function refreshLive() {
      for (const a of data.accounts) {
        const el = box.querySelector('.dcst[data-id="' + a.id + '"]'); if (!el) continue;
        const st = STATE[a.state] || STATE.offline; el.textContent = st[1]; el.style.color = st[0];
        const dot = el.parentNode.querySelector('.dcdot'); if (dot) dot.style.background = st[0];
      }
    }
    const poll = async () => {
      try {
        const r = await window.api.dcBotsGet(); const old = sig; data = r;
        const s2 = r.accounts.map((a) => a.id + a.isAi + a.enabled + a.status + a.activityType).join('|') + r.ai.hasKey + r.libOk;
        if (s2 !== old || !box.firstChild) paint(); else refreshLive();
      } catch {}
    };
    window.api.dcBotsGet().then((r) => { data = r; paint(); }).catch((e) => box.replaceChildren(hint(e.message || String(e))));
    const timer = setInterval(() => { if (!box.isConnected) { clearInterval(timer); return; } poll(); }, 3000);
    return [box];
  }

  window.WellaDcBots = { section };
})();
