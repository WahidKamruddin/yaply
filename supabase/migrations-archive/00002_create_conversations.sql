-- ─── Conversations & members ──────────────────────────────────────────────────

create type public.conversation_type as enum ('direct', 'group', 'ai');
create type public.member_role as enum ('owner', 'admin', 'member');

create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  type            public.conversation_type not null default 'direct',
  name            text,
  description     text,
  avatar_url      text,
  created_by      uuid not null references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_message_at timestamptz,
  muted_until     timestamptz,
  is_archived     boolean not null default false
);

create trigger conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  role            public.member_role not null default 'member',
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;

-- Members can see conversations they belong to
create policy "conversations: member can select"
  on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id
        and cm.user_id = auth.uid()
    )
  );

-- Any authenticated user can create a conversation
create policy "conversations: auth can insert"
  on public.conversations for insert
  with check (auth.uid() = created_by);

-- Owner/admin can update conversation metadata
create policy "conversations: owner/admin can update"
  on public.conversations for update
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
  );

create policy "conversation_members: member can select"
  on public.conversation_members for select
  using (
    exists (
      select 1 from public.conversation_members cm2
      where cm2.conversation_id = conversation_id
        and cm2.user_id = auth.uid()
    )
  );

create policy "conversation_members: owner can insert"
  on public.conversation_members for insert
  with check (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id
        and cm.user_id = auth.uid()
        and cm.role in ('owner', 'admin')
    )
    or auth.uid() = user_id  -- allow self-join (e.g. direct conversations)
  );

create policy "conversation_members: self can delete"
  on public.conversation_members for delete
  using (user_id = auth.uid());
