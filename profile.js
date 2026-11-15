function view() {
  const p = LC.profile;
  $('#view').innerHTML = `<div class="stack" style="max-width:560px"><h1>Your profile</h1>
  <div class="card center">${avatar(p, 110)}<h2 style="margin-top:10px">${esc(p.display_name)}</h2><p class="muted">@${esc(p.username)}</p><p style="margin-top:6px">${pill(p)}${p.status_text ? ` <span class="muted">· ${esc(p.status_text)}</span>` : ''}</p><p style="margin-top:10px;white-space:pre-wrap">${esc(p.bio) || '<span class="muted">Add a short bio below.</span>'}</p></div>
  <div class="card"><h3 style="margin-bottom:12px">My status</h3>
    <div class="tabs" id="sts">${[['available', '🟢 Available'], ['busy', '🔴 Busy'], ['away', '🟡 Away']].map(s => `<span class="tab ${p.status === s[0] ? 'on' : ''}" data-s="${s[0]}">${s[1]}</span>`).join('')}</div>
    <label class="field"><span>Custom status message (optional)</span><input id="stt" maxlength="60" value="${esc(p.status_text)}" placeholder="e.g. At work, back at 6 ☕"></label>
    <button class="btn block" id="stsave" type="button">Save status</button></div>
  <form class="card" id="pf"><h3 style="margin-bottom:12px">Edit profile</h3>
    <label class="field"><span>Profile picture (JPG, PNG or WebP, max 2 MB)</span><input id="file" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <label class="field"><span>Username</span><input id="un" maxlength="20" value="${esc(p.username)}" autocapitalize="none"></label>
    <label class="field"><span>Display name</span><input id="dn" maxlength="40" value="${esc(p.display_name)}"></label>
    <label class="field"><span>Bio (<b id="cnt">${p.bio.length}</b>/200)</span><textarea id="bio" maxlength="200">${esc(p.bio)}</textarea></label>
    <button class="btn block" id="save">Save changes</button></form>
  <a class="btn ghost block" href="settings.html">Account settings</a></div>`;
  $('#bio').oninput = () => $('#cnt').textContent = $('#bio').value.length;
  $('#pf').onsubmit = save;
  let st = p.status; $$('#sts .tab').forEach(t => t.onclick = () => { st = t.dataset.s; $$('#sts .tab').forEach(x => x.classList.toggle('on', x === t)); });
  $('#stsave').onclick = async () => {
    const b = $('#stsave'); b.disabled = true;
    const { data, error } = await sb.from('profiles').update({ status: st, status_text: $('#stt').value.trim().slice(0, 60) }).eq('id', LC.me.id).select().single();
    b.disabled = false; if (error) return toast(errMsg(error), 'err');
    LC.profile = data; toast('Status updated'); view();
  };
}
async function save(e) {
  e.preventDefault();
  const username = $('#un').value.trim().toLowerCase(), display_name = $('#dn').value.trim(), bio = $('#bio').value.trim();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return toast('Username: 3–20 letters, numbers or underscores.', 'err');
  if (!display_name || display_name.length > 40) return toast('Display name must be 1–40 characters.', 'err');
  const b = $('#save'); b.disabled = true; b.textContent = 'Saving…';
  try {
    const upd = { username, display_name, bio };
    const f = $('#file').files[0];
    if (f) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) throw new Error('Please choose a JPG, PNG or WebP image.');
      if (f.size > 2 * 1024 * 1024) throw new Error('Image must be under 2 MB.');
      const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${LC.me.id}/avatar-${Date.now()}.${ext}`;
      const up = await sb.storage.from('avatars').upload(path, f, { contentType: f.type, upsert: true });
      if (up.error) throw up.error;
      upd.avatar_url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await sb.from('profiles').update(upd).eq('id', LC.me.id).select().single();
    if (error) throw new Error(error.code === '23505' ? 'That username is already taken.' : error.message);
    LC.profile = data; toast('Profile saved 💜'); view();
  } catch (err) { toast(errMsg(err), 'err'); b.disabled = false; b.textContent = 'Save changes'; }
}
LC.boot('profile', view);
