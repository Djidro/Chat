const page = document.body.dataset.page;
const back = () => new URL('login.html', location.href).href;
const setBusy = (btn, on, txt) => { btn.disabled = on; if (txt) btn.textContent = on ? 'Please wait…' : txt; };
let recovery = location.hash.includes('type=recovery');
sb.auth.onAuthStateChange(ev => { if (ev === 'PASSWORD_RECOVERY') { recovery = true; showReset(); } });
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session && !recovery) location.replace('index.html');
  if (recovery) showReset();
})();
function showReset() { $('#loginBox')?.classList.add('hidden'); $('#forgotBox')?.classList.add('hidden'); $('#resetBox')?.classList.remove('hidden'); }

if (page === 'login') {
  $('#loginForm').onsubmit = async e => {
    e.preventDefault(); const b = $('#loginBtn');
    const email = $('#email').value.trim(), password = $('#password').value;
    if (!email || !password) return toast('Enter your email and password.', 'err');
    setBusy(b, true, 'Log in');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { setBusy(b, false, 'Log in'); return toast(/confirm/i.test(error.message) ? 'Please verify your email first (check your inbox).' : errMsg(error), 'err'); }
    location.replace('index.html');
  };
  $('#toForgot').onclick = () => { $('#loginBox').classList.add('hidden'); $('#forgotBox').classList.remove('hidden'); };
  $('#toLogin').onclick = () => { $('#forgotBox').classList.add('hidden'); $('#loginBox').classList.remove('hidden'); };
  $('#forgotForm').onsubmit = async e => {
    e.preventDefault(); const b = $('#forgotBtn'), email = $('#femail').value.trim();
    if (!email) return toast('Enter your email.', 'err');
    setBusy(b, true, 'Send reset link');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: back() });
    setBusy(b, false, 'Send reset link');
    error ? toast(errMsg(error), 'err') : toast('Reset link sent. Check your email.');
  };
  $('#resetForm').onsubmit = async e => {
    e.preventDefault(); const p1 = $('#np1').value, p2 = $('#np2').value;
    if (p1.length < 8) return toast('Password must be at least 8 characters.', 'err');
    if (p1 !== p2) return toast('Passwords do not match.', 'err');
    const { error } = await sb.auth.updateUser({ password: p1 });
    if (error) return toast(errMsg(error), 'err');
    toast('Password updated 💜'); setTimeout(() => location.replace('index.html'), 900);
  };
}
if (page === 'register') {
  $('#regForm').onsubmit = async e => {
    e.preventDefault(); const b = $('#regBtn');
    const username = $('#username').value.trim().toLowerCase(), display = $('#display').value.trim();
    const email = $('#email').value.trim(), p1 = $('#password').value, p2 = $('#password2').value;
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return toast('Username: 3–20 letters, numbers or underscores.', 'err');
    if (!display || display.length > 40) return toast('Display name must be 1–40 characters.', 'err');
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email.', 'err');
    if (p1.length < 8) return toast('Password must be at least 8 characters.', 'err');
    if (p1 !== p2) return toast('Passwords do not match.', 'err');
    setBusy(b, true, 'Create account');
    const ok = await sb.rpc('username_available', { u: username });
    if (ok.error || ok.data === false) { setBusy(b, false, 'Create account'); return toast(ok.data === false ? 'That username is taken.' : errMsg(ok.error), 'err'); }
    const { data, error } = await sb.auth.signUp({ email, password: p1, options: { data: { username, display_name: display }, emailRedirectTo: back() } });
    setBusy(b, false, 'Create account');
    if (error) return toast(errMsg(error), 'err');
    if (data.session) return location.replace('index.html');
    $('#regForm').classList.add('hidden'); $('#done').classList.remove('hidden');
  };
}
