(function () {
  const KEY = 'wella-theme';
  const BASE_HUE = 273; // hue of the purple in the logo; the logo is rotated from here to the accent hue
  const PINK_PAL = { bg0: '#070307', panel0: '#100810', panel20: '#170b17', line0: '#2e1229', line2: '#4a1b40', text: '#fff0f7', mut: '#b07a9c', chip: '#140a14', chip2: '#1b0d1b', chip3: '#221024', hover: '#150915', modal: '#0b050b', sec: '#0e060e', faint: '#5a2850' };
  const def = { mode: 'dark', accent: '#ff3d9a', tint: false, btn: '', start: '#3ddc97', stop: '#ff4d6d', fx: true, toastShape: 'pill',
    font: 'ui', radius: -1, scale: 100, glow: true, scan: false, nomo: false, compact: false, sfull: true, good: '', bad: '', warn: '', glowc: '', sel: '', scrollc: '', pal: PINK_PAL, preset: 'default' };
  const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '');
  const PAL_KEYS = ['bg0', 'panel0', 'panel20', 'line0', 'line2', 'text', 'mut', 'chip', 'chip2', 'chip3', 'hover', 'modal', 'sec', 'faint'];
  const FONTS = {
    ui: { name: 'Segoe UI (default)', css: '' },
    mono: { name: 'Terminal (monospace)', css: '"Cascadia Mono",Consolas,"Courier New",monospace' },
    serif: { name: 'Serif (Georgia)', css: 'Georgia,"Palatino Linotype",serif' },
    round: { name: 'Rounded (Trebuchet)', css: '"Trebuchet MS","Segoe UI",sans-serif' },
    gothic: { name: 'Gothic (Palatino)', css: '"Palatino Linotype","Book Antiqua",Palatino,serif' },
    impact: { name: 'Heavy (Impact)', css: 'Impact,"Arial Narrow Bold","Segoe UI",sans-serif' }
    ,arial: { name: 'Arial', css: 'Arial,Helvetica,sans-serif' }
    ,verdana: { name: 'Verdana', css: 'Verdana,Geneva,sans-serif' }
    ,tahoma: { name: 'Tahoma', css: 'Tahoma,Geneva,sans-serif' }
    ,times: { name: 'Times New Roman', css: '"Times New Roman",Times,serif' }
    ,courier: { name: 'Courier New', css: '"Courier New",Courier,monospace' }
    ,comic: { name: 'Comic Sans', css: '"Comic Sans MS",cursive,sans-serif' }
    // more fonts: shown only when they are installed on this PC (fam = the family that is checked)
    ,system: { name: 'System UI', css: 'system-ui,"Segoe UI",sans-serif', fam: 'system-ui', always: true }
    ,segvar: { name: 'Segoe UI Variable', css: '"Segoe UI Variable Text","Segoe UI",sans-serif', fam: 'Segoe UI Variable Text' }
    ,calibri: { name: 'Calibri', css: 'Calibri,"Segoe UI",sans-serif', fam: 'Calibri' }
    ,candara: { name: 'Candara', css: 'Candara,"Segoe UI",sans-serif', fam: 'Candara' }
    ,corbel: { name: 'Corbel', css: 'Corbel,"Segoe UI",sans-serif', fam: 'Corbel' }
    ,century: { name: 'Century Gothic', css: '"Century Gothic","Segoe UI",sans-serif', fam: 'Century Gothic' }
    ,franklin: { name: 'Franklin Gothic', css: '"Franklin Gothic Medium","Segoe UI",sans-serif', fam: 'Franklin Gothic Medium' }
    ,gill: { name: 'Gill Sans', css: '"Gill Sans MT","Gill Sans","Segoe UI",sans-serif', fam: 'Gill Sans MT' }
    ,lucida: { name: 'Lucida Sans', css: '"Lucida Sans Unicode","Lucida Grande","Segoe UI",sans-serif', fam: 'Lucida Sans Unicode' }
    ,bahn: { name: 'Bahnschrift', css: 'Bahnschrift,"Segoe UI",sans-serif', fam: 'Bahnschrift' }
    ,helv: { name: 'Helvetica Neue', css: '"Helvetica Neue",Helvetica,Arial,sans-serif', fam: 'Helvetica Neue' }
    ,cambria: { name: 'Cambria', css: 'Cambria,Georgia,serif', fam: 'Cambria' }
    ,constantia: { name: 'Constantia', css: 'Constantia,Georgia,serif', fam: 'Constantia' }
    ,garamond: { name: 'Garamond', css: 'Garamond,"Palatino Linotype",serif', fam: 'Garamond' }
    ,bookman: { name: 'Bookman Old Style', css: '"Bookman Old Style",Georgia,serif', fam: 'Bookman Old Style' }
    ,rockwell: { name: 'Rockwell', css: 'Rockwell,Georgia,serif', fam: 'Rockwell' }
    ,sylfaen: { name: 'Sylfaen', css: 'Sylfaen,Georgia,serif', fam: 'Sylfaen' }
    ,cascadia: { name: 'Cascadia Code', css: '"Cascadia Code","Cascadia Mono",Consolas,monospace', fam: 'Cascadia Code' }
    ,consolas: { name: 'Consolas', css: 'Consolas,"Courier New",monospace', fam: 'Consolas' }
    ,lucidacon: { name: 'Lucida Console', css: '"Lucida Console",Consolas,monospace', fam: 'Lucida Console' }
    ,segprint: { name: 'Segoe Print', css: '"Segoe Print","Comic Sans MS",cursive', fam: 'Segoe Print' }
    ,segscript: { name: 'Segoe Script', css: '"Segoe Script","Brush Script MT",cursive', fam: 'Segoe Script' }
    ,inkfree: { name: 'Ink Free', css: '"Ink Free","Segoe Print",cursive', fam: 'Ink Free' }
    ,brush: { name: 'Brush Script', css: '"Brush Script MT","Segoe Script",cursive', fam: 'Brush Script MT' }
    ,copper: { name: 'Copperplate Gothic', css: '"Copperplate Gothic Bold","Copperplate",fantasy', fam: 'Copperplate Gothic Bold' }
    ,papyrus: { name: 'Papyrus', css: 'Papyrus,fantasy', fam: 'Papyrus' }
    ,arialblack: { name: 'Arial Black', css: '"Arial Black","Arial Bold",sans-serif', fam: 'Arial Black' }
    ,haettenschweiler: { name: 'Haettenschweiler', css: 'Haettenschweiler,Impact,sans-serif', fam: 'Haettenschweiler' }
    ,stencil: { name: 'Stencil', css: 'Stencil,Impact,fantasy', fam: 'Stencil' }
    ,gabriola: { name: 'Gabriola', css: 'Gabriola,"Segoe Script",cursive', fam: 'Gabriola' }
  };
  // is this family installed? (a canvas measures a test text with the font and with 3 fallbacks: different width = the font exists)
  const probe = {};
  let cvx = null;
  function fontOk(id) {
    const f = FONTS[id]; if (!f) return false;
    if (!f.fam || f.always) return true;
    if (f.fam in probe) return probe[f.fam];
    let ok = true;
    try {
      cvx = cvx || document.createElement('canvas').getContext('2d');
      const txt = 'mmmmmmmmmmlliWwQq0123@#';
      ok = false;
      for (const base of ['monospace', 'serif', 'sans-serif']) {
        cvx.font = '64px ' + base; const w0 = cvx.measureText(txt).width;
        cvx.font = '64px "' + f.fam + '",' + base; if (cvx.measureText(txt).width !== w0) { ok = true; break; }
      }
    } catch { ok = true; }
    probe[f.fam] = ok; return ok;
  }

  // Ready-made themes for the gallery. "pal" repaints the neutral colours (backgrounds, panels, lines, text); "bg" picks a built-in background.
  const P = (o) => o;
  const PRESETS = [
    P({ id: 'default', name: 'Pink Noir (default)', note: 'Hot pink on black', theme: { mode: 'dark', accent: '#ff3d9a', btn: '', start: '#3ddc97', stop: '#ff4d6d', fx: true, font: 'ui', radius: -1, glow: true, scan: false, pal: PINK_PAL }, bg: { id: 'pink-grid', blur: 0, vis: 50, dim: 0, sat: 100, hue: 0, vig: 30, drift: false } }),
    P({ id: 'pinkopium', name: 'Pink Opium', note: 'Black with pink crosses', theme: { mode: 'dark', accent: '#ff3d9a', btn: '', start: '#ffd1e8', stop: '#ff4d6d', glow: true, scan: false, font: 'gothic', radius: 3, pal: PINK_PAL }, bg: { id: 'pink-opium', blur: 0, vis: 90, dim: 0, vig: 30 } }),
    P({ id: 'pinkritual', name: 'Pink Ritual', note: 'Pink pentagram in the dark', theme: { mode: 'dark', accent: '#ff2e93', btn: '', start: '#ffd1e8', stop: '#ff4d6d', glow: true, scan: false, font: 'gothic', radius: 3, pal: PINK_PAL }, bg: { id: 'pink-pent', blur: 0, vis: 90, dim: 0, vig: 40 } }),
    P({ id: 'pinkak', name: 'Pink Crossfire', note: 'Pink rifles and a cross', theme: { mode: 'dark', accent: '#ff3d9a', btn: '', start: '#ffd1e8', stop: '#ff4d6d', glow: true, scan: false, font: 'impact', radius: 2, pal: PINK_PAL }, bg: { id: 'pink-ak', blur: 0, vis: 88, dim: 0, vig: 35 } }),
    P({ id: 'kuromi', name: 'Kawaii Night', note: 'Black, pink cats and bows', theme: { mode: 'dark', accent: '#ff7ab8', btn: '', start: '#3ddc97', stop: '#ff4d6d', glow: true, scan: false, font: 'round', radius: 16, pal: PINK_PAL }, bg: { id: 'kawaii-night', blur: 0, vis: 80, dim: 0, vig: 30 } }),
    P({ id: 'classic', name: 'Classic purple', note: 'The old black + purple', theme: { mode: 'dark', accent: '#8b5cf6', tint: false, btn: '', start: '#22c55e', stop: '#ef4444', fx: true, font: 'ui', radius: -1, glow: false, scan: false, pal: null }, bg: { id: 'none', blur: 0, vis: 70, dim: 0, sat: 100, hue: 0, vig: 0, drift: false } }),
    P({ id: 'neon', name: 'Neon', note: 'Glowing magenta on deep violet', theme: { mode: 'dark', accent: '#ff2bd6', btn: '', start: '#00ffa3', stop: '#ff3366', glow: true, scan: false, font: 'round', radius: 14,
      pal: { bg0: '#05010d', panel0: '#0c0418', panel20: '#120622', line0: '#2a0f4a', line2: '#43177a', text: '#f4eaff', mut: '#9a7fc4', chip: '#140a26', chip2: '#1b0d33', chip3: '#22103f', hover: '#150a28', modal: '#0a0314', sec: '#0d0519', faint: '#4b2b7a' } }, bg: { id: 'purple-grid', blur: 0, vis: 60, dim: 10, vig: 40 } }),
    P({ id: 'amoled', name: 'AMOLED', note: 'True black, saves battery on OLED', theme: { mode: 'dark', accent: '#00d1ff', btn: '', start: '#2bd96b', stop: '#ff4d4d', glow: false, scan: false, font: 'ui', radius: 10,
      pal: { bg0: '#000000', panel0: '#050505', panel20: '#0a0a0a', line0: '#161616', line2: '#222222', text: '#f5f5f5', mut: '#7d7d7d', chip: '#0b0b0b', chip2: '#111111', chip3: '#151515', hover: '#0a0a0a', modal: '#030303', sec: '#070707', faint: '#2d2d2d' } }, bg: { id: 'none' } }),
    P({ id: 'retro', name: 'Retro CRT', note: 'Amber terminal with scanlines', theme: { mode: 'dark', accent: '#ffb000', btn: '', start: '#7dff4a', stop: '#ff5a3a', glow: true, scan: true, font: 'mono', radius: 2,
      pal: { bg0: '#0a0700', panel0: '#120d00', panel20: '#191200', line0: '#3a2a00', line2: '#5a4200', text: '#ffcf66', mut: '#a07a1a', chip: '#161000', chip2: '#1d1500', chip3: '#241a00', hover: '#140e00', modal: '#0e0a00', sec: '#100b00', faint: '#5a4200' } }, bg: { id: 'none' } }),
    P({ id: 'synth', name: 'Synthwave', note: '80s grid, pink and cyan', theme: { mode: 'dark', accent: '#ff3cac', btn: '', start: '#2de2e6', stop: '#ff4d6d', glow: true, scan: false, font: 'round', radius: 8,
      pal: { bg0: '#0d0221', panel0: '#150433', panel20: '#1c0745', line0: '#35106b', line2: '#4e1a96', text: '#fdeaff', mut: '#a58acb', chip: '#190540', chip2: '#210a52', chip3: '#2a0f63', hover: '#170438', modal: '#0f0328', sec: '#12042e', faint: '#54229d' } }, bg: { id: 'pink-grid', blur: 0, vis: 70, dim: 0, vig: 30 } }),
    P({ id: 'opium', name: 'Opium', note: 'Black, white crosses, chrome', theme: { mode: 'dark', accent: '#e8e8ee', btn: '', start: '#d9d9e0', stop: '#ff2a4a', glow: false, scan: false, font: 'gothic', radius: 3,
      pal: { bg0: '#030303', panel0: '#080808', panel20: '#0d0d0e', line0: '#1b1b1d', line2: '#2a2a2d', text: '#f2f2f4', mut: '#85858c', chip: '#0c0c0d', chip2: '#121214', chip3: '#17171a', hover: '#0b0b0c', modal: '#050505', sec: '#09090a', faint: '#38383d' } }, bg: { id: 'opium-void', blur: 0, vis: 85, dim: 0, vig: 30 } }),
    P({ id: 'ritual', name: 'Blood Ritual', note: 'Red pentagram in the dark', theme: { mode: 'dark', accent: '#e0102f', btn: '', start: '#e8e8ee', stop: '#ff2a4a', glow: true, scan: false, font: 'gothic', radius: 3,
      pal: { bg0: '#050102', panel0: '#0b0305', panel20: '#10050a', line0: '#2a0a12', line2: '#43101c', text: '#f6e8ea', mut: '#9a6a72', chip: '#0e0407', chip2: '#14060b', chip3: '#1a0810', hover: '#0c0306', modal: '#070204', sec: '#0a0305', faint: '#4a1722' } }, bg: { id: 'pent-void', blur: 0, vis: 90, dim: 0, vig: 40 } }),
    P({ id: 'ak', name: 'Crossfire', note: 'Crossed rifles and a red glow', theme: { mode: 'dark', accent: '#ff1133', btn: '', start: '#f2f2f6', stop: '#ff1133', glow: false, scan: false, font: 'impact', radius: 2,
      pal: { bg0: '#040404', panel0: '#0a0a0a', panel20: '#0f0f10', line0: '#1d1d1f', line2: '#2c2c2f', text: '#f4f4f6', mut: '#8a8a90', chip: '#0d0d0e', chip2: '#131315', chip3: '#18181a', hover: '#0c0c0d', modal: '#060606', sec: '#0a0a0b', faint: '#3a3a3f' } }, bg: { id: 'ak-crossfire', blur: 0, vis: 85, dim: 0, vig: 35 } }),
    P({ id: 'dracula', name: 'Dracula', note: 'The well-known purple dark theme', theme: { mode: 'dark', accent: '#bd93f9', btn: '', start: '#50fa7b', stop: '#ff5555', glow: false, scan: false, font: 'mono', radius: 8,
      pal: { bg0: '#1e1f29', panel0: '#282a36', panel20: '#303342', line0: '#3d4056', line2: '#4d516b', text: '#f8f8f2', mut: '#8e92b0', chip: '#2b2d3b', chip2: '#323547', chip3: '#393c50', hover: '#2a2c3a', modal: '#242632', sec: '#262833', faint: '#565a75' } }, bg: { id: 'none' } }),
    P({ id: 'terminal', name: 'Hacker', note: 'Green on black, digital rain', theme: { mode: 'dark', accent: '#22ff7a', btn: '', start: '#22ff7a', stop: '#ff4d4d', glow: true, scan: true, font: 'mono', radius: 0,
      pal: { bg0: '#010703', panel0: '#04100a', panel20: '#071710', line0: '#0f3a22', line2: '#165a34', text: '#b9ffd4', mut: '#4fa876', chip: '#06130c', chip2: '#091b11', chip3: '#0c2317', hover: '#05110a', modal: '#030c07', sec: '#04100a', faint: '#1c6b3d' } }, bg: { id: 'green-rain', blur: 0, vis: 55, dim: 25, vig: 40 } }),
    P({ id: 'ice', name: 'Ice', note: 'Cold blue and clean', theme: { mode: 'dark', accent: '#4cc2ff', btn: '', start: '#3ddc97', stop: '#ff6b6b', glow: false, scan: false, font: 'ui', radius: 12,
      pal: { bg0: '#050b14', panel0: '#0a1524', panel20: '#0e1c30', line0: '#16304f', line2: '#21457a', text: '#e9f4ff', mut: '#7f9bbd', chip: '#0c192b', chip2: '#112139', chip3: '#162a47', hover: '#0b1727', modal: '#07101c', sec: '#09131f', faint: '#2d5185' } }, bg: { id: 'blue-ocean', blur: 4, vis: 60, dim: 10, vig: 25 } }),
    P({ id: 'sakura', name: 'Sakura', note: 'Light and pink', theme: { mode: 'light', accent: '#ff4f93', btn: '', start: '#16a34a', stop: '#e11d48', glow: false, scan: false, font: 'round', radius: 16,
      pal: { bg0: '#fff0f6', panel0: '#ffffff', panel20: '#ffe4ef', line0: '#f6cfe0', line2: '#eeb2cd', text: '#3a1426', mut: '#9a6580', chip: '#ffe9f2', chip2: '#ffdceb', chip3: '#ffd0e4', hover: '#fff4f9', modal: '#ffffff', sec: '#fff6fa', faint: '#e3a9c3' } }, bg: { id: 'kawaii-dots', blur: 0, vis: 45, dim: 0, vig: 0 } })
  ];

  function read() {
    try {
      const raw = localStorage.getItem(KEY); if (raw === null) return { ...def };
      const o = JSON.parse(raw || '{}');
      return { ...def, ...(('pal' in o) ? {} : { pal: null, glow: false, preset: '' }), ...o };      // a theme saved before palettes existed keeps its old look
    } catch { return { ...def }; }
  }
  function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function onColor(hex) { const [r, g, b] = rgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#000' : '#fff'; }
  function hueOf(hex) {
    const [r, g, b] = rgb(hex).map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return BASE_HUE;
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (h * 60 + 360) % 360;
  }
  // The emblem is purple. It is turned grey, tinted with sepia and rotated to the accent hue, so it follows ANY colour (pink, white, grey...).
  function logoFilter(hex) {
    const [r, g, b] = rgb(hex).map((x) => x / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
    const s = d ? d / (1 - Math.abs(2 * l - 1) || 1) : 0;
    if (s < 0.12) return `grayscale(1) brightness(${(0.45 + l * 1.25).toFixed(2)}) contrast(1.05)`;
    return `grayscale(1) sepia(1) hue-rotate(${Math.round(hueOf(hex) - 38)}deg) saturate(${(1.6 + s * 3.2).toFixed(2)}) brightness(${(0.8 + l * 0.55).toFixed(2)})`;
  }
  function apply(t) {
    const el = document.documentElement, s = el.style;
    const accent = isHex(t.accent) ? t.accent : def.accent;
    const btn = isHex(t.btn) ? t.btn : accent;           // empty = follow the accent
    const start = isHex(t.start) ? t.start : def.start;
    const stop = isHex(t.stop) ? t.stop : def.stop;
    el.dataset.theme = t.mode === 'light' ? 'light' : 'dark';
    el.dataset.toast = ['pill', 'round', 'soft', 'square', 'oval'].includes(t.toastShape) ? t.toastShape : 'pill';
    s.setProperty('--red', accent);   s.setProperty('--onred', onColor(accent));
    s.setProperty('--btn', btn);      s.setProperty('--onbtn', onColor(btn));
    s.setProperty('--start', start);  s.setProperty('--onstart', onColor(start));
    s.setProperty('--stop', stop);    s.setProperty('--onstop', onColor(stop));
    for (const [k, v] of [['good', '--green'], ['bad', '--bad'], ['warn', '--warn'], ['glowc', '--glowc'], ['sel', '--sel'], ['scrollc', '--scroll']]) { if (isHex(t[k])) s.setProperty(v, t[k]); else s.removeProperty(v); }   // extra colours: empty = the normal one
    s.setProperty('--logo-filter', logoFilter(accent));
    s.setProperty('--logo-hue', ((hueOf(accent) - BASE_HUE + 360) % 360) + 'deg');
    el.classList.toggle('tint', !!t.tint);
    el.classList.toggle('nofx', t.fx === false);
    // neutral colours: a palette repaints them, no palette = the plain black / white of the mode
    const pal = t.pal && typeof t.pal === 'object' ? t.pal : null;
    for (const k of PAL_KEYS) { if (pal && isHex(pal[k])) s.setProperty('--' + k, pal[k]); else s.removeProperty('--' + k); }
    // type, shape, size, effects
    const f = FONTS[t.font] || FONTS.ui;
    if (f.css) { s.setProperty('--font', f.css); el.dataset.font = t.font; } else { s.removeProperty('--font'); delete el.dataset.font; }
    const rad = Number(t.radius);
    if (Number.isFinite(rad) && rad >= 0) { s.setProperty('--rad', Math.min(30, rad) + 'px'); el.classList.add('radc'); } else { s.removeProperty('--rad'); el.classList.remove('radc'); }
    const sc = Number(t.scale);
    s.zoom = Number.isFinite(sc) && sc >= 80 && sc <= 130 && sc !== 100 ? String(sc / 100) : '';
    s.setProperty('--z', s.zoom || '1');                            // so full-window things can divide the zoom out (100vw / --z)
    el.classList.toggle('glow', !!t.glow);
    el.classList.toggle('scan', !!t.scan);
    el.classList.toggle('nomo', !!t.nomo);
    el.classList.toggle('compact', !!t.compact);
    el.classList.toggle('sfull', t.sfull !== false);          // the Settings window fills the whole app window
  }
  let cur = read(), pushT = null;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {} };
  const push = () => { // Admin Panel appearance is local-only and must not alter the regular user app.
    if (window.__WELLA_WEB && document.body && document.body.classList.contains('admin-panel')) return;
    clearTimeout(pushT);
    pushT = setTimeout(() => { try { if (window.api && window.api.setTheme) window.api.setTheme(cur); } catch {} }, 250);
  };
  apply(cur);
  window.WellaTheme = {
    defaults: { ...def },
    fonts: FONTS,
    fontOk,
    presets: PRESETS,
    get: () => ({ ...cur }),
    set(patch) { cur = { ...cur, ...patch }; apply(cur); save(); push(); },
    // a gallery theme: colours, fonts, shape and effects + its background
    preset(id) {
      const p = PRESETS.find((x) => x.id === id); if (!p) return false;
      cur = { ...def, tint: false, toastShape: cur.toastShape, scale: cur.scale, nomo: cur.nomo, compact: cur.compact, sfull: cur.sfull, ...p.theme, preset: id };
      apply(cur); save(); push();
      try { if (window.WellaBg && p.bg) window.WellaBg.set({ ...(window.WellaBg.defaults || {}), ...p.bg }); } catch {}
      return true;
    },
    load(t) { cur = { ...def, ...t }; apply(cur); save(); }   // theme coming from the PC: apply, do not send it back
  };
})();
