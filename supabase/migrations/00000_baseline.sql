


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."expense_category" AS ENUM (
    'food',
    'transport',
    'entertainment',
    'utilities',
    'rent',
    'health',
    'shopping',
    'other'
);


ALTER TYPE "public"."expense_category" OWNER TO "postgres";


CREATE TYPE "public"."reminder_status" AS ENUM (
    'pending',
    'sent',
    'dismissed'
);


ALTER TYPE "public"."reminder_status" OWNER TO "postgres";


CREATE TYPE "public"."task_priority" AS ENUM (
    'low',
    'medium',
    'high'
);


ALTER TYPE "public"."task_priority" OWNER TO "postgres";


CREATE TYPE "public"."task_status" AS ENUM (
    'todo',
    'in_progress',
    'done'
);


ALTER TYPE "public"."task_status" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_no_self" CHECK (("requester_id" <> "recipient_id")),
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text"])))
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") RETURNS "public"."friendships"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.friendships;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update public.friendships
     set status = 'accepted'
   where id = p_request_id and recipient_id = auth.uid() and status = 'pending'
  returning * into v_row;

  if not found then raise exception 'friend request not found'; end if;

  perform public.sync_direct_request_state(v_row.requester_id, v_row.recipient_id);
  return v_row;
end;
$$;


ALTER FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if public.get_user_role_in_conversation(auth.uid(), p_conversation_id) not in ('owner', 'admin') then
    raise exception 'not an admin of this conversation';
  end if;

  if not exists (select 1 from public.conversations c where c.id = p_conversation_id and c.type = 'group') then
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


ALTER FUNCTION "public"."add_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."are_friends"("p_a" "uuid", "p_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and least(f.requester_id, f.recipient_id) = least(p_a, p_b)
      and greatest(f.requester_id, f.recipient_id) = greatest(p_a, p_b)
  );
$$;


ALTER FUNCTION "public"."are_friends"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot block yourself'; end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing;

  delete from public.friendships
   where least(requester_id, recipient_id) = least(auth.uid(), p_user_id)
     and greatest(requester_id, recipient_id) = greatest(auth.uid(), p_user_id);
end;
$$;


ALTER FUNCTION "public"."block_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_send_in_conversation"("p_user" "uuid", "p_conversation_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.conversation_members me
    join public.conversations c on c.id = me.conversation_id
    where me.conversation_id = p_conversation_id
      and me.user_id = p_user
      and me.request_state = 'accepted'
      and not exists (
        select 1 from public.conversation_members d
        where d.conversation_id = p_conversation_id and d.request_state = 'declined'
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


ALTER FUNCTION "public"."can_send_in_conversation"("p_user" "uuid", "p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_prekey"("p_user_id" "uuid", "p_device_id" integer) RETURNS TABLE("key_id" integer, "public_key" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_prekey_id UUID;
    v_key_id INTEGER;
    v_public_key TEXT;
BEGIN
    SELECT pk.id, pk.key_id, pk.public_key
    INTO v_prekey_id, v_key_id, v_public_key
    FROM public.prekeys pk
    WHERE pk.user_id = p_user_id
      AND pk.device_id = p_device_id
      AND pk.is_consumed = FALSE
    ORDER BY pk.key_id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_prekey_id IS NOT NULL THEN
        UPDATE public.prekeys SET is_consumed = TRUE WHERE id = v_prekey_id;
        RETURN QUERY SELECT v_key_id, v_public_key;
    END IF;
END;
$$;


ALTER FUNCTION "public"."consume_prekey"("p_user_id" "uuid", "p_device_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_group_conversation"("p_name" "text", "p_member_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conv_id    uuid;
  v_creator_id uuid := auth.uid();
  v_member_id  uuid;
begin
  if v_creator_id is null then raise exception 'not authenticated'; end if;

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


ALTER FUNCTION "public"."create_group_conversation"("p_name" "text", "p_member_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_conversation_if_empty"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from conversation_members where conversation_id = old.conversation_id
  ) then
    delete from conversations where id = old.conversation_id;
  end if;
  return old;
end;
$$;


ALTER FUNCTION "public"."delete_conversation_if_empty"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_due_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    with due as (
      select id from public.reminders
       where status = 'pending' and remind_at <= now()
       order by remind_at
       limit 200
       for update skip locked
    )
    update public.reminders rem
       set status = 'sent', sent_at = now(), attempts = rem.attempts + 1
      from due
     where rem.id = due.id
    returning rem.id
  loop
    perform public.enqueue_push(
      jsonb_build_object('kind', 'reminder', 'reminder_id', r.id)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."dispatch_due_reminders"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_push"("p_body" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
declare
  v_url    text := public.push_config('push_fn_url');
  v_secret text := public.push_config('push_webhook_secret');
begin
  -- Not configured yet. Do nothing, and never raise.
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := p_body,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-push-secret', v_secret
               ),
    timeout_milliseconds := 5000
  );
exception when others then
  -- A broken vault entry, a dropped extension, anything at all: the push is
  -- lost, the write that triggered it still succeeds.
  raise warning 'enqueue_push failed: %', sqlerrm;
end;
$$;


ALTER FUNCTION "public"."enqueue_push"("p_body" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_or_create_direct_conversation"("target_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_conversation_id uuid;
  v_state           text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if target_user_id = auth.uid() then raise exception 'cannot message yourself'; end if;
  if public.is_blocked_between(auth.uid(), target_user_id) then raise exception 'blocked'; end if;

  select cm1.conversation_id into v_conversation_id
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id and cm2.user_id = target_user_id
  join public.conversations c
    on c.id = cm1.conversation_id and c.type = 'direct'
  where cm1.user_id = auth.uid()
  limit 1;

  if v_conversation_id is not null then
    update public.conversation_members
       set request_state = 'accepted'
     where conversation_id = v_conversation_id
       and user_id = auth.uid()
       and request_state = 'declined';
    return v_conversation_id;
  end if;

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


ALTER FUNCTION "public"."find_or_create_direct_conversation"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_budget_summary"("p_budget_id" "uuid") RETURNS TABLE("user_id" "uuid", "total_paid" numeric, "total_owed" numeric, "net_balance" numeric)
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  with paid as (
    select paid_by as user_id, sum(amount) as total_paid
    from public.expenses where budget_id = p_budget_id group by paid_by
  ),
  owed as (
    select u.id as user_id,
           sum(e.amount / array_length(e.split_between, 1)) as total_owed
    from public.expenses e
    cross join unnest(e.split_between) as u(id)
    where e.budget_id = p_budget_id group by u.id
  )
  select
    coalesce(p.user_id, o.user_id) as user_id,
    coalesce(p.total_paid, 0)      as total_paid,
    coalesce(o.total_owed, 0)      as total_owed,
    coalesce(p.total_paid, 0) - coalesce(o.total_owed, 0) as net_balance
  from paid p full outer join owed o on o.user_id = p.user_id;
$$;


ALTER FUNCTION "public"."get_budget_summary"("p_budget_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_friend_suggestions"("p_limit" integer DEFAULT 10) RETURNS TABLE("id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text", "is_online" boolean, "mutual_friends" integer, "shared_groups" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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
    from fof full outer join grp on grp.cand = fof.cand
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


ALTER FUNCTION "public"."get_friend_suggestions"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_relationships"("p_user_ids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "status" "text", "request_id" "uuid", "mutual_friends" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."get_relationships"("p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_conversation_ids"("uid" "uuid") RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT conversation_id FROM public.conversation_members WHERE user_id = uid;
$$;


ALTER FUNCTION "public"."get_user_conversation_ids"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role_in_conversation"("uid" "uuid", "conv_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM public.conversation_members
  WHERE user_id = uid AND conversation_id = conv_id
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_role_in_conversation"("uid" "uuid", "conv_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, username, display_name, avatar_url, username_set)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 6)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_blocked_between"("p_a" "uuid", "p_b" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;


ALTER FUNCTION "public"."is_blocked_between"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mutual_friend_count"("p_a" "uuid", "p_b" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."mutual_friend_count"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_event_confirmed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    perform public.enqueue_push(jsonb_build_object(
      'kind', 'event_confirmed',
      'event_id', new.id,
      'actor_id', coalesce(auth.uid(), new.created_by)
    ));
  end if;
  return new;
exception when others then
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_event_confirmed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_friendship"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.enqueue_push(jsonb_build_object(
      'kind', 'friend_request',
      'actor_id', new.requester_id,
      'target_id', new.recipient_id
    ));
  elsif tg_op = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    -- Tell whoever asked that they were accepted; the accepter already knows.
    perform public.enqueue_push(jsonb_build_object(
      'kind', 'friend_accepted',
      'actor_id', new.recipient_id,
      'target_id', new.requester_id
    ));
  end if;
  return new;
exception when others then
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_friendship"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- System messages are UI chrome ("Task created: ..."), and they are the one
  -- message type stored as readable plaintext. Pushing them would be both noise
  -- and the only payload on this path carrying content the server can read.
  if new.type = 'system' then
    return new;
  end if;

  if new.deleted_at is not null then
    return new;
  end if;

  -- Only the id travels. The function re-reads with the service role, so the
  -- queue row stays small and no ciphertext or envelope material is ever
  -- written into pg_net's tables.
  perform public.enqueue_push(
    jsonb_build_object('kind', 'message', 'message_id', new.id)
  );
  return new;
exception when others then
  -- Belt and braces on top of enqueue_push's own handler. Sending a message
  -- must never fail because a notification could not be dispatched.
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_new_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_task_assigned"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by);
begin
  if new.assigned_to is null then return new; end if;
  -- Only when the assignee actually changed.
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  -- Assigning something to yourself is not news.
  if new.assigned_to = v_actor then return new; end if;

  perform public.enqueue_push(jsonb_build_object(
    'kind', 'task_assigned',
    'task_id', new.id,
    'actor_id', v_actor
  ));
  return new;
exception when others then
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_task_assigned"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_config"("p_name" "text") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'vault', 'public', 'pg_temp'
    AS $$
  select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1;
$$;


ALTER FUNCTION "public"."push_config"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_message_context"("p_message_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'message_id',        m.id,
    'conversation_id',   m.conversation_id,
    'conversation_type', c.type::text,
    'conversation_name', c.name,
    'sender_id',         m.sender_id,
    'sender_name',       coalesce(p.display_name, p.username),
    'sender_username',   p.username,
    'sender_avatar_url', p.avatar_url,
    'type',              m.type::text,
    'enc_v',             m.enc_v,
    'iv',                m.iv,
    'content',           m.content,
    'media_mime',        m.media_mime,
    'reply_to_id',       m.reply_to_id,
    'created_at',        m.created_at
  )
  from public.messages m
  join public.conversations c on c.id = m.conversation_id
  left join public.profiles p on p.id = m.sender_id
  where m.id = p_message_id
    and m.deleted_at is null;
$$;


ALTER FUNCTION "public"."push_message_context"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_simple_notification"("p_kind" "text", "p_payload" "jsonb") RETURNS TABLE("token" "text", "environment" "text", "recipient_id" "uuid", "device_id" integer, "title" "text", "body" "text", "conversation_id" "uuid")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_targets uuid[];
  v_title   text;
  v_body    text;
  v_conv    uuid;
  v_actor   text;
begin
  -- Display name of whoever caused the notification, where there is one.
  select coalesce(p.display_name, p.username)
    into v_actor
    from public.profiles p
   where p.id = (p_payload->>'actor_id')::uuid;

  if p_kind = 'friend_request' then
    v_targets := array[(p_payload->>'target_id')::uuid];
    v_title   := coalesce(v_actor, 'Someone');
    v_body    := 'Sent you a friend request';

  elsif p_kind = 'friend_accepted' then
    v_targets := array[(p_payload->>'target_id')::uuid];
    v_title   := coalesce(v_actor, 'Someone');
    v_body    := 'Accepted your friend request';

  elsif p_kind = 'task_assigned' then
    select array[t.assigned_to], t.conversation_id, 'Assigned to you: ' || t.title
      into v_targets, v_conv, v_body
      from public.tasks t
     where t.id = (p_payload->>'task_id')::uuid;
    v_title := coalesce(v_actor, 'Yaply');

  elsif p_kind = 'event_confirmed' then
    select e.conversation_id, e.name into v_conv, v_title
      from public.events e
     where e.id = (p_payload->>'event_id')::uuid;
    if v_title is null then return; end if;
    v_body := 'Event confirmed';
    -- Everyone in the conversation except whoever confirmed it.
    select array_agg(cm.user_id) into v_targets
      from public.conversation_members cm
     where cm.conversation_id = v_conv
       and cm.user_id <> (p_payload->>'actor_id')::uuid
       and cm.request_state = 'accepted'
       and (cm.muted_until is null or cm.muted_until <= now());

  elsif p_kind = 'reminder' then
    -- The creator, matching where the client used to schedule this locally.
    select array[r.user_id], r.conversation_id, r.message
      into v_targets, v_conv, v_body
      from public.reminders r
     where r.id = (p_payload->>'reminder_id')::uuid;
    v_title := 'Reminder';

  else
    return;
  end if;

  if v_targets is null or cardinality(v_targets) = 0 or v_body is null then
    return;
  end if;

  return query
    select pt.token, pt.environment, pt.user_id, pt.device_id, v_title, v_body, v_conv
      from public.push_tokens pt
      join public.devices d
        on d.user_id = pt.user_id
       and d.device_id = pt.device_id
       and d.last_active_at > now() - interval '90 days'
     where pt.user_id = any(v_targets);
end;
$$;


ALTER FUNCTION "public"."push_simple_notification"("p_kind" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_targets_for_message"("p_message_id" "uuid") RETURNS TABLE("token" "text", "environment" "text", "recipient_id" "uuid", "device_id" integer, "recipient_fp" "text", "eph_pub" "text", "key_iv" "text", "wrapped_key" "text", "unread_count" integer, "is_mention" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with m as (
    select id, conversation_id, sender_id, enc_v, deleted_at,
           mentioned_user_ids, mentions_everyone
    from public.messages
    where id = p_message_id
  ),
  recips as (
    select cm.user_id, cm.last_read_at
    from public.conversation_members cm
    join m on m.conversation_id = cm.conversation_id
    where cm.user_id <> m.sender_id
      and cm.request_state = 'accepted'
      and (
            cm.muted_until is null or cm.muted_until <= now()
            or (not cm.mute_mentions
                and (m.mentions_everyone or cm.user_id = any(m.mentioned_user_ids)))
          )
      and not public.is_blocked_between(cm.user_id, m.sender_id)
  )
  select
    pt.token,
    pt.environment,
    d.user_id,
    d.device_id,
    e.recipient_fp,
    e.eph_pub,
    e.key_iv,
    e.wrapped_key,
    -- Total across the recipient's whole inbox, per-conversation mute rules
    -- applied per message: a muted conversation still contributes its own
    -- unread @mentions unless that member also set mute_mentions.
    (select count(*)::int
       from public.conversation_members cm2
       join public.messages um on um.conversation_id = cm2.conversation_id
      where cm2.user_id = r.user_id
        and cm2.request_state = 'accepted'
        and (
              cm2.muted_until is null or cm2.muted_until <= now()
              or (not cm2.mute_mentions
                  and (um.mentions_everyone or cm2.user_id = any(um.mentioned_user_ids)))
            )
        and um.deleted_at is null
        and um.type <> 'system'
        and um.sender_id <> r.user_id
        and um.created_at > coalesce(cm2.last_read_at, '-infinity'::timestamptz)),
    (m.mentions_everyone or r.user_id = any(m.mentioned_user_ids))
  from recips r
  cross join m
  join public.devices d
    on d.user_id = r.user_id
   and d.last_active_at > now() - interval '90 days'
  join public.push_tokens pt
    on pt.user_id = d.user_id
   and pt.device_id = d.device_id
  left join public.message_envelopes e
    on e.message_id = m.id
   and e.recipient_user_id = d.user_id
   and e.recipient_fp = d.key_fingerprint
  where m.deleted_at is null
    and (m.enc_v is distinct from 2 or e.id is not null);
$$;


ALTER FUNCTION "public"."push_targets_for_message"("p_message_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_token_record_failure"("p_token" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  delete from public.push_tokens
  where token = p_token and fail_count >= 9;

  update public.push_tokens
  set fail_count = fail_count + 1
  where token = p_token;
$$;


ALTER FUNCTION "public"."push_token_record_failure"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_tokens_claim_token"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  delete from public.push_tokens
  where token = new.token
    and not (user_id = new.user_id and device_id = new.device_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."push_tokens_claim_token"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_device"("p_device_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
declare
  v_uid uuid := auth.uid();
  v_session uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select d.session_id into v_session
  from public.devices d
  where d.user_id = v_uid and d.device_id = p_device_id;

  if not found then
    raise exception 'device not found';
  end if;

  delete from public.devices
  where user_id = v_uid and device_id = p_device_id;

  if v_session is not null then
    delete from auth.sessions where id = v_session;
  end if;
end;
$$;


ALTER FUNCTION "public"."revoke_device"("p_device_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sanitize_message_mentions"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_conv_type text;
begin
  select type into v_conv_type
  from public.conversations
  where id = new.conversation_id;

  if v_conv_type is distinct from 'group' or new.type <> 'text' then
    new.mentioned_user_ids := '{}';
    new.mentions_everyone := false;
    return new;
  end if;

  if new.mentioned_user_ids is null then
    new.mentioned_user_ids := '{}';
  end if;

  select coalesce(array_agg(distinct uid), '{}')
    into new.mentioned_user_ids
  from unnest(new.mentioned_user_ids[1:64]) as uid
  where uid <> new.sender_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = new.conversation_id
        and cm.user_id = uid
    );

  return new;
end;
$$;


ALTER FUNCTION "public"."sanitize_message_mentions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_users"("p_query" "text") RETURNS TABLE("id" "uuid", "username" "text", "display_name" "text", "avatar_url" "text", "is_online" boolean, "last_seen_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_online, p.last_seen_at
  from public.profiles p
  where p.id <> auth.uid()
    and (p.username ilike '%' || p_query || '%' or p.display_name ilike '%' || p_query || '%')
    and not public.is_blocked_between(auth.uid(), p.id)
  order by p.username
  limit 20;
$$;


ALTER FUNCTION "public"."search_users"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_friend_request"("p_recipient_id" "uuid") RETURNS "public"."friendships"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_row public.friendships;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_recipient_id = auth.uid() then raise exception 'cannot friend yourself'; end if;
  if public.is_blocked_between(auth.uid(), p_recipient_id) then raise exception 'blocked'; end if;

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


ALTER FUNCTION "public"."send_friend_request"("p_recipient_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "content" "text" NOT NULL,
    "iv" "text",
    "media_url" "text",
    "media_mime" "text",
    "reply_to_id" "uuid",
    "thread_id" "uuid",
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "enc_v" smallint,
    "mentioned_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "mentions_everyone" boolean DEFAULT false NOT NULL,
    CONSTRAINT "messages_mentions_text_only" CHECK ((("type" = 'text'::"text") OR (("mentioned_user_ids" = '{}'::"uuid"[]) AND ("mentions_everyone" = false)))),
    CONSTRAINT "messages_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'image'::"text", 'gif'::"text", 'sticker'::"text", 'file'::"text", 'voice'::"text", 'system'::"text", 'ai'::"text"])))
);

ALTER TABLE ONLY "public"."messages" REPLICA IDENTITY FULL;


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_message_with_envelopes"("p_conversation_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb", "p_type" "text" DEFAULT 'text'::"text", "p_reply_to_id" "uuid" DEFAULT NULL::"uuid", "p_thread_id" "uuid" DEFAULT NULL::"uuid", "p_media_url" "text" DEFAULT NULL::"text", "p_media_mime" "text" DEFAULT NULL::"text", "p_mentioned_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_mentions_everyone" boolean DEFAULT false) RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_msg public.messages;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

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
    (conversation_id, sender_id, content, iv, enc_v, type, reply_to_id, thread_id,
     media_url, media_mime, mentioned_user_ids, mentions_everyone)
  values
    (p_conversation_id, auth.uid(), p_content, p_iv, 2, p_type, p_reply_to_id, p_thread_id,
     p_media_url, p_media_mime, coalesce(p_mentioned_user_ids, '{}'), coalesce(p_mentions_everyone, false))
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


ALTER FUNCTION "public"."send_message_with_envelopes"("p_conversation_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb", "p_type" "text", "p_reply_to_id" "uuid", "p_thread_id" "uuid", "p_media_url" "text", "p_media_mime" "text", "p_mentioned_user_ids" "uuid"[], "p_mentions_everyone" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin new.updated_at = now(); return new; end $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_direct_request_state"("p_a" "uuid", "p_b" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."sync_direct_request_state"("p_a" "uuid", "p_b" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_conversation_last_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE public.conversations
  SET updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_conversation_last_message"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "context_summary" "text",
    "model" "text" DEFAULT 'claude-sonnet'::"text",
    "token_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."album_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "album_id" "uuid" NOT NULL,
    "message_id" "uuid",
    "media_url" "text" NOT NULL,
    "media_mime" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."album_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."albums" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "uuid",
    "locked" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."albums" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "total_amount" numeric(12,2) NOT NULL,
    "currency" character(3) DEFAULT 'USD'::"bpchar" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "splitwise_group_id" "text",
    "event_id" "uuid",
    "locked" boolean DEFAULT false NOT NULL,
    CONSTRAINT "budgets_total_amount_check" CHECK (("total_amount" > (0)::numeric))
);


ALTER TABLE "public"."budgets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversation_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "last_read_at" timestamp with time zone DEFAULT "now"(),
    "is_muted" boolean DEFAULT false,
    "muted_until" timestamp with time zone,
    "request_state" "text" DEFAULT 'accepted'::"text" NOT NULL,
    "mute_mentions" boolean DEFAULT false NOT NULL,
    CONSTRAINT "conversation_members_request_state_check" CHECK (("request_state" = ANY (ARRAY['accepted'::"text", 'pending'::"text", 'declined'::"text"]))),
    CONSTRAINT "conversation_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."conversation_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text" DEFAULT 'direct'::"text" NOT NULL,
    "name" "text",
    "avatar_url" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "conversations_type_check" CHECK (("type" = ANY (ARRAY['direct'::"text", 'group'::"text", 'ai'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" integer NOT NULL,
    "identity_key" "text" NOT NULL,
    "signed_prekey" "jsonb",
    "device_name" "text",
    "last_active_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "key_fingerprint" "text",
    "session_id" "uuid",
    "platform" "text"
);


ALTER TABLE "public"."devices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "slots" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."event_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_rsvp" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "response" "text" DEFAULT 'pending'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "event_rsvp_response_check" CHECK (("response" = ANY (ARRAY['going'::"text", 'maybe'::"text", 'not_going'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."event_rsvp" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "location" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'planning'::"text" NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['planning'::"text", 'confirmed'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "budget_id" "uuid" NOT NULL,
    "paid_by" "uuid" NOT NULL,
    "description" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "category" "public"."expense_category" DEFAULT 'other'::"public"."expense_category" NOT NULL,
    "split_between" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expenses_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_envelopes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "recipient_user_id" "uuid" NOT NULL,
    "recipient_fp" "text" NOT NULL,
    "eph_pub" "text" NOT NULL,
    "key_iv" "text" NOT NULL,
    "wrapped_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_envelopes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reactions" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_reactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_reads" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_reads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" integer NOT NULL,
    "status" "text" NOT NULL,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_receipts_status_check" CHECK (("status" = ANY (ARRAY['delivered'::"text", 'read'::"text"])))
);


ALTER TABLE "public"."message_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "title" "text" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "event_id" "uuid",
    "locked" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pinned_messages" (
    "conversation_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "pinned_by" "uuid",
    "pinned_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pinned_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "question" "text" NOT NULL,
    "options" "jsonb" NOT NULL,
    "votes" "jsonb" DEFAULT '{}'::"jsonb",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."polls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prekeys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" integer NOT NULL,
    "key_id" integer NOT NULL,
    "public_key" "text" NOT NULL,
    "is_consumed" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."prekeys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "bio" "text",
    "status" "text" DEFAULT 'offline'::"text",
    "last_seen_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_online" boolean DEFAULT false NOT NULL,
    "username_set" boolean DEFAULT true NOT NULL,
    "birthdate" "date",
    CONSTRAINT "profiles_status_check" CHECK (("status" = ANY (ARRAY['online'::"text", 'offline'::"text", 'away'::"text", 'dnd'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "platform" "text" DEFAULT 'web'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_subscriptions_platform_check" CHECK (("platform" = 'web'::"text"))
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_subscriptions" IS 'Web Push (VAPID) subscriptions only. Native APNs/FCM tokens live in push_tokens.';



CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "device_id" integer NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text" DEFAULT 'ios'::"text" NOT NULL,
    "environment" "text" DEFAULT 'production'::"text" NOT NULL,
    "fail_count" integer DEFAULT 0 NOT NULL,
    "last_success_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_environment_check" CHECK (("environment" = ANY (ARRAY['sandbox'::"text", 'production'::"text"]))),
    CONSTRAINT "push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."push_tokens" IS 'Native push tokens, one row per install, linked to a devices row so the sender can select the matching message_envelopes row for the payload.';



CREATE TABLE IF NOT EXISTS "public"."reminders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "message" "text" NOT NULL,
    "remind_at" timestamp with time zone NOT NULL,
    "status" "public"."reminder_status" DEFAULT 'pending'::"public"."reminder_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "sent_at" timestamp with time zone,
    "attempts" smallint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."reminders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stickers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."stickers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "created_by" "uuid" NOT NULL,
    "assigned_to" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "status" "public"."task_status" DEFAULT 'todo'::"public"."task_status" NOT NULL,
    "priority" "public"."task_priority" DEFAULT 'medium'::"public"."task_priority" NOT NULL,
    "due_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_blocks" (
    "blocker_id" "uuid" NOT NULL,
    "blocked_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_no_self" CHECK (("blocker_id" <> "blocked_id"))
);


ALTER TABLE "public"."user_blocks" OWNER TO "postgres";


ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."album_media"
    ADD CONSTRAINT "album_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_user_id_device_id_key" UNIQUE ("user_id", "device_id");



ALTER TABLE ONLY "public"."event_availability"
    ADD CONSTRAINT "event_availability_event_id_user_id_key" UNIQUE ("event_id", "user_id");



ALTER TABLE ONLY "public"."event_availability"
    ADD CONSTRAINT "event_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_rsvp"
    ADD CONSTRAINT "event_rsvp_event_id_user_id_key" UNIQUE ("event_id", "user_id");



ALTER TABLE ONLY "public"."event_rsvp"
    ADD CONSTRAINT "event_rsvp_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_envelopes"
    ADD CONSTRAINT "message_envelopes_message_id_recipient_user_id_recipient_fp_key" UNIQUE ("message_id", "recipient_user_id", "recipient_fp");



ALTER TABLE ONLY "public"."message_envelopes"
    ADD CONSTRAINT "message_envelopes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("message_id", "user_id", "emoji");



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_pkey" PRIMARY KEY ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_message_id_user_id_device_id_status_key" UNIQUE ("message_id", "user_id", "device_id", "status");



ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_pkey" PRIMARY KEY ("conversation_id", "message_id");



ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prekeys"
    ADD CONSTRAINT "prekeys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prekeys"
    ADD CONSTRAINT "prekeys_user_id_device_id_key_id_key" UNIQUE ("user_id", "device_id", "key_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_device_id_key" UNIQUE ("user_id", "device_id");



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stickers"
    ADD CONSTRAINT "stickers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "blocked_id");



CREATE INDEX "album_media_album_idx" ON "public"."album_media" USING "btree" ("album_id");



CREATE INDEX "albums_conversation_idx" ON "public"."albums" USING "btree" ("conversation_id");



CREATE INDEX "budgets_conversation_idx" ON "public"."budgets" USING "btree" ("conversation_id");



CREATE INDEX "conversation_members_request_state_idx" ON "public"."conversation_members" USING "btree" ("user_id", "request_state") WHERE ("request_state" <> 'accepted'::"text");



CREATE INDEX "devices_user_fp_idx" ON "public"."devices" USING "btree" ("user_id", "key_fingerprint");



CREATE INDEX "expenses_budget_idx" ON "public"."expenses" USING "btree" ("budget_id");



CREATE INDEX "expenses_paid_by_idx" ON "public"."expenses" USING "btree" ("paid_by");



CREATE UNIQUE INDEX "friendships_pair_uq" ON "public"."friendships" USING "btree" (LEAST("requester_id", "recipient_id"), GREATEST("requester_id", "recipient_id"));



CREATE INDEX "friendships_recipient_idx" ON "public"."friendships" USING "btree" ("recipient_id", "status");



CREATE INDEX "friendships_requester_idx" ON "public"."friendships" USING "btree" ("requester_id", "status");



CREATE INDEX "idx_conv_members_conv" ON "public"."conversation_members" USING "btree" ("conversation_id");



CREATE INDEX "idx_conv_members_user" ON "public"."conversation_members" USING "btree" ("user_id");



CREATE INDEX "idx_devices_user_id" ON "public"."devices" USING "btree" ("user_id");



CREATE INDEX "idx_events_conversation" ON "public"."events" USING "btree" ("conversation_id");



CREATE INDEX "idx_polls_conversation" ON "public"."polls" USING "btree" ("conversation_id");



CREATE INDEX "idx_prekeys_available" ON "public"."prekeys" USING "btree" ("user_id", "device_id", "is_consumed") WHERE ("is_consumed" = false);



CREATE INDEX "idx_profiles_username_trgm" ON "public"."profiles" USING "gin" ("username" "public"."gin_trgm_ops");



CREATE INDEX "message_envelopes_recipient_idx" ON "public"."message_envelopes" USING "btree" ("recipient_user_id", "message_id");



CREATE INDEX "message_reads_message_idx" ON "public"."message_reads" USING "btree" ("message_id");



CREATE INDEX "messages_conversation_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at" DESC);



CREATE INDEX "messages_mentions_gin" ON "public"."messages" USING "gin" ("mentioned_user_ids") WHERE ("mentioned_user_ids" <> '{}'::"uuid"[]);



CREATE INDEX "messages_sender_idx" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "messages_thread_idx" ON "public"."messages" USING "btree" ("thread_id") WHERE ("thread_id" IS NOT NULL);



CREATE INDEX "notes_conversation_idx" ON "public"."notes" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "notes_user_idx" ON "public"."notes" USING "btree" ("user_id");



CREATE INDEX "pinned_messages_conversation_idx" ON "public"."pinned_messages" USING "btree" ("conversation_id", "pinned_at" DESC);



CREATE INDEX "push_tokens_token_idx" ON "public"."push_tokens" USING "btree" ("token");



CREATE INDEX "push_tokens_user_idx" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "reminders_status_idx" ON "public"."reminders" USING "btree" ("status") WHERE ("status" = 'pending'::"public"."reminder_status");



CREATE INDEX "reminders_user_idx" ON "public"."reminders" USING "btree" ("user_id", "remind_at");



CREATE INDEX "stickers_user_idx" ON "public"."stickers" USING "btree" ("user_id");



CREATE INDEX "tasks_assigned_idx" ON "public"."tasks" USING "btree" ("assigned_to") WHERE ("assigned_to" IS NOT NULL);



CREATE INDEX "tasks_conversation_idx" ON "public"."tasks" USING "btree" ("conversation_id") WHERE ("conversation_id" IS NOT NULL);



CREATE INDEX "tasks_creator_idx" ON "public"."tasks" USING "btree" ("created_by");



CREATE INDEX "user_blocks_blocked_idx" ON "public"."user_blocks" USING "btree" ("blocked_id");



CREATE OR REPLACE TRIGGER "events_notify_push" AFTER UPDATE OF "status" ON "public"."events" FOR EACH ROW EXECUTE FUNCTION "public"."notify_event_confirmed"();



CREATE OR REPLACE TRIGGER "friendships_notify_push" AFTER INSERT OR UPDATE OF "status" ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."notify_friendship"();



CREATE OR REPLACE TRIGGER "friendships_updated_at" BEFORE UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "messages_notify_push" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_message"();



CREATE OR REPLACE TRIGGER "messages_update_conversation" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."update_conversation_last_message"();



CREATE OR REPLACE TRIGGER "notes_updated_at" BEFORE UPDATE ON "public"."notes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "push_tokens_claim" BEFORE INSERT OR UPDATE OF "token" ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."push_tokens_claim_token"();



CREATE OR REPLACE TRIGGER "push_tokens_updated_at" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "tasks_notify_push" AFTER INSERT OR UPDATE OF "assigned_to" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_assigned"();



CREATE OR REPLACE TRIGGER "tasks_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_delete_empty_conversation" AFTER DELETE ON "public"."conversation_members" FOR EACH ROW EXECUTE FUNCTION "public"."delete_conversation_if_empty"();



CREATE OR REPLACE TRIGGER "trg_messages_sanitize_mentions" BEFORE INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "public"."sanitize_message_mentions"();



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."album_media"
    ADD CONSTRAINT "album_media_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."album_media"
    ADD CONSTRAINT "album_media_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."albums"
    ADD CONSTRAINT "albums_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."budgets"
    ADD CONSTRAINT "budgets_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversation_members"
    ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_availability"
    ADD CONSTRAINT "event_availability_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_availability"
    ADD CONSTRAINT "event_availability_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_rsvp"
    ADD CONSTRAINT "event_rsvp_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_rsvp"
    ADD CONSTRAINT "event_rsvp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "public"."budgets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_envelopes"
    ADD CONSTRAINT "message_envelopes_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_envelopes"
    ADD CONSTRAINT "message_envelopes_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reactions"
    ADD CONSTRAINT "message_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_reads"
    ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."messages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notes"
    ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pinned_messages"
    ADD CONSTRAINT "pinned_messages_pinned_by_fkey" FOREIGN KEY ("pinned_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prekeys"
    ADD CONSTRAINT "prekeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_device_fk" FOREIGN KEY ("user_id", "device_id") REFERENCES "public"."devices"("user_id", "device_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reminders"
    ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stickers"
    ADD CONSTRAINT "stickers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_blocks"
    ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated users can create conversations" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "Creator can delete events" ON "public"."events" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Creator can update events" ON "public"."events" FOR UPDATE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "Members can create events" ON "public"."events" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "events"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Members can create polls" ON "public"."polls" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "polls"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Members can view AI conversations" ON "public"."ai_conversations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "ai_conversations"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view events" ON "public"."events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "events"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view polls" ON "public"."polls" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "polls"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "Members can view their conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members"
  WHERE (("conversation_members"."conversation_id" = "conversations"."id") AND ("conversation_members"."user_id" = "auth"."uid"())))));



CREATE POLICY "Profiles are viewable by authenticated users" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can manage own devices" ON "public"."devices" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own prekeys" ON "public"."prekeys" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can manage own receipts" ON "public"."message_receipts" TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read device public keys" ON "public"."devices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."album_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "album_media: member can insert" ON "public"."album_media" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."albums" "a"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "a"."conversation_id")))
  WHERE (("a"."id" = "album_media"."album_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "album_media: member can select" ON "public"."album_media" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."albums" "a"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "a"."conversation_id")))
  WHERE (("a"."id" = "album_media"."album_id") AND ("cm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."albums" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "albums: admin can delete any" ON "public"."albums" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "albums"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "albums: admin can update any" ON "public"."albums" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "albums"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "albums: conversation member can select" ON "public"."albums" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "albums"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "albums: creator can delete" ON "public"."albums" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "albums: member can create" ON "public"."albums" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "cm"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "albums: member can update" ON "public"."albums" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "albums"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "availability: member select" ON "public"."event_availability" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "e"."conversation_id")))
  WHERE (("e"."id" = "event_availability"."event_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "availability: owner insert" ON "public"."event_availability" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "availability: owner update" ON "public"."event_availability" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."budgets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "budgets: admin can delete any" ON "public"."budgets" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "budgets"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "budgets: admin can update any" ON "public"."budgets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "budgets"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "budgets: conversation member can select" ON "public"."budgets" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "budgets"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "budgets: creator can delete" ON "public"."budgets" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "budgets: member can create" ON "public"."budgets" FOR INSERT WITH CHECK ((("auth"."uid"() = "created_by") AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "cm"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "budgets: member can update" ON "public"."budgets" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "budgets"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."conversation_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversation_members: admin can remove others" ON "public"."conversation_members" FOR DELETE USING ((("auth"."uid"() <> "user_id") AND ("public"."get_user_role_in_conversation"("auth"."uid"(), "conversation_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "conversation_members: admin can update role" ON "public"."conversation_members" FOR UPDATE USING (("public"."get_user_role_in_conversation"("auth"."uid"(), "conversation_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])));



CREATE POLICY "conversation_members: member can insert" ON "public"."conversation_members" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (("public"."get_user_role_in_conversation"("auth"."uid"(), "conversation_id") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND "public"."are_friends"("auth"."uid"(), "user_id"))));



CREATE POLICY "conversation_members: member can select" ON "public"."conversation_members" FOR SELECT USING (("conversation_id" IN ( SELECT "public"."get_user_conversation_ids"("auth"."uid"()) AS "get_user_conversation_ids")));



CREATE POLICY "conversation_members: self can delete" ON "public"."conversation_members" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "conversation_members: self can update" ON "public"."conversation_members" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations: owner/admin can delete" ON "public"."conversations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "conversations"."id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_availability" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_rsvp" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events: admin can delete any" ON "public"."events" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "events"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "events: admin can update any" ON "public"."events" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "events"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses: member can insert" ON "public"."expenses" FOR INSERT WITH CHECK ((("auth"."uid"() = "paid_by") AND (EXISTS ( SELECT 1
   FROM ("public"."budgets" "b"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "b"."conversation_id")))
  WHERE (("b"."id" = "expenses"."budget_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "expenses: member can select" ON "public"."expenses" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."budgets" "b"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "b"."conversation_id")))
  WHERE (("b"."id" = "expenses"."budget_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "expenses: payer can delete" ON "public"."expenses" FOR DELETE USING (("auth"."uid"() = "paid_by"));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships: participant can delete" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "requester_id") OR ("auth"."uid"() = "recipient_id")));



CREATE POLICY "friendships: participant can select" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "requester_id") OR ("auth"."uid"() = "recipient_id")));



ALTER TABLE "public"."message_envelopes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_envelopes: recipient or sender can select" ON "public"."message_envelopes" FOR SELECT USING ((("auth"."uid"() = "recipient_user_id") OR (EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_envelopes"."message_id") AND ("m"."sender_id" = "auth"."uid"()))))));



CREATE POLICY "message_envelopes: sender can delete" ON "public"."message_envelopes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_envelopes"."message_id") AND ("m"."sender_id" = "auth"."uid"())))));



CREATE POLICY "message_envelopes: sender can insert" ON "public"."message_envelopes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."messages" "m"
  WHERE (("m"."id" = "message_envelopes"."message_id") AND ("m"."sender_id" = "auth"."uid"())))));



ALTER TABLE "public"."message_reactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reactions: member can insert" ON "public"."message_reactions" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_reactions"."message_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "message_reactions: member can select" ON "public"."message_reactions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_reactions"."message_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "message_reactions: self can delete" ON "public"."message_reactions" FOR DELETE USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."message_reads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_reads: insert own" ON "public"."message_reads" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "message_reads: select in conversation" ON "public"."message_reads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_reads"."message_id") AND ("cm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."message_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages: member can insert" ON "public"."messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND "public"."can_send_in_conversation"("auth"."uid"(), "conversation_id")));



CREATE POLICY "messages: member can select" ON "public"."messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "messages"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "messages: sender can update" ON "public"."messages" FOR UPDATE USING (("auth"."uid"() = "sender_id"));



ALTER TABLE "public"."notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notes: admin can delete any" ON "public"."notes" FOR DELETE USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "notes"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "notes: admin can select any" ON "public"."notes" FOR SELECT USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "notes"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "notes: admin can update any" ON "public"."notes" FOR UPDATE USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "notes"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "notes: owner can update" ON "public"."notes" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "notes: owner only" ON "public"."notes" USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."pinned_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pinned_messages: members can pin" ON "public"."pinned_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "pinned_by") AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "pinned_messages"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "pinned_messages: members can unpin" ON "public"."pinned_messages" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "pinned_messages"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "pinned_messages: members can view" ON "public"."pinned_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "pinned_messages"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."polls" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."prekeys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_subscriptions: manage own" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_tokens: manage own" ON "public"."push_tokens" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."reminders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reminders: admin can delete any" ON "public"."reminders" FOR DELETE USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "reminders"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "reminders: admin can select any" ON "public"."reminders" FOR SELECT USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "reminders"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "reminders: admin can update any" ON "public"."reminders" FOR UPDATE USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "reminders"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "reminders: members can create" ON "public"."reminders" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "reminders"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()))))));



CREATE POLICY "reminders: members can delete" ON "public"."reminders" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "reminders"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "reminders: members can update" ON "public"."reminders" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "reminders"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "reminders: members can view" ON "public"."reminders" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "reminders"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "rsvp: member select" ON "public"."event_rsvp" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."events" "e"
     JOIN "public"."conversation_members" "cm" ON (("cm"."conversation_id" = "e"."conversation_id")))
  WHERE (("e"."id" = "event_rsvp"."event_id") AND ("cm"."user_id" = "auth"."uid"())))));



CREATE POLICY "rsvp: owner insert" ON "public"."event_rsvp" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "rsvp: owner update" ON "public"."event_rsvp" FOR UPDATE USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."stickers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stickers: owner only" ON "public"."stickers" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks: admin can delete any" ON "public"."tasks" FOR DELETE USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "tasks"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "tasks: admin can update any" ON "public"."tasks" FOR UPDATE USING ((("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "tasks"."conversation_id") AND ("cm"."user_id" = "auth"."uid"()) AND ("cm"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "tasks: auth can create" ON "public"."tasks" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "created_by"));



CREATE POLICY "tasks: creator can delete" ON "public"."tasks" FOR DELETE USING (("auth"."uid"() = "created_by"));



CREATE POLICY "tasks: creator or assignee can update" ON "public"."tasks" FOR UPDATE USING ((("auth"."uid"() = "created_by") OR ("auth"."uid"() = "assigned_to")));



CREATE POLICY "tasks: visible to conversation members, creator, assignee" ON "public"."tasks" FOR SELECT USING ((("created_by" = "auth"."uid"()) OR ("assigned_to" = "auth"."uid"()) OR (("conversation_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."conversation_members" "cm"
  WHERE (("cm"."conversation_id" = "tasks"."conversation_id") AND ("cm"."user_id" = "auth"."uid"())))))));



ALTER TABLE "public"."user_blocks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_blocks: blocker can delete" ON "public"."user_blocks" FOR DELETE USING (("auth"."uid"() = "blocker_id"));



CREATE POLICY "user_blocks: blocker can insert" ON "public"."user_blocks" FOR INSERT WITH CHECK (("auth"."uid"() = "blocker_id"));



CREATE POLICY "user_blocks: blocker can select" ON "public"."user_blocks" FOR SELECT USING (("auth"."uid"() = "blocker_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversation_members";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."devices";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."friendships";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reactions";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."message_reads";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pinned_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";














































































































































































GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_group_member"("p_conversation_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."are_friends"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."are_friends"("p_a" "uuid", "p_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."are_friends"("p_a" "uuid", "p_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."block_user"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_user"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_send_in_conversation"("p_user" "uuid", "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_send_in_conversation"("p_user" "uuid", "p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_send_in_conversation"("p_user" "uuid", "p_conversation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."consume_prekey"("p_user_id" "uuid", "p_device_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."consume_prekey"("p_user_id" "uuid", "p_device_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_prekey"("p_user_id" "uuid", "p_device_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_group_conversation"("p_name" "text", "p_member_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_group_conversation"("p_name" "text", "p_member_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_group_conversation"("p_name" "text", "p_member_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_conversation_if_empty"() TO "anon";
GRANT ALL ON FUNCTION "public"."delete_conversation_if_empty"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_conversation_if_empty"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_due_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_due_reminders"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enqueue_push"("p_body" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enqueue_push"("p_body" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_or_create_direct_conversation"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_or_create_direct_conversation"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_or_create_direct_conversation"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_budget_summary"("p_budget_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_budget_summary"("p_budget_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_budget_summary"("p_budget_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_friend_suggestions"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_friend_suggestions"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_friend_suggestions"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_relationships"("p_user_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_relationships"("p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_relationships"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_conversation_ids"("uid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_conversation_ids"("uid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_conversation_ids"("uid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role_in_conversation"("uid" "uuid", "conv_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role_in_conversation"("uid" "uuid", "conv_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role_in_conversation"("uid" "uuid", "conv_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_blocked_between"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_blocked_between"("p_a" "uuid", "p_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_blocked_between"("p_a" "uuid", "p_b" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mutual_friend_count"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mutual_friend_count"("p_a" "uuid", "p_b" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mutual_friend_count"("p_a" "uuid", "p_b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_event_confirmed"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_event_confirmed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_event_confirmed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_friendship"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_friendship"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_friendship"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_new_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."notify_task_assigned"() TO "anon";
GRANT ALL ON FUNCTION "public"."notify_task_assigned"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."notify_task_assigned"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_config"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_config"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_message_context"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_message_context"("p_message_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_simple_notification"("p_kind" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_simple_notification"("p_kind" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_targets_for_message"("p_message_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_targets_for_message"("p_message_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_token_record_failure"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_token_record_failure"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."push_tokens_claim_token"() TO "anon";
GRANT ALL ON FUNCTION "public"."push_tokens_claim_token"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_tokens_claim_token"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_device"("p_device_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_device"("p_device_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_device"("p_device_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sanitize_message_mentions"() TO "anon";
GRANT ALL ON FUNCTION "public"."sanitize_message_mentions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sanitize_message_mentions"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_users"("p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_users"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_users"("p_query" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_friend_request"("p_recipient_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_recipient_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_friend_request"("p_recipient_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



REVOKE ALL ON FUNCTION "public"."send_message_with_envelopes"("p_conversation_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb", "p_type" "text", "p_reply_to_id" "uuid", "p_thread_id" "uuid", "p_media_url" "text", "p_media_mime" "text", "p_mentioned_user_ids" "uuid"[], "p_mentions_everyone" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."send_message_with_envelopes"("p_conversation_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb", "p_type" "text", "p_reply_to_id" "uuid", "p_thread_id" "uuid", "p_media_url" "text", "p_media_mime" "text", "p_mentioned_user_ids" "uuid"[], "p_mentions_everyone" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_message_with_envelopes"("p_conversation_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb", "p_type" "text", "p_reply_to_id" "uuid", "p_thread_id" "uuid", "p_media_url" "text", "p_media_mime" "text", "p_mentioned_user_ids" "uuid"[], "p_mentions_everyone" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_direct_request_state"("p_a" "uuid", "p_b" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_direct_request_state"("p_a" "uuid", "p_b" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_conversation_last_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_conversation_last_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_conversation_last_message"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";
























GRANT ALL ON TABLE "public"."ai_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."album_media" TO "anon";
GRANT ALL ON TABLE "public"."album_media" TO "authenticated";
GRANT ALL ON TABLE "public"."album_media" TO "service_role";



GRANT ALL ON TABLE "public"."albums" TO "anon";
GRANT ALL ON TABLE "public"."albums" TO "authenticated";
GRANT ALL ON TABLE "public"."albums" TO "service_role";



GRANT ALL ON TABLE "public"."budgets" TO "anon";
GRANT ALL ON TABLE "public"."budgets" TO "authenticated";
GRANT ALL ON TABLE "public"."budgets" TO "service_role";



GRANT ALL ON TABLE "public"."conversation_members" TO "anon";
GRANT ALL ON TABLE "public"."conversation_members" TO "authenticated";
GRANT ALL ON TABLE "public"."conversation_members" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."devices" TO "anon";
GRANT ALL ON TABLE "public"."devices" TO "authenticated";
GRANT ALL ON TABLE "public"."devices" TO "service_role";



GRANT ALL ON TABLE "public"."event_availability" TO "anon";
GRANT ALL ON TABLE "public"."event_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."event_availability" TO "service_role";



GRANT ALL ON TABLE "public"."event_rsvp" TO "anon";
GRANT ALL ON TABLE "public"."event_rsvp" TO "authenticated";
GRANT ALL ON TABLE "public"."event_rsvp" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."message_envelopes" TO "anon";
GRANT ALL ON TABLE "public"."message_envelopes" TO "authenticated";
GRANT ALL ON TABLE "public"."message_envelopes" TO "service_role";



GRANT ALL ON TABLE "public"."message_reactions" TO "anon";
GRANT ALL ON TABLE "public"."message_reactions" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reactions" TO "service_role";



GRANT ALL ON TABLE "public"."message_reads" TO "anon";
GRANT ALL ON TABLE "public"."message_reads" TO "authenticated";
GRANT ALL ON TABLE "public"."message_reads" TO "service_role";



GRANT ALL ON TABLE "public"."message_receipts" TO "anon";
GRANT ALL ON TABLE "public"."message_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."message_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."notes" TO "anon";
GRANT ALL ON TABLE "public"."notes" TO "authenticated";
GRANT ALL ON TABLE "public"."notes" TO "service_role";



GRANT ALL ON TABLE "public"."pinned_messages" TO "anon";
GRANT ALL ON TABLE "public"."pinned_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."pinned_messages" TO "service_role";



GRANT ALL ON TABLE "public"."polls" TO "anon";
GRANT ALL ON TABLE "public"."polls" TO "authenticated";
GRANT ALL ON TABLE "public"."polls" TO "service_role";



GRANT ALL ON TABLE "public"."prekeys" TO "anon";
GRANT ALL ON TABLE "public"."prekeys" TO "authenticated";
GRANT ALL ON TABLE "public"."prekeys" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."reminders" TO "anon";
GRANT ALL ON TABLE "public"."reminders" TO "authenticated";
GRANT ALL ON TABLE "public"."reminders" TO "service_role";



GRANT ALL ON TABLE "public"."stickers" TO "anon";
GRANT ALL ON TABLE "public"."stickers" TO "authenticated";
GRANT ALL ON TABLE "public"."stickers" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."user_blocks" TO "authenticated";
GRANT ALL ON TABLE "public"."user_blocks" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































