-- yaply#6: "messages: sender can update" had only a USING clause, so a sender
-- could UPDATE *any* column of their own message — most seriously
-- conversation_id, teleporting it into a conversation they cannot send in
-- (bypassing can_send_in_conversation, block and message-request gating) or
-- forging type = 'system'.
--
-- Direct client UPDATEs legitimately touch only:
--   * deleted_at            soft delete
--   * content, edited_at    phase-1 (enc_v NULL) link-preview attach / edit
-- Everything else is immutable to a direct write. Encrypted edits go through
-- edit_message_with_envelopes (SECURITY DEFINER, runs as its owner, so
-- current_user is not 'authenticated' there and the guard steps aside).

create or replace function public.messages_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id              is distinct from old.id
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id       is distinct from old.sender_id
     or new.type            is distinct from old.type
     or new.iv              is distinct from old.iv
     or new.enc_v           is distinct from old.enc_v
     or new.media_url       is distinct from old.media_url
     or new.media_mime      is distinct from old.media_mime
     or new.reply_to_id     is distinct from old.reply_to_id
     or new.thread_id       is distinct from old.thread_id
     or new.created_at      is distinct from old.created_at then
    raise exception 'messages: only content, edited_at and deleted_at may be updated'
      using errcode = '42501';
  end if;

  -- An enc_v = 2 body is only ever replaced together with its envelopes, in
  -- one transaction, by the edit RPC. A bare content write would orphan them.
  if new.content is distinct from old.content and old.enc_v is not null then
    raise exception 'messages: encrypted content can only be edited via edit_message_with_envelopes'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_guard_update on public.messages;
create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.messages_guard_update();

-- Belt and braces: the row must still belong to the caller after the update.
drop policy if exists "messages: sender can update" on public.messages;
create policy "messages: sender can update"
  on public.messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);
