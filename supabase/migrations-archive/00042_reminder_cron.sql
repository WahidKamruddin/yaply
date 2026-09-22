-- Server-side reminder delivery.
--
-- Until now a reminder only fired as a local UNNotificationRequest on the
-- device that typed /remind — reinstall the app or switch phones and it was
-- silently lost. Dispatching from the server means it reaches every device the
-- user has, and survives the client that created it.

create extension if not exists pg_cron with schema extensions;

-- sent_at is the audit trail; attempts separates "enqueued once, delivery
-- unknown" from "retried and failing" if a sweeper is ever needed.
alter table public.reminders add column if not exists sent_at  timestamptz;
alter table public.reminders add column if not exists attempts smallint not null default 0;

-- ─── Dispatch ─────────────────────────────────────────────────────────────────
-- Claim and enqueue in one transaction.
--
-- Idempotency does not come from a dedupe check at send time: status='pending'
-- is simultaneously the work queue and the lock. FOR UPDATE SKIP LOCKED means a
-- concurrent tick sees zero rows, and the flip to 'sent' commits with the
-- enqueue, so a later tick also sees zero rows. A reminder is therefore
-- enqueued at most once.
--
-- The residual failure mode is loss, not duplication — if pg_net's worker drops
-- the queued request the reminder is marked sent and never fires. That is the
-- right side to fail on: a reminder that fires twice is worse than one that
-- occasionally does not.
--
-- LIMIT 200 caps the blast radius if the job was paused and a backlog built up.

create or replace function public.dispatch_due_reminders()
returns integer
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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

revoke all on function public.dispatch_due_reminders() from public, anon, authenticated;

select cron.schedule(
  'dispatch-due-reminders',
  '* * * * *',
  $$select public.dispatch_due_reminders()$$
);

-- pg_net's response log grows unbounded before 0.8, where net.ttl took over.
-- Harmless if redundant; check with
--   select extversion from pg_extension where extname = 'pg_net';
select cron.schedule(
  'prune-net-responses',
  '*/15 * * * *',
  $$delete from net._http_response where created < now() - interval '1 hour'$$
);
