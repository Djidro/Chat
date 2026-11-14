LC.boot('settings', () => {
  const dark = (localStorage.getItem('lc-theme') || 'dark') === 'dark';
  $('#view').innerHTML = `<div class="stack" style="max-width:560px"><h1>Settings</h1>
  <div class="card row sp"><div><h3>Appearance</h3><p class="muted">Switch between dark and light mode</p></div><button class="btn ghost" id="theme">${dark ? '☀️ Light' : '🌙 Dark'}</button></div>
  <div class="card"><div class="row sp"><div><h3>Phone notifications 🔔</h3><p class="muted" id="ps">Checking…</p></div><button class="btn" id="pb" disabled>…</button></div>
    <p class="muted" style="margin-top:10px">iPhone: first open this site in Safari → Share → <b>Add to Home Screen</b>, then open it from the Home Screen and enable here.</p></div>
  <form class="card" id="ef"><h3 style="margin-bottom:4px">Email</h3><p class="muted" style="margin-bottom:12px">Current: ${esc(LC.me.email)}. A confirmation link is sent to the new address.</p>
    <label class="field"><span>New email</span><input id="ne" type="email" required></label><button class="btn block">Change email</button></form>
  <form class="card" id="pf"><h3 style="margin-bottom:12px">Change password</h3>
    <label class="field"><span>New password (min 8)</span><input id="p1" type="password" minlength="8" autocomplete="new-password" required></label>
    <label class="field"><span>Repeat password</span><input id="p2" type="password" minlength="8" autocomplete="new-password" required></label><button class="btn block">Update password</button></form>
  <button class="btn danger block" id="out">Log out</button></div>`;
  const refreshPush = async () => {
    const st = await LC.pushState(), b = $('#pb'), t = $('#ps');
    const m = { unsupported: ['Not supported in this browser', 'Unavailable', true], denied: ['Blocked in your browser settings', 'Blocked', true], on: ['Enabled on this device ✓', 'Turn off', false], off: ['Get alerts even when the site is closed', 'Turn on', false] }[st];
    t.textContent = m[0]; b.textContent = m[1]; b.disabled = m[2]; b.className = 'btn ' + (st === 'on' ? 'ghost' : ''); b.dataset.st = st;
  };
  $('#pb').onclick = async () => {
    const b = $('#pb'); b.disabled = true;
    try { if (b.dataset.st === 'on') { await LC.disablePush(); toast('Phone notifications off'); } else { await LC.enablePush(); toast('Phone notifications on 🔔'); } }
    catch (e) { toast(errMsg(e), 'err'); }
    refreshPush();
  };
  refreshPush();
  $('#theme').onclick = () => { const n = (localStorage.getItem('lc-theme') || 'dark') === 'dark' ? 'light' : 'dark'; localStorage.setItem('lc-theme', n); applyTheme(); $('#theme').textContent = n === 'dark' ? '☀️ Light' : '🌙 Dark'; };
  $('#ef').onsubmit = async e => { e.preventDefault(); const em = $('#ne').value.trim(); if (!/^\S+@\S+\.\S+$/.test(em)) return toast('Enter a valid email.', 'err'); const { error } = await sb.auth.updateUser({ email: em }, { emailRedirectTo: new URL('login.html', location.href).href }); error ? toast(errMsg(error), 'err') : toast('Check your new email to confirm.'); };
  $('#pf').onsubmit = async e => { e.preventDefault(); const a = $('#p1').value; if (a.length < 8) return toast('Password must be at least 8 characters.', 'err'); if (a !== $('#p2').value) return toast('Passwords do not match.', 'err'); const { error } = await sb.auth.updateUser({ password: a }); if (error) return toast(errMsg(error), 'err'); toast('Password updated 💜'); e.target.reset(); };
  $('#out').onclick = LC.logout;
});
