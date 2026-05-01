-- ─── AI (YaplyAI) conversations ───────────────────────────────────────────────
-- AI messages are NOT encrypted — intentional trade-off documented in project overview.

create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.ai_messages (
  id                  uuid primary key default gen_random_uuid(),
  ai_conversation_id  uuid not null references public.ai_conversations (id) on delete cascade,
  role                text not null check (role in ('user', 'assistant')),
  content             text not null,   -- plaintext, NOT encrypted
  created_at          timestamptz not null default now()
);

create index ai_messages_conv_idx on public.ai_messages (ai_conversation_id, created_at);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "ai_conversations: owner only"
  on public.ai_conversations for all
  using (auth.uid() = user_id);

create policy "ai_messages: owner only"
  on public.ai_messages for all
  using (
    exists (
      select 1 from public.ai_conversations ac
      where ac.id = ai_conversation_id
        and ac.user_id = auth.uid()
    )
  );
