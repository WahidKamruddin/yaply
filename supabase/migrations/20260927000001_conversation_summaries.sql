-- Per-conversation sidebar summary for the caller: the newest live message and
-- unread / unread-@mention counts.
--
-- Both clients used to derive these by selecting EVERY non-deleted message in
-- every conversation the user belongs to (no limit) and scanning it client-side,
-- on every realtime message insert and every presence change. That grew without
-- bound with history and ran on the UI thread. This returns one row per
-- conversation, served by messages_conversation_idx (conversation_id, created_at desc).
--
-- Unread counting matches push_targets_for_message's badge subquery exactly
-- (deleted_at is null, type <> 'system', sender_id <> me, created_at > last_read_at)
-- so the in-app counts and the pushed badge agree. Mute and request_state are
-- deliberately NOT applied here: clients need the raw counts to render muted and
-- pending rows, and apply those rules themselves, as before.
--
-- The last message keeps its ciphertext fields (content/iv/enc_v); clients decrypt
-- the preview locally, exactly as they did with the old query.
--
-- SECURITY DEFINER to skip per-row RLS on messages; the only rows it can read are
-- conversations where auth.uid() is a member, and it takes no user id argument.

create or replace function public.get_conversation_summaries()
returns table (
  conversation_id uuid,
  last_message_id uuid,
  last_sender_id uuid,
  last_content text,
  last_iv text,
  last_enc_v smallint,
  last_type text,
  last_created_at timestamptz,
  unread_count integer,
  mention_unread_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    cm.conversation_id,
    lm.id,
    lm.sender_id,
    lm.content,
    lm.iv,
    lm.enc_v,
    lm.type,
    lm.created_at,
    coalesce(u.unread, 0),
    coalesce(u.mentions, 0)
  from public.conversation_members cm
  left join lateral (
    select m.id, m.sender_id, m.content, m.iv, m.enc_v, m.type, m.created_at
    from public.messages m
    where m.conversation_id = cm.conversation_id
      and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select
      count(*)::int as unread,
      count(*) filter (
        where m.mentions_everyone or cm.user_id = any(m.mentioned_user_ids)
      )::int as mentions
    from public.messages m
    where m.conversation_id = cm.conversation_id
      and m.deleted_at is null
      and m.type <> 'system'
      and m.sender_id <> cm.user_id
      and m.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
  ) u on true
  where cm.user_id = auth.uid();
$$;

alter function public.get_conversation_summaries() owner to postgres;
revoke all on function public.get_conversation_summaries() from public;
revoke all on function public.get_conversation_summaries() from anon;
grant execute on function public.get_conversation_summaries() to authenticated;
grant execute on function public.get_conversation_summaries() to service_role;
