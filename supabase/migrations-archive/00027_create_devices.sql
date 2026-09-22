-- Codifies the `devices` table, which existed on the live project but was
-- never captured in a migration. Matches the live DDL exactly (verified
-- 2026-07-18). Fully idempotent — safe to apply where the table exists.

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id integer not null,
  identity_key text not null,
  signed_prekey jsonb,
  device_name text,
  push_subscription jsonb,
  last_active_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, device_id)
);

alter table public.devices enable row level security;

-- Owners manage their own device rows (the client upserts its public
-- identity key with onConflict user_id,device_id).
drop policy if exists "Users can manage own devices" on public.devices;
create policy "Users can manage own devices" on public.devices
  for all using (auth.uid() = user_id);

-- Anyone authenticated can read public keys — required for pairwise ECDH.
drop policy if exists "Users can read device public keys" on public.devices;
create policy "Users can read device public keys" on public.devices
  for select using (true);
