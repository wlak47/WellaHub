// Backgrounds: built-in ones (generated as SVG, no image files needed) + your own picture.
// Blur, visibility, darkness, saturation, colour shift, zoom, fit, slow drift and vignette apply to both. Saved in this browser/app only.
(function () {
  'use strict';
  const KEY = 'wella-bg', CKEY = 'wella-bg-custom';
  const W = 1600, H = 900;
  const def = { id: 'none', blur: 0, vis: 70, dim: 0, sat: 100, hue: 0, zoom: 100, fit: 'cover', pos: 'center', drift: false, vig: 0 };

  // ---------- tiny helpers ----------
  const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const svg = (inner, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${inner}</svg>`;
  const rect = (fill, extra = '') => `<rect width="${W}" height="${H}" fill="${fill}" ${extra}/>`;
  const lin = (id, c1, c2, c3, x2 = 1, y2 = 1) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${c1}"/>${c3 ? `<stop offset=".5" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/>` : `<stop offset="1" stop-color="${c2}"/>`}</linearGradient>`;
  const rad = (id, c, a0 = 1, a1 = 0) => `<radialGradient id="${id}"><stop offset="0" stop-color="${c}" stop-opacity="${a0}"/><stop offset="1" stop-color="${c}" stop-opacity="${a1}"/></radialGradient>`;
  const vignette = (a = 0.85) => `<radialGradient id="vg" cx=".5" cy=".5" r=".75"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${a}"/></radialGradient>`;
  const vig = (a) => ({ d: vignette(a), b: `<rect width="${W}" height="${H}" fill="url(#vg)"/>` });
  const grainDef = '<filter id="gr" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -.35"/></filter>';
  const grain = (o) => `<rect width="${W}" height="${H}" filter="url(#gr)" opacity="${o}"/>`;
  const smokeDef = (id, r, g, b, seed, fx = '.005 .011') => `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${fx}" numOctaves="4" seed="${seed}"/><feColorMatrix values="0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 1.9 -.78"/></filter>`;
  const blurDef = (id, n) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n}"/></filter>`;
  const CROSS = 'M-3-16h6v8h7v6h-7v22h-6v-22h-7v-6h7z';
  const HEART = 'M0 5C-15-6-9-17 0-9C9-17 15-6 0 5z';
  const SPARK = 'M0-14C1-4 4-1 14 0C4 1 1 4 0 14C-1 4-4 1-14 0C-4-1-1-4 0-14z';
  const BOW = 'M0 0C-10-9-20-7-20 0C-20 7-10 9 0 0C10 9 20 7 20 0C20-7 10-9 0 0z';
  const CAT = 'M-22 14C-26 2-24-12-20-22L-8-12C-3-14 3-14 8-12L20-22C24-12 26 2 22 14C16 24-16 24-22 14z';
  const stars = (r, n, col = '#fff', maxO = 0.7) => { let s = ''; for (let i = 0; i < n; i++) s += `<circle cx="${(r() * W) | 0}" cy="${(r() * H) | 0}" r="${(0.5 + r() * 1.5).toFixed(1)}" fill="${col}" opacity="${(0.15 + r() * maxO).toFixed(2)}"/>`; return s; };
  const scatter = (r, n, path, cols, smin, smax, omin, omax, rot = true) => { let s = ''; for (let i = 0; i < n; i++) { const sc = smin + r() * (smax - smin); s += `<path d="${path}" transform="translate(${(r() * W) | 0} ${(r() * H) | 0}) rotate(${rot ? ((r() * 360) | 0) : 0}) scale(${sc.toFixed(2)})" fill="${cols[(r() * cols.length) | 0]}" opacity="${(omin + r() * (omax - omin)).toFixed(2)}"/>`; } return s; };
  const grid = (col, o, horizon = 430) => {
    let s = `<g stroke="${col}" stroke-width="1.6" opacity="${o}" fill="none">`;
    for (let i = 0; i <= 18; i++) { const y = horizon + Math.pow(i / 18, 2.1) * (H - horizon); s += `<path d="M0 ${y.toFixed(1)}H${W}"/>`; }
    for (let i = -14; i <= 14; i++) s += `<path d="M${W / 2 + i * 22} ${horizon}L${W / 2 + i * 150} ${H}"/>`;
    return s + '</g>';
  };

  // ---------- the 25 backgrounds ----------
  const L = [];
  const add = (id, name, group, fn) => L.push({ id, name, group, fn });

  // BLACK / OPIUM style (8)
  add('opium-void', 'Opium Void', 'Black', () => { const r = rng(11), v = vig(0.9); let c = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) c += `<path d="${CROSS}" transform="translate(${x * 120 + (y % 2 ? 60 : 0) + 20} ${y * 125 + 60}) scale(1.15)" fill="#fff" opacity="${(0.07 + r() * 0.16).toFixed(3)}"/>`; return svg(rect('#050505') + c + v.b + grain(0.1), v.d + grainDef); });
  add('opium-thorn', 'Thorn Chrome', 'Black', () => { const r = rng(23), v = vig(0.8); let p = ''; for (let i = 0; i < 12; i++) { const y = 40 + i * 75 + r() * 30, a = 60 + r() * 120; const d = `M-50 ${y} C ${300} ${y - a} ${700} ${y + a} ${1000} ${y - a / 2} S ${1500} ${y + a / 2} 1700 ${y}`; p += `<path d="${d}" fill="none" stroke="#cfd4dc" stroke-opacity=".38" stroke-width="1.6"/><path d="${d}" fill="none" stroke="#cfd4dc" stroke-opacity=".34" stroke-width="10" stroke-dasharray="1.6 17"/>`; } return svg(rect('url(#bgl)') + p + v.b + grain(0.09), lin('bgl', '#0c0c10', '#000') + v.d + grainDef); });
  add('opium-static', 'Ash Static', 'Black', () => svg(rect('#060606') + `<ellipse cx="800" cy="980" rx="900" ry="360" fill="url(#rg)"/>` + (() => { let s = ''; for (let y = 0; y < H; y += 4) s += `<rect y="${y}" width="${W}" height="1" fill="#fff" opacity=".022"/>`; return s; })() + grain(0.3), rad('rg', '#ff1133', 0.22, 0) + grainDef));
  add('opium-spikes', 'Gothic Spikes', 'Black', () => { const r = rng(5), v = vig(0.7); const layer = (base, hmin, hmax, fill, o) => { let pts = `0,${H} `; let x = 0; while (x < W + 60) { const w = 26 + r() * 30, hh = hmin + r() * (hmax - hmin); pts += `${x},${base} ${x + w / 2},${base - hh} ${x + w},${base} `; x += w; } return `<polygon points="${pts}${W + 80},${H}" fill="${fill}" opacity="${o}"/>`; }; return svg(rect('url(#bgl)') + `<circle cx="1180" cy="230" r="70" fill="#fff" opacity=".08"/>` + layer(900, 120, 420, '#171717', 1) + layer(900, 60, 240, '#0b0b0b', 1) + layer(900, 20, 90, '#000', 1) + v.b + grain(0.08), lin('bgl', '#000', '#1a1a1d', null, 0, 1) + v.d + grainDef); });
  add('opium-moon', 'Blood Moon Black', 'Black', () => { const r = rng(9), v = vig(0.85); return svg(rect('#030303') + `<circle cx="1160" cy="340" r="340" fill="url(#rg)"/><circle cx="1160" cy="340" r="150" fill="#7d0018" opacity=".9" filter="url(#bl)"/><circle cx="1160" cy="340" r="120" fill="#b0002a" opacity=".55" filter="url(#bl)"/>` + stars(r, 120, '#fff', 0.5) + v.b + grain(0.12), rad('rg', '#ff0033', 0.35, 0) + blurDef('bl', 10) + v.d + grainDef); });
  add('opium-crossfire', 'Crossfire', 'Black', () => { const r = rng(31), v = vig(0.85); let sc = ''; for (let i = 0; i < 30; i++) { const x = (r() * W) | 0, y = (r() * H) | 0, l = 60 + r() * 220; sc += `<path d="M${x} ${y}l${l} ${(l * 0.35) | 0}" stroke="#fff" stroke-opacity="${(0.03 + r() * 0.06).toFixed(3)}" stroke-width="${(0.6 + r()).toFixed(1)}"/>`; } return svg(rect('#040404') + scatter(r, 46, CROSS, ['#fff', '#fff', '#fff'], 0.5, 2.6, 0.03, 0.15) + scatter(r, 9, CROSS, ['#ff1133'], 0.6, 2.2, 0.15, 0.4) + sc + v.b + grain(0.1), v.d + grainDef); });
  add('opium-cathedral', 'Cathedral', 'Black', () => { const v = vig(0.85); let a = ''; for (let i = 0; i < 7; i++) { const x = i * 250 - 40, w = 210; for (let k = 0; k < 3; k++) { const m = k * 22; a += `<path d="M${x + m} 900V${420 + m}Q${x + m} ${250 + m} ${x + w / 2} ${170 + m * 0.6}Q${x + w - m} ${250 + m} ${x + w - m} ${420 + m}V900" fill="none" stroke="#fff" stroke-opacity="${0.3 - k * 0.08}" stroke-width="2"/>`; } } return svg(rect('url(#bgl)') + a + v.b + grain(0.08), lin('bgl', '#08080a', '#000', null, 0, 1) + v.d + grainDef); });
  add('opium-smoke', 'Black Smoke', 'Black', () => svg(rect('#030303') + `<rect width="${W}" height="${H}" filter="url(#sm)" opacity=".38"/>` + grain(0.1), smokeDef('sm', 0.5, 0.5, 0.55, 4) + grainDef));

  // RED (2)
  add('red-crimson', 'Crimson Fade', 'Red', () => svg(rect('url(#bgl)') + `<ellipse cx="1250" cy="200" rx="600" ry="380" fill="url(#rg)"/>` + grain(0.12), lin('bgl', '#14000a', '#7a0a1c', '#0a0003') + rad('rg', '#ff2a4a', 0.35, 0) + grainDef));
  add('red-smoke', 'Red Smoke', 'Red', () => svg(rect('#0a0002') + `<rect width="${W}" height="${H}" filter="url(#sm)" opacity=".75"/>` + grain(0.1), smokeDef('sm', 1, 0.1, 0.2, 12) + grainDef));

  // PINK (4)
  add('pink-haze', 'Pink Haze', 'Pink', () => svg(rect('url(#bgl)') + `<circle cx="300" cy="200" r="320" fill="#fff" opacity=".28" filter="url(#bl)"/><circle cx="1300" cy="700" r="380" fill="#ff2e93" opacity=".38" filter="url(#bl)"/><circle cx="900" cy="300" r="220" fill="#ffd1e8" opacity=".3" filter="url(#bl)"/>`, lin('bgl', '#ffb0d3', '#ff6aa9', '#b83a78') + blurDef('bl', 90)));
  add('pink-hearts', 'Pink Hearts', 'Pink', () => { const r = rng(77); return svg(rect('#ffc2dc') + scatter(r, 70, HEART, ['#ff6aa9', '#ff9ec8', '#fff', '#e23b86'], 0.9, 3.2, 0.35, 0.8), ''); });
  add('pink-grid', 'Pink Neon Grid', 'Pink', () => svg(rect('url(#bgl)') + `<g filter="url(#bl)">${grid('#ff3d9a', 0.9)}</g>` + grid('#ff8cc4', 0.7) + `<circle cx="800" cy="430" r="150" fill="#ff3d9a" opacity=".5" filter="url(#bl2)"/>`, lin('bgl', '#12020c', '#2a0620', null, 0, 1) + blurDef('bl', 4) + blurDef('bl2', 40)));
  add('pink-sparkle', 'Sparkle Night', 'Pink', () => { const r = rng(41); return svg(rect('url(#bgl)') + scatter(r, 60, SPARK, ['#ff7ab8', '#fff', '#ffc2dc'], 0.3, 1.4, 0.25, 0.9, false) + stars(r, 120, '#ffc2dc', 0.5), lin('bgl', '#1b0614', '#3a0c2c', null, 0, 1)); });

  // KAWAII CATS (3) - original cat silhouettes, bows and dots
  add('kawaii-cats', 'Kawaii Cats', 'Kawaii', () => { const r = rng(3); return svg(rect('#ffc4dd') + scatter(r, 40, CAT, ['#fff'], 1, 2.6, 0.35, 0.6, false).replace(/rotate\(\d+\)/g, (m) => `rotate(${((r() * 40) | 0) - 20})`) + scatter(r, 36, BOW, ['#ff4f93', '#e2206f'], 0.6, 1.3, 0.55, 0.9) + scatter(r, 40, HEART, ['#fff'], 0.5, 1.1, 0.5, 0.9), ''); });
  add('kawaii-night', 'Kawaii Night', 'Kawaii', () => { const r = rng(14); return svg(rect('url(#bgl)') + scatter(r, 34, CAT, ['#ff7ab8'], 1, 2.5, 0.12, 0.28, false) + scatter(r, 30, BOW, ['#ff7ab8', '#fff'], 0.5, 1.1, 0.25, 0.6) + stars(r, 90, '#ffd1e8', 0.7), lin('bgl', '#2c0b22', '#4a1236', null, 0, 1)); });
  add('kawaii-dots', 'Bows & Dots', 'Kawaii', () => { const r = rng(21); let d = ''; for (let y = 0; y < 12; y++) for (let x = 0; x < 20; x++) d += `<circle cx="${x * 90 + (y % 2 ? 45 : 0)}" cy="${y * 80}" r="9" fill="#fff" opacity=".42"/>`; return svg(rect('#ff9fc9') + d + scatter(r, 26, BOW, ['#d6246f', '#fff'], 1, 2, 0.7, 0.95, false), ''); });

  // PURPLE (4)
  add('purple-nebula', 'Violet Nebula', 'Purple', () => { const r = rng(8); return svg(rect('#06020e') + `<circle cx="450" cy="330" r="360" fill="#7c3aed" opacity=".5" filter="url(#bl)"/><circle cx="1150" cy="560" r="400" fill="#c026d3" opacity=".38" filter="url(#bl)"/><circle cx="800" cy="820" r="300" fill="#4c1d95" opacity=".5" filter="url(#bl)"/>` + stars(r, 150, '#fff', 0.7), blurDef('bl', 110)); });
  add('purple-grid', 'Purple Neon Grid', 'Purple', () => svg(rect('url(#bgl)') + `<g filter="url(#bl)">${grid('#a855f7', 0.9)}</g>` + grid('#d8b4fe', 0.65) + `<circle cx="800" cy="430" r="160" fill="#a855f7" opacity=".5" filter="url(#bl2)"/>`, lin('bgl', '#07020f', '#1a0638', null, 0, 1) + blurDef('bl', 4) + blurDef('bl2', 40)));
  add('purple-smoke', 'Purple Smoke', 'Purple', () => svg(rect('#06020c') + `<rect width="${W}" height="${H}" filter="url(#sm)" opacity=".75"/>` + grain(0.1), smokeDef('sm', 0.62, 0.25, 1, 19) + grainDef));
  add('purple-opium', 'Purple Opium', 'Purple', () => { const r = rng(52), v = vig(0.9); return svg(rect('#07030d') + scatter(r, 50, CROSS, ['#c4a1ff', '#9d5cff'], 0.5, 2.4, 0.05, 0.22) + `<circle cx="1180" cy="300" r="260" fill="url(#rg)"/>` + v.b + grain(0.12), rad('rg', '#8b2cff', 0.3, 0) + v.d + grainDef); });

  // GREEN (2)
  add('green-toxic', 'Toxic Glow', 'Green', () => svg(rect('#020a05') + `<ellipse cx="800" cy="900" rx="950" ry="420" fill="url(#rg)"/><ellipse cx="260" cy="120" rx="420" ry="260" fill="url(#rg2)"/>` + grain(0.14), rad('rg', '#22ff7a', 0.38, 0) + rad('rg2', '#12b85a', 0.28, 0) + grainDef));
  add('green-rain', 'Digital Rain', 'Green', () => { const r = rng(66); let s = ''; for (let x = 0; x < W; x += 22) { const len = 5 + ((r() * 18) | 0), y0 = (r() * H) | 0; for (let i = 0; i < len; i++) s += `<rect x="${x}" y="${(y0 + i * 17) % H}" width="9" height="12" rx="2" fill="#22ff7a" opacity="${(0.05 + (i / len) * 0.4).toFixed(2)}"/>`; } return svg(rect('#010703') + s, ''); });

  // BLUE (2)
  add('blue-ocean', 'Deep Ocean', 'Blue', () => svg(rect('url(#bgl)') + `<circle cx="1200" cy="250" r="360" fill="#3b82f6" opacity=".33" filter="url(#bl)"/><circle cx="350" cy="700" r="330" fill="#1d4ed8" opacity=".42" filter="url(#bl)"/>`, lin('bgl', '#010a1e', '#0a3a7a', '#010510') + blurDef('bl', 100)));
  add('blue-night', 'Midnight Stars', 'Blue', () => { const r = rng(90); return svg(rect('url(#bgl)') + `<ellipse cx="800" cy="900" rx="900" ry="300" fill="url(#rg)"/>` + stars(r, 220, '#cfe3ff', 0.8), lin('bgl', '#02040d', '#071733', null, 0, 1) + rad('rg', '#2f7bff', 0.3, 0)); });

  // ---------- extra shapes: pentagram + AK-47 silhouette (original drawings) ----------
  const PENT = 'M0-20L11.76 16.18L-19.02-6.18L19.02-6.18L-11.76 16.18Z';                                        // 5-point star, radius 20
  const RING = 'M0-23A23 23 0 1 1 0 23A23 23 0 1 1 0-23Z';                                                       // circle around it
  const AK = 'M0 20L8 16L44 22V34L10 40L0 36ZM44 20H100V35H44ZM46 20Q72 11 100 18V21H46ZM52 34H62L58 56H48ZM78 34H92Q100 52 112 66L100 68Q86 52 78 34ZM100 22H148V34H100ZM100 16H152V21H100ZM148 25H192V29H148ZM151 12H157V25H151ZM178 19H190V26H178ZM191 23H200V31H191ZM95 12H106V17H95Z';
  const pent = (cx, cy, s, rot, col, o, ring) => `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${s})" opacity="${o}"><path d="${PENT}" fill="none" stroke="${col}" stroke-width="${(1.6 / s * (s > 4 ? 2.4 : 1)).toFixed(2)}" stroke-linejoin="round"/>${ring === false ? '' : `<path d="${RING}" fill="none" stroke="${col}" stroke-width="${(1.2 / s * (s > 4 ? 2 : 1)).toFixed(2)}"/>`}</g>`;
  const ak = (cx, cy, s, rot, col, o, flip) => `<g transform="translate(${cx} ${cy}) rotate(${rot}) scale(${flip ? -s : s} ${s}) translate(-100 -34)" fill="${col}" opacity="${o}"><path d="${AK}"/></g>`;
  const runes = (r, n, col) => { let s = ''; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x1 = 800 + Math.cos(a) * 292, y1 = 450 + Math.sin(a) * 292, x2 = 800 + Math.cos(a) * (310 + r() * 20), y2 = 450 + Math.sin(a) * (310 + r() * 20); s += `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)}L${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="${col}" stroke-opacity=".5" stroke-width="2"/>`; } return s; };
  const chrome = (id) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#8a8f99"/><stop offset=".55" stop-color="#2a2d33"/><stop offset="1" stop-color="#d9dde4"/></linearGradient>`;

  // OPIUM+ (crosses)
  add('opium-rain', 'Cross Rain', 'Opium', () => { const r = rng(101), v = vig(0.85); let s = ''; for (let i = 0; i < 70; i++) { const x = (r() * W) | 0, y = (r() * H) | 0, sc = 0.5 + r() * 1.8, o = 0.08 + r() * 0.3; s += `<path d="M${x} ${y - 140 * sc}V${y - 14 * sc}" stroke="#fff" stroke-opacity="${(o * 0.35).toFixed(2)}" stroke-width="1.2"/><path d="${CROSS}" transform="translate(${x} ${y}) scale(${sc.toFixed(2)})" fill="#fff" opacity="${o.toFixed(2)}"/>`; } return svg(rect('#030303') + s + v.b + grain(0.12), v.d + grainDef); });
  add('opium-chrome', 'Chrome Crosses', 'Opium', () => { const r = rng(102), v = vig(0.8); let s = ''; for (let i = 0; i < 14; i++) s += `<path d="${CROSS}" transform="translate(${(r() * W) | 0} ${(r() * H) | 0}) rotate(${((r() * 50) | 0) - 25}) scale(${(2.2 + r() * 4).toFixed(2)})" fill="url(#ch)" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`; return svg(rect('#050506') + s + v.b + grain(0.1), chrome('ch') + v.d + grainDef); });
  add('opium-giant', 'Giant Cross', 'Opium', () => { const r = rng(103), v = vig(0.9); let rays = ''; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; rays += `<path d="M800 380L${(800 + Math.cos(a) * 1400).toFixed(0)} ${(380 + Math.sin(a) * 1400).toFixed(0)}" stroke="#fff" stroke-opacity=".035" stroke-width="22"/>`; } return svg(rect('#030303') + rays + `<path d="${CROSS}" transform="translate(800 400) scale(15)" fill="#000" stroke="#fff" stroke-opacity=".5" stroke-width=".35"/>` + stars(r, 60, '#fff', 0.35) + v.b + grain(0.1), v.d + grainDef); });
  add('opium-red', 'Red Crosses', 'Opium', () => { const r = rng(104), v = vig(0.88); let c = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) c += `<path d="${CROSS}" transform="translate(${x * 120 + (y % 2 ? 60 : 0) + 20} ${y * 125 + 60}) scale(1.15)" fill="#ff1133" opacity="${(0.06 + r() * 0.3).toFixed(3)}"/>`; return svg(rect('#060102') + `<ellipse cx="800" cy="450" rx="700" ry="400" fill="url(#rg)"/>` + c + v.b + grain(0.12), rad('rg', '#8a0016', 0.45, 0) + v.d + grainDef); });
  add('opium-rosary', 'Rosary', 'Opium', () => { const r = rng(105), v = vig(0.85); let b = ''; for (let k = 0; k < 3; k++) { const y0 = 140 + k * 260; for (let i = 0; i <= 40; i++) { const t = i / 40, x = -40 + t * (W + 80), y = y0 + Math.sin(t * Math.PI * 2 + k) * 70; b += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${i % 5 === 0 ? 9 : 5}" fill="#cfd4dc" opacity="${i % 5 === 0 ? 0.55 : 0.28}"/>`; } } return svg(rect('#040405') + b + scatter(r, 18, CROSS, ['#fff'], 1.2, 2.4, 0.18, 0.5) + v.b + grain(0.1), v.d + grainDef); });
  add('opium-wings', 'Dark Halo', 'Opium', () => { const r = rng(106), v = vig(0.9); return svg(rect('#020202') + `<circle cx="800" cy="300" r="190" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/><circle cx="800" cy="300" r="230" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="14"/>` + `<path d="${CROSS}" transform="translate(800 300) scale(5)" fill="#fff" opacity=".7"/>` + scatter(r, 50, CROSS, ['#fff'], 0.4, 1.6, 0.04, 0.16) + `<rect width="${W}" height="${H}" filter="url(#sm)" opacity=".25"/>` + v.b + grain(0.12), smokeDef('sm', 0.55, 0.55, 0.6, 7) + v.d + grainDef); });

  // PENTAGRAM
  add('pent-void', 'Pentagram Void', 'Pentagram', () => { const r = rng(111), v = vig(0.9); return svg(rect('#030203') + `<circle cx="800" cy="450" r="420" fill="url(#rg)"/>` + pent(800, 450, 13, 180, '#ff1133', 0.85) + `<g filter="url(#bl)">${pent(800, 450, 13, 180, '#ff1133', 0.7)}</g>` + runes(r, 72, '#ff1133') + scatter(r, 28, CROSS, ['#fff'], 0.4, 1.2, 0.05, 0.18) + v.b + grain(0.12), rad('rg', '#6a0010', 0.55, 0) + blurDef('bl', 6) + v.d + grainDef); });
  add('pent-field', 'Pentagram Field', 'Pentagram', () => { const r = rng(112), v = vig(0.8); let s = ''; for (let y = 0; y < 7; y++) for (let x = 0; x < 11; x++) s += pent(x * 160 + (y % 2 ? 80 : 0) + 30, y * 140 + 50, 1.5 + r() * 0.8, 180 + ((r() * 14) | 0) - 7, '#fff', (0.06 + r() * 0.2).toFixed(2)); return svg(rect('#040404') + s + v.b + grain(0.1), v.d + grainDef); });
  add('pent-blood', 'Blood Ritual', 'Pentagram', () => { const r = rng(113), v = vig(0.9); let d = ''; for (let i = 0; i < 26; i++) { const x = (r() * W) | 0, l = 40 + r() * 220; d += `<path d="M${x} -10V${l}" stroke="#7a0014" stroke-width="${(2 + r() * 5).toFixed(1)}" stroke-linecap="round" opacity="${(0.25 + r() * 0.4).toFixed(2)}"/><circle cx="${x}" cy="${l}" r="${(3 + r() * 4).toFixed(1)}" fill="#7a0014" opacity=".6"/>`; } return svg(rect('url(#bgl)') + d + pent(800, 470, 15, 180, '#d1001f', 0.75) + v.b + grain(0.14), lin('bgl', '#120004', '#030001', null, 0, 1) + v.d + grainDef); });
  add('pent-circle', 'Ritual Circle', 'Pentagram', () => { const r = rng(114), v = vig(0.85); let c = ''; for (const [rad2, o] of [[150, 0.5], [270, 0.35], [330, 0.2], [380, 0.12]]) c += `<circle cx="800" cy="450" r="${rad2}" fill="none" stroke="#e8e8ee" stroke-opacity="${o}" stroke-width="2" ${rad2 === 330 ? 'stroke-dasharray="3 12"' : ''}/>`; return svg(rect('#030304') + c + pent(800, 450, 11, 180, '#e8e8ee', 0.7, false) + runes(r, 48, '#e8e8ee') + stars(r, 90, '#fff', 0.5) + v.b + grain(0.1), v.d + grainDef); });
  add('pent-cross', 'Pentagrams & Crosses', 'Pentagram', () => { const r = rng(115), v = vig(0.85); let s = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 13; x++) { const px = x * 130 + (y % 2 ? 65 : 0) + 30, py = y * 118 + 50; s += (x + y) % 2 ? `<path d="${CROSS}" transform="translate(${px} ${py}) scale(1)" fill="#fff" opacity="${(0.06 + r() * 0.16).toFixed(2)}"/>` : pent(px, py, 1.1, 180, '#ff1133', (0.12 + r() * 0.3).toFixed(2)); } return svg(rect('#040304') + s + v.b + grain(0.1), v.d + grainDef); });

  // AK-47
  add('ak-crossfire', 'AK Crossed', 'AK-47', () => { const r = rng(121), v = vig(0.88); return svg(rect('#040404') + `<ellipse cx="800" cy="450" rx="650" ry="330" fill="url(#rg)"/>` + ak(800, 450, 3.3, -24, '#e9e9ee', 0.88) + ak(800, 450, 3.3, 24, '#b9bcc6', 0.88, true) + `<path d="${CROSS}" transform="translate(800 450) scale(2.6)" fill="#ff1133" opacity=".85"/>` + stars(r, 70, '#fff', 0.35) + v.b + grain(0.12), rad('rg', '#7a0012', 0.4, 0) + v.d + grainDef); });
  add('ak-wall', 'AK Wall', 'AK-47', () => { const r = rng(122), v = vig(0.82); let s = ''; for (let y = 0; y < 7; y++) for (let x = 0; x < 6; x++) s += ak(x * 290 + (y % 2 ? 140 : 20) + 100, y * 135 + 60, 0.85 + r() * 0.25, ((r() * 24) | 0) - 12, '#fff', (0.05 + r() * 0.14).toFixed(2), r() > 0.5); return svg(rect('#040404') + s + v.b + grain(0.1), v.d + grainDef); });
  add('ak-opium', 'AK Opium', 'AK-47', () => { const r = rng(123), v = vig(0.9); return svg(rect('#030303') + scatter(r, 60, CROSS, ['#fff'], 0.5, 2.2, 0.04, 0.15) + `<circle cx="1180" cy="260" r="240" fill="url(#rg)"/>` + ak(780, 560, 5.2, -12, '#0b0b0d', 1) + ak(780, 560, 5.2, -12, 'none', 1).replace('<path', '<path stroke="#fff" stroke-opacity=".35" stroke-width=".5"') + pent(1180, 260, 4.2, 180, '#ff1133', 0.7) + v.b + grain(0.13), rad('rg', '#a00018', 0.4, 0) + v.d + grainDef); });
  add('ak-red', 'AK Red Moon', 'AK-47', () => { const r = rng(124), v = vig(0.9); return svg(rect('#050102') + `<circle cx="1000" cy="330" r="300" fill="#8a0018" opacity=".85" filter="url(#bl)"/><circle cx="1000" cy="330" r="240" fill="#c4002a" opacity=".5" filter="url(#bl)"/>` + ak(900, 620, 6.4, -9, '#000', 1) + stars(r, 90, '#fff', 0.4) + v.b + grain(0.14), blurDef('bl', 12) + v.d + grainDef); });
  add('ak-pentagram', 'AK Pentagram', 'AK-47', () => { const r = rng(125), v = vig(0.9); return svg(rect('#030203') + `<circle cx="800" cy="450" r="400" fill="url(#rg)"/>` + pent(800, 450, 12, 180, '#ff1133', 0.8) + ak(800, 450, 3.0, -36, '#f2f2f6', 0.9) + ak(800, 450, 3.0, 36, '#c7c9d1', 0.9, true) + runes(r, 60, '#ff1133') + v.b + grain(0.12), rad('rg', '#5a000e', 0.55, 0) + v.d + grainDef); });

  // PINK + BLACK (match the default theme)
  add('pink-opium', 'Pink Opium', 'Pink', () => { const r = rng(131), v = vig(0.9); let c = ''; for (let y = 0; y < 8; y++) for (let x = 0; x < 14; x++) c += `<path d="${CROSS}" transform="translate(${x * 120 + (y % 2 ? 60 : 0) + 20} ${y * 125 + 60}) scale(1.15)" fill="#ff3d9a" opacity="${(0.07 + r() * 0.26).toFixed(3)}"/>`; return svg(rect('#060207') + `<ellipse cx="1200" cy="200" rx="600" ry="380" fill="url(#rg)"/>` + c + v.b + grain(0.1), rad('rg', '#ff2e93', 0.25, 0) + v.d + grainDef); });
  add('pink-pent', 'Pink Pentagram', 'Pink', () => { const r = rng(132), v = vig(0.9); return svg(rect('#050205') + `<circle cx="800" cy="450" r="420" fill="url(#rg)"/>` + pent(800, 450, 13, 180, '#ff3d9a', 0.9) + `<g filter="url(#bl)">${pent(800, 450, 13, 180, '#ff3d9a', 0.7)}</g>` + runes(r, 72, '#ff3d9a') + scatter(r, 26, CROSS, ['#ffc2dc'], 0.4, 1.2, 0.05, 0.2) + v.b + grain(0.12), rad('rg', '#80104a', 0.5, 0) + blurDef('bl', 6) + v.d + grainDef); });
  add('pink-ak', 'Pink Crossfire', 'Pink', () => { const r = rng(133), v = vig(0.88); return svg(rect('#050205') + `<ellipse cx="800" cy="450" rx="650" ry="330" fill="url(#rg)"/>` + ak(800, 450, 3.3, -24, '#ffd1e8', 0.9) + ak(800, 450, 3.3, 24, '#ff8cc4', 0.9, true) + `<path d="${CROSS}" transform="translate(800 450) scale(2.6)" fill="#ff3d9a" opacity=".9"/>` + stars(r, 70, '#ffc2dc', 0.4) + v.b + grain(0.12), rad('rg', '#a0105a', 0.4, 0) + v.d + grainDef); });

  // ---------- state ----------
  const cache = {};
  const uri = (b) => { if (!cache[b.id]) cache[b.id] = 'data:image/svg+xml;utf8,' + encodeURIComponent(b.fn()); return cache[b.id]; };
  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const lim = (v, lo, hi, d) => (isNum(v) ? Math.min(hi, Math.max(lo, v)) : d);
  function read() {
    try {
      const o = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { ...def, ...o, blur: lim(o.blur, 0, 40, def.blur), vis: lim(o.vis, 5, 100, def.vis), dim: lim(o.dim, 0, 90, 0), sat: lim(o.sat, 0, 250, 100), hue: lim(o.hue, 0, 360, 0), zoom: lim(o.zoom, 100, 220, 100),
        fit: ['cover', 'contain', 'tile'].includes(o.fit) ? o.fit : 'cover', pos: ['center', 'top', 'bottom', 'left', 'right'].includes(o.pos) ? o.pos : 'center', drift: !!o.drift, vig: lim(o.vig, 0, 100, 0) };
    } catch { return { ...def }; }
  }
  let cur = read();
  try { if (localStorage.getItem(KEY) === null) cur = { ...cur, id: 'pink-grid', vis: 50, vig: 30 }; } catch {}
  const customUrl = () => { try { return localStorage.getItem(CKEY) || ''; } catch { return ''; } };
  const urlFor = (id) => id === 'custom' ? customUrl() : (L.find((b) => b.id === id) ? uri(L.find((b) => b.id === id)) : '');
  let layer = null;
  let vigEl = null;
  function apply() {
    const url = cur.id === 'none' ? '' : urlFor(cur.id);
    if (!layer) { layer = document.getElementById('bgLayer'); if (!layer && document.body) { layer = document.createElement('div'); layer.id = 'bgLayer'; document.body.prepend(layer); } }
    if (!layer) return;
    if (!vigEl && document.body) { vigEl = document.getElementById('bgVig'); if (!vigEl) { vigEl = document.createElement('div'); vigEl.id = 'bgVig'; layer.after(vigEl); } }
    const on = !!url;
    document.documentElement.classList.toggle('hasbg', on);
    layer.style.backgroundImage = on ? `url("${url}")` : 'none';
    const f = [];
    if (cur.blur) f.push(`blur(${cur.blur}px)`);
    if (cur.sat !== 100) f.push(`saturate(${cur.sat}%)`);
    if (cur.hue) f.push(`hue-rotate(${cur.hue}deg)`);
    if (cur.dim) f.push(`brightness(${100 - cur.dim}%)`);
    layer.style.filter = f.length ? f.join(' ') : 'none';
    layer.style.opacity = String(cur.vis / 100);
    layer.style.backgroundSize = cur.fit === 'tile' ? `${Math.round(cur.zoom * 4)}px` : (cur.fit === 'contain' ? 'contain' : (cur.zoom > 100 ? cur.zoom + '%' : 'cover'));
    layer.style.backgroundRepeat = cur.fit === 'tile' || cur.fit === 'contain' ? 'repeat' : 'no-repeat';
    layer.style.backgroundPosition = cur.pos;
    layer.classList.toggle('drift', !!cur.drift && on);
    if (vigEl) { vigEl.style.opacity = on ? String(cur.vig / 100) : '0'; }
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {} };

  // shrink a picked picture so it fits in local storage
  function fileToData(file) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('Pick an image file (JPG, PNG, WEBP, GIF).'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('Could not read the file.'));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => rej(new Error('That image could not be opened.'));
        im.onload = () => {
          const k = Math.min(1, 1920 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          let out = c.toDataURL('image/jpeg', 0.85);
          if (out.length > 3.2e6) out = c.toDataURL('image/jpeg', 0.6);
          res(out);
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  window.WellaBg = {
    list: L.map((b) => ({ id: b.id, name: b.name, group: b.group })),
    thumb: (id) => urlFor(id),
    defaults: { ...def },
    hasCustom: () => !!customUrl(),
    get: () => ({ ...cur }),
    set(patch) { cur = { ...cur, ...patch }; apply(); save(); },
    async setCustom(file) {
      const data = await fileToData(file);
      try { localStorage.setItem(CKEY, data); } catch { throw new Error('Image is too big to store. Try a smaller one.'); }
      cur = { ...cur, id: 'custom' }; apply(); save();
    },
    removeCustom() { try { localStorage.removeItem(CKEY); } catch {} if (cur.id === 'custom') cur = { ...cur, id: 'none' }; apply(); save(); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
