const sb = window.supabase.createClient(LC_CONFIG.SUPABASE_URL, LC_CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg, type = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 3500);
}
function errMsg(e) { return (e && e.message) ? e.message : 'Something went wrong. Please try again.'; }
function avatar(p, size = 44) {
  if (p && p.avatar_url) return `<img class="av" style="width:${size}px;height:${size}px" src="${esc(p.avatar_url)}" alt="" loading="lazy">`;
  const ch = esc(((p && (p.display_name || p.username)) || '?').trim().charAt(0).toUpperCase());
  return `<span class="av ph" style="width:${size}px;height:${size}px;font-size:${size * .42}px">${ch}</span>`;
}
const isOnline = ls => ls && (Date.now() - new Date(ls).getTime() < 120000);
function avatarDot(p, size = 44) { return `<span class="avw">${avatar(p, size)}<i class="dot ${isOnline(p && p.last_seen) ? 'on' : ''}"></i></span>`; }
function fmtTime(d) { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtDay(d) {
  const x = new Date(d), n = new Date(), y = new Date(Date.now() - 864e5);
  if (x.toDateString() === n.toDateString()) return 'Today';
  if (x.toDateString() === y.toDateString()) return 'Yesterday';
  return x.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}
function shortTime(d) {
  if (!d) return '';
  return new Date(d).toDateString() === new Date().toDateString() ? fmtTime(d) : new Date(d).toLocaleDateString([], { day: 'numeric', month: 'short' });
}
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card">${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m); return m;
}
function applyTheme() { document.documentElement.dataset.theme = localStorage.getItem('lc-theme') || 'dark'; }
applyTheme();
