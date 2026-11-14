# Love Connect ❤ — free multi-user romantic messaging site

HTML + CSS + vanilla JS, Supabase (free) backend, GitHub Pages (free) hosting. Total cost: **0 OMR**.

## What is already done for you
Your Supabase project **"simple chat"** (`rfvixnyqlgcjlohissva`) is already configured:
database tables, RLS security, realtime, and the public `avatars` storage bucket.
`js/config.js` already contains your project URL and **publishable** key (safe to publish).
Never put a `service_role` / secret key in this project.

## Do these 3 things in the Supabase dashboard (my connector can't change Auth settings)
1. **Authentication → Providers → Email**: keep "Confirm email" ON (this is email verification).
2. **Authentication → URL Configuration**:
   - *Site URL*: `https://YOUR-GITHUB-USERNAME.github.io/love-connect/`
   - *Redirect URLs*: add the same URL with `**` at the end, e.g. `https://YOUR-GITHUB-USERNAME.github.io/love-connect/**`
   (needed so verification and password-reset emails open your site).
3. Optional: **Authentication → Rate limits / SMTP** — the free built-in email sender allows only a few emails per hour. For many users, add a free SMTP (e.g. Brevo free plan).

## Deploy on GitHub Pages (free)
1. Create a GitHub account → **New repository** named `love-connect` (Public).
2. Upload **all files in this folder** (keep the folders `css`, `js`, `assets`, `database`).
3. Repository **Settings → Pages** → Source: *Deploy from a branch* → Branch `main`, folder `/ (root)` → Save.
4. After ~1 minute your site is live at `https://YOUR-GITHUB-USERNAME.github.io/love-connect/login.html`.

## Test it
Register two accounts (use two different browsers), verify both emails, then on **Discover** search the other username → Connect → accept on the other account → open **Messages**.

## Features
Register/login/logout, email verification, password reset, unique usernames, profile pictures, bio, settings · Discover, connection requests, block/unblock · real-time chat (replies, delete own, reactions, read receipts ✓✓, online status, unread counts, paginated history) · hugs, kisses, stickers, animated hearts, love letters, daily quote, good morning/goodnight · dark/light mode, desktop sidebar, mobile bottom nav.

## Security summary
RLS on every table; users edit only their own profile; messages only inside conversations you belong to; only connected users can chat or send letters; blocked users cannot message, react or write letters; conversations/connections are created only by secured database functions; avatar uploads limited to your own folder (JPG/PNG/WebP, 2 MB).

## Notes
- `database/schema.sql` is for re-creating the setup on a fresh project (already applied to yours).
- Online status = seen in the last 2 minutes. Account deletion is not included (it needs a server-side function).
- Free-tier limits: 50,000 monthly users, 500 MB database, 1 GB storage; inactive free projects pause after 1 week without activity.


## Update: notifications, push & Home
- Love letters were removed (table dropped; it was empty).
- Bell icon on every page + live alerts (toast + sound) for messages, hugs, kisses, stickers, reactions and requests.
- Phone push: Settings → "Phone notifications" → Turn on. Needs HTTPS (GitHub Pages is). On iPhone the site must be added to the Home Screen first (iOS 16.4+).
- Push is sent by the Supabase Edge Function `send-push` (already deployed). The VAPID private key lives only in the database table `push_config`, never in the website.
