-- Friend requests, task assignments and confirmed events.
--
-- Unlike message pushes these are plaintext end to end: a friend request has no
-- content, and tasks.title / events.name are stored unencrypted, so there is
-- nothing here the server could protect that Postgres is not already holding in
-- the clear. They therefore carry no envelope and no mutable-content flag —
-- the notification service extension never runs for them.

-- ─── Targets and text for the non-message kinds ───────────────────────────────
-- One RPC rather than one per kind so the edge function stays a thin loop, and
-- so the recipient-resolution rules live in one place. Returns nothing at all
-- when the referenced row has since been deleted.

create or replace function public.push_simple_notification(p_kind text, p_payload jsonb)
returns table (
  token           text,
  environment     text,
  recipient_id    uuid,
  device_id       integer,
  title           text,
  body            text,
  conversation_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
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

revoke all on function public.push_simple_notification(text, jsonb) from public, anon, authenticated;

-- ─── Friend requests ──────────────────────────────────────────────────────────

create or replace function public.notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

drop trigger if exists friendships_notify_push on public.friendships;
create trigger friendships_notify_push
  after insert or update of status on public.friendships
  for each row execute function public.notify_friendship();

-- ─── Task assignment ──────────────────────────────────────────────────────────

create or replace function public.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

drop trigger if exists tasks_notify_push on public.tasks;
create trigger tasks_notify_push
  after insert or update of assigned_to on public.tasks
  for each row execute function public.notify_task_assigned();

-- ─── Event confirmed ──────────────────────────────────────────────────────────

create or replace function public.notify_event_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

drop trigger if exists events_notify_push on public.events;
create trigger events_notify_push
  after update of status on public.events
  for each row execute function public.notify_event_confirmed();
