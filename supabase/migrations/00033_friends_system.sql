-- ─── Friends system: friendships, blocking, message requests ─────────────────
-- Until now yaply had no relationship model at all: any authenticated user could
-- DM or group-add any other user, and the "Friends" list on the dashboard was
-- merely derived from whichever DMs happened to exist. This migration introduces
-- the real thing.
--
-- Three moving parts:
--
--   1. `friendships` — one row per pair, direction preserved (requester_id →
--      recipient_id) so incoming vs outgoing requests are distinguishable.
--      status is 'pending' or 'accepted'; decline/cancel/unfriend DELETE the row
--      rather than parking it in a 'declined' state, so a later re-request stays
--      possible. Blocking is the permanent tool. A functional unique index on
--      (least, greatest) of the pair makes a duplicate impossible in either
--      direction without denormalising a canonical-order column.
--
--   2. `user_blocks` — directed blocks. Only the blocker can see their own rows,
--      so a blocked user gets no signal that they were blocked (their sends just
--      fail). Blocking deletes any friendship and prevents new DMs.
--
--   3. `conversation_members.request_state` — message requests. A DM from a
--      non-friend lands with the recipient's own member row set to 'pending':
--      they can read it but cannot reply until they accept. Accepting a message
--      request does NOT create a friendship; it just opens the chat. Declining
--      sets 'declined', which locks the thread in BOTH directions so the sender
--      cannot keep messaging into a wall. Declining must never delete the
--      membership row — `trg_delete_empty_conversation` would take the whole
--      conversation with it.
--
-- Enforcement lives server-side only. Both conversation-creating RPCs are
-- SECURITY DEFINER and therefore bypass RLS entirely, so client-side checks are
-- decorative and iOS shares this same backend. Every gate below is either inside
-- an RPC body or inside an RLS policy, and all cross-table checks route through
-- SECURITY DEFINER helper functions — a policy on table T may never contain an
-- EXISTS over T itself (Postgres inlines it and raises 42P17; see migration
-- 00028 for the outage that taught us this).
--
-- Backfill: every existing pair sharing a `direct` conversation is grandfathered
-- into an accepted friendship, so nothing changes for anyone already talking.

begin;

-- ─── friendships ──────────────────────────────────────────────────────────────
create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> recipient_id)
);

-- One row per unordered pair, whichever direction the request came from.
create unique index if not exists friendships_pair_uq
  on public.friendships (least(requester_id, recipient_id), greatest(requester_id, recipient_id));

create index if not exists friendships_recipient_idx on public.friendships (recipient_id, status);
create index if not exists friendships_requester_idx on public.friendships (requester_id, status);

drop trigger if exists friendships_updated_at on public.friendships;
create trigger friendships_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

alter table public.friendships enable row level security;

-- Reads and deletes are safe to expose directly: a participant may always see
-- their own edge, and delete covers cancel / decline / unfriend in one policy.
-- INSERT and UPDATE are deliberately absent — they carry invariants (block
-- checks, reverse-pending auto-accept, pending→accepted only) and go through the
-- RPCs below.
drop policy if exists "friendships: participant can select" on public.friendships;
create policy "friendships: participant can select"
  on public.friendships for select
  using (auth.uid() in (requester_id, recipient_id));

drop policy if exists "friendships: participant can delete" on public.friendships;
create policy "friendships: participant can delete"
  on public.friendships for delete
  using (auth.uid() in (requester_id, recipient_id));

-- ─── user_blocks ──────────────────────────────────────────────────────────────
create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

-- Only the blocker sees, creates, or removes their own blocks. The blocked user
-- can never read the row — that opacity is the point.
drop policy if exists "user_blocks: blocker can select" on public.user_blocks;
create policy "user_blocks: blocker can select"
  on public.user_blocks for select
  using (auth.uid() = blocker_id);

drop policy if exists "user_blocks: blocker can insert" on public.user_blocks;
create policy "user_blocks: blocker can insert"
  on public.user_blocks for insert
  with check (auth.uid() = blocker_id);

drop policy if exists "user_blocks: blocker can delete" on public.user_blocks;
create policy "user_blocks: blocker can delete"
  on public.user_blocks for delete
  using (auth.uid() = blocker_id);

-- ─── conversation_members.request_state ───────────────────────────────────────
-- Defaults to 'accepted' so every existing row and every group membership is
-- untouched; only a DM created between non-friends ever writes 'pending'.
alter table public.conversation_members
  add column if not exists request_state text not null default 'accepted';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conversation_members'::regclass
      and conname = 'conversation_members_request_state_check'
  ) then
    alter table public.conversation_members
      add constraint conversation_members_request_state_check
      check (request_state in ('accepted', 'pending', 'declined'));
  end if;
end $$;

create index if not exists conversation_members_request_state_idx
  on public.conversation_members (user_id, request_state)
  where request_state <> 'accepted';

-- ─── Helper functions ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can be called from RLS policies on the very tables
-- they read without tripping the 42P17 recursion detector.

create or replace function public.are_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.recipient_id) = least(p_a, p_b)
      and greatest(f.requester_id, f.recipient_id) = greatest(p_a, p_b)
  );
$$;

create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.mutual_friend_count(p_a uuid, p_b uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with fa as (
    select case when f.requester_id = p_a then f.recipient_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and p_a in (f.requester_id, f.recipient_id)
  ),
  fb as (
    select case when f.requester_id = p_b then f.recipient_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and p_b in (f.requester_id, f.recipient_id)
  )
  select count(*)::integer from fa join fb on fb.fid = fa.fid;
$$;

-- The single predicate every write path consults. Encodes three rules at once:
--   • you must be a member;
--   • your own request_state must be 'accepted' (a pending recipient reads but
--     cannot reply — that is what makes a message request a request);
--   • nobody in the conversation has declined, and for a DM neither side has
--     blocked the other.
create or replace function public.can_send_in_conversation(p_user uuid, p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members me
    join public.conversations c on c.id = me.conversation_id
    where me.conversation_id = p_conversation_id
      and me.user_id = p_user
      and me.request_state = 'accepted'
      and not exists (
        select 1 from public.conversation_members d
        where d.conversation_id = p_conversation_id
          and d.request_state = 'declined'
      )
      and (
        c.type <> 'direct'
        or not exists (
          select 1 from public.conversation_members o
          where o.conversation_id = p_conversation_id
            and o.user_id <> p_user
            and public.is_blocked_between(p_user, o.user_id)
        )
      )
  );
$$;

-- RLS policies are evaluated with the caller's privileges, so `authenticated`
-- must be able to execute the helpers named in them. `anon` must not: these
-- functions take arbitrary user ids and would otherwise be a logged-out oracle
-- for "are these two people friends" over /rest/v1/rpc.
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.mutual_friend_count(uuid, uuid) to authenticated;
grant execute on function public.can_send_in_conversation(uuid, uuid) to authenticated;
revoke execute on function public.are_friends(uuid, uuid) from public, anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke execute on function public.mutual_friend_count(uuid, uuid) from public, anon;
revoke execute on function public.can_send_in_conversation(uuid, uuid) from public, anon;

-- ─── Tightened write policies ─────────────────────────────────────────────────
-- The old messages INSERT policy read
--   EXISTS (SELECT 1 FROM conversation_members cm
--           WHERE cm.conversation_id = cm.conversation_id AND cm.user_id = auth.uid())
-- — note both sides of the first comparison are the *inner* alias, so it was
-- always true and the policy only ever verified "is a member of some
-- conversation". Replacing it with can_send_in_conversation() both fixes that
-- and adds the request/block gating for the direct-insert paths (phase-1
-- fallback, media, system messages) that skip send_message_with_envelopes.
drop policy if exists "messages: member can insert" on public.messages;
create policy "messages: member can insert"
  on public.messages for insert
  with check (
    auth.uid() = sender_id
    and public.can_send_in_conversation(auth.uid(), conversation_id)
  );

-- Adding someone else to a conversation now additionally requires friendship.
-- The self-join branch is unchanged (it is how a user joins their own DM).
drop policy if exists "conversation_members: member can insert" on public.conversation_members;
create policy "conversation_members: member can insert"
  on public.conversation_members for insert
  with check (
    auth.uid() = user_id
    or (
      public.get_user_role_in_conversation(auth.uid(), conversation_id) in ('owner', 'admin')
      and public.are_friends(auth.uid(), user_id)
    )
  );

-- ─── Friend request RPCs ──────────────────────────────────────────────────────

-- Becoming friends implicitly accepts any message request sitting between the
-- pair: once you have agreed to be friends, holding their DM hostage is noise.
create or replace function public.sync_direct_request_state(p_a uuid, p_b uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_members cm
     set request_state = 'accepted'
   where cm.request_state <> 'accepted'
     and cm.conversation_id in (
       select c.id
       from public.conversations c
       join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = p_a
       join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = p_b
       where c.type = 'direct'
     );
$$;

create or replace function public.send_friend_request(p_recipient_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.friendships;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_recipient_id = auth.uid() then
    raise exception 'cannot friend yourself';
  end if;

  if public.is_blocked_between(auth.uid(), p_recipient_id) then
    raise exception 'blocked';
  end if;

  -- They already asked us: treat this as an accept rather than a second row.
  update public.friendships
     set status = 'accepted'
   where requester_id = p_recipient_id
     and recipient_id = auth.uid()
     and status = 'pending'
  returning * into v_row;

  if found then
    perform public.sync_direct_request_state(auth.uid(), p_recipient_id);
    return v_row;
  end if;

  begin
    insert into public.friendships (requester_id, recipient_id, status)
    values (auth.uid(), p_recipient_id, 'pending')
    returning * into v_row;
  exception when unique_violation then
    raise exception 'friend request already exists';
  end;

  return v_row;
end;
$$;

create or replace function public.accept_friend_request(p_request_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.friendships;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.friendships
     set status = 'accepted'
   where id = p_request_id
     and recipient_id = auth.uid()
     and status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'friend request not found';
  end if;

  perform public.sync_direct_request_state(v_row.requester_id, v_row.recipient_id);

  return v_row;
end;
$$;

create or replace function public.block_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'cannot block yourself';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing;

  -- A block supersedes any relationship: drop the friendship or pending request
  -- so the pair falls back to 'none' if the block is ever lifted.
  delete from public.friendships
   where least(requester_id, recipient_id) = least(auth.uid(), p_user_id)
     and greatest(requester_id, recipient_id) = greatest(auth.uid(), p_user_id);
end;
$$;

grant execute on function public.send_friend_request(uuid) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;

-- sync_direct_request_state takes both user ids as arguments and has no
-- auth.uid() guard of its own — every caller above has already established who
-- the pair is. Exposed over PostgREST it would let anyone accept a message
-- request on someone else's behalf, so EXECUTE is revoked from every client
-- role. The SECURITY DEFINER callers run as the owner and keep working.
revoke execute on function public.sync_direct_request_state(uuid, uuid) from public, anon, authenticated;

-- ─── Relationship / discovery RPCs ────────────────────────────────────────────

-- Batched on purpose: search results, group member lists and the friends page
-- all need the relationship for many users at once, and a per-user call would be
-- a guaranteed N+1.
create or replace function public.get_relationships(p_user_ids uuid[])
returns table (
  user_id        uuid,
  status         text,
  request_id     uuid,
  mutual_friends integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    u.id,
    case
      when exists (select 1 from public.user_blocks b where b.blocker_id = auth.uid() and b.blocked_id = u.id) then 'blocked'
      when exists (select 1 from public.user_blocks b where b.blocker_id = u.id and b.blocked_id = auth.uid()) then 'blocked_by'
      when f.id is null then 'none'
      when f.status = 'accepted' then 'friends'
      when f.requester_id = auth.uid() then 'pending_out'
      else 'pending_in'
    end,
    f.id,
    public.mutual_friend_count(auth.uid(), u.id)
  from unnest(p_user_ids) as u(id)
  left join public.friendships f
    on least(f.requester_id, f.recipient_id) = least(auth.uid(), u.id)
   and greatest(f.requester_id, f.recipient_id) = greatest(auth.uid(), u.id);
$$;

create or replace function public.search_users(p_query text)
returns table (
  id           uuid,
  username     text,
  display_name text,
  avatar_url   text,
  is_online    boolean,
  last_seen_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_online, p.last_seen_at
  from public.profiles p
  where p.id <> auth.uid()
    and (p.username ilike '%' || p_query || '%' or p.display_name ilike '%' || p_query || '%')
    and not public.is_blocked_between(auth.uid(), p.id)
  order by p.username
  limit 20;
$$;

-- People You May Know: friends-of-friends weighted by mutual count, merged with
-- people sharing a group chat. Both signals are small, indexed scans at this
-- scale; anything heavier belongs in a materialised view later.
create or replace function public.get_friend_suggestions(p_limit integer default 10)
returns table (
  id             uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  is_online      boolean,
  mutual_friends integer,
  shared_groups  integer
)
language sql
stable
security definer
set search_path = public
as $$
  with my_friends as (
    select case when f.requester_id = auth.uid() then f.recipient_id else f.requester_id end as fid
    from public.friendships f
    where f.status = 'accepted' and auth.uid() in (f.requester_id, f.recipient_id)
  ),
  fof as (
    select case when f.requester_id = mf.fid then f.recipient_id else f.requester_id end as cand,
           count(*)::integer as mutual
    from public.friendships f
    join my_friends mf on mf.fid in (f.requester_id, f.recipient_id)
    where f.status = 'accepted'
    group by 1
  ),
  my_groups as (
    select c.id
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id and cm.user_id = auth.uid()
    where c.type = 'group'
  ),
  grp as (
    select cm.user_id as cand, count(distinct cm.conversation_id)::integer as shared
    from public.conversation_members cm
    join my_groups g on g.id = cm.conversation_id
    group by 1
  ),
  cands as (
    select coalesce(fof.cand, grp.cand) as cand,
           coalesce(fof.mutual, 0) as mutual,
           coalesce(grp.shared, 0) as shared
    from fof
    full outer join grp on grp.cand = fof.cand
  )
  select p.id, p.username, p.display_name, p.avatar_url, p.is_online, c.mutual, c.shared
  from cands c
  join public.profiles p on p.id = c.cand
  where c.cand <> auth.uid()
    and not exists (
      select 1 from public.friendships f
      where least(f.requester_id, f.recipient_id) = least(auth.uid(), c.cand)
        and greatest(f.requester_id, f.recipient_id) = greatest(auth.uid(), c.cand)
    )
    and not public.is_blocked_between(auth.uid(), c.cand)
  order by c.mutual desc, c.shared desc, p.username
  limit p_limit;
$$;

grant execute on function public.get_relationships(uuid[]) to authenticated;
grant execute on function public.search_users(text) to authenticated;
grant execute on function public.get_friend_suggestions(integer) to authenticated;
revoke execute on function public.get_relationships(uuid[]) from public, anon;
revoke execute on function public.search_users(text) from public, anon;
revoke execute on function public.get_friend_suggestions(integer) from public, anon;
revoke execute on function public.send_friend_request(uuid) from public, anon;
revoke execute on function public.accept_friend_request(uuid) from public, anon;
revoke execute on function public.block_user(uuid) from public, anon;

-- ─── Conversation RPCs: gating ────────────────────────────────────────────────
-- Signatures are unchanged on purpose — yaply-ios calls these same functions and
-- must keep working without a client update.

create or replace function public.find_or_create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
  v_state           text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot message yourself';
  end if;

  if public.is_blocked_between(auth.uid(), target_user_id) then
    raise exception 'blocked';
  end if;

  select cm1.conversation_id into v_conversation_id
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id
   and cm2.user_id = target_user_id
  join public.conversations c
    on c.id = cm1.conversation_id
   and c.type = 'direct'
  where cm1.user_id = auth.uid()
  limit 1;

  if v_conversation_id is not null then
    -- Reaching this RPC is an explicit "I want to talk to this person", so a
    -- thread the caller previously declined is reopened on their side.
    update public.conversation_members
       set request_state = 'accepted'
     where conversation_id = v_conversation_id
       and user_id = auth.uid()
       and request_state = 'declined';
    return v_conversation_id;
  end if;

  -- Friends chat immediately; a stranger's first DM arrives as a request.
  v_state := case when public.are_friends(auth.uid(), target_user_id) then 'accepted' else 'pending' end;

  insert into public.conversations (type, created_by)
  values ('direct', auth.uid())
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role, request_state)
  values
    (v_conversation_id, auth.uid(),     'owner',  'accepted'),
    (v_conversation_id, target_user_id, 'member', v_state);

  return v_conversation_id;
end;
$$;

create or replace function public.create_group_conversation(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv_id    uuid;
  v_creator_id uuid := auth.uid();
  v_member_id  uuid;
begin
  if v_creator_id is null then
    raise exception 'not authenticated';
  end if;

  foreach v_member_id in array p_member_ids loop
    if v_member_id <> v_creator_id and not public.are_friends(v_creator_id, v_member_id) then
      raise exception 'can only add friends to groups';
    end if;
  end loop;

  insert into public.conversations (type, name, created_by)
  values ('group', p_name, v_creator_id)
  returning id into v_conv_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conv_id, v_creator_id, 'owner');

  foreach v_member_id in array p_member_ids loop
    if v_member_id <> v_creator_id then
      insert into public.conversation_members (conversation_id, user_id, role)
      values (v_conv_id, v_member_id, 'member')
      on conflict do nothing;
    end if;
  end loop;

  return v_conv_id;
end;
$$;

-- Adding a member used to be a bare client-side insert against
-- conversation_members. It now goes through an RPC so the friendship rule is
-- enforced in one place, with the RLS policy above as a second line of defence.
create or replace function public.add_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if public.get_user_role_in_conversation(auth.uid(), p_conversation_id) not in ('owner', 'admin') then
    raise exception 'not an admin of this conversation';
  end if;

  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and c.type = 'group'
  ) then
    raise exception 'not a group conversation';
  end if;

  if not public.are_friends(auth.uid(), p_user_id) then
    raise exception 'can only add friends to groups';
  end if;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (p_conversation_id, p_user_id, 'member')
  on conflict do nothing;
end;
$$;

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

  -- Was a bare membership check; now also covers message requests and blocks.
  if not public.can_send_in_conversation(auth.uid(), p_conversation_id) then
    raise exception 'cannot send in this conversation';
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

grant execute on function public.find_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
grant execute on function public.send_message_with_envelopes(uuid, text, text, jsonb, text, uuid, uuid, text, text) to authenticated;
revoke execute on function public.find_or_create_direct_conversation(uuid) from public, anon;
revoke execute on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke execute on function public.add_group_member(uuid, uuid) from public, anon;
revoke execute on function public.send_message_with_envelopes(uuid, text, text, jsonb, text, uuid, uuid, text, text) from public, anon;

-- ─── Grandfather existing conversations ───────────────────────────────────────
-- Anyone already in a DM together becomes friends, so shipping this feature is
-- invisible to current users: no existing thread turns into a message request.
insert into public.friendships (requester_id, recipient_id, status)
select distinct
  least(cm1.user_id, cm2.user_id),
  greatest(cm1.user_id, cm2.user_id),
  'accepted'
from public.conversation_members cm1
join public.conversation_members cm2
  on cm2.conversation_id = cm1.conversation_id
 and cm2.user_id > cm1.user_id
join public.conversations c
  on c.id = cm1.conversation_id
 and c.type = 'direct'
on conflict do nothing;

-- ─── Realtime ─────────────────────────────────────────────────────────────────
-- Friend request badges and the accepted-request banner both need push.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;

commit;
