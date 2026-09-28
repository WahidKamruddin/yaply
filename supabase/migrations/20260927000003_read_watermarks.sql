-- Messenger-style read receipts: per-member, per-conversation watermarks.
--
-- Messenger models reads and deliveries as watermarks, not per-message rows:
-- "All messages that were sent before or at this timestamp were read"
-- (Messenger Platform message_reads / message_deliveries). We do the same:
--   conversation_members.last_read_at      — read watermark (already existed)
--   conversation_members.last_delivered_at — delivery watermark (new)
--
-- Clients learn about other members' watermarks from conversation_members
-- UPDATE events filtered by conversation_id, which replaces the unfilterable
-- message_reads subscription. message_reads is left in place, unused, until
-- older app builds that still insert into it are gone.
--
-- Both RPCs use the server clock: last_read_at used to be written with the
-- client's clock, and a client running behind never reached a message's
-- (server) created_at, so it could never show as seen. Both only ever move a
-- watermark forward, and only on the caller's own rows.

alter table public.conversation_members
  add column last_delivered_at timestamptz;

-- Reading implies delivery.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.conversation_members
  set last_read_at = greatest(coalesce(last_read_at, '-infinity'::timestamptz), now()),
      last_delivered_at = greatest(coalesce(last_delivered_at, '-infinity'::timestamptz), now())
  where conversation_id = p_conversation_id
    and user_id = auth.uid();
$$;

-- p_until is the newest created_at the client has actually received (the
-- newest last_created_at from get_conversation_summaries, or a realtime
-- insert's created_at): anything created after that fetch has a later
-- created_at, so nothing is marked delivered early. Rows already at or past it
-- are skipped, so a repeat call writes nothing and emits no realtime event.
--
-- p_until is rounded up by 1ms: iOS sends Dates at millisecond precision while
-- created_at carries microseconds, so an unrounded watermark could land a few
-- microseconds *before* the very message it acknowledges.
create or replace function public.mark_delivered(p_until timestamptz)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.conversation_members
  set last_delivered_at = least(p_until + interval '1 millisecond', now())
  where user_id = auth.uid()
    and (last_delivered_at is null
         or last_delivered_at < least(p_until + interval '1 millisecond', now()));
$$;

alter function public.mark_conversation_read(uuid) owner to postgres;
alter function public.mark_delivered(timestamptz) owner to postgres;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.mark_delivered(timestamptz) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated, service_role;
grant execute on function public.mark_delivered(timestamptz) to authenticated, service_role;
