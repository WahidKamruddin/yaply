-- @mentions: @username and @everyone in group chats, plus a two-level mute
-- model (mute chat but still notify on mentions, vs mute everything).
--
-- messages.content is E2E ciphertext (wire-format v2) — the server can never
-- read it, so it cannot know who was @mentioned by parsing content. Mention
-- targeting therefore travels as a plaintext side-channel on the messages
-- row, the same precedent already set by reply_to_id/thread_id. It leaks who
-- was mentioned, never message text — consistent with the documented
-- "metadata is plaintext" limitation.

-- ─── Columns ────────────────────────────────────────────────────────────────

alter table public.messages
  add column mentioned_user_ids uuid[] not null default '{}',
  add column mentions_everyone  boolean not null default false;

alter table public.messages
  add constraint messages_mentions_text_only
  check (type = 'text' or (mentioned_user_ids = '{}' and mentions_everyone = false));

create index messages_mentions_gin on public.messages using gin (mentioned_user_ids)
  where mentioned_user_ids <> '{}';

-- Two-level mute: `muted_until` set + mute_mentions = false (default) still
-- notifies on a mention; muted_until set + mute_mentions = true is silent.
-- mute_mentions is only meaningful while muted_until is in the future —
-- unmuting must reset both, enforced client-side, not by a constraint.
alter table public.conversation_members
  add column mute_mentions boolean not null default false;

-- ─── Anti-spoof trigger ─────────────────────────────────────────────────────
--
-- The plain `messages` insert path (phase-1 fallback, media, system messages)
-- bypasses send_message_with_envelopes entirely, so that RPC cannot be the
-- only place mentions are validated. Without this trigger any client could
-- set mentioned_user_ids to an arbitrary user id and punch through their
-- mute. Any group member may legitimately @everyone — that mute-bypass is
-- the feature working as designed, not a hole this trigger needs to close.

create or replace function public.sanitize_message_mentions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conv_type text;
begin
  select type into v_conv_type
  from public.conversations
  where id = new.conversation_id;

  if v_conv_type is distinct from 'group' or new.type <> 'text' then
    new.mentioned_user_ids := '{}';
    new.mentions_everyone := false;
    return new;
  end if;

  if new.mentioned_user_ids is null then
    new.mentioned_user_ids := '{}';
  end if;

  select coalesce(array_agg(distinct uid), '{}')
    into new.mentioned_user_ids
  from unnest(new.mentioned_user_ids[1:64]) as uid
  where uid <> new.sender_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = new.conversation_id
        and cm.user_id = uid
    );

  return new;
end;
$$;

drop trigger if exists trg_messages_sanitize_mentions on public.messages;
create trigger trg_messages_sanitize_mentions
  before insert on public.messages
  for each row execute function public.sanitize_message_mentions();

-- ─── send_message_with_envelopes: add mention params ───────────────────────
--
-- create or replace cannot add parameters in a way that's safe for rolling
-- deploys — an overload pair would let old and new clients silently resolve
-- to different functions. Drop and recreate so there is exactly one overload;
-- the two new params are defaulted, so an un-updated client calling with the
-- original 9 named args still resolves fine (PostgREST passes named args).

drop function if exists public.send_message_with_envelopes(uuid, text, text, jsonb, text, uuid, uuid, text, text);

create function public.send_message_with_envelopes(
  p_conversation_id     uuid,
  p_content             text,
  p_iv                  text,
  p_envelopes           jsonb,
  p_type                text default 'text',
  p_reply_to_id         uuid default null,
  p_thread_id           uuid default null,
  p_media_url           text default null,
  p_media_mime          text default null,
  p_mentioned_user_ids  uuid[] default '{}',
  p_mentions_everyone   boolean default false
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not public.can_send_in_conversation(auth.uid(), p_conversation_id) then
    raise exception 'cannot send in this conversation';
  end if;

  if p_envelopes is null
     or jsonb_typeof(p_envelopes) <> 'array'
     or jsonb_array_length(p_envelopes) = 0 then
    raise exception 'a v2 message requires at least one envelope';
  end if;

  if p_iv is null or p_iv = '' then
    raise exception 'a v2 message requires an iv';
  end if;

  insert into public.messages
    (conversation_id, sender_id, content, iv, enc_v, type, reply_to_id, thread_id,
     media_url, media_mime, mentioned_user_ids, mentions_everyone)
  values
    (p_conversation_id, auth.uid(), p_content, p_iv, 2, p_type, p_reply_to_id, p_thread_id,
     p_media_url, p_media_mime, coalesce(p_mentioned_user_ids, '{}'), coalesce(p_mentions_everyone, false))
  returning * into v_msg;

  insert into public.message_envelopes
    (message_id, recipient_user_id, recipient_fp, eph_pub, key_iv, wrapped_key)
  select
    v_msg.id,
    (e->>'recipient_user_id')::uuid,
    e->>'recipient_fp',
    e->>'eph_pub',
    e->>'key_iv',
    e->>'wrapped_key'
  from jsonb_array_elements(p_envelopes) as e;

  return v_msg;
end;
$$;

grant execute on function public.send_message_with_envelopes(uuid, text, text, jsonb, text, uuid, uuid, text, text, uuid[], boolean) to authenticated;
revoke execute on function public.send_message_with_envelopes(uuid, text, text, jsonb, text, uuid, uuid, text, text, uuid[], boolean) from public, anon;

-- ─── push_targets_for_message: mention bypasses mute, unless mute_mentions ──
--
-- Return type changes (new is_mention column), so this must be dropped and
-- recreated too. Body is otherwise the 00044 version (badge = total unread
-- across the whole inbox); only the two mute predicates and the select list
-- change here.

drop function if exists public.push_targets_for_message(uuid);

create function public.push_targets_for_message(p_message_id uuid)
returns table (
  token        text,
  environment  text,
  recipient_id uuid,
  device_id    integer,
  recipient_fp text,
  eph_pub      text,
  key_iv       text,
  wrapped_key  text,
  unread_count integer,
  is_mention   boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with m as (
    select id, conversation_id, sender_id, enc_v, deleted_at,
           mentioned_user_ids, mentions_everyone
    from public.messages
    where id = p_message_id
  ),
  recips as (
    select cm.user_id, cm.last_read_at
    from public.conversation_members cm
    join m on m.conversation_id = cm.conversation_id
    where cm.user_id <> m.sender_id
      and cm.request_state = 'accepted'
      and (
            cm.muted_until is null or cm.muted_until <= now()
            or (not cm.mute_mentions
                and (m.mentions_everyone or cm.user_id = any(m.mentioned_user_ids)))
          )
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
    -- Total across the recipient's whole inbox, per-conversation mute rules
    -- applied per message: a muted conversation still contributes its own
    -- unread @mentions unless that member also set mute_mentions.
    (select count(*)::int
       from public.conversation_members cm2
       join public.messages um on um.conversation_id = cm2.conversation_id
      where cm2.user_id = r.user_id
        and cm2.request_state = 'accepted'
        and (
              cm2.muted_until is null or cm2.muted_until <= now()
              or (not cm2.mute_mentions
                  and (um.mentions_everyone or cm2.user_id = any(um.mentioned_user_ids)))
            )
        and um.deleted_at is null
        and um.type <> 'system'
        and um.sender_id <> r.user_id
        and um.created_at > coalesce(cm2.last_read_at, '-infinity'::timestamptz)),
    (m.mentions_everyone or r.user_id = any(m.mentioned_user_ids))
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
