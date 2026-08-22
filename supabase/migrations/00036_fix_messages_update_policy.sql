-- Fix #6: "messages: sender can update" had USING only. Postgres reuses the
-- USING expression as the implicit WITH CHECK, which constrains sender_id on
-- the new row but nothing else -- so a sender could move their own message
-- into ANY conversation_id (including ones they are not a member of), flip
-- type to 'system', and rewrite content/iv. Recipients of the target
-- conversation would then see the injected message via the member-select
-- policy.
--
-- The app's only client-side message update is the soft delete
-- (src/features/chat/api/messages.ts:222 sets deleted_at); nothing edits
-- content or moves rows between conversations, so both changes below are
-- non-breaking for current clients.

alter table public.messages enable row level security;

drop policy if exists "messages: sender can update" on public.messages;
create policy "messages: sender can update"
  on public.messages
  for update
  to authenticated
  using (auth.uid() = sender_id)
  with check (
    auth.uid() = sender_id
    -- the (possibly changed) conversation must still be one of the sender's
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Belt-and-suspenders: the columns that define where a message lives and who
-- wrote it are immutable at the trigger layer, because RLS predicates cannot
-- express per-column rules. Soft-delete (deleted_at) and future legitimate
-- edits (content/iv/edited_at/media_*) keep working; teleporting a row to
-- another conversation or reassigning authorship is rejected in the database,
-- not just in the policy.
create or replace function public.guard_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.type is distinct from old.type
     or new.created_at is distinct from old.created_at then
    raise exception 'messages: conversation_id, sender_id, type and created_at are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_guard_update on public.messages;
create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.guard_message_update();
