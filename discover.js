let D = { conns: [], sent: {}, incoming: [], blocked: [], profiles: {} };
async function loadRel() {
  const [cs, rq, bl] = await Promise.all([
    LC.connections(),
    sb.from('connection_requests').select('*').eq('status', 'pending'),
    sb.from('user_blocks').select('blocked_id')
  ]);
  if (rq.error) throw rq.error; if (bl.error) throw bl.error;
  D.conns = cs; D.sent = {}; D.incoming = [];
  (rq.data || []).forEach(r => r.sender_id === LC.me.id ? D.sent[r.receiver_id] = r : D.incoming.push(r));
  const ids = [...new Set([...D.incoming.map(r => r.sender_id), ...Object.keys(D.sent), ...(bl.data || []).map(b => b.blocked_id)])];
  D.profiles = {}; cs.forEach(p => D.profiles[p.id] = p);
  if (ids.length) (await sb.from('profiles').select('*').in('id', ids)).data?.forEach(p => D.profiles[p.id] = p);
  D.blocked = (bl.data || []).map(b => D.profiles[b.blocked_id]).filter(Boolean);
}
const rel = id => D.conns.some(c => c.id === id) ? 'conn' : D.sent[id] ? 'sent' : D.incoming.some(r => r.sender_id === id) ? 'in' : D.blocked.some(b => b.id === id) ? 'blocked' : 'none';
function actionBtn(p) {
  const r = rel(p.id);
  if (r === 'conn') return `<a class="btn sm" href="#" data-act="chat" data-id="${p.id}">Message</a>`;
  if (r === 'sent') return `<button class="btn sm ghost" data-act="cancel" data-id="${p.id}">Requested ✓</button>`;
  if (r === 'in') return `<span class="muted">Sent you a request</span>`;
  if (r === 'blocked') return `<button class="btn sm ghost" data-act="unblock" data-id="${p.id}">Unblock</button>`;
  return `<button class="btn sm" data-act="request" data-id="${p.id}">Connect 💜</button>`;
}
const personRow = (p, extra = '') => `<div class="item" data-prof="${p.id}">${avatarDot(p)}<div class="grow"><b>${esc(p.display_name)}</b><div class="muted">@${esc(p.username)}</div></div><div class="row" style="gap:6px">${extra || actionBtn(p)}</div></div>`;
async function render() {
  const inc = D.incoming.map(r => D.profiles[r.sender_id]).filter(Boolean);
  $('#lists').innerHTML = `
    ${inc.length ? `<div class="card"><h3>Connection requests</h3>${D.incoming.map(r => { const p = D.profiles[r.sender_id]; return p ? personRow(p, `<button class="btn sm" data-act="accept" data-id="${r.id}">Accept</button><button class="btn sm ghost" data-act="reject" data-id="${r.id}">Reject</button>`) : ''; }).join('')}</div>` : ''}
    <div class="card"><h3>Your connections (${D.conns.length})</h3>${D.conns.length ? D.conns.map(p => personRow(p, `<button class="btn sm" data-act="chat" data-id="${p.id}">Message</button><button class="btn sm danger" data-act="block" data-id="${p.id}">Block</button>`)).join('') : '<div class="empty">No connections yet. Search for a username above.</div>'}</div>
    ${D.blocked.length ? `<div class="card"><h3>Blocked</h3>${D.blocked.map(p => personRow(p)).join('')}</div>` : ''}`;
}
async function refresh() { try { await loadRel(); await render(); LC.refreshBadges(); } catch (e) { toast(errMsg(e), 'err'); } }
async function doSearch(q) {
  const box = $('#results'); q = q.trim().toLowerCase().replace(/^@/, '');
  if (!q) { box.innerHTML = ''; return; }
  if (!/^[a-z0-9_]{1,20}$/.test(q)) { box.innerHTML = '<div class="empty">Usernames use letters, numbers and underscores.</div>'; return; }
  box.innerHTML = '<div class="loading">Searching…</div>';
  const { data, error } = await sb.from('profiles').select('*').like('username', q + '%').neq('id', LC.me.id).order('username').limit(20);
  if (error) { box.innerHTML = ''; return toast(errMsg(error), 'err'); }
  data.forEach(p => D.profiles[p.id] = p);
  box.innerHTML = `<div class="card"><h3>Results</h3>${data.length ? data.map(p => personRow(p)).join('') : '<div class="empty">No users found 💔</div>'}</div>`;
}
async function handle(e) {
  const prof = e.target.closest('[data-prof]'); const b = e.target.closest('[data-act]');
  if (!b && prof) return showProfile(D.profiles[prof.dataset.prof]);
  if (!b) return; e.preventDefault(); e.stopPropagation();
  const id = b.dataset.id, act = b.dataset.act; b.disabled = true;
  try {
    if (act === 'request') { const { error } = await sb.from('connection_requests').insert({ sender_id: LC.me.id, receiver_id: id }); if (error) throw error; toast('Request sent 💌'); }
    if (act === 'cancel') { const { error } = await sb.from('connection_requests').delete().eq('id', D.sent[id].id); if (error) throw error; toast('Request cancelled'); }
    if (act === 'accept' || act === 'reject') { const { error } = await sb.rpc('respond_to_request', { req_id: id, accept: act === 'accept' }); if (error) throw error; toast(act === 'accept' ? 'Connected! 💞' : 'Request rejected'); }
    if (act === 'block') { if (!confirm('Block this user? They will no longer be able to contact you.')) { b.disabled = false; return; } const { error } = await sb.rpc('block_user', { target: id }); if (error) throw error; toast('User blocked'); }
    if (act === 'unblock') { const { error } = await sb.from('user_blocks').delete().eq('blocker_id', LC.me.id).eq('blocked_id', id); if (error) throw error; toast('User unblocked'); }
    if (act === 'chat') { const cid = await LC.conversationWith(id); if (cid) return location.href = 'messages.html?c=' + cid; throw new Error('Conversation not found.'); }
    await refresh(); $('#q').dispatchEvent(new Event('input'));
  } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; }
}
function showProfile(p) {
  if (!p) return;
  const m = modal(`<div class="center">${avatar(p, 96)}<h2 style="margin-top:10px">${esc(p.display_name)}</h2><p class="muted">@${esc(p.username)} · ${isOnline(p.last_seen) ? 'Online' : 'Offline'}</p>
    <p style="margin:14px 0;white-space:pre-wrap">${esc(p.bio) || '<span class="muted">No bio yet.</span>'}</p><p class="muted">Joined ${new Date(p.created_at).toLocaleDateString()}</p>
    <div style="margin-top:16px" id="pm">${actionBtn(p)}</div></div>`);
  m.querySelector('#pm').addEventListener('click', async e => { await handle(e); m.remove(); });
}
LC.boot('discover', async () => {
  $('#view').innerHTML = `<div class="stack"><h1>Discover</h1><input id="q" placeholder="Search by username…" maxlength="21" autocomplete="off"><div id="results"></div><div id="lists"><div class="loading">Loading…</div></div></div>`;
  let t; $('#q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => doSearch($('#q').value), 300); });
  $('#view').addEventListener('click', handle);
  sb.channel('disc').on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, refresh).on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, refresh).subscribe();
  await refresh();
});
