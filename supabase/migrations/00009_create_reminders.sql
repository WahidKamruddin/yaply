-- ─── Reminders ────────────────────────────────────────────────────────────────

create type public.reminder_status as enum ('pending', 'sent', 'dismissed');

create table if not exists public.reminders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  message         text not null,
  remind_at       timestamptz not null,
  status          public.reminder_status not null default 'pending',
  created_at      timestamptz not null default now()
);

create index reminders_user_idx   on public.reminders (user_id, remind_at);
create index reminders_status_idx on public.reminders (status) where status = 'pending';

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.reminders enable row level security;

create policy "reminders: owner only"
  on public.reminders for all
  using (auth.uid() = user_id);
