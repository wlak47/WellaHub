(function () {
  const $ = (s) => document.querySelector(s);
  const web = !!window.__WELLA_WEB;
  let stream = null, timer = 0, video = null, canvas = null, lastMove = 0, lastFrameHash = '', monitors = [], selectedMonitor = '', fps = 60, quality = 1080, targetFps = 60, targetWidth = 1920, targetHeight = 1080, receivedFrames = 0, monitorsLoaded = false, monitorsLoading = false;
  const point = (img, e) => {
    const r = img.getBoundingClientRect(), iw = img.naturalWidth || r.width, ih = img.naturalHeight || r.height;
    const scale = Math.min(r.width / iw, r.height / ih), w = iw * scale, h = ih * scale;
    const left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
    if (e.clientX < left || e.clientX > left + w || e.clientY < top || e.clientY > top + h) return null;
    return { x: Math.max(0, Math.min(1, (e.clientX - left) / w)), y: Math.max(0, Math.min(1, (e.clientY - top) / h)) };
  };
  const sendPoint = (img, e, action, button = 'left') => { const p = point(img, e); if (p) window.api.remoteScreenInput({ ...p, action, button }).catch((err) => toast(err.message, 'bad')); };
  function show() {
    const host = $('#remoteMain'); if (!host) return;
    if (!web) { host.replaceChildren(h('div', { class: 'empty' }, 'Remote PC is available from your phone after enabling web access in Settings.')); return; }
    const image = h('img', { id: 'remoteScreenImage', class: 'remote-screen', alt: 'PC screen', draggable: 'false' });
    image.addEventListener('pointerdown', (e) => { e.preventDefault(); image.setPointerCapture(e.pointerId); sendPoint(image, e, 'down', e.button === 2 ? 'right' : 'left'); });
    image.addEventListener('pointerup', (e) => { e.preventDefault(); sendPoint(image, e, 'up', e.button === 2 ? 'right' : 'left'); });
    image.addEventListener('pointercancel', (e) => sendPoint(image, e, 'up'));
    image.addEventListener('pointermove', (e) => { if (e.buttons && Date.now() - lastMove > 160) { lastMove = Date.now(); sendPoint(image, e, 'move'); } });
    image.addEventListener('contextmenu', (e) => e.preventDefault());
    const fpsCounter = h('span', { class: 'remote-fps-counter' }, '0 FPS');
    const frame = h('div', { class: 'remote-screen-wrap', tabindex: '0', onwheel: (e) => { e.preventDefault(); window.api.remoteScreenInput({ action: 'scroll', delta: e.deltaY }); } }, image, fpsCounter);
    image.addEventListener('pointerdown', () => frame.focus({ preventScroll: true }));
    const keyName = (e) => ({ Space: 'SPACE', Escape: 'ESC', Enter: 'ENTER', Backspace: 'BACKSPACE', Tab: 'TAB', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', MetaLeft: 'WIN', MetaRight: 'WIN', PageUp: 'PAGEUP', PageDown: 'PAGEDOWN', CapsLock: 'CAPSLOCK', Delete: 'DELETE', Insert: 'INSERT', Home: 'HOME', End: 'END', Backquote: 'BACKTICK', Minus: 'MINUS', Equal: 'EQUAL', BracketLeft: 'LBRACKET', BracketRight: 'RBRACKET', Backslash: 'BACKSLASH', Semicolon: 'SEMICOLON', Quote: 'QUOTE', Comma: 'COMMA', Period: 'PERIOD', Slash: 'SLASH', NumpadAdd: 'PLUS' }[e.code] || (/^F(?:[1-9]|1[0-2])$/.test(e.code) ? e.code : /^[A-Z0-9]$/i.test(e.key) ? e.key.toUpperCase() : ''));
    frame.addEventListener('keydown', (e) => { if (['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.repeat) return; const key = keyName(e); if (key) { e.preventDefault(); window.api.remoteScreenInput({ action: 'keydown', key }); } });
    frame.addEventListener('keyup', (e) => { if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return; const key = keyName(e); if (key) { e.preventDefault(); window.api.remoteScreenInput({ action: 'keyup', key }); } });
    const keys = ['ESC', 'TAB', 'CTRL', 'ALT', 'SPACE', 'ENTER', 'UP', 'LEFT', 'DOWN', 'RIGHT'];
    const typeText = h('input', { class: 'in remote-type', placeholder: 'Type text on the PC…', maxlength: '500' });
    const sendText = async () => { if (!typeText.value) return; await window.api.remoteScreenInput({ action: 'type', text: typeText.value }); typeText.value = ''; };
    typeText.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendText(); } });
    const monitorSelect = h('select', { class: 'in remote-setting', title: 'Monitor to share', onchange: (e) => { selectedMonitor = e.target.value; } }, monitors.length ? monitors.map((m) => h('option', { value: m.id, selected: selectedMonitor === m.id ? 'selected' : null }, `${m.name}${m.width ? ` · ${m.width}×${m.height}` : ''}${m.primary ? ' · Primary' : ''}`)) : [h('option', { value: '' }, 'Detecting monitors…')]);
    const fpsSelect = h('select', { class: 'in remote-setting', title: 'Frames per second', onchange: (e) => { fps = Number(e.target.value) || 5; } }, [15, 20, 30, 45, 60].map((n) => h('option', { value: String(n), selected: fps === n ? 'selected' : null }, `${n} FPS`)));
    const qualitySelect = h('select', { class: 'in remote-setting', title: 'Image quality / bandwidth', onchange: (e) => { quality = Number(e.target.value) || 540; } }, [[540, '540p · data saver'], [720, '720p · balanced'], [1080, '1080p · sharp']].map(([n, label]) => h('option', { value: String(n), selected: quality === n ? 'selected' : null }, label)));
    const refreshMonitors = h('button', { class: 'btn ghost sm', onclick: async () => { try { const items = await window.api.remoteScreenMonitors(); monitors = Array.isArray(items) ? items : []; const primary = monitors.find((m) => m.primary) || monitors[0]; if (!monitors.some((m) => m.id === selectedMonitor)) selectedMonitor = primary && primary.id || ''; monitorsLoaded = true; show(); } catch (err) { toast('Could not detect PC monitors: ' + err.message, 'bad'); } } }, 'Refresh monitors');
    const start = h('button', { class: 'btn start', onclick: async (e) => { e.currentTarget.disabled = true; try { const r = await window.api.remoteScreenStart({ sourceId: selectedMonitor, fps, quality }); if (r && r.error) throw new Error(r.error); toast(`Screen sharing started · ${fps} FPS · ${quality}p.`, 'ok'); } catch (err) { toast(err.message, 'bad'); } finally { e.currentTarget.disabled = false; } } }, 'Start sharing');
    const fullscreen = h('button', { class: 'btn ghost', onclick: async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await frame.requestFullscreen(); } catch { frame.classList.toggle('remote-fullscreen'); } } }, 'Fullscreen');
    host.replaceChildren(h('div', { class: 'remote-head' }, h('div', {}, h('h1', {}, 'Remote PC'), h('small', {}, 'View and control the PC screen from this phone. Tap the screen or use the keyboard controls.')), monitorSelect, refreshMonitors, qualitySelect, fpsSelect, start, fullscreen, h('button', { class: 'btn stop', onclick: () => window.api.remoteScreenStop() }, 'Stop sharing')), frame,
      h('div', { class: 'remote-keys' }, keys.map((k) => h('button', { class: 'btn ghost sm', onclick: () => window.api.remoteScreenInput({ action: 'key', key: k }) }, k)), typeText, h('button', { class: 'btn red sm', onclick: sendText }, 'Type')));
    if (web && !monitorsLoaded && !monitorsLoading) { monitorsLoading = true; window.api.remoteScreenMonitors().then((items) => { monitors = Array.isArray(items) ? items : []; const primary = monitors.find((m) => m.primary) || monitors[0]; if (!monitors.some((m) => m.id === selectedMonitor)) selectedMonitor = primary && primary.id || ''; monitorsLoaded = true; monitorsLoading = false; show(); }).catch((err) => { monitorsLoaded = true; monitorsLoading = false; monitors = []; toast('Could not detect PC monitors: ' + err.message, 'bad'); }); }
  }
  if (web && window.api.onRemoteFrame) window.api.onRemoteFrame((data) => { const img = $('#remoteScreenImage'); if (img && data) { img.src = data; receivedFrames++; } });
  if (web && window.api.onRemoteScreenState) window.api.onRemoteScreenState((s) => { if (s && s.on) { targetFps = Number(s.fps) || 5; targetWidth = Number(s.maxWidth) || 960; targetHeight = Number(s.maxHeight) || 540; } });
  if (web) setInterval(() => { const badge = document.querySelector('.remote-fps-counter'); if (!badge) return; const actual = receivedFrames; receivedFrames = 0; badge.textContent = `${actual} FPS${targetFps ? ` / ${targetFps}` : ''}`; }, 1000);
  if (!web && window.api.onRemoteScreenState) window.api.onRemoteScreenState(async (on) => {
    clearInterval(timer); timer = 0;
    if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null; video = null; canvas = null; lastFrameHash = '';
    const config = typeof on === 'object' && on ? on : { on: !!on };
    if (!config.on) return;
    try {
      let sourceId = config.sourceId;
      if (!sourceId) { const source = await window.api.remoteScreenSource(); if (source.error) throw new Error(source.error); sourceId = source.id; }
      targetFps = Math.max(1, Math.min(60, Number(config.fps) || 60));
      targetWidth = Math.max(640, Math.min(1920, Number(config.maxWidth) || 960)); targetHeight = Math.round(targetWidth * 9 / 16);
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: sourceId, maxWidth: targetWidth, maxHeight: targetHeight, maxFrameRate: targetFps } } });
      video = document.createElement('video'); video.muted = true; video.srcObject = stream; await video.play();
      canvas = document.createElement('canvas'); const scale = Math.min(1, targetWidth / video.videoWidth, targetHeight / video.videoHeight); canvas.width = Math.max(1, Math.round(video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext('2d', { alpha: false }), sample = document.createElement('canvas'); sample.width = 32; sample.height = 18;
      const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
      timer = setInterval(() => {
        if (!video || video.readyState < 2) return;
        sampleCtx.drawImage(video, 0, 0, sample.width, sample.height);
        const pixels = sampleCtx.getImageData(0, 0, sample.width, sample.height).data;
        let hash = 2166136261; for (let i = 0; i < pixels.length; i += 8) hash = Math.imul(hash ^ pixels[i], 16777619);
        const sig = String(hash >>> 0); if (sig === lastFrameHash) return; lastFrameHash = sig;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let data = canvas.toDataURL('image/jpeg', targetWidth <= 960 ? 0.40 : 0.44);
        if (data.length > 480000) { canvas.width = Math.max(1, Math.round(canvas.width * 0.8)); canvas.height = Math.max(1, Math.round(canvas.height * 0.8)); ctx.drawImage(video, 0, 0, canvas.width, canvas.height); data = canvas.toDataURL('image/jpeg', 0.32); }
        window.api.remoteScreenFrame({ data }).catch(() => {});
      }, Math.max(16, Math.round(1000 / targetFps)));
    } catch (err) { toast('Screen sharing failed: ' + (err.message || err), 'bad'); await window.api.remoteScreenStop(); }
  });
  window.RemotePC = { show };
})();
