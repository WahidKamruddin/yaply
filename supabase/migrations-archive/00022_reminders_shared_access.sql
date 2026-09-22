-- ─── Reminders: shared conversation access ────────────────────────────────────
-- Reminders are now visible to all conversation members, not just the creator.

drop policy if exists "reminders: owner only" on public.reminders;

-- Conversation members can view all reminders in their conversations
create policy "reminders: members can view"
  on public.reminders for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = reminders.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Conversation members can create reminders for their conversations
create policy "reminders: members can create"
  on public.reminders for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = reminders.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Conversation members can update (dismiss/mark sent) any reminder in their conversations
create policy "reminders: members can update"
  on public.reminders for update
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = reminders.conversation_id
        and cm.user_id = auth.uid()
    )
  );

-- Conversation members can delete reminders in their conversations
create policy "reminders: members can delete"
  on public.reminders for delete
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = reminders.conversation_id
        and cm.user_id = auth.uid()
    )
  );
