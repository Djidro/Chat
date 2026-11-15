// Voice messages + photo/file sharing for the chat (uses private bucket "chat-files")
const MEDIA = {};
const BUCKET = 'chat-files', MAXB = 10 * 1024 * 1024, MAX_REC = 300000;
const DOC_TYPES = {
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', zip: 'application/zip'
};
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const fmtDur = ms => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const fileIcon = n => ({ pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', ppt: '📙', pptx: '📙', zip: '🗜️', txt: '📄' }[(String(n).split('.').pop() || '').toLowerCase()] || '📎');
const signCache = {};
MEDIA.cached = p => { const c = signCache[p + '|']; return c && c.exp > Date.now() ? c.url : ''; };
MEDIA.sign = async (path, dl) => {
  const k = path + '|' + (dl || ''), c = signCache[k];
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600, dl ? { download: dl } : undefined);
  if (error) throw error;
  signCache[k] = { url: data.signedUrl, exp: Date.now() + 3300000 };
  return data.signedUrl;
};

// ----- bubbles -----
MEDIA.html = m => {
  if (!m.attachment_path) return null;
  const p = esc(m.attachment_path);
  if (m.kind === 'voice') {
    const wf = Array.isArray(m.waveform) && m.waveform.length ? m.waveform : Array(30).fill(35);
    return `<div class="bub vbub" data-bub data-v="${m.id}" data-path="${p}" data-dur="${m.duration_ms || 0}"><button class="vp" data-play aria-label="Play">▶</button><div class="wf">${wf.map(h => `<i style="height:${Math.max(10, Math.min(100, Number(h) || 10))}%"></i>`).join('')}</div><span class="vd">${fmtDur(m.duration_ms)}</span></div>`;
  }
  if (m.kind === 'image') {
    const ar = m.attachment_w && m.attachment_h ? `aspect-ratio:${m.attachment_w}/${m.attachment_h};` : 'aspect-ratio:4/3;';
    const cap = m.body.replace(/^📷\s?/, ''), has = cap && cap !== 'Photo', u = MEDIA.cached(m.attachment_path);
    return `<div class="bub imb" data-bub><img class="pimg" data-path="${p}" data-name="${esc(m.attachment_name || 'photo')}" ${u ? `src="${esc(u)}"` : ''} style="${ar}" alt="Photo">${has ? `<div class="icap">${esc(cap)}</div>` : ''}</div>`;
  }
  return `<div class="bub fbub" data-bub data-path="${p}" data-name="${esc(m.attachment_name || 'file')}"><span class="fi">${fileIcon(m.attachment_name)}</span><div class="grow"><b class="fn">${esc(m.attachment_name || 'File')}</b><div class="muted">${fmtSize(m.attachment_size || 0)}</div></div><button class="btn sm" data-dl aria-label="Download">⬇</button></div>`;
};
MEDIA.bind = () => {
  const root = $('#msgs'); if (!root) return;
  $$('[data-play]', root).forEach(b => b.onclick = e => { e.stopPropagation(); MEDIA.toggle(b.closest('.vbub')); });
  $$('[data-menu]', root).forEach(b => b.onclick = e => { e.stopPropagation(); showMenu(e, b.closest('.m').dataset.m); });
  $$('.fbub [data-dl]', root).forEach(b => b.onclick = e => { e.stopPropagation(); const f = b.closest('.fbub'); MEDIA.download(f.dataset.path, f.dataset.name); });
  $$('.pimg', root).forEach(img => {
    img.onclick = e => { e.stopPropagation(); MEDIA.view(img.dataset.path, img.dataset.name); };
    if (!img.getAttribute('src')) MEDIA.sign(img.dataset.path).then(u => { img.src = u; }).catch(() => { img.alt = 'Image unavailable'; });
  });
  if (MEDIA.cur) { const el = $(`.vbub[data-v="${MEDIA.cur.id}"]`, root); if (el) { MEDIA.cur.el = el; MEDIA.paint(); } }
};
MEDIA.download = async (path, name) => {
  try {
    const url = await MEDIA.sign(path, name), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast(errMsg(e), 'err'); }
};
MEDIA.view = async (path, name) => {
  try {
    const url = await MEDIA.sign(path);
    const m = modal(`<img src="${esc(url)}" alt="" style="width:100%;border-radius:12px"><div class="row" style="margin-top:12px"><button class="btn grow" id="vdl">⬇ Download</button><button class="btn ghost grow" id="vcl">Close</button></div>`);
    $('#vcl', m).onclick = () => m.remove(); $('#vdl', m).onclick = () => MEDIA.download(path, name);
  } catch (e) { toast(errMsg(e), 'err'); }
};

// ----- voice playback -----
MEDIA.cur = null;
MEDIA.reset = el => { if (!el) return; $$('.wf i', el).forEach(b => b.classList.remove('on')); $('[data-play]', el).textContent = '▶'; $('.vd', el).textContent = fmtDur(+el.dataset.dur); };
MEDIA.paint = () => {
  const c = MEDIA.cur; if (!c || !c.el) return;
  const bars = $$('.wf i', c.el), a = c.a, total = isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : c.dur;
  const p = total ? Math.min(1, a.currentTime * 1000 / total) : 0;
  bars.forEach((b, i) => b.classList.toggle('on', i < Math.round(p * bars.length)));
  $('[data-play]', c.el).textContent = a.paused ? '▶' : '⏸';
  $('.vd', c.el).textContent = fmtDur(a.currentTime > 0 ? a.currentTime * 1000 : c.dur);
};
MEDIA.toggle = async el => {
  const id = el.dataset.v;
  if (MEDIA.cur && MEDIA.cur.id === id) { const a = MEDIA.cur.a; a.paused ? a.play() : a.pause(); return; }
  if (MEDIA.cur) { const old = MEDIA.cur; MEDIA.cur = null; old.a.pause(); MEDIA.reset(old.el); }
  try {
    const a = new Audio(await MEDIA.sign(el.dataset.path));
    MEDIA.cur = { id, a, el, dur: +el.dataset.dur };
    a.ontimeupdate = a.onplay = a.onpause = () => MEDIA.paint();
    a.onended = () => { const e2 = MEDIA.cur && MEDIA.cur.el; MEDIA.cur = null; MEDIA.reset(e2); };
    a.onerror = () => { const e2 = MEDIA.cur && MEDIA.cur.el; MEDIA.cur = null; MEDIA.reset(e2); toast('This voice message cannot be played on this device.', 'err'); };
    await a.play();
  } catch (e) { MEDIA.cur = null; MEDIA.reset(el); toast(errMsg(e), 'err'); }
};

// ----- upload + send -----
MEDIA.upload = async o => {
  const cid = C.cid; if (!cid) throw new Error('Open a conversation first.');
  if (o.blob.size > MAXB) throw new Error('File must be under 10 MB.');
  const path = `${cid}/${crypto.randomUUID()}.${o.ext}`;
  const up = await sb.storage.from(BUCKET).upload(path, o.blob, { contentType: o.type, upsert: false });
  if (up.error) throw up.error;
  const label = o.kind === 'voice' ? '🎤 Voice message' : o.kind === 'image' ? '📷 ' + (o.caption || 'Photo') : '📎 ' + o.name;
  try {
    const m = await LC.sendMessage(cid, label, o.kind, C.reply ? C.reply.id : null, {
      attachment_path: path, attachment_name: o.name.slice(0, 200), attachment_type: o.type, attachment_size: o.blob.size,
      duration_ms: o.dur || null, waveform: o.wf || null, attachment_w: o.w || null, attachment_h: o.h || null
    });
    clearReply();
    if (!byId(m.id)) { C.msgs.push(m); renderMsgs(); $('#msgs').scrollTop = 1e9; }
    loadList();
  } catch (e) { sb.storage.from(BUCKET).remove([path]); throw e; }
};

// ----- photos & documents -----
MEDIA.prep = (f, type) => new Promise((res, rej) => {
  const url = URL.createObjectURL(f), im = new Image();
  im.onload = () => {
    URL.revokeObjectURL(url);
    const w = im.naturalWidth, h = im.naturalHeight, ext = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || 'jpg';
    if (type === 'image/gif' || (f.size < 800 * 1024 && Math.max(w, h) <= 1600)) return res({ blob: f, type, ext, w, h });
    const s = Math.min(1, 1600 / Math.max(w, h)), cw = Math.round(w * s), ch = Math.round(h * s), cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch; cv.getContext('2d').drawImage(im, 0, 0, cw, ch);
    cv.toBlob(b => b ? res({ blob: b, type: 'image/jpeg', ext: 'jpg', w: cw, h: ch }) : rej(new Error('Could not process this image.')), 'image/jpeg', 0.82);
  };
  im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read this image.')); };
  im.src = url;
});
MEDIA.pick = async (f, mode) => {
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  if (f.size > MAXB) return toast('File must be under 10 MB.', 'err');
  if (mode === 'image') {
    const type = f.type || ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }[ext] || '');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return toast('Please choose a JPG, PNG, WebP or GIF image.', 'err');
    let img; try { img = await MEDIA.prep(f, type); } catch (e) { return toast(errMsg(e), 'err'); }
    const url = URL.createObjectURL(img.blob);
    const m = modal(`<h3 style="margin-bottom:10px">Send photo</h3><img src="${url}" alt="" style="width:100%;max-height:50vh;object-fit:contain;border-radius:12px;background:var(--card2)"><p class="muted" style="margin-top:6px">${fmtSize(img.blob.size)}</p><label class="field" style="margin-top:8px"><span>Caption (optional)</span><input id="cap" maxlength="200"></label><div class="row"><button class="btn ghost grow" id="pvc">Cancel</button><button class="btn grow" id="pvs">Send</button></div>`);
    $('#pvc', m).onclick = () => { m.remove(); URL.revokeObjectURL(url); };
    $('#pvs', m).onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Sending…';
      try { await MEDIA.upload({ blob: img.blob, type: img.type, ext: img.ext, name: f.name || 'photo.' + img.ext, kind: 'image', caption: $('#cap', m).value.trim(), w: img.w, h: img.h }); m.remove(); URL.revokeObjectURL(url); }
      catch (err) { toast(errMsg(err), 'err'); b.disabled = false; b.textContent = 'Send'; }
    };
  } else {
    if (!DOC_TYPES[ext]) return toast('Allowed documents: PDF, Word, Excel, PowerPoint, TXT, ZIP.', 'err');
    const m = modal(`<h3 style="margin-bottom:12px">Send document</h3><div class="row card" style="box-shadow:none"><span style="font-size:2.2rem">${fileIcon(f.name)}</span><div class="grow"><b style="word-break:break-all">${esc(f.name)}</b><div class="muted">${fmtSize(f.size)}</div></div></div><div class="row" style="margin-top:14px"><button class="btn ghost grow" id="pvc">Cancel</button><button class="btn grow" id="pvs">Send</button></div>`);
    $('#pvc', m).onclick = () => m.remove();
    $('#pvs', m).onclick = async e => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Sending…';
      try { await MEDIA.upload({ blob: f, type: DOC_TYPES[ext], ext, name: f.name, kind: 'file' }); m.remove(); }
      catch (err) { toast(errMsg(err), 'err'); b.disabled = false; b.textContent = 'Send'; }
    };
  }
};

// ----- voice recording -----
MEDIA.rec = null;
MEDIA.endUI = () => { $('.composer')?.classList.remove('recording'); };
MEDIA.startVoice = async () => {
  if (MEDIA.rec) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) return toast('Voice recording is not supported in this browser.', 'err');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (_) { return toast('Allow microphone access to record voice messages.', 'err'); }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [], peaks = [];
  mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  let ctx, an, buf;
  try { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC(); const src = ctx.createMediaStreamSource(stream); an = ctx.createAnalyser(); an.fftSize = 512; src.connect(an); buf = new Uint8Array(an.fftSize); } catch (_) { }
  const sampler = setInterval(() => { if (!an) return peaks.push(.3); an.getByteTimeDomainData(buf); let mx = 0; for (const v of buf) mx = Math.max(mx, Math.abs(v - 128)); peaks.push(mx / 128); }, 100);
  const t0 = Date.now(), r = MEDIA.rec = { mr, chunks, peaks, t0, mime: mr.mimeType || mime || 'audio/webm' };
  r.cleanup = () => { clearInterval(sampler); clearInterval(r.tick); stream.getTracks().forEach(t => t.stop()); try { ctx && ctx.close(); } catch (_) { } };
  mr.start();
  $('.composer').classList.add('recording');
  $('#recbar').innerHTML = '<span class="recdot"></span><b id="rt">0:00</b><span class="muted grow">Recording…</span><button class="ib" id="rc" title="Cancel">🗑</button><button class="ib" id="rs" style="background:var(--grad);color:#fff" title="Send">➤</button>';
  $('#rc').onclick = MEDIA.cancelVoice; $('#rs').onclick = MEDIA.sendVoice;
  r.tick = setInterval(() => { const ms = Date.now() - t0, el = $('#rt'); if (el) el.textContent = fmtDur(ms); if (ms >= MAX_REC) MEDIA.sendVoice(); }, 250);
};
MEDIA.cancelVoice = () => {
  const r = MEDIA.rec; if (!r) return; MEDIA.rec = null; r.mr.onstop = null;
  try { r.mr.stop(); } catch (_) { } r.cleanup(); MEDIA.endUI();
};
MEDIA.sendVoice = async () => {
  const r = MEDIA.rec; if (!r) return; MEDIA.rec = null;
  const dur = Date.now() - r.t0, done = new Promise(res => { r.mr.onstop = res; });
  try { r.mr.stop(); } catch (_) { }
  await done; r.cleanup(); MEDIA.endUI();
  if (dur < 1000) return toast('Voice message too short.', 'err');
  const base = r.mime.split(';')[0], ext = base.includes('mp4') ? 'm4a' : base.includes('ogg') ? 'ogg' : 'webm';
  const blob = new Blob(r.chunks, { type: base }), n = Math.min(40, r.peaks.length);
  let wf = [];
  for (let i = 0; i < n; i++) { const a = Math.floor(i * r.peaks.length / n), b = Math.max(a + 1, Math.floor((i + 1) * r.peaks.length / n)); wf.push(Math.max(...r.peaks.slice(a, b))); }
  const mx = Math.max(...wf, .05); wf = wf.map(v => Math.round(Math.max(10, v / mx * 100)));
  try { await MEDIA.upload({ blob, type: base, ext, name: `voice-${Date.now()}.${ext}`, kind: 'voice', dur, wf }); }
  catch (e) { toast(errMsg(e), 'err'); }
};
MEDIA.mount = () => {
  $('#mb').onclick = MEDIA.startVoice;
  $('#ab').onclick = e => {
    $('.menu')?.remove();
    const r = e.currentTarget.getBoundingClientRect(), el = document.createElement('div');
    el.className = 'menu'; el.innerHTML = '<button class="act" data-a="p">📷 Photo</button><button class="act" data-a="d">📄 Document</button>';
    document.body.appendChild(el);
    el.style.left = Math.max(8, r.left) + 'px'; el.style.top = Math.max(8, r.top - el.offsetHeight - 8) + 'px';
    el.onclick = ev => { const b = ev.target.closest('button'); if (!b) return; el.remove(); (b.dataset.a === 'p' ? $('#fp') : $('#fd')).click(); };
    setTimeout(() => document.addEventListener('click', function f() { el.remove(); document.removeEventListener('click', f); }), 0);
  };
  $('#fp').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) MEDIA.pick(f, 'image'); };
  $('#fd').onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (f) MEDIA.pick(f, 'file'); };
};
