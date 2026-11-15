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
  ['messages', 'messages.html', 'Messages', 'chat'],
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
  LC.initBell(); LC.registerSW();
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
LC.logout = async () => { try { await LC.disablePush(true); } catch (_) { } await sb.auth.signOut(); location.replace('login.html'); };
LC.connections = async function () {
  const { data, error } = await sb.from('connections').select('user_a,user_b,created_at');
  if (error) throw error;
  const when = {}; (data || []).forEach(c => when[c.user_a === LC.me.id ? c.user_b : c.user_a] = c.created_at);
  const ids = Object.keys(when);
  if (!ids.length) return [];
  const { data: ps, error: e2 } = await sb.from('profiles').select('*').in('id', ids);
  if (e2) throw e2;
  return (ps || []).map(p => ({ ...p, connected_at: when[p.id] }));
};
LC.conversationWith = async function (otherId) {
  const { data, error } = await sb.rpc('my_conversations');
  if (error) throw error;
  const c = (data || []).find(x => x.other_id === otherId);
  return c ? c.conversation_id : null;
};
LC.sendMessage = async function (cid, body, kind = 'text', replyTo = null, extra = {}) {
  body = (body || '').trim();
  if (!body || body.length > 2000) throw new Error('Message must be 1–2000 characters.');
  const { data, error } = await sb.from('messages').insert({ conversation_id: cid, sender_id: LC.me.id, body, kind, reply_to: replyTo, ...extra }).select().single();
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

// ---------- Notifications: bell, in-app alerts, phone push ----------
LC.names = {};
LC.noteText = function (n, who) {
  const w = who || 'Someone';
  const t = {
    connection_request: [`${w} wants to connect with you`, '💌'], request_accepted: [`${w} accepted your request`, '💞'],
    message: [`${w}: ${n.body || 'New message'}`, '💬'], hug: [`${w} sent you a warm hug`, '🤗'], kiss: [`${w} sent you a kiss`, '😘'],
    heart: [`${w} is sending you love`, '💖'], voice: [`${w} sent you a voice message`, '🎤'], image: [`${w} sent you a photo`, '📷'], file: [`${w} sent you a file`, '📎'], sticker: [`${w} sent you a sticker`, '🌹'], reaction: [`${w} reacted ${n.body || '❤️'} to your message`, '❤️']
  }[n.type] || ['New notification', '🔔'];
  return { text: t[0], icon: t[1] };
};
LC.noteUrl = n => n.conversation_id ? 'messages.html?c=' + n.conversation_id : (n.type === 'connection_request' || n.type === 'request_accepted') ? 'discover.html' : 'index.html';
LC.fetchNames = async function (ids) {
  const need = [...new Set(ids.filter(i => i && !LC.names[i]))];
  if (need.length) (await sb.from('profiles').select('id,display_name').in('id', need)).data?.forEach(p => LC.names[p.id] = p.display_name);
};
LC.beep = function () {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(.001, a.currentTime); g.gain.exponentialRampToValueAtTime(.15, a.currentTime + .02); g.gain.exponentialRampToValueAtTime(.001, a.currentTime + .35);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + .4);
  } catch (_) { }
};
LC.initBell = function () {
  const b = document.createElement('button'); b.id = 'bell'; b.className = 'bellbtn'; b.setAttribute('aria-label', 'Notifications');
  b.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg><span class="badge hidden" id="bellb"></span>';
  document.body.appendChild(b); b.onclick = LC.openBell;
  LC.bellCount();
  sb.channel('notes').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + LC.me.id }, async p => {
    const n = p.new, here = document.body.dataset.page === 'messages' && !document.hidden && n.conversation_id && new URLSearchParams(location.search).get('c') === n.conversation_id;
    LC.bellCount();
    if (here) return;
    await LC.fetchNames([n.actor_id]); const t = LC.noteText(n, LC.names[n.actor_id]);
    LC.beep(); toast(t.icon + ' ' + t.text.slice(0, 90));
  }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + LC.me.id }, () => LC.bellCount()).subscribe();
};
LC.bellCount = async function () {
  const { count } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('read', false);
  const el = $('#bellb'); if (el) { el.textContent = count > 99 ? '99+' : count; el.classList.toggle('hidden', !count); }
};
LC.openBell = async function () {
  const m = modal('<div class="row sp"><h3>Notifications 🔔</h3><button class="btn ghost sm" id="mar">Mark all read</button></div><div id="nl" style="margin-top:10px"><div class="loading">Loading…</div></div>');
  const { data, error } = await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30);
  if (error) { $('#nl', m).innerHTML = ''; return toast(errMsg(error), 'err'); }
  await LC.fetchNames((data || []).map(n => n.actor_id));
  $('#nl', m).innerHTML = (data || []).length ? data.map(n => { const t = LC.noteText(n, LC.names[n.actor_id]); return `<a class="item" href="${LC.noteUrl(n)}" data-n="${n.id}" style="color:inherit"><span style="font-size:1.5rem">${t.icon}</span><div class="grow ${n.read ? '' : 'unread'}"><div>${esc(t.text.slice(0, 110))}</div><div class="muted">${shortTime(n.created_at)}</div></div></a>`; }).join('') : '<div class="empty">No notifications yet 💜</div>';
  $('#mar', m).onclick = async () => { await sb.from('notifications').update({ read: true }).eq('read', false); $$('.unread', m).forEach(x => x.classList.remove('unread')); LC.bellCount(); };
  $$('[data-n]', m).forEach(a => a.addEventListener('click', () => sb.from('notifications').update({ read: true }).eq('id', a.dataset.n)));
};
LC.registerSW = async function () { if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('sw.js'); } catch (_) { } } };
LC.pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
LC.pushState = async function () {
  if (!LC.pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready; return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
};
LC.enablePush = async function () {
  if (!LC.pushSupported()) throw new Error('This browser does not support push. On iPhone, add the site to your Home Screen first.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications were not allowed. Enable them in your browser/phone settings.');
  const reg = await navigator.serviceWorker.ready;
  const pad = '='.repeat((4 - LC_CONFIG.VAPID_PUBLIC.length % 4) % 4), raw = atob((LC_CONFIG.VAPID_PUBLIC + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  let sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON();
  const { error } = await sb.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw error;
};
LC.disablePush = async function (silent) {
  if (!LC.pushSupported()) return;
  const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
};

// ---------- Home page ----------
async function initHome() {
  const hr = new Date().getHours(), p = LC.profile;
  const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
  $('#view').innerHTML = `<div class="stack">
    <div class="row" style="padding-right:56px">${avatar(p, 54)}<div class="grow"><div class="muted">${greet}</div><h1 style="line-height:1.2">${esc(p.display_name)} 💜</h1></div></div>
    <div class="card hero"><p class="quote">“${esc(LC.quoteOfDay())}”</p><p class="muted" style="margin-top:8px">✨ Quote of the day</p></div>
    <div class="grid g3" id="stats"></div>
    <div class="card"><h3>Send some love 💞</h3><div id="quick"><div class="loading">Loading…</div></div></div>
    <div class="card"><div class="row sp"><h3>Conversations</h3><a href="messages.html" class="muted">Open all →</a></div><div id="recent" style="margin-top:8px"><div class="loading">Loading…</div></div></div>
    <div class="card"><h3>Recent activity</h3><div id="notes" style="margin-top:8px"></div></div></div>`;
  try {
    const [conv, conns, reqs, notes] = await Promise.all([
      sb.rpc('my_conversations'), LC.connections(),
      sb.from('connection_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', LC.me.id).eq('status', 'pending'),
      sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(5)
    ]);
    if (conv.error) throw conv.error;
    const cs = conv.data || [], unread = cs.reduce((s, x) => s + Number(x.unread), 0);
    $('#stats').innerHTML = [[unread, 'Unread', 'messages.html', '💬'], [conns.length, 'Connections', 'discover.html', '💞'], [reqs.count || 0, 'Requests', 'discover.html', '💌']].map(s => `<a class="card stat" href="${s[2]}" style="color:inherit"><span style="font-size:1.4rem">${s[3]}</span><b>${s[0]}</b><span class="muted">${s[1]}</span></a>`).join('');
    $('#recent').innerHTML = cs.length ? cs.slice(0, 4).map(c => `<a class="item" href="messages.html?c=${c.conversation_id}" style="color:inherit">${avatarDot(c)}<div class="grow"><b>${esc(c.display_name)}</b><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.last_body || 'Say hello 👋')}</div></div>${Number(c.unread) ? `<span class="badge">${c.unread}</span>` : ''}</a>`).join('') : '<div class="empty">No conversations yet. <a href="discover.html">Find someone to connect with →</a></div>';
    if (!cs.length) $('#quick').innerHTML = '<div class="empty">Connect with someone first to send love.</div>';
    else {
      let sel = cs[0].conversation_id;
      const days = id => { const c = conns.find(x => x.id === id); return c ? Math.max(0, Math.floor((Date.now() - new Date(c.connected_at)) / 864e5)) : null; };
      const draw = () => {
        const cur = cs.find(c => c.conversation_id === sel), d = days(cur.other_id);
        $('#quick').innerHTML = `<div class="chips-row">${cs.map(c => `<button class="chip ${c.conversation_id === sel ? 'on' : ''}" data-s="${c.conversation_id}">${avatar(c, 34)}<span>${esc(c.display_name)}</span></button>`).join('')}</div>
          <p class="muted" style="margin:8px 0 12px">${d === null ? '' : d === 0 ? '💞 Connected today' : `💞 Connected ${d} day${d > 1 ? 's' : ''}`}</p>
          <div class="qgrid"><button class="qb" data-k="text" data-b="Good morning ☀️ Wishing you a beautiful day full of smiles."><span>☀️</span>Good morning</button>
          <button class="qb" data-k="text" data-b="Goodnight 🌙 Sweet dreams, thinking of you."><span>🌙</span>Goodnight</button>
          <button class="qb" data-k="hug" data-b="Sent you a warm hug 🤗"><span>🤗</span>Hug</button>
          <button class="qb" data-k="kiss" data-b="Sent you a kiss 😘"><span>😘</span>Kiss</button></div>`;
        $$('#quick .chip').forEach(b => b.onclick = () => { sel = b.dataset.s; draw(); });
        $$('#quick .qb').forEach(b => b.onclick = async () => {
          b.disabled = true;
          try { await LC.sendMessage(sel, b.dataset.b, b.dataset.k); LC.floatHearts(b.querySelector('span').textContent, 12); toast('Sent 💌'); }
          catch (e) { toast(errMsg(e), 'err'); }
          b.disabled = false;
        });
      };
      draw();
    }
    const ns = notes.data || []; await LC.fetchNames(ns.map(n => n.actor_id));
    $('#notes').innerHTML = ns.length ? ns.map(n => { const t = LC.noteText(n, LC.names[n.actor_id]); return `<a class="item" href="${LC.noteUrl(n)}" style="color:inherit"><span style="font-size:1.4rem">${t.icon}</span><div class="grow ${n.read ? '' : 'unread'}"><div>${esc(t.text.slice(0, 100))}</div><div class="muted">${shortTime(n.created_at)}</div></div></a>`; }).join('') : '<div class="empty">Nothing new yet 💜</div>';
  } catch (e) { toast(errMsg(e), 'err'); }
}
if (document.body.dataset.page === 'home') LC.boot('home', initHome);

LC.showProfile = function (p) {
  if (!p) return;
  modal(`<div class="center">${avatarDot(p, 96)}<h2 style="margin-top:10px">${esc(p.display_name)}</h2><p class="muted">@${esc(p.username)}</p>
    <p style="margin:8px 0">${pill(p)}${p.status_text ? ` <span class="muted">· ${esc(p.status_text)}</span>` : ''}</p><p class="muted">${esc(statusLabel(p))}</p>
    <p style="margin:12px 0;white-space:pre-wrap">${esc(p.bio) || '<span class="muted">No bio yet.</span>'}</p></div>`);
};
