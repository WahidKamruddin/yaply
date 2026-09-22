-- Realtime configuration for `messages`, moved into version control.
--
-- Both settings below were previously applied only through the Dashboard
-- (Database -> Replication), which is why realtime message delivery has broken
-- more than once: a dashboard toggle is invisible to code review, absent from a
-- fresh project, and silently lost on a restore. Nothing here changes behaviour
-- on a correctly-configured project — it just makes the configuration
-- reproducible and reviewable.

-- ─── Publication membership ───────────────────────────────────────────────────
-- Without this, postgres_changes on `messages` emits nothing at all: clients
-- subscribe successfully and then wait forever, which looks like a client bug.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;

-- ─── Replica identity ─────────────────────────────────────────────────────────
-- `messages` has RLS, and Realtime re-evaluates the SELECT policy per subscriber
-- against the row it decodes from the WAL. With the default replica identity an
-- UPDATE or DELETE only carries the primary key, so there is no conversation_id
-- to evaluate "is this subscriber a member" against and the event is dropped —
-- which is what breaks realtime propagation of the deleted_at soft delete.
--
-- INSERT is unaffected either way (Postgres always emits the full new tuple),
-- so this is not a fix for missing insert events.
--
-- Cost: every UPDATE and DELETE now writes the full old row to the WAL.
-- Acceptable here; revisit if message volume grows substantially.
alter table public.messages replica identity full;
