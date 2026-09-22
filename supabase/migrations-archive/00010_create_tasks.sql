-- ─── Tasks ────────────────────────────────────────────────────────────────────

create type public.task_status   as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('low', 'medium', 'high');

create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.conversations (id) on delete set null,
  created_by      uuid not null references public.profiles (id) on delete cascade,
  assigned_to     uuid references public.profiles (id) on delete set null,
  title           text not null,
  description     text,
  status          public.task_status   not null default 'todo',
  priority        public.task_priority not null default 'medium',
  due_at          timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger tasks_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create index tasks_conversation_idx on public.tasks (conversation_id) where conversation_id is not null;
create index tasks_assigned_idx     on public.tasks (assigned_to) where assigned_to is not null;
create index tasks_creator_idx      on public.tasks (created_by);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.tasks enable row level security;

-- Members of the conversation, creator, or assignee can view tasks
create policy "tasks: visible to conversation members, creator, assignee"
  on public.tasks for select
  using (
    created_by = auth.uid()
    or assigned_to = auth.uid()
    or (
      conversation_id is not null
      and exists (
        select 1 from public.conversation_members cm
        where cm.conversation_id = tasks.conversation_id
          and cm.user_id = auth.uid()
      )
    )
  );

create policy "tasks: auth can create"
  on public.tasks for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "tasks: creator or assignee can update"
  on public.tasks for update
  using (auth.uid() = created_by or auth.uid() = assigned_to);

create policy "tasks: creator can delete"
  on public.tasks for delete
  using (auth.uid() = created_by);
