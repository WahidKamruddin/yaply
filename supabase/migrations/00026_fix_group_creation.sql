-- ─── Fix Group Creation + RLS Policy Bugs ────────────────────────────────────
--
-- 1. Creates create_group_conversation() SECURITY DEFINER RPC so the creator
--    can be added to conversation_members atomically before any SELECT RLS check
--    runs against the new conversation row.
--
-- 2. Fixes three RLS policies from migration 00025 that had PostgreSQL column
--    scoping ambiguities — unqualified `id` / `conversation_id` inside a
--    self-joined subquery resolved to the subquery alias columns, not the outer
--    table columns, making the predicates always-true or always-false.

-- ─── create_group_conversation RPC ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_name text,
  p_member_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id uuid;
  v_creator_id uuid := auth.uid();
  v_member_id uuid;
BEGIN
  INSERT INTO conversations (type, name, created_by)
  VALUES ('group', p_name, v_creator_id)
  RETURNING id INTO v_conv_id;

  INSERT INTO conversation_members (conversation_id, user_id, role)
  VALUES (v_conv_id, v_creator_id, 'owner');

  FOREACH v_member_id IN ARRAY p_member_ids LOOP
    IF v_member_id <> v_creator_id THEN
      INSERT INTO conversation_members (conversation_id, user_id, role)
      VALUES (v_conv_id, v_member_id, 'member')
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[]) TO authenticated;

-- ─── Fix: conversations owner/admin can delete ────────────────────────────────
-- Bug: `cm.conversation_id = id` inside the subquery resolved `id` as cm.id
-- (conversation_members PK), not conversations.id. Now fully qualified.

DROP POLICY IF EXISTS "conversations: owner/admin can delete" ON public.conversations;
CREATE POLICY "conversations: owner/admin can delete"
  ON public.conversations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversations.id
        AND cm.user_id = auth.uid()
        AND cm.role = ANY (ARRAY['owner', 'admin'])
    )
  );

-- ─── Fix: conversation_members admin can remove others ────────────────────────
-- Bug: `cm.conversation_id = conversation_id` resolved both sides to the
-- subquery alias (always true). Now uses fully qualified outer table reference.

DROP POLICY IF EXISTS "conversation_members: admin can remove others" ON public.conversation_members;
CREATE POLICY "conversation_members: admin can remove others"
  ON public.conversation_members FOR DELETE
  USING (
    auth.uid() <> user_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role = ANY (ARRAY['owner', 'admin'])
    )
  );

-- ─── Fix: conversation_members admin can update role ─────────────────────────
-- Same scoping bug as above.

DROP POLICY IF EXISTS "conversation_members: admin can update role" ON public.conversation_members;
CREATE POLICY "conversation_members: admin can update role"
  ON public.conversation_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role = ANY (ARRAY['owner', 'admin'])
    )
  );
