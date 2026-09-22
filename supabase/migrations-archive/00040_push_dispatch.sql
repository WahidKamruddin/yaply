-- The hop from a database write to the send-push edge function.
--
-- Written as a migration rather than a dashboard "Database Webhook" so the
-- wiring is in version control and reproducible on a fresh project. A dashboard
-- webhook is itself just a pg_net trigger — this is the same mechanism,
-- declared rather than clicked.
--
-- Nothing here does anything until the two vault secrets below exist, so
-- applying this migration before the function is deployed is inert and safe.

create extension if not exists pg_net with schema extensions;

-- ─── Config ───────────────────────────────────────────────────────────────────
-- Secrets live in supabase_vault (encrypted at rest, and its decrypted view is
-- postgres-only) rather than in `alter database ... set`, where any session
-- could read them back with current_setting().
--
-- The VALUES are inserted by hand, once, and never committed:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push',
--                              'push_fn_url', 'send-push endpoint');
--   select vault.create_secret('<openssl rand -hex 32>',
--                              'push_webhook_secret', 'shared secret for trigger -> send-push');

-- Security definer so it can read vault.decrypted_secrets. Execute is revoked
-- from every client role: reachable from triggers (which run as the table
-- owner) and from nowhere else. Left callable over PostgREST it would be a
-- secret-exfiltration endpoint.
create or replace function public.push_config(p_name text)
returns text
language sql
stable
security definer
set search_path = vault, public, pg_temp
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;

revoke all on function public.push_config(text) from public, anon, authenticated;

-- ─── Enqueue ──────────────────────────────────────────────────────────────────
-- Every notification trigger funnels through here, so the URL, the auth header
-- and the failure semantics are defined exactly once.
--
-- net.http_post only inserts into pg_net's queue and returns immediately — a
-- background worker performs the HTTP. Two consequences, both wanted: the
-- originating insert is never slowed by network latency, and the enqueue is
-- transactional, so a rolled-back message never notifies.

create or replace function public.enqueue_push(p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_url    text := public.push_config('push_fn_url');
  v_secret text := public.push_config('push_webhook_secret');
begin
  -- Not configured yet. Do nothing, and never raise.
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := p_body,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-push-secret', v_secret
               ),
    timeout_milliseconds := 5000
  );
exception when others then
  -- A broken vault entry, a dropped extension, anything at all: the push is
  -- lost, the write that triggered it still succeeds.
  raise warning 'enqueue_push failed: %', sqlerrm;
end;
$$;

revoke all on function public.enqueue_push(jsonb) from public, anon, authenticated;

-- ─── messages AFTER INSERT ────────────────────────────────────────────────────
-- A trigger rather than a hook inside send_message_with_envelopes, because
-- there are two insert paths: encrypted text goes through that RPC, but media,
-- sticker, gif, voice, system and phase-1 messages are plain INSERTs. AFTER
-- INSERT on `messages` is the only choke point covering both.

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- System messages are UI chrome ("Task created: ..."), and they are the one
  -- message type stored as readable plaintext. Pushing them would be both noise
  -- and the only payload on this path carrying content the server can read.
  if new.type = 'system' then
    return new;
  end if;

  if new.deleted_at is not null then
    return new;
  end if;

  -- Only the id travels. The function re-reads with the service role, so the
  -- queue row stays small and no ciphertext or envelope material is ever
  -- written into pg_net's tables.
  perform public.enqueue_push(
    jsonb_build_object('kind', 'message', 'message_id', new.id)
  );
  return new;
exception when others then
  -- Belt and braces on top of enqueue_push's own handler. Sending a message
  -- must never fail because a notification could not be dispatched.
  return new;
end;
$$;

drop trigger if exists messages_notify_push on public.messages;
create trigger messages_notify_push
  after insert on public.messages
  for each row execute function public.notify_new_message();
