-- ─── Group Admin Permissions ─────────────────────────────────────────────────
-- Grants admin/owner roles additional powers in group conversations:
--   • Hard-delete entire conversation for everyone
--   • Remove/promote other members
--   • Delete or lock any task, note, reminder, album, budget, or event
--   • Edit time fields on any item
-- Also fixes FK cascades on tasks/notes/reminders so hard-deleting a conversation
-- cleans up all associated items.

-- ─── Fix FK cascades ─────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_conversation_id_fkey,
  ADD CONSTRAINT tasks_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS notes_conversation_id_fkey,
  ADD CONSTRAINT notes_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE public.reminders
  DROP CONSTRAINT IF EXISTS reminders_conversation_id_fkey,
  ADD CONSTRAINT reminders_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

-- ─── locked column ───────────────────────────────────────────────────────────

ALTER TABLE public.tasks     ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.notes     ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.reminders ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.albums    ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.budgets   ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.events    ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;

-- ─── conversations: admin/owner can delete ────────────────────────────────────

CREATE POLICY "conversations: owner/admin can delete"
  ON public.conversations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── conversation_members: admin can remove others ────────────────────────────

CREATE POLICY "conversation_members: admin can remove others"
  ON public.conversation_members FOR DELETE
  USING (
    auth.uid() != user_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── conversation_members: admin can update role ──────────────────────────────

CREATE POLICY "conversation_members: admin can update role"
  ON public.conversation_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── tasks: admin powers ──────────────────────────────────────────────────────

CREATE POLICY "tasks: admin can delete any"
  ON public.tasks FOR DELETE
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = tasks.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "tasks: admin can update any"
  ON public.tasks FOR UPDATE
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = tasks.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── notes: admin powers ──────────────────────────────────────────────────────
-- Notes are normally owner-only but admins can manage all notes in their conversation.

CREATE POLICY "notes: admin can select any"
  ON public.notes FOR SELECT
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = notes.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "notes: admin can update any"
  ON public.notes FOR UPDATE
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = notes.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "notes: admin can delete any"
  ON public.notes FOR DELETE
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = notes.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── reminders: admin powers ──────────────────────────────────────────────────

CREATE POLICY "reminders: admin can select any"
  ON public.reminders FOR SELECT
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = reminders.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "reminders: admin can update any"
  ON public.reminders FOR UPDATE
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = reminders.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "reminders: admin can delete any"
  ON public.reminders FOR DELETE
  USING (
    conversation_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = reminders.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── albums: admin powers ─────────────────────────────────────────────────────

CREATE POLICY "albums: admin can delete any"
  ON public.albums FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = albums.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "albums: admin can update any"
  ON public.albums FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = albums.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── budgets: admin powers ────────────────────────────────────────────────────

CREATE POLICY "budgets: admin can delete any"
  ON public.budgets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = budgets.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "budgets: admin can update any"
  ON public.budgets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = budgets.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

-- ─── events: admin powers ─────────────────────────────────────────────────────

CREATE POLICY "events: admin can delete any"
  ON public.events FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = events.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "events: admin can update any"
  ON public.events FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = events.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
  );
