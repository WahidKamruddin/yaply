-- ─── Budgets & expenses ───────────────────────────────────────────────────────

create type public.expense_category as enum (
  'food', 'transport', 'entertainment', 'utilities',
  'rent', 'health', 'shopping', 'other'
);

create table if not exists public.budgets (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  name            text not null,
  total_amount    numeric(12, 2) not null check (total_amount > 0),
  currency        char(3) not null default 'USD',
  created_by      uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index budgets_conversation_idx on public.budgets (conversation_id);

create table if not exists public.expenses (
  id             uuid primary key default gen_random_uuid(),
  budget_id      uuid not null references public.budgets (id) on delete cascade,
  paid_by        uuid not null references public.profiles (id) on delete cascade,
  description    text not null,
  amount         numeric(12, 2) not null check (amount > 0),
  category       public.expense_category not null default 'other',
  split_between  uuid[] not null default '{}',
  created_at     timestamptz not null default now()
);

create index expenses_budget_idx  on public.expenses (budget_id);
create index expenses_paid_by_idx on public.expenses (paid_by);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;

create policy "budgets: conversation member can select"
  on public.budgets for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = budgets.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "budgets: member can create"
  on public.budgets for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "budgets: creator can delete"
  on public.budgets for delete
  using (auth.uid() = created_by);

create policy "expenses: member can select"
  on public.expenses for select
  using (
    exists (
      select 1
      from public.budgets b
      join public.conversation_members cm on cm.conversation_id = b.conversation_id
      where b.id = budget_id
        and cm.user_id = auth.uid()
    )
  );

create policy "expenses: member can insert"
  on public.expenses for insert
  with check (
    auth.uid() = paid_by
    and exists (
      select 1
      from public.budgets b
      join public.conversation_members cm on cm.conversation_id = b.conversation_id
      where b.id = budget_id
        and cm.user_id = auth.uid()
    )
  );

create policy "expenses: payer can delete"
  on public.expenses for delete
  using (auth.uid() = paid_by);

-- ─── RPC: get_budget_summary ──────────────────────────────────────────────────
-- Returns total spent and per-person owed amounts for a budget.
create or replace function public.get_budget_summary(p_budget_id uuid)
returns table (
  user_id       uuid,
  total_paid    numeric,
  total_owed    numeric,
  net_balance   numeric
)
language sql
security definer
as $$
  with paid as (
    select paid_by as user_id, sum(amount) as total_paid
    from public.expenses
    where budget_id = p_budget_id
    group by paid_by
  ),
  owed as (
    select u.id as user_id,
           sum(e.amount / array_length(e.split_between, 1)) as total_owed
    from public.expenses e
    cross join unnest(e.split_between) as u(id)
    where e.budget_id = p_budget_id
    group by u.id
  )
  select
    coalesce(p.user_id, o.user_id) as user_id,
    coalesce(p.total_paid, 0)      as total_paid,
    coalesce(o.total_owed, 0)      as total_owed,
    coalesce(p.total_paid, 0) - coalesce(o.total_owed, 0) as net_balance
  from paid p
  full outer join owed o on o.user_id = p.user_id;
$$;
