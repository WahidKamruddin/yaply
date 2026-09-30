-- mark_delivered: only advance watermarks on conversations with something new.
--
-- The 20260927000003 version moved last_delivered_at forward on *every* one of
-- the caller's membership rows whenever the watermark advanced. Each row UPDATE
-- is a realtime event to every member of that conversation, so a user in 50
-- conversations receiving one message produced 50 UPDATEs and 50 broadcasts.
--
-- Now a row is only touched when the conversation holds a message from someone
-- else created after the row's current watermark and at or before the new one,
-- i.e. there is actually something new to acknowledge. The EXISTS is served by
-- messages_conversation_idx (conversation_id, created_at desc).
--
-- Leaving quiet conversations behind is harmless: a watermark only has to cover
-- the other members' messages, and the next message into a quiet conversation
-- advances it straight past everything before.
--
-- Same signature, so the web and iOS callers are unchanged.
create or replace function public.mark_delivered(p_until timestamptz)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  with bound as (
    select least(p_until + interval '1 millisecond', now()) as until
  )
  update public.conversation_members cm
  set last_delivered_at = bound.until
  from bound
  where cm.user_id = auth.uid()
    and (cm.last_delivered_at is null or cm.last_delivered_at < bound.until)
    and exists (
      select 1
      from public.messages m
      where m.conversation_id = cm.conversation_id
        and m.created_at > coalesce(cm.last_delivered_at, '-infinity'::timestamptz)
        and m.created_at <= bound.until
        and m.sender_id is distinct from auth.uid()
    );
$$;

alter function public.mark_delivered(timestamptz) owner to postgres;
revoke all on function public.mark_delivered(timestamptz) from public, anon;
grant execute on function public.mark_delivered(timestamptz) to authenticated, service_role;
