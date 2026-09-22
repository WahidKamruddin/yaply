-- Albums: any conversation member can update event_id (link/unlink)
CREATE POLICY "albums: member can update"
  ON public.albums FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = albums.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- Budgets: any conversation member can update event_id and splitwise_group_id
CREATE POLICY "budgets: member can update"
  ON public.budgets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = budgets.conversation_id
        AND cm.user_id = auth.uid()
    )
  );

-- Notes: owner can update (notes are private — user_id is the owner)
CREATE POLICY "notes: owner can update"
  ON public.notes FOR UPDATE
  USING (auth.uid() = user_id);
