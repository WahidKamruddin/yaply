-- ─── Presence columns for profiles ───────────────────────────────────────────
-- is_online: toggled by the client via realtime presence or explicit API calls
-- last_seen_at: updated whenever is_online flips to false

alter table public.profiles
  add column if not exists is_online    boolean     not null default false,
  add column if not exists last_seen_at timestamptz;
