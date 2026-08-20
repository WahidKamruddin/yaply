-- Device management: naming and real revocation.
--
-- Deleting a device row alone is NOT a sign-out — the device keeps a valid
-- Supabase session and would simply re-register itself on the next login,
-- re-publishing the same keypair from IndexedDB and silently undoing the
-- revocation. Real revocation therefore has three parts, all of which must
-- happen or the feature is theatre:
--   1. delete the devices row      → peers stop sealing new messages to it
--   2. delete its auth.sessions row → its refresh token dies (cascade on
--      auth.refresh_tokens), so the session cannot be renewed
--   3. the device clears its local keys → it cannot resurrect the same
--      identity, and must re-pair to read history again
-- Steps 1-2 are this migration; step 3 is client-side (see useDeviceRevocation
-- and the orphan check in registerDevice).

-- The auth session this install signed in with, captured from the access
-- token's `session_id` claim at registration. Nullable: rows written before
-- this migration have none, and revoking one of those can only do step 1.
alter table public.devices add column if not exists session_id uuid;

-- 'web' | 'ios' | 'android'. Kept separate from device_name so a user rename
-- can never lose which platform a device is, and so iOS can pick an icon.
alter table public.devices add column if not exists platform text;

-- Revokes one of the CALLER'S OWN devices. Security definer because
-- auth.sessions is not reachable from the anon/authenticated roles, so the
-- ownership check inside is the only thing standing between a caller and
-- someone else's session — it filters on auth.uid() and never trusts a
-- user id from the arguments.
create or replace function public.revoke_device(p_device_id integer)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_session uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select d.session_id into v_session
  from public.devices d
  where d.user_id = v_uid and d.device_id = p_device_id;

  if not found then
    raise exception 'device not found';
  end if;

  delete from public.devices
  where user_id = v_uid and device_id = p_device_id;

  -- Kills the refresh token too (auth.refresh_tokens.session_id cascades), so
  -- the device is locked out once its current access token expires — or
  -- immediately, if it is online and sees the realtime delete below.
  if v_session is not null then
    delete from auth.sessions where id = v_session;
  end if;
end;
$$;

revoke all on function public.revoke_device(integer) from public, anon;
grant execute on function public.revoke_device(integer) to authenticated;

-- Lets a revoked device react instantly instead of waiting out its access
-- token. The client subscribes filtered to its own row id, so no other user's
-- device ids are observable (delete events carry only the primary key).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'devices'
  ) then
    alter publication supabase_realtime add table public.devices;
  end if;
end
$$;
