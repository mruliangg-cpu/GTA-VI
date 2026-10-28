-- GTA VI - Ulian Edition: Supabase schema
-- Run in Supabase Dashboard -> SQL Editor (or `supabase db push`).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_uniq
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

create table if not exists public.game_saves (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Create profile automatically on sign-up (username passed in sign-up metadata)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', 'player' || substr(new.id::text, 1, 6));
  insert into public.profiles (id, username) values (new.id, uname);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.game_saves enable row level security;

create policy "profiles readable by signed-in users" on public.profiles
  for select to authenticated using (true);
create policy "update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester, addressee));
create policy "send friend request" on public.friendships
  for insert to authenticated with check (auth.uid() = requester and status = 'pending');
create policy "addressee accepts" on public.friendships
  for update to authenticated using (auth.uid() = addressee) with check (auth.uid() = addressee and status = 'accepted');
create policy "either side removes" on public.friendships
  for delete to authenticated using (auth.uid() in (requester, addressee));

create policy "own save select" on public.game_saves
  for select to authenticated using (auth.uid() = user_id);
create policy "own save insert" on public.game_saves
  for insert to authenticated with check (auth.uid() = user_id);
create policy "own save update" on public.game_saves
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
