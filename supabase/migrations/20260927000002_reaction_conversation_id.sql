-- message_reactions.conversation_id, so realtime subscriptions can be filtered
-- to the open conversation.
--
-- Without it, every client with a chat open subscribed to ALL reaction inserts
-- in the database: Realtime evaluated the table's SELECT policy (an EXISTS over
-- messages + conversation_members) for every subscriber on every reaction, in the
-- same queue that delivers messages. With it, clients filter INSERT on
-- conversation_id=eq.<open conversation>.
--
-- DELETE events can't be filtered by Realtime (they carry only the primary key
-- and skip RLS), so clients still receive those unfiltered and ignore ones for
-- messages they haven't loaded.
--
-- The column is always set by the trigger from the parent message — any value a
-- client sends is overwritten — so it can't be used to misfile a reaction, and
-- clients never need to send it.

alter table public.message_reactions
  add column conversation_id uuid references public.conversations(id) on delete cascade;

update public.message_reactions r
set conversation_id = m.conversation_id
from public.messages m
where m.id = r.message_id
  and r.conversation_id is null;

create or replace function public.set_reaction_conversation_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.conversation_id := (select m.conversation_id from public.messages m where m.id = new.message_id);
  return new;
end;
$$;

alter function public.set_reaction_conversation_id() owner to postgres;
revoke all on function public.set_reaction_conversation_id() from public;

create trigger trg_message_reactions_conversation_id
  before insert on public.message_reactions
  for each row execute function public.set_reaction_conversation_id();

-- NOT NULL after the backfill; BEFORE triggers run ahead of the check, so inserts
-- that omit the column still pass.
alter table public.message_reactions
  alter column conversation_id set not null;
