-- ─── Notes ────────────────────────────────────────────────────────────────────

create table if not exists public.notes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  title           text not null,
  content         text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger notes_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

create index notes_user_idx         on public.notes (user_id);
create index notes_conversation_idx on public.notes (conversation_id) where conversation_id is not null;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.notes enable row level security;

create policy "notes: owner only"
  on public.notes for all
  using (auth.uid() = user_id);
