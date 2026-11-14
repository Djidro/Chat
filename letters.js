let tab = 'inbox', L = { conns: [], rows: [], names: {} };
async function load() {
  const col = tab === 'sent' ? 'sender_id' : 'recipient_id';
  $('#lbody').innerHTML = '<div class="loading">Loading…</div>';
  const { data, error } = await sb.from('love_letters').select('*').eq(col, LC.me.id).order('created_at', { ascending: false }).limit(50);
  if (error) { $('#lbody').innerHTML = ''; return toast(errMsg(error), 'err'); }
  L.rows = data || [];
  const ids = [...new Set(L.rows.map(r => tab === 'sent' ? r.recipient_id : r.sender_id))];
  if (ids.length) (await sb.from('profiles').select('id,display_name,username').in('id', ids)).data?.forEach(p => L.names[p.id] = p);
  $('#lbody').innerHTML = L.rows.length ? L.rows.map(r => {
    const o = L.names[tab === 'sent' ? r.recipient_id : r.sender_id];
    return `<div class="card letter item" data-id="${r.id}" style="margin-bottom:12px;display:block"><div class="row sp"><b class="${tab === 'inbox' && !r.read_at ? 'unread' : ''}">${esc(r.title)}</b><span class="muted">${new Date(r.created_at).toLocaleDateString()}</span></div><div class="muted">${tab === 'sent' ? 'To' : 'From'} ${esc(o?.display_name || 'Unknown')}</div></div>`;
  }).join('') : `<div class="empty">${tab === 'sent' ? 'You have not sent any letters yet.' : 'No letters yet 💌'}</div>`;
  $$('#lbody [data-id]').forEach(el => el.onclick = () => open(L.rows.find(r => r.id === el.dataset.id)));
}
async function open(r) {
  const o = L.names[tab === 'sent' ? r.recipient_id : r.sender_id];
  const m = modal(`<div class="letter" style="padding:6px"><h2>${esc(r.title)}</h2><p class="muted" style="margin:4px 0 14px">${tab === 'sent' ? 'To' : 'From'} ${esc(o?.display_name || '')} · ${new Date(r.created_at).toLocaleString()}</p><div class="body">${esc(r.body)}</div>
    <div class="row" style="margin-top:18px"><button class="btn ghost sm" id="cl">Close</button>${tab === 'sent' ? '<button class="btn danger sm" id="del">Delete</button>' : ''}</div></div>`);
  $('#cl', m).onclick = () => m.remove();
  if (tab === 'sent') $('#del', m).onclick = async () => { if (!confirm('Delete this letter?')) return; const { error } = await sb.from('love_letters').delete().eq('id', r.id); if (error) return toast(errMsg(error), 'err'); m.remove(); load(); };
  if (tab === 'inbox' && !r.read_at) { await sb.from('love_letters').update({ read_at: new Date().toISOString() }).eq('id', r.id); r.read_at = 1; load(); }
}
function write() {
  $('#lbody').innerHTML = L.conns.length ? `<div class="card"><label class="field"><span>To</span><select id="to">${L.conns.map(p => `<option value="${p.id}">${esc(p.display_name)} (@${esc(p.username)})</option>`).join('')}</select></label>
    <label class="field"><span>Title</span><input id="ttl" maxlength="100" placeholder="My dearest…"></label>
    <label class="field"><span>Your letter</span><textarea id="txt" maxlength="5000" style="min-height:200px" placeholder="Write from the heart…"></textarea></label>
    <button class="btn block" id="send">Send letter 💌</button></div>` : '<div class="empty">You can send letters to your connections. <a href="discover.html">Find someone →</a></div>';
  const s = $('#send'); if (s) s.onclick = async () => {
    const title = $('#ttl').value.trim(), body = $('#txt').value.trim();
    if (!title || title.length > 100) return toast('Add a title (max 100 characters).', 'err');
    if (!body || body.length > 5000) return toast('Write your letter (max 5000 characters).', 'err');
    s.disabled = true;
    const { error } = await sb.from('love_letters').insert({ sender_id: LC.me.id, recipient_id: $('#to').value, title, body });
    s.disabled = false; if (error) return toast(errMsg(error), 'err');
    toast('Letter sent 💌'); LC.floatHearts('💌', 8); setTab('sent');
  };
}
function setTab(t) { tab = t; $$('.tab').forEach(x => x.classList.toggle('on', x.dataset.t === t)); t === 'write' ? write() : load(); }
LC.boot('letters', async () => {
  $('#view').innerHTML = `<h1 style="margin-bottom:14px">Love letters 💌</h1><div class="tabs"><span class="tab on" data-t="inbox">Inbox</span><span class="tab" data-t="sent">Sent</span><span class="tab" data-t="write">Write</span></div><div id="lbody"></div>`;
  $$('.tab').forEach(x => x.onclick = () => setTab(x.dataset.t));
  try { L.conns = await LC.connections(); } catch (e) { toast(errMsg(e), 'err'); }
  load();
});
