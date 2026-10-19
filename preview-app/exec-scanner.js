// Admin-only executable scanner UI. Results are loaded from a persistent local cache;
// a full scan runs only when no cache exists or when the administrator presses Rescan.
(function () {
  const esc = (s) => String(s == null ? '' : s);
  function make(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  async function show() {
    const host = document.getElementById('execScannerMain');
    if (!host) return;
    const admin = window.__WELLA_WEB && await window.api.remoteIsAdmin().catch(() => false);
    if (!admin) {
      host.replaceChildren(make('div', 'empty', 'Executable Scanner is available only in the Web Admin Panel.'));
      return;
    }
    host.replaceChildren();
    const wrap = make('div', 'execscan');
    const head = make('div', 'execscan-head');
    const titleBox = make('div');
    titleBox.append(make('h1', '', 'Executable Scanner'), make('p', 'execscan-muted', 'Cached scan of executable files across available drives. Starting and stopping processes requires care.'));
    const actions = make('div', 'execscan-actions');
    const scanBtn = make('button', 'btn ghost', 'Scan entire PC');
    const refreshBtn = make('button', 'btn ghost', 'Refresh status');
    actions.append(scanBtn, refreshBtn); head.append(titleBox, actions);
    const status = make('div', 'execscan-status', 'Loading saved scan…');
    const search = make('input', 'in'); search.type = 'search'; search.placeholder = 'Filter by file name or path…';
    const list = make('div', 'execscan-list');
    wrap.append(head, status, search, list); host.append(wrap);
    let data = { files: [], scannedAt: null, cached: false };
    let busy = false;
    const load = async (rescan) => {
      if (busy) return;
      busy = true; scanBtn.disabled = refreshBtn.disabled = true;
      status.textContent = rescan ? 'Scanning available drives. This may take a while…' : 'Loading cached scan…';
      try {
        data = rescan ? await window.api.execScanRun(true) : await window.api.execScanGet();
        if (data && data.error) throw new Error(data.error);
        if (data && data.scanning) { status.textContent = 'A scan is already running. Refresh in a moment.'; }
        else render();
      } catch (e) { status.textContent = e.message || 'Could not load scanner data.'; }
      finally { busy = false; scanBtn.disabled = refreshBtn.disabled = false; }
    };
    const render = () => {
      const files = Array.isArray(data.files) ? data.files : [];
      const q = search.value.trim().toLowerCase();
      const filtered = files.filter((x) => !q || String(x.path).toLowerCase().includes(q) || String(x.name).toLowerCase().includes(q));
      const when = data.scannedAt ? new Date(data.scannedAt).toLocaleString() : 'Never';
      status.textContent = `${files.length.toLocaleString()} executables cached · Last full scan: ${when}${data.truncated ? ' · Limit reached; some files may not be listed.' : ''}`;
      list.replaceChildren();
      if (!filtered.length) { list.append(make('div', 'empty', files.length ? 'No matching executables.' : 'No saved scan yet. Press Scan entire PC to create one.')); return; }
      const fragment = document.createDocumentFragment();
      for (const item of filtered.slice(0, 1500)) {
        const row = make('div', 'execscan-row');
        const details = make('div', 'execscan-file');
        details.append(make('strong', '', item.name || item.path.split(/[\\/]/).pop()), make('small', 'execscan-muted', item.path));
        const state = make('span', 'execscan-state ' + (item.running ? 'is-running' : 'is-stopped'), item.running ? `Running · ${item.pids?.join(', ') || 'PID found'}` : 'Stopped');
        const controls = make('div', 'execscan-controls');
        const start = make('button', 'btn start sm', 'Start'); start.disabled = !!item.running;
        const stop = make('button', 'btn danger sm', 'Stop'); stop.disabled = !item.running;
        start.addEventListener('click', async () => {
          if (!confirm(`Start this executable?\n\n${item.path}`)) return;
          start.disabled = true;
          try { const r = await window.api.execScanStart(item.path); if (r && r.error) alert(r.error); await load(false); }
          catch (e) { alert(e.message || 'Could not start executable.'); }
          finally { start.disabled = false; }
        });
        stop.addEventListener('click', async () => {
          if (!confirm(`Stop every running process whose executable path exactly matches this file?\n\n${item.path}`)) return;
          stop.disabled = true;
          try { const r = await window.api.execScanStop(item.path); if (r && r.error) alert(r.error); await load(false); }
          catch (e) { alert(e.message || 'Could not stop executable.'); }
          finally { stop.disabled = false; }
        });
        controls.append(start, stop); row.append(details, state, controls); fragment.append(row);
      }
      if (filtered.length > 1500) fragment.append(make('div', 'execscan-muted', `Showing first 1,500 of ${filtered.length.toLocaleString()} matching files. Use search to narrow the list.`));
      list.append(fragment);
    };
    search.addEventListener('input', render);
    scanBtn.addEventListener('click', () => load(true));
    refreshBtn.addEventListener('click', () => load(false));
    await load(false);
    // If there is no cache, perform the first full scan automatically once. The cache prevents rescans on later visits.
    if (!data.scannedAt && !data.scanning) await load(true);
  }
  window.ExecScanner = { show };
})();
