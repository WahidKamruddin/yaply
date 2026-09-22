-- ─── Multi-device envelope encryption (wire format v2) ───────────────────────
-- Fixes the single-slot identity key: `devices` previously held one key per
-- user (device_id hard-coded to 1) that every login overwrote, permanently
-- orphaning messages sealed under the replaced key. v2 messages carry one
-- random AES-256 message key encrypted once over the content, wrapped
-- per-recipient-device (ephemeral P-256 ECDH → AES-GCM KEK) in
-- `message_envelopes`. Every install owns its own `devices` row.
--
-- enc_v semantics on messages:
--   NULL = unencrypted phase-1 (iv must also be NULL; system/media/fallback)
--   2    = envelope-encrypted (iv set, envelopes exist)

-- Wrapped in an explicit transaction: the wipe below is irreversible, so if any
-- later statement fails (a bad paste, a syntax error) the deletes must roll back
-- with it. Never run the deletes outside this transaction.
begin;

-- ─── Data wipe (explicitly requested) ─────────────────────────────────────────
-- Legacy pairwise-ECDH messages are unreadable under the new scheme and do not
-- need to survive. Cascades clear conversation_members, reactions/reads, and
-- all per-conversation data (tasks, notes, reminders, events, albums, budgets).
-- Devices are wiped so every install re-registers a clean per-device row.
delete from public.messages;
delete from public.conversations;
delete from public.devices;

-- ─── devices: per-install rows ────────────────────────────────────────────────
-- key_fingerprint = JWK x || '.' || y of identity_key; envelope recipients are
-- matched by this fingerprint.
alter table public.devices add column if not exists key_fingerprint text;

create index if not exists devices_user_fp_idx
  on public.devices (user_id, key_fingerprint);

-- ─── messages: wire-format version ────────────────────────────────────────────
alter table public.messages add column if not exists enc_v smallint;

-- ─── message_envelopes ────────────────────────────────────────────────────────
create table if not exists public.message_envelopes (
  id                uuid primary key default gen_random_uuid(),
  message_id        uuid not null references public.messages (id) on delete cascade,
  recipient_user_id uuid not null references public.profiles (id) on delete cascade,
  recipient_fp      text not null,  -- fingerprint of the device public key this envelope is sealed to
  eph_pub           text not null,  -- JSON-stringified JWK of the per-message ephemeral P-256 public key
  key_iv            text not null,  -- base64(nonce[12]) for the key wrap
  wrapped_key       text not null,  -- base64(AES-GCM(KEK, raw 32-byte message key) + tag)
  created_at        timestamptz not null default now(),
  unique (message_id, recipient_user_id, recipient_fp)
);

create index if not exists message_envelopes_recipient_idx
  on public.message_envelopes (recipient_user_id, message_id);

alter table public.message_envelopes enable row level security;

-- Recipients read their own envelopes; the sender may also read (debugging /
-- resend visibility). Nobody else — envelopes are useless without the matching
-- private key, but there is no reason to expose them.
drop policy if exists "message_envelopes: recipient or sender can select" on public.message_envelopes;
create policy "message_envelopes: recipient or sender can select"
  on public.message_envelopes for select
  using (
    auth.uid() = recipient_user_id
    or exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );

-- Inserts normally go through the RPC below (atomic with the message), but the
-- policy also allows direct inserts by the message's sender.
drop policy if exists "message_envelopes: sender can insert" on public.message_envelopes;
create policy "message_envelopes: sender can insert"
  on public.message_envelopes for insert
  with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );

drop policy if exists "message_envelopes: sender can delete" on public.message_envelopes;
create policy "message_envelopes: sender can delete"
  on public.message_envelopes for delete
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );

-- ─── Atomic send RPC ──────────────────────────────────────────────────────────
-- A v2 message must never exist without its envelopes: inserting both in one
-- transaction (and rejecting an empty envelope set) guarantees that "no
-- envelope for my device on an enc_v=2 message" always truly means the device
-- did not exist when the message was sealed — never a half-written send.
create or replace function public.send_message_with_envelopes(
  p_conversation_id uuid,
  p_content         text,
  p_iv              text,
  p_envelopes       jsonb,
  p_type            text default 'text',
  p_reply_to_id     uuid default null,
  p_thread_id       uuid default null,
  p_media_url       text default null,
  p_media_mime      text default null
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

  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this conversation';
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
    (conversation_id, sender_id, content, iv, enc_v, type, reply_to_id, thread_id, media_url, media_mime)
  values
    (p_conversation_id, auth.uid(), p_content, p_iv, 2, p_type, p_reply_to_id, p_thread_id, p_media_url, p_media_mime)
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

grant execute on function public.send_message_with_envelopes to authenticated;

commit;
