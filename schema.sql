-- LOVE CONNECT schema. ALREADY APPLIED to your Supabase project via migration "love_connect_schema".
-- Keep this file for re-deploying to a fresh project (paste into SQL Editor and run once).
-- (The first lines remove OLD empty tables of the previous "simple chat" app, if present.)
drop table if exists public.messages cascade;
drop table if exists public.conversation_participants cascade;
drop table if exists public.conversations cascade;
drop table if exists public.users cascade;
drop policy if exists storage_insert on storage.objects;
drop policy if exists storage_select on storage.objects;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 200),
  avatar_url text,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now());
create index profiles_username_idx on public.profiles (username text_pattern_ops);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (sender_id, receiver_id), check (sender_id <> receiver_id));
create index conn_req_receiver_idx on public.connection_requests (receiver_id, status);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b), unique (user_a, user_b));
create index connections_b_idx on public.connections (user_b);

create table public.conversations (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now());
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(), primary key (conversation_id, user_id));
create index conv_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  kind text not null default 'text' check (kind in ('text','hug','kiss','sticker','heart')),
  reply_to uuid references public.messages(id) on delete set null,
  read_at timestamptz, created_at timestamptz not null default now());
create index messages_conv_idx on public.messages (conversation_id, created_at desc);
create index messages_unread_idx on public.messages (conversation_id) where read_at is null;

create table public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(), unique (message_id, user_id, emoji));
create index reactions_msg_idx on public.message_reactions (message_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  type text not null, read boolean not null default false, created_at timestamptz not null default now());
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id), check (blocker_id <> blocked_id));
create index blocks_blocked_idx on public.user_blocks (blocked_id);

create table public.love_letters (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 5000),
  read_at timestamptz, created_at timestamptz not null default now(), check (sender_id <> recipient_id));
create index letters_recipient_idx on public.love_letters (recipient_id, created_at desc);
create index letters_sender_idx on public.love_letters (sender_id, created_at desc);

-- helpers
create function public.is_blocked_between(a uuid, b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)) $$;
create function public.blocked_me(u uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks where blocker_id = u and blocked_id = auth.uid()) $$;
create function public.are_connected(a uuid, b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.connections where user_a = least(a, b) and user_b = greatest(a, b)) $$;
create function public.is_member(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members where conversation_id = cid and user_id = auth.uid()) $$;
create function public.can_message(cid uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_member(cid) and not exists (select 1 from public.conversation_members m
    where m.conversation_id = cid and m.user_id <> auth.uid() and public.is_blocked_between(auth.uid(), m.user_id)) $$;
create function public.username_available(u text) returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where username = lower(u)) $$;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare uname text; dname text;
begin
  uname := lower(coalesce(new.raw_user_meta_data->>'username', ''));
  if uname !~ '^[a-z0-9_]{3,20}$' then uname := 'user' || substr(replace(new.id::text, '-', ''), 1, 8); end if;
  dname := left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), uname), 40);
  insert into public.profiles (id, username, display_name) values (new.id, uname, dname);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create function public.notify_new_request() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.notifications (user_id, actor_id, type) values (new.receiver_id, new.sender_id, 'connection_request'); return new; end $$;
create trigger on_request_created after insert on public.connection_requests for each row execute function public.notify_new_request();

create function public.respond_to_request(req_id uuid, accept boolean) returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.connection_requests; cid uuid;
begin
  select * into r from public.connection_requests where id = req_id and receiver_id = auth.uid() and status = 'pending' for update;
  if not found then raise exception 'Request not found'; end if;
  if public.is_blocked_between(r.sender_id, r.receiver_id) then raise exception 'Not allowed'; end if;
  update public.connection_requests set status = case when accept then 'accepted' else 'rejected' end where id = req_id;
  if accept then
    insert into public.connections (user_a, user_b) values (least(r.sender_id, r.receiver_id), greatest(r.sender_id, r.receiver_id)) on conflict do nothing;
    select m1.conversation_id into cid from public.conversation_members m1
      join public.conversation_members m2 on m1.conversation_id = m2.conversation_id
      where m1.user_id = r.sender_id and m2.user_id = r.receiver_id limit 1;
    if cid is null then
      insert into public.conversations default values returning id into cid;
      insert into public.conversation_members (conversation_id, user_id) values (cid, r.sender_id), (cid, r.receiver_id);
    end if;
    insert into public.notifications (user_id, actor_id, type) values (r.sender_id, r.receiver_id, 'request_accepted');
  end if;
  return cid;
end $$;

create function public.block_user(target uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if target = auth.uid() then raise exception 'Invalid'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
  delete from public.connections where user_a = least(auth.uid(), target) and user_b = greatest(auth.uid(), target);
  delete from public.connection_requests where (sender_id = auth.uid() and receiver_id = target) or (sender_id = target and receiver_id = auth.uid());
end $$;

create function public.mark_read(cid uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member(cid) then raise exception 'Not allowed'; end if;
  update public.messages set read_at = now() where conversation_id = cid and sender_id <> auth.uid() and read_at is null;
end $$;

create function public.my_conversations() returns table (conversation_id uuid, other_id uuid, username text, display_name text,
  avatar_url text, last_seen timestamptz, last_body text, last_kind text, last_at timestamptz, unread bigint)
language sql stable security invoker set search_path = '' as $$
  select c.id, p.id, p.username, p.display_name, p.avatar_url, p.last_seen, lm.body, lm.kind, lm.created_at,
    (select count(*) from public.messages m where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null)
  from public.conversations c
  join public.conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  join public.conversation_members ot on ot.conversation_id = c.id and ot.user_id <> auth.uid()
  join public.profiles p on p.id = ot.user_id
  left join lateral (select body, kind, created_at from public.messages m where m.conversation_id = c.id order by created_at desc limit 1) lm on true
  order by coalesce(lm.created_at, c.created_at) desc $$;

-- RLS
alter table public.profiles enable row level security;
alter table public.connection_requests enable row level security;
alter table public.connections enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.notifications enable row level security;
alter table public.user_blocks enable row level security;
alter table public.love_letters enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid() or not public.blocked_me(id));
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy req_select on public.connection_requests for select to authenticated using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy req_insert on public.connection_requests for insert to authenticated with check (sender_id = auth.uid() and status = 'pending'
  and not public.is_blocked_between(sender_id, receiver_id) and not public.are_connected(sender_id, receiver_id));
create policy req_delete on public.connection_requests for delete to authenticated using (sender_id = auth.uid() and status = 'pending');
create policy connections_select on public.connections for select to authenticated using (user_a = auth.uid() or user_b = auth.uid());
create policy conv_select on public.conversations for select to authenticated using (public.is_member(id));
create policy members_select on public.conversation_members for select to authenticated using (user_id = auth.uid() or public.is_member(conversation_id));
create policy msg_select on public.messages for select to authenticated using (public.is_member(conversation_id));
create policy msg_insert on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.can_message(conversation_id));
create policy msg_delete on public.messages for delete to authenticated using (sender_id = auth.uid());
create policy react_select on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));
create policy react_insert on public.message_reactions for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.can_message(m.conversation_id)));
create policy react_delete on public.message_reactions for delete to authenticated using (user_id = auth.uid());
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());
create policy blocks_select on public.user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_delete on public.user_blocks for delete to authenticated using (blocker_id = auth.uid());
create policy letters_select on public.love_letters for select to authenticated using (sender_id = auth.uid() or recipient_id = auth.uid());
create policy letters_insert on public.love_letters for insert to authenticated with check (sender_id = auth.uid()
  and public.are_connected(sender_id, recipient_id) and not public.is_blocked_between(sender_id, recipient_id));
create policy letters_update on public.love_letters for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy letters_delete on public.love_letters for delete to authenticated using (sender_id = auth.uid());

-- privileges
revoke all on all tables in schema public from anon;
revoke update on public.profiles from authenticated;
grant update (username, display_name, bio, avatar_url, last_seen) on public.profiles to authenticated;
revoke update on public.love_letters from authenticated;
grant update (read_at) on public.love_letters to authenticated;
revoke update on public.notifications from authenticated;
grant update (read) on public.notifications to authenticated;
revoke insert, update, delete on public.connections, public.conversations, public.conversation_members from authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_blocked_between(uuid,uuid), public.blocked_me(uuid), public.are_connected(uuid,uuid),
  public.is_member(uuid), public.can_message(uuid), public.respond_to_request(uuid,boolean), public.block_user(uuid),
  public.mark_read(uuid), public.my_conversations() to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

-- realtime
alter table public.messages replica identity full;
alter table public.message_reactions replica identity full;
alter publication supabase_realtime add table public.messages, public.message_reactions, public.notifications, public.connection_requests, public.connections;

-- storage (public "avatars" bucket, one folder per user)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']) on conflict (id) do nothing;
create policy avatars_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_update on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
