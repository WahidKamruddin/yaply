-- Badge count: total unread, not one conversation's unread.
--
-- push_targets_for_message scoped its unread subquery to the conversation the
-- message arrived in, so the app icon showed "3" because one chat had three
-- unread — not because there were three unread overall. The number jumped around
-- as different conversations received messages and never reflected the inbox.
--
-- Counting across every accepted, unmuted conversation makes it mean what a badge
-- is universally taken to mean, and matches what the client computes locally when
-- it clears the badge after a read. The two must agree or they will fight: the
-- client recomputes on refresh and foreground, the server on each send.
--
-- Everything else about the function is unchanged; only the unread_count column
-- of the select list differs.

create or replace function public.push_targets_for_message(p_message_id uuid)
returns table (
  token        text,
  environment  text,
  recipient_id uuid,
  device_id    integer,
  recipient_fp text,
  eph_pub      text,
  key_iv       text,
  wrapped_key  text,
  unread_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with m as (
    select id, conversation_id, sender_id, enc_v, deleted_at
    from public.messages
    where id = p_message_id
  ),
  recips as (
    select cm.user_id, cm.last_read_at
    from public.conversation_members cm
    join m on m.conversation_id = cm.conversation_id
    where cm.user_id <> m.sender_id
      and cm.request_state = 'accepted'
      and (cm.muted_until is null or cm.muted_until <= now())
      and not public.is_blocked_between(cm.user_id, m.sender_id)
  )
  select
    pt.token,
    pt.environment,
    d.user_id,
    d.device_id,
    e.recipient_fp,
    e.eph_pub,
    e.key_iv,
    e.wrapped_key,
    -- Total across the recipient's whole inbox. Each conversation is compared
    -- against its OWN last_read_at, which is why this joins conversation_members
    -- again rather than reusing r.last_read_at (that one belongs to the
    -- conversation this message arrived in).
    (select count(*)::int
       from public.conversation_members cm2
       join public.messages um on um.conversation_id = cm2.conversation_id
      where cm2.user_id = r.user_id
        and cm2.request_state = 'accepted'
        and (cm2.muted_until is null or cm2.muted_until <= now())
        and um.deleted_at is null
        and um.type <> 'system'
        and um.sender_id <> r.user_id
        and um.created_at > coalesce(cm2.last_read_at, '-infinity'::timestamptz))
  from recips r
  cross join m
  join public.devices d
    on d.user_id = r.user_id
   and d.last_active_at > now() - interval '90 days'
  join public.push_tokens pt
    on pt.user_id = d.user_id
   and pt.device_id = d.device_id
  left join public.message_envelopes e
    on e.message_id = m.id
   and e.recipient_user_id = d.user_id
   and e.recipient_fp = d.key_fingerprint
  where m.deleted_at is null
    and (m.enc_v is distinct from 2 or e.id is not null);
$$;

revoke all on function public.push_targets_for_message(uuid) from public, anon, authenticated;
