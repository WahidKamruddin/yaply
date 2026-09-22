-- Native push tokens (APNs today, FCM later).
--
-- Separate from push_subscriptions (Web Push) on purpose. A native token is an
-- opaque string routed to Apple; a Web Push subscription is an endpoint URL
-- plus an ECDH keypair routed to whatever browser vendor issued it. They share
-- no columns beyond user_id, and only the native token can be tied to a
-- `devices` row — which is what lets the sender pick the one
-- message_envelopes row that this specific install can actually decrypt.
--
-- NOT stored on `devices`: that table carries `select using (true)` so peers
-- can read each other's identity keys to encrypt. A push token there would be
-- readable by every authenticated user, and a token is a capability to push
-- content to someone's phone, not a public key.

-- ─── push_tokens ──────────────────────────────────────────────────────────────

create table if not exists public.push_tokens (
  id              uuid    primary key default gen_random_uuid(),
  user_id         uuid    not null,
  device_id       integer not null,
  token           text    not null,
  platform        text    not null default 'ios'
                    check (platform in ('ios', 'android')),

  -- Xcode debug builds are issued SANDBOX tokens; TestFlight and App Store
  -- builds are issued PRODUCTION ones, and the two APNs hosts do not accept
  -- each other's tokens (wrong host => 400 BadDeviceToken, which the sender
  -- treats as a hard prune). The host must therefore be chosen per row, never
  -- per deployment — one project serves both kinds of build at once.
  environment     text    not null default 'production'
                    check (environment in ('sandbox', 'production')),

  -- Consecutive non-fatal APNs failures. Lets the sender retire a token that
  -- 500s forever without pruning on a single transient error — an outage at
  -- Apple must not wipe every token in the table.
  fail_count      integer not null default 0,
  last_success_at timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One token per install. Clients upsert on this pair.
  unique (user_id, device_id),

  -- Composite FK to the devices row this token belongs to. ON DELETE CASCADE
  -- is a security property, not a convenience: revoke_device() deletes the
  -- devices row, and a revoked-but-not-yet-wiped install still holds its P-256
  -- private key. Since the push payload carries ciphertext plus that device's
  -- wrapped_key, continuing to push it would hand a revoked device readable
  -- content and defeat the entire revocation path. The cascade stops pushes in
  -- the same transaction that revokes.
  constraint push_tokens_device_fk
    foreign key (user_id, device_id)
    references public.devices (user_id, device_id)
    on delete cascade
);

create index if not exists push_tokens_user_idx  on public.push_tokens (user_id);
create index if not exists push_tokens_token_idx on public.push_tokens (token);

drop trigger if exists push_tokens_updated_at on public.push_tokens;
create trigger push_tokens_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

-- ─── Token reassignment ───────────────────────────────────────────────────────
-- An APNs token identifies an app INSTALL, not a user. Sign out of account A
-- and into account B on the same phone and Apple hands B the same token. Without
-- this, A's stale row survives and keeps receiving pushes meant for B — a
-- cross-account content leak, since the payload carries message ciphertext.
-- Apple requires providers to honour the most recent claim on a token.

create or replace function public.push_tokens_claim_token()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.push_tokens
  where token = new.token
    and not (user_id = new.user_id and device_id = new.device_id);
  return new;
end;
$$;

drop trigger if exists push_tokens_claim on public.push_tokens;
create trigger push_tokens_claim
  before insert or update of token on public.push_tokens
  for each row execute function public.push_tokens_claim_token();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Owner-only in both directions. Deliberately no world-readable select, unlike
-- `devices`. The sender reads this table with the service role, which bypasses
-- RLS entirely, so nothing needs broader access.

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens: manage own" on public.push_tokens;
create policy "push_tokens: manage own"
  on public.push_tokens for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── Clean up push_subscriptions ──────────────────────────────────────────────
-- The iOS client has been writing hex APNs tokens into push_subscriptions with
-- p256dh = '' and auth = '', because that was the only push table that existed.
-- Those rows are unusable by either sender: no ECDH keypair for Web Push, no
-- device_id for APNs. Purge them — the replacement client writes to push_tokens.

delete from public.push_subscriptions
where platform <> 'web' or p256dh = '' or auth = '';

-- Make the split structural so nothing drifts back.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check check (platform = 'web');

comment on table public.push_subscriptions is
  'Web Push (VAPID) subscriptions only. Native APNs/FCM tokens live in push_tokens.';

comment on table public.push_tokens is
  'Native push tokens, one row per install, linked to a devices row so the '
  'sender can select the matching message_envelopes row for the payload.';

-- Never written by any client, and `devices` is world-readable — remove it
-- before someone stores a real token there.
alter table public.devices drop column if exists push_subscription;
