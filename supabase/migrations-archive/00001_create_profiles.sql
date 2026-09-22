-- ─── User profiles ────────────────────────────────────────────────────────────
-- Extends the built-in auth.users table with app-level profile data.
-- The public_key column stores the Base64-encoded ECDH P-256 public key
-- uploaded by the client after key generation.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique,
  display_name text,
  avatar_url   text,
  bio          text,
  public_key   text,         -- Base64 ECDH P-256 public key, nullable until first login
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Username must be lowercase alphanumeric + _ - .
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[a-z0-9_.\-]+$');

-- Row-level security
alter table public.profiles enable row level security;

create policy "profiles: anyone can read"
  on public.profiles for select
  using (true);

create policy "profiles: owner can update"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
