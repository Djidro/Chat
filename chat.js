const EMOJIS = '😀 😂 🥰 😍 😘 😊 😉 🥹 😭 😢 😮 😎 🤗 🙈 😴 🤔 👍 👏 🙏 💪 ❤️ 🧡 💛 💚 💙 💜 🖤 💖 💕 💞 💋 🌹 🌸 ✨ 🔥 🌙 ☀️ 🎁 🍫 ☕ 🥂'.split(' ');
const STICKERS = [['🐻', 'Bear hug'], ['🌹', 'A rose for you'], ['💌', 'Love note'], ['🥰', 'Smitten'], ['🌙', 'Dream of me'], ['☀️', 'My sunshine'], ['🍫', 'Sweet for sweet'], ['💍', 'Forever'], ['🦋', 'Butterflies'], ['⭐', 'You are my star']];
const RX = ['❤️', '😂', '😮', '😢', '👍', '🔥'];
const PAGE = 30;
const C = { list: [], cid: null, other: null, msgs: [], rx: {}, reply: null, more: false, loading: false };

const byId = id => C.msgs.find(m => m.id === id);
const lastEmoji = s => (s.match(/\p{Extended_Pictographic}/u) || ['💖'])[0];

async function loadList() {
  const { data, error } = await sb.rpc('my_conversations');
  if (error) { toast(errMsg(error), 'err'); return; }
  C.list = data || [];
  renderList();
}
function renderList() {
  const el = $('#clist'); if (!el) return;
  el.innerHTML = C.list.length ? C.list.map(c => `<div class="item ${c.conversation_id === C.cid ? 'on' : ''}" data-c="${c.conversation_id}">${avatarDot(c)}<div class="grow"><div class="row sp"><b>${esc(c.display_name)}</b><span class="muted" style="font-size:.72rem">${shortTime(c.last_at)}</span></div><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_body || 'Say hello 👋')}</div></div>${Number(c.unread) ? `<span class="badge">${c.unread}</span>` : ''}</div>`).join('') : '<div class="empty">No conversations yet.<br><a href="discover.html">Connect with someone →</a></div>';
  $$('#clist [data-c]').forEach(x => x.onclick = () => openConv(x.dataset.c));
}
async function openConv(cid) {
  C.cid = cid; C.msgs = []; C.rx = {}; C.reply = null; C.more = false;
  C.other = C.list.find(c => c.conversation_id === cid);
  history.replaceState(null, '', '?c=' + cid);
  $('.chatwrap').classList.add('open'); renderList();
  $('#cpane').innerHTML = `<div class="hd"><button class="ib back" id="bk">←</button>${avatarDot(C.other, 42)}<div class="grow"><b>${esc(C.other.display_name)}</b><div class="muted" id="st"></div></div></div>
    <div class="msgs" id="msgs"><div class="loading">Loading…</div></div><div id="rbar"></div>
    <div class="composer"><div id="pop" class="pop hidden"></div><button class="ib" id="eb" title="Emoji">😊</button><button class="ib" id="lb" title="Love">💞</button>
    <textarea id="inp" rows="1" maxlength="2000" placeholder="Write a message…"></textarea><button class="ib" id="sn" style="background:var(--grad);color:#fff" title="Send">➤</button></div>`;
  $('#bk').onclick = () => { $('.chatwrap').classList.remove('open'); C.cid = null; history.replaceState(null, '', 'messages.html'); renderList(); };
  $('#eb').onclick = () => togglePop('emoji'); $('#lb').onclick = () => togglePop('love');
  $('#sn').onclick = sendText;
  $('#inp').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } };
  $('#inp').oninput = e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; };
  updateStatus();
  await loadMsgs(true);
}
function updateStatus() { const s = $('#st'); if (s && C.other) s.textContent = isOnline(C.other.last_seen) ? '● Online' : 'Offline'; if (s) s.style.color = isOnline(C.other?.last_seen) ? 'var(--ok)' : ''; }
async function loadMsgs(first) {
  if (C.loading) return; C.loading = true;
  const cid = C.cid; let q = sb.from('messages').select('*').eq('conversation_id', cid).order('created_at', { ascending: false }).limit(PAGE);
  if (!first && C.msgs.length) q = q.lt('created_at', C.msgs[0].created_at);
  const { data, error } = await q; C.loading = false;
  if (cid !== C.cid) return;
  if (error) { toast(errMsg(error), 'err'); $('#msgs').innerHTML = ''; return; }
  const rows = (data || []).reverse(); C.more = (data || []).length === PAGE;
  if (rows.length) {
    const { data: rs } = await sb.from('message_reactions').select('*').in('message_id', rows.map(r => r.id));
    (rs || []).forEach(r => (C.rx[r.message_id] = C.rx[r.message_id] || []).push(r));
  }
  const box = $('#msgs'), prevH = box.scrollHeight;
  C.msgs = [...rows, ...C.msgs]; renderMsgs();
  box.scrollTop = first ? box.scrollHeight : box.scrollHeight - prevH;
  markRead();
}
function markRead() {
  if (!C.cid || document.hidden) return;
  if (C.msgs.some(m => m.sender_id !== LC.me.id && !m.read_at)) sb.rpc('mark_read', { cid: C.cid }).then(() => { loadList(); LC.refreshBadges(); });
}
function bubble(m) {
  const me = m.sender_id === LC.me.id, special = ['hug', 'kiss', 'sticker', 'heart'].includes(m.kind);
  const rq = m.reply_to ? byId(m.reply_to) : null;
  const rxs = {}; (C.rx[m.id] || []).forEach(r => { (rxs[r.emoji] = rxs[r.emoji] || []).push(r.user_id); });
  return `<div class="m ${me ? 'me' : 'them'}" data-m="${m.id}">
    ${special ? `<div class="bub big" data-bub>${esc(lastEmoji(m.body))}</div><div class="cap">${esc(m.body.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').trim() || m.kind)}</div>`
      : `<div class="bub" data-bub>${m.reply_to ? `<div class="rq">${rq ? esc(rq.body.slice(0, 80)) : 'Original message'}</div>` : ''}${esc(m.body)}</div>`}
    ${Object.keys(rxs).length ? `<div class="rx">${Object.entries(rxs).map(([e, u]) => `<span class="${u.includes(LC.me.id) ? 'mine' : ''}" data-rx="${e}">${e}${u.length > 1 ? ' ' + u.length : ''}</span>`).join('')}</div>` : ''}
    <div class="meta"><span>${fmtTime(m.created_at)}</span>${me ? `<span class="tick ${m.read_at ? 'read' : ''}" title="${m.read_at ? 'Read' : 'Delivered'}">${m.read_at ? '✓✓' : '✓'}</span>` : ''}</div></div>`;
}
function renderMsgs() {
  const box = $('#msgs'); if (!box) return; let day = '', html = C.more ? '<button class="btn ghost sm" id="older" style="align-self:center">Load older messages</button>' : '';
  C.msgs.forEach(m => { const d = fmtDay(m.created_at); if (d !== day) { day = d; html += `<div class="sep">${d}</div>`; } html += bubble(m); });
  box.innerHTML = html || '<div class="empty">No messages yet. Say something sweet 💜</div>';
  $('#older')?.addEventListener('click', () => loadMsgs(false));
  $$('#msgs .m').forEach(el => {
    const id = el.dataset.m;
    el.querySelector('[data-bub]').onclick = ev => showMenu(ev, id);
    $$('[data-rx]', el).forEach(r => r.onclick = ev => { ev.stopPropagation(); toggleReaction(id, r.dataset.rx); });
  });
}
function showMenu(ev, id) {
  $('.menu')?.remove(); const m = byId(id); if (!m) return;
  const el = document.createElement('div'); el.className = 'menu';
  el.innerHTML = `<div class="rr">${RX.map(e => `<button data-e="${e}">${e}</button>`).join('')}</div><button class="act" data-a="reply">↩ Reply</button><button class="act" data-a="copy">⧉ Copy</button>${m.sender_id === LC.me.id ? '<button class="act" data-a="del" style="color:var(--danger)">🗑 Delete</button>' : ''}`;
  document.body.appendChild(el);
  const r = ev.currentTarget.getBoundingClientRect();
  el.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - el.offsetHeight - 8)) + 'px';
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8)) + 'px';
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return; el.remove();
    if (b.dataset.e) toggleReaction(id, b.dataset.e);
    if (b.dataset.a === 'reply') { C.reply = m; $('#rbar').innerHTML = `<div class="replybar"><span>↩ ${esc(m.body.slice(0, 60))}</span><button class="btn ghost sm" id="xr">✕</button></div>`; $('#xr').onclick = clearReply; $('#inp').focus(); }
    if (b.dataset.a === 'copy') navigator.clipboard?.writeText(m.body).then(() => toast('Copied'));
    if (b.dataset.a === 'del') { if (!confirm('Delete this message for everyone?')) return; const { error } = await sb.from('messages').delete().eq('id', id); if (error) return toast(errMsg(error), 'err'); removeMsg(id); loadList(); }
  };
  setTimeout(() => document.addEventListener('click', function f(e) { if (!el.contains(e.target)) { el.remove(); } document.removeEventListener('click', f); }), 0);
}
function clearReply() { C.reply = null; $('#rbar').innerHTML = ''; }
function removeMsg(id) { C.msgs = C.msgs.filter(m => m.id !== id); delete C.rx[id]; renderMsgs(); }
async function toggleReaction(id, emoji) {
  const mine = (C.rx[id] || []).find(r => r.user_id === LC.me.id && r.emoji === emoji);
  if (mine) { const { error } = await sb.from('message_reactions').delete().eq('id', mine.id); if (error) return toast(errMsg(error), 'err'); C.rx[id] = C.rx[id].filter(r => r.id !== mine.id); }
  else {
    const { data, error } = await sb.from('message_reactions').insert({ message_id: id, user_id: LC.me.id, emoji }).select().single();
    if (error) return toast(errMsg(error), 'err'); (C.rx[id] = C.rx[id] || []).push(data); if (emoji === '❤️') LC.floatHearts('❤️', 10);
  }
  renderMsgs();
}
function togglePop(kind) {
  const p = $('#pop'); if (!p.classList.contains('hidden') && p.dataset.k === kind) return p.classList.add('hidden');
  p.dataset.k = kind; p.classList.remove('hidden');
  if (kind === 'emoji') p.innerHTML = `<div class="emo">${EMOJIS.map(e => `<button>${e}</button>`).join('')}</div>`;
  else p.innerHTML = `<div class="chips"><button class="btn sm" data-s="text|Good morning ☀️ Wishing you a beautiful day full of smiles.">☀️ Good morning</button><button class="btn sm" data-s="text|Goodnight 🌙 Sweet dreams, thinking of you.">🌙 Goodnight</button><button class="btn sm ghost" data-s="hug|Sent you a warm hug 🤗">🤗 Hug</button><button class="btn sm ghost" data-s="kiss|Sent you a kiss 😘">😘 Kiss</button><button class="btn sm ghost" data-s="heart|Sending you love 💖">💖 Heart</button></div>
    <div class="muted" style="margin-bottom:6px">Stickers</div><div class="emo">${STICKERS.map(s => `<button data-s="sticker|${s[1]} ${s[0]}" title="${s[1]}">${s[0]}</button>`).join('')}</div>`;
  p.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (kind === 'emoji') { const i = $('#inp'); i.value += b.textContent; i.focus(); }
    else { const [k, ...t] = b.dataset.s.split('|'); p.classList.add('hidden'); send(t.join('|'), k); }
  };
}
async function sendText() { const i = $('#inp'), t = i.value.trim(); if (!t) return; i.value = ''; i.style.height = 'auto'; $('#pop').classList.add('hidden'); await send(t, 'text'); }
async function send(body, kind) {
  try {
    const m = await LC.sendMessage(C.cid, body, kind, C.reply?.id || null); clearReply();
    if (!byId(m.id)) { C.msgs.push(m); renderMsgs(); $('#msgs').scrollTop = 1e9; }
    if (kind !== 'text') LC.floatHearts(kind === 'kiss' ? '😘' : kind === 'hug' ? '🤗' : '💖', 12);
    loadList();
  } catch (e) { toast(errMsg(e), 'err'); }
}
function onMsg(p) {
  if (p.eventType === 'DELETE') { const id = p.old.id; if (byId(id)) removeMsg(id); return loadList(); }
  const m = p.new; loadList();
  if (m.conversation_id !== C.cid) return;
  const i = C.msgs.findIndex(x => x.id === m.id);
  if (i >= 0) C.msgs[i] = m; else { C.msgs.push(m); if (m.sender_id !== LC.me.id && ['heart', 'hug', 'kiss'].includes(m.kind)) LC.floatHearts(lastEmoji(m.body), 10); }
  renderMsgs(); const box = $('#msgs');
  if (p.eventType === 'INSERT') box.scrollTop = box.scrollHeight;
  if (m.sender_id !== LC.me.id) markRead();
}
function onRx(p) {
  const r = p.eventType === 'DELETE' ? p.old : p.new; if (!r || !byId(r.message_id)) return;
  const arr = C.rx[r.message_id] = C.rx[r.message_id] || [];
  if (p.eventType === 'INSERT' && !arr.some(x => x.id === r.id)) { arr.push(r); if (r.emoji === '❤️' && r.user_id !== LC.me.id) LC.floatHearts('❤️', 8); }
  if (p.eventType === 'DELETE') C.rx[r.message_id] = arr.filter(x => x.id !== r.id);
  renderMsgs();
}
LC.boot('messages', async () => {
  $('#view').innerHTML = `<div class="chatwrap"><div class="clist"><div class="hd"><h3>Messages</h3></div><div class="body" id="clist"><div class="loading">Loading…</div></div></div><div class="cpane" id="cpane"><div class="empty" style="margin:auto">Select a conversation 💬</div></div></div>`;
  await loadList();
  sb.channel('chat')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onMsg)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, onRx).subscribe();
  setInterval(async () => { await loadList(); if (C.cid) { C.other = C.list.find(c => c.conversation_id === C.cid) || C.other; updateStatus(); } }, 30000);
  document.addEventListener('visibilitychange', markRead);
  const want = new URLSearchParams(location.search).get('c');
  if (want && C.list.some(c => c.conversation_id === want)) openConv(want);
});
