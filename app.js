const LC = { me: null, profile: null };
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
const NAV = [
  ['home', 'index.html', 'Home', 'home'], ['discover', 'discover.html', 'Discover', 'search'],
  ['messages', 'messages.html', 'Messages', 'chat'], ['letters', 'love-letters.html', 'Letters', 'mail'],
  ['profile', 'profile.html', 'Profile', 'user'], ['settings', 'settings.html', 'Settings', 'gear']
];
function navHTML(page, bottom) {
  return NAV.filter(n => !bottom || n[0] !== 'settings').map(n =>
    `<a class="nav-i ${n[0] === page ? 'on' : ''}" href="${n[1]}"><svg viewBox="0 0 24 24">${ICONS[n[3]]}</svg><span>${n[2]}</span>${n[0] === 'messages' ? '<span class="badge hidden" data-b="msg"></span>' : ''}${n[0] === 'discover' ? '<span class="badge hidden" data-b="req"></span>' : ''}</a>`).join('');
}
LC.boot = async function (page, init) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.replace('login.html'); return; }
  LC.me = session.user;
  const { data: p, error } = await sb.from('profiles').select('*').eq('id', LC.me.id).single();
  if (error || !p) { $('#view').innerHTML = '<div class="empty">Could not load your profile. Please log in again.</div>'; return; }
  LC.profile = p;
  $('#side').innerHTML = `<div class="brand">Love Connect ❤</div>${navHTML(page, false)}`;
  $('#bottom').innerHTML = navHTML(page, true);
  LC.refreshBadges();
  sb.channel('badges')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => LC.refreshBadges())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => LC.refreshBadges())
    .subscribe();
  const beat = () => sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', LC.me.id);
  beat(); setInterval(() => { if (!document.hidden) beat(); }, 60000);
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') location.replace('login.html'); });
  await init();
};
LC.refreshBadges = async function () {
  const [c, r] = await Promise.all([
    sb.rpc('my_conversations'),
    sb.from('connection_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', LC.me.id).eq('status', 'pending')
  ]);
  const unread = (c.data || []).reduce((s, x) => s + Number(x.unread), 0);
  const set = (k, n) => $$(`[data-b="${k}"]`).forEach(b => { b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); });
  set('msg', unread); set('req', r.count || 0);
  document.title = (unread ? `(${unread}) ` : '') + 'Love Connect';
};
LC.logout = async () => { await sb.auth.signOut(); location.replace('login.html'); };
LC.connections = async function () {
  const { data, error } = await sb.from('connections').select('user_a,user_b');
  if (error) throw error;
  const ids = (data || []).map(c => c.user_a === LC.me.id ? c.user_b : c.user_a);
  if (!ids.length) return [];
  const { data: ps, error: e2 } = await sb.from('profiles').select('*').in('id', ids);
  if (e2) throw e2;
  return ps || [];
};
LC.conversationWith = async function (otherId) {
  const { data, error } = await sb.rpc('my_conversations');
  if (error) throw error;
  const c = (data || []).find(x => x.other_id === otherId);
  return c ? c.conversation_id : null;
};
LC.sendMessage = async function (cid, body, kind = 'text', replyTo = null) {
  body = (body || '').trim();
  if (!body || body.length > 2000) throw new Error('Message must be 1–2000 characters.');
  const { data, error } = await sb.from('messages').insert({ conversation_id: cid, sender_id: LC.me.id, body, kind, reply_to: replyTo }).select().single();
  if (error) throw error;
  return data;
};
LC.floatHearts = function (emoji = '💖', n = 14) {
  for (let i = 0; i < n; i++) {
    const h = document.createElement('div'); h.className = 'fh'; h.textContent = emoji;
    h.style.left = Math.random() * 95 + 'vw'; h.style.fontSize = 18 + Math.random() * 28 + 'px';
    h.style.animationDelay = Math.random() * 0.8 + 's'; document.body.appendChild(h); setTimeout(() => h.remove(), 3600);
  }
};
LC.QUOTES = [
  'Love is not about finding someone to live with, but someone you cannot imagine living without.',
  'Every little moment with you becomes my favorite memory.',
  'Home is wherever you are.',
  'You make ordinary days feel like a gift.',
  'In a sea of people, my heart will always search for you.',
  'Your smile is my favorite place to rest.',
  'Two hearts, one quiet kind of magic.',
  'Love grows in the small things we do for each other every day.',
  'With you, even silence feels like a conversation.',
  'You are my today and all of my tomorrows.',
  'Kindness is the language love speaks most clearly.',
  'The best part of my day is thinking of you.',
  'Love is a garden — tend it, and it blooms.',
  'Hold the ones you love close, and tell them often.',
  'Distance means little when someone means everything.'
];
LC.quoteOfDay = () => LC.QUOTES[Math.floor(Date.now() / 864e5) % LC.QUOTES.length];

// ---------- Home page ----------
async function initHome() {
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  const v = $('#view');
  v.innerHTML = `<div class="stack">
    <div class="card hero"><h1>${greet}, ${esc(LC.profile.display_name)} 💜</h1><p class="quote" style="margin-top:10px">“${esc(LC.quoteOfDay())}”</p><p class="muted" style="margin-top:6px">Quote of the day</p></div>
    <div class="grid g3" id="stats"></div>
    <div class="card"><h3>Send some love</h3><p class="muted" style="margin:4px 0 12px">Pick a connection and send a sweet message.</p>
      <div id="quick"><div class="loading">Loading…</div></div></div>
    <div class="card"><h3>Recent conversations</h3><div id="recent" style="margin-top:8px"><div class="loading">Loading…</div></div></div>
    <div class="card"><h3>Notifications</h3><div id="notes" style="margin-top:8px"></div></div></div>`;
  try {
    const [conv, conns, reqs, notes] = await Promise.all([
      sb.rpc('my_conversations'), LC.connections(),
      sb.from('connection_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', LC.me.id).eq('status', 'pending'),
      sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(8)
    ]);
    if (conv.error) throw conv.error;
    const cs = conv.data || [], unread = cs.reduce((s, x) => s + Number(x.unread), 0);
    $('#stats').innerHTML = [[conns.length, 'Connections'], [unread, 'Unread'], [reqs.count || 0, 'Requests']].map(s => `<div class="card stat"><b>${s[0]}</b><span class="muted">${s[1]}</span></div>`).join('');
    $('#recent').innerHTML = cs.length ? cs.slice(0, 5).map(c => `<a class="item" href="messages.html?c=${c.conversation_id}" style="color:inherit">${avatarDot({ ...c, display_name: c.display_name })}<div class="grow"><b>${esc(c.display_name)}</b><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_body || 'Say hello 👋')}</div></div>${Number(c.unread) ? `<span class="badge">${c.unread}</span>` : ''}</a>`).join('') : '<div class="empty">No conversations yet. <a href="discover.html">Find someone to connect with →</a></div>';
    if (!cs.length) $('#quick').innerHTML = '<div class="empty">Connect with someone first to send messages.</div>';
    else {
      $('#quick').innerHTML = `<select id="qto">${cs.map(c => `<option value="${c.conversation_id}">${esc(c.display_name)} (@${esc(c.username)})</option>`).join('')}</select>
        <div class="row" style="flex-wrap:wrap;margin-top:12px">
        <button class="btn sm" data-k="text" data-b="Good morning ☀️ Wishing you a beautiful day full of smiles.">☀️ Good morning</button>
        <button class="btn sm" data-k="text" data-b="Goodnight 🌙 Sweet dreams, thinking of you.">🌙 Goodnight</button>
        <button class="btn sm ghost" data-k="hug" data-b="Sent you a warm hug 🤗">🤗 Hug</button>
        <button class="btn sm ghost" data-k="kiss" data-b="Sent you a kiss 😘">😘 Kiss</button></div>`;
      $$('#quick button').forEach(b => b.onclick = async () => {
        b.disabled = true;
        try { await LC.sendMessage($('#qto').value, b.dataset.b, b.dataset.k); LC.floatHearts(); toast('Sent 💌'); }
        catch (e) { toast(errMsg(e), 'err'); }
        b.disabled = false;
      });
    }
    const label = { connection_request: 'sent you a connection request', request_accepted: 'accepted your request 💞' };
    const ns = notes.data || [], ids = [...new Set(ns.map(n => n.actor_id).filter(Boolean))];
    const pm = {};
    if (ids.length) (await sb.from('profiles').select('id,display_name,username').in('id', ids)).data?.forEach(p => pm[p.id] = p);
    $('#notes').innerHTML = ns.length ? ns.map(n => `<div class="item" style="cursor:default"><div class="grow"><b>${esc(pm[n.actor_id]?.display_name || 'Someone')}</b> ${esc(label[n.type] || n.type)}<div class="muted">${new Date(n.created_at).toLocaleString()}</div></div></div>`).join('') : '<div class="empty">Nothing new yet.</div>';
    if (ns.some(n => !n.read)) sb.from('notifications').update({ read: true }).eq('user_id', LC.me.id).eq('read', false).then(() => { });
  } catch (e) { toast(errMsg(e), 'err'); }
}
if (document.body.dataset.page === 'home') LC.boot('home', initHome);
