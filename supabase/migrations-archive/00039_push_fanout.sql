-- Fanout queries for the send-push edge function.
--
-- These are RPCs rather than raw SQL inside the function so the join that picks
-- each device's envelope lives next to the schema it depends on, can be tested
-- from the SQL editor with no deploy, and moves in lockstep with any change to
-- the envelope wire format in 00029.
--
-- Both are service-role only: execute is revoked from anon/authenticated. They
-- return other users' push tokens and envelope material, so exposing them over
-- PostgREST would be a data leak regardless of what RLS says about the
-- underlying tables.

-- ─── Targets ──────────────────────────────────────────────────────────────────
-- One row per (recipient device token × the envelope that device can open).
--
-- Suppression mirrors the rules the clients already apply in-app, because a
-- push that contradicts the in-app behaviour is a bug the user notices
-- immediately: never the sender, never a pending/declined message request,
-- never a muted conversation, never across a block.

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
      -- The project-wide mute convention: muted iff the timestamp is in the
      -- future. NULL or past = not muted. Matches conversations.ts and
      -- ConversationRepository.
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
    (select count(*)::int
       from public.messages um
      where um.conversation_id = m.conversation_id
        and um.deleted_at is null
        and um.type <> 'system'
        and um.sender_id <> r.user_id
        and um.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz))
  from recips r
  cross join m
  join public.devices d
    on d.user_id = r.user_id
   -- Mirrors the sender-side fan-out bound in encryptForMembers /
   -- fetchActiveDeviceRows: a device inactive for 90 days got no envelope, so
   -- there is nothing to push it anyway.
   and d.last_active_at > now() - interval '90 days'
  join public.push_tokens pt
    on pt.user_id = d.user_id
   and pt.device_id = d.device_id
  left join public.message_envelopes e
    on e.message_id = m.id
   and e.recipient_user_id = d.user_id
   and e.recipient_fp = d.key_fingerprint
  where m.deleted_at is null
    -- An enc_v = 2 message with no envelope for this device is permanently
    -- unreadable by it — the device registered after the send. Pushing a
    -- notification whose body can never resolve to text is worse than silence,
    -- so drop the target. Media and phase-1 messages carry no envelope by
    -- design and always pass.
    and (m.enc_v is distinct from 2 or e.id is not null);
$$;

revoke all on function public.push_targets_for_message(uuid) from public, anon, authenticated;

-- ─── Message context ──────────────────────────────────────────────────────────
-- Everything shared by every target's payload, fetched once per message.
-- `content` and `iv` are the ciphertext as stored; the server never decrypts
-- them and could not if it wanted to.

create or replace function public.push_message_context(p_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'message_id',        m.id,
    'conversation_id',   m.conversation_id,
    'conversation_type', c.type::text,
    'conversation_name', c.name,
    'sender_id',         m.sender_id,
    'sender_name',       coalesce(p.display_name, p.username),
    'sender_username',   p.username,
    'sender_avatar_url', p.avatar_url,
    'type',              m.type::text,
    'enc_v',             m.enc_v,
    'iv',                m.iv,
    'content',           m.content,
    'media_mime',        m.media_mime,
    'reply_to_id',       m.reply_to_id,
    'created_at',        m.created_at
  )
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.profiles p on p.id = m.sender_id
  where m.id = p_message_id
    and m.deleted_at is null;
$$;

revoke all on function public.push_message_context(uuid) from public, anon, authenticated;

-- ─── Token failure bookkeeping ────────────────────────────────────────────────
-- Called by the sender after a non-fatal APNs failure. Retires a token only
-- after 10 consecutive failures, so a transient outage at Apple cannot wipe
-- the table. A successful send resets fail_count to 0.

create or replace function public.push_token_record_failure(p_token text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_tokens
  where token = p_token and fail_count >= 9;

  update public.push_tokens
  set fail_count = fail_count + 1
  where token = p_token;
$$;

revoke all on function public.push_token_record_failure(text) from public, anon, authenticated;
