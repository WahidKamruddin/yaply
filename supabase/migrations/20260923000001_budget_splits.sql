-- Budgets → Splitwise-style shared expenses.
--
-- What changes:
--   • Who owes what is stored explicitly in `expense_shares` (one row per person,
--     exact cents), replacing `expenses.split_between`. Rounding is decided once,
--     here, so web and iOS can never disagree about a share.
--   • `settlements` records paybacks ("A paid B $20").
--   • Every write to expenses / shares / settlements goes through a SECURITY
--     DEFINER RPC; the tables have SELECT policies only (same pattern as
--     `friendships`). Balances and the simplified "who pays whom" list are
--     computed server-side only.
--   • The Splitwise integration is gone (`budgets.splitwise_group_id` dropped).
--   • `total_amount` is now optional: NULL = no spending cap.
--
-- Holes this closes in the baseline:
--   • "budgets: member can create" compared cm.conversation_id to itself, so any
--     authenticated user could create a budget in any conversation.
--   • "budgets: member can update" had no column limits, so any member could flip
--     `locked` or rewrite the cap. A guard trigger now enforces who may change what.
--   • get_budget_summary was SECURITY DEFINER with no membership check — anyone
--     could read any budget's balances. It is dropped.
--
-- Realtime: only `budgets` is published. Every write RPC touches the parent
-- budget's `updated_at`, so a client subscribed to `budgets` for its conversation
-- hears about every expense / settlement change without the child tables being
-- published (their DELETE events would carry only a PK and could not be filtered).

-- ─── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.is_budget_member(p_budget_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.budgets b
    join public.conversation_members cm on cm.conversation_id = b.conversation_id
    where b.id = p_budget_id
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_admin(p_conversation_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin')
  );
$$;

-- Equal split in exact cents: everyone gets floor(total / n) cents and the
-- leftover cents go +1 each to participants in ascending user_id order.
-- $100 three ways → 33.34 / 33.33 / 33.33. The only implementation of the rule.
create or replace function public.budget_equal_shares(p_amount numeric, p_users uuid[])
returns table (user_id uuid, amount numeric)
language sql immutable
set search_path = public
as $$
  with u as (
    select distinct x as uid from unnest(p_users) as x
  ),
  o as (
    select uid,
           row_number() over (order by uid) as ord,
           count(*) over ()                 as n
    from u
  )
  select uid,
         ((floor((p_amount * 100) / n)
           + case when ord <= ((p_amount * 100)::bigint % n) then 1 else 0 end) / 100)::numeric(12, 2)
  from o;
$$;

-- ─── budgets ─────────────────────────────────────────────────────────────────

alter table public.budgets drop column if exists splitwise_group_id;
alter table public.budgets alter column total_amount drop not null;
alter table public.budgets add column if not exists updated_at timestamptz not null default now();

drop policy if exists "budgets: member can create" on public.budgets;
create policy "budgets: member can create"
  on public.budgets for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = budgets.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- A locked budget can only be deleted by an admin (who has their own policy).
drop policy if exists "budgets: creator can delete" on public.budgets;
create policy "budgets: creator can delete"
  on public.budgets for delete
  using (auth.uid() = created_by and not locked);

-- The member UPDATE policy stays (any member may link a budget to an event);
-- this trigger decides which columns each caller may actually change.
create or replace function public.budgets_guard_update()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_admin boolean;
begin
  -- Service role, cron and migrations run without a user.
  if v_uid is null then
    new.updated_at := now();
    return new;
  end if;

  v_admin := public.is_conversation_admin(old.conversation_id);

  if new.conversation_id <> old.conversation_id
     or new.created_by <> old.created_by
     or new.created_at <> old.created_at then
    raise exception 'cannot change budget ownership';
  end if;

  if new.locked is distinct from old.locked and not v_admin then
    raise exception 'only admins can lock budgets';
  end if;

  if (new.name, new.total_amount, new.currency)
     is distinct from (old.name, old.total_amount, old.currency) then
    if not (v_admin or old.created_by = v_uid) then
      raise exception 'only the creator can edit this budget';
    end if;
    if old.locked and not v_admin then
      raise exception 'budget locked';
    end if;
  end if;

  if new.currency <> old.currency
     and exists (select 1 from public.expenses e where e.budget_id = old.id) then
    raise exception 'cannot change currency after expenses exist';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists budgets_guard_update on public.budgets;
create trigger budgets_guard_update
  before update on public.budgets
  for each row execute function public.budgets_guard_update();

-- ─── expenses ────────────────────────────────────────────────────────────────

alter table public.expenses
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists split_mode text not null default 'equal'
    check (split_mode in ('equal', 'exact')),
  add column if not exists spent_on   date not null default current_date,
  add column if not exists updated_at timestamptz not null default now();

update public.expenses
set created_by = paid_by,
    spent_on   = created_at::date
where created_by is null;

alter table public.expenses
  add constraint expenses_description_length check (char_length(description) between 1 and 200);

-- ─── expense_shares ──────────────────────────────────────────────────────────

create table if not exists public.expense_shares (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0),
  primary key (expense_id, user_id)
);

create index if not exists expense_shares_user_idx on public.expense_shares (user_id);

-- Backfill from split_between. Clients never filled it in (always '{}'), so most
-- rows get a single share for the payer — they owed it all, balance unchanged.
do $$
declare
  e       record;
  v_users uuid[];
begin
  for e in select id, amount, paid_by, split_between from public.expenses loop
    select coalesce(array_agg(distinct x), '{}')
      into v_users
      from unnest(e.split_between) as x
     where exists (select 1 from public.profiles p where p.id = x);

    if cardinality(v_users) = 0 or (e.amount * 100) < cardinality(v_users) then
      v_users := array[e.paid_by];
    end if;

    insert into public.expense_shares (expense_id, user_id, amount)
    select e.id, s.user_id, s.amount
    from public.budget_equal_shares(e.amount, v_users) s;
  end loop;
end;
$$;

alter table public.expenses drop column if exists split_between;

-- ─── settlements ─────────────────────────────────────────────────────────────

create table if not exists public.settlements (
  id         uuid primary key default gen_random_uuid(),
  budget_id  uuid not null references public.budgets (id) on delete cascade,
  from_user  uuid not null references public.profiles (id) on delete cascade,
  to_user    uuid not null references public.profiles (id) on delete cascade,
  amount     numeric(12, 2) not null check (amount > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index if not exists settlements_budget_idx on public.settlements (budget_id);

-- ─── RLS: read-only tables, writes via RPC ───────────────────────────────────

drop policy if exists "expenses: member can select" on public.expenses;
drop policy if exists "expenses: member can insert" on public.expenses;
drop policy if exists "expenses: payer can delete"  on public.expenses;

create policy "expenses: member can select"
  on public.expenses for select
  using (public.is_budget_member(budget_id));

alter table public.expense_shares enable row level security;
create policy "expense_shares: member can select"
  on public.expense_shares for select
  using (
    exists (
      select 1 from public.expenses e
      where e.id = expense_shares.expense_id
        and public.is_budget_member(e.budget_id)
    )
  );

alter table public.settlements enable row level security;
create policy "settlements: member can select"
  on public.settlements for select
  using (public.is_budget_member(budget_id));

revoke insert, update, delete on public.expenses, public.expense_shares, public.settlements
  from anon, authenticated;

-- ─── RPC: save_expense (insert or edit) ──────────────────────────────────────

create or replace function public.save_expense(
  p_budget_id    uuid,
  p_expense_id   uuid,
  p_description  text,
  p_amount       numeric,
  p_category     public.expense_category,
  p_paid_by      uuid,
  p_split_mode   text,
  p_participants uuid[],
  p_exact        jsonb default null,
  p_spent_on     date  default null
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_budget   public.budgets%rowtype;
  v_existing public.expenses%rowtype;
  v_admin    boolean;
  v_id       uuid;
  v_users    uuid[];
  v_key      text;
  v_val      text;
  v_share    numeric;
  v_sum      numeric := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_budget from public.budgets where id = p_budget_id;
  if not found or not public.is_budget_member(p_budget_id) then
    raise exception 'budget not found';
  end if;

  v_admin := public.is_conversation_admin(v_budget.conversation_id);
  if v_budget.locked and not v_admin then
    raise exception 'budget locked';
  end if;

  p_description := btrim(coalesce(p_description, ''));
  if p_description = '' or char_length(p_description) > 200 then
    raise exception 'description must be 1-200 characters';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount >= 10000000000 then
    raise exception 'invalid amount';
  end if;

  if p_split_mode not in ('equal', 'exact') then
    raise exception 'invalid split mode';
  end if;

  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = v_budget.conversation_id and cm.user_id = p_paid_by
  ) then
    raise exception 'payer must be in this chat';
  end if;

  if p_expense_id is not null then
    select * into v_existing
    from public.expenses
    where id = p_expense_id and budget_id = p_budget_id
    for update;
    if not found then
      raise exception 'expense not found';
    end if;
    if not (v_admin or v_existing.created_by is not distinct from v_uid or v_existing.paid_by = v_uid) then
      raise exception 'not allowed to edit this expense';
    end if;

    update public.expenses
    set description = p_description,
        amount      = p_amount,
        category    = coalesce(p_category, 'other'),
        paid_by     = p_paid_by,
        split_mode  = p_split_mode,
        spent_on    = coalesce(p_spent_on, v_existing.spent_on),
        updated_at  = now()
    where id = p_expense_id;

    delete from public.expense_shares where expense_id = p_expense_id;
    v_id := p_expense_id;
  else
    insert into public.expenses
      (budget_id, paid_by, created_by, description, amount, category, split_mode, spent_on)
    values
      (p_budget_id, p_paid_by, v_uid, p_description, p_amount,
       coalesce(p_category, 'other'), p_split_mode, coalesce(p_spent_on, current_date))
    returning id into v_id;
  end if;

  if p_split_mode = 'equal' then
    select coalesce(array_agg(distinct x), '{}') into v_users
    from unnest(coalesce(p_participants, '{}')) as x;

    if cardinality(v_users) = 0 then
      raise exception 'split needs at least one person';
    end if;
    if (p_amount * 100) < cardinality(v_users) then
      raise exception 'amount too small to split';
    end if;

    insert into public.expense_shares (expense_id, user_id, amount)
    select v_id, s.user_id, s.amount
    from public.budget_equal_shares(p_amount, v_users) s;
  else
    if p_exact is null or jsonb_typeof(p_exact) <> 'object' then
      raise exception 'exact split needs amounts';
    end if;

    for v_key, v_val in select key, value from jsonb_each_text(p_exact) loop
      begin
        v_share := v_val::numeric;
      exception when others then
        raise exception 'invalid share amount';
      end;
      if v_share = 0 then
        continue;
      end if;
      if v_share < 0 or v_share <> round(v_share, 2) then
        raise exception 'invalid share amount';
      end if;
      v_users := array_append(coalesce(v_users, '{}'), v_key::uuid);
      v_sum := v_sum + v_share;
      insert into public.expense_shares (expense_id, user_id, amount)
      values (v_id, v_key::uuid, v_share);
    end loop;

    if coalesce(cardinality(v_users), 0) = 0 then
      raise exception 'split needs at least one person';
    end if;
    if v_sum <> p_amount then
      raise exception 'shares must add up to the total';
    end if;
  end if;

  if exists (
    select 1 from unnest(v_users) as x
    where not exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = v_budget.conversation_id and cm.user_id = x
    )
  ) then
    raise exception 'everyone in the split must be in this chat';
  end if;

  update public.budgets set updated_at = now() where id = p_budget_id;
  return v_id;
end;
$$;

-- ─── RPC: delete_expense ─────────────────────────────────────────────────────

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_budget  public.budgets%rowtype;
  v_admin   boolean;
begin
  select * into v_expense from public.expenses where id = p_expense_id;
  if not found or not public.is_budget_member(v_expense.budget_id) then
    raise exception 'expense not found';
  end if;

  select * into v_budget from public.budgets where id = v_expense.budget_id;
  v_admin := public.is_conversation_admin(v_budget.conversation_id);

  if v_budget.locked and not v_admin then
    raise exception 'budget locked';
  end if;
  if not (v_admin or v_expense.created_by is not distinct from auth.uid() or v_expense.paid_by = auth.uid()) then
    raise exception 'not allowed to delete this expense';
  end if;

  delete from public.expenses where id = p_expense_id;
  update public.budgets set updated_at = now() where id = v_budget.id;
end;
$$;

-- ─── RPC: record_settlement / delete_settlement ──────────────────────────────
-- Allowed on a locked budget: locking freezes the expense list, not paying back.

create or replace function public.record_settlement(
  p_budget_id uuid,
  p_from      uuid,
  p_to        uuid,
  p_amount    numeric
)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_budget public.budgets%rowtype;
  v_id     uuid;
begin
  select * into v_budget from public.budgets where id = p_budget_id;
  if not found or not public.is_budget_member(p_budget_id) then
    raise exception 'budget not found';
  end if;
  if p_from is null or p_to is null or v_uid not in (p_from, p_to) then
    raise exception 'you can only record a payment you made or received';
  end if;
  if p_from = p_to then
    raise exception 'invalid settlement';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount >= 10000000000 then
    raise exception 'invalid amount';
  end if;
  if (
    select count(*) from public.conversation_members cm
    where cm.conversation_id = v_budget.conversation_id and cm.user_id in (p_from, p_to)
  ) <> 2 then
    raise exception 'both people must be in this chat';
  end if;

  insert into public.settlements (budget_id, from_user, to_user, amount, created_by)
  values (p_budget_id, p_from, p_to, p_amount, v_uid)
  returning id into v_id;

  update public.budgets set updated_at = now() where id = p_budget_id;
  return v_id;
end;
$$;

create or replace function public.delete_settlement(p_settlement_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_row    public.settlements%rowtype;
  v_budget public.budgets%rowtype;
begin
  select * into v_row from public.settlements where id = p_settlement_id;
  if not found or not public.is_budget_member(v_row.budget_id) then
    raise exception 'settlement not found';
  end if;
  select * into v_budget from public.budgets where id = v_row.budget_id;
  if not (v_row.created_by is not distinct from auth.uid() or public.is_conversation_admin(v_budget.conversation_id)) then
    raise exception 'not allowed to delete this payment';
  end if;

  delete from public.settlements where id = p_settlement_id;
  update public.budgets set updated_at = now() where id = v_budget.id;
end;
$$;

-- ─── RPC: balances and simplified debts ──────────────────────────────────────

drop function if exists public.get_budget_summary(uuid);

-- net = paid for expenses + paid back to others − owed on expenses − paid back by others
-- Positive = is owed money. Includes people who have since left the chat.
create or replace function public.get_budget_balances(p_budget_id uuid)
returns table (
  user_id     uuid,
  paid        numeric,
  owed        numeric,
  settled_out numeric,
  settled_in  numeric,
  net         numeric
)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.is_budget_member(p_budget_id) then
    raise exception 'budget not found';
  end if;

  return query
  with p as (
    select e.paid_by as uid, sum(e.amount) as v
    from public.expenses e where e.budget_id = p_budget_id group by e.paid_by
  ),
  o as (
    select s.user_id as uid, sum(s.amount) as v
    from public.expense_shares s
    join public.expenses e on e.id = s.expense_id
    where e.budget_id = p_budget_id group by s.user_id
  ),
  so as (
    select st.from_user as uid, sum(st.amount) as v
    from public.settlements st where st.budget_id = p_budget_id group by st.from_user
  ),
  si as (
    select st.to_user as uid, sum(st.amount) as v
    from public.settlements st where st.budget_id = p_budget_id group by st.to_user
  ),
  ids as (
    select uid from p union select uid from o union select uid from so union select uid from si
  )
  select ids.uid,
         coalesce(p.v, 0),
         coalesce(o.v, 0),
         coalesce(so.v, 0),
         coalesce(si.v, 0),
         coalesce(p.v, 0) + coalesce(so.v, 0) - coalesce(o.v, 0) - coalesce(si.v, 0)
  from ids
  left join p  on p.uid  = ids.uid
  left join o  on o.uid  = ids.uid
  left join so on so.uid = ids.uid
  left join si on si.uid = ids.uid
  order by ids.uid;
end;
$$;

-- Who should pay whom to settle everything. Greedy: debtors sorted most-owing
-- first, creditors most-owed first (ties by user_id), matched in order. Deterministic,
-- at most n−1 transfers, in exact cents. The only implementation — clients render it.
create or replace function public.get_budget_debts(p_budget_id uuid)
returns table (from_user uuid, to_user uuid, amount numeric)
language plpgsql stable security definer
set search_path = public
as $$
declare
  d_ids uuid[];
  d_amt bigint[];
  c_ids uuid[];
  c_amt bigint[];
  i     int := 1;
  j     int := 1;
  x     bigint;
begin
  if not public.is_budget_member(p_budget_id) then
    raise exception 'budget not found';
  end if;

  select coalesce(array_agg(b.user_id order by b.net asc, b.user_id), '{}'),
         coalesce(array_agg((-b.net * 100)::bigint order by b.net asc, b.user_id), '{}')
    into d_ids, d_amt
    from public.get_budget_balances(p_budget_id) b
   where b.net < 0;

  select coalesce(array_agg(b.user_id order by b.net desc, b.user_id), '{}'),
         coalesce(array_agg((b.net * 100)::bigint order by b.net desc, b.user_id), '{}')
    into c_ids, c_amt
    from public.get_budget_balances(p_budget_id) b
   where b.net > 0;

  while i <= cardinality(d_ids) and j <= cardinality(c_ids) loop
    x := least(d_amt[i], c_amt[j]);
    from_user := d_ids[i];
    to_user   := c_ids[j];
    amount    := (x::numeric / 100)::numeric(12, 2);
    return next;
    d_amt[i] := d_amt[i] - x;
    c_amt[j] := c_amt[j] - x;
    if d_amt[i] = 0 then i := i + 1; end if;
    if c_amt[j] = 0 then j := j + 1; end if;
  end loop;
end;
$$;

-- One call per budget list: total spent and the caller's own net per budget.
create or replace function public.get_budget_overviews(p_conversation_id uuid)
returns table (budget_id uuid, spent numeric, my_net numeric)
language plpgsql stable security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = p_conversation_id and cm.user_id = v_uid
  ) then
    raise exception 'conversation not found';
  end if;

  return query
  select b.id,
         coalesce((select sum(e.amount) from public.expenses e where e.budget_id = b.id), 0),
         coalesce((select sum(e.amount) from public.expenses e
                    where e.budget_id = b.id and e.paid_by = v_uid), 0)
       + coalesce((select sum(st.amount) from public.settlements st
                    where st.budget_id = b.id and st.from_user = v_uid), 0)
       - coalesce((select sum(s.amount) from public.expense_shares s
                    join public.expenses e on e.id = s.expense_id
                    where e.budget_id = b.id and s.user_id = v_uid), 0)
       - coalesce((select sum(st.amount) from public.settlements st
                    where st.budget_id = b.id and st.to_user = v_uid), 0)
  from public.budgets b
  where b.conversation_id = p_conversation_id;
end;
$$;

-- ─── Grants ──────────────────────────────────────────────────────────────────

revoke all on function public.budget_equal_shares(numeric, uuid[]) from public, anon, authenticated;
revoke all on function public.budgets_guard_update() from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.is_budget_member(uuid)',
    'public.is_conversation_admin(uuid)',
    'public.save_expense(uuid, uuid, text, numeric, public.expense_category, uuid, text, uuid[], jsonb, date)',
    'public.delete_expense(uuid)',
    'public.record_settlement(uuid, uuid, uuid, numeric)',
    'public.delete_settlement(uuid)',
    'public.get_budget_balances(uuid)',
    'public.get_budget_debts(uuid)',
    'public.get_budget_overviews(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;

-- ─── Realtime ────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.budgets;
