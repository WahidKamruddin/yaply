-- ─── Fix: infinite recursion (42P17) on conversation_members UPDATE/DELETE ───
--
-- "conversation_members: admin can update role" and "conversation_members:
-- admin can remove others" each check admin/owner status with a raw
-- `EXISTS (SELECT 1 FROM conversation_members cm WHERE ...)` subquery against
-- the same table the policy is attached to. Unlike a call to a SECURITY
-- DEFINER helper (opaque to the planner, so not eligible for inlining), a
-- literal self-reference like this is expanded in place by the rewriter and
-- is detected as direct recursion — Postgres throws 42P17 for ANY UPDATE or
-- DELETE on this table, even a member updating their own last_read_at, since
-- Postgres must evaluate all applicable permissive policies for the command
-- (both this one and the unrelated "self can update"/"self can delete").
--
-- This is exactly the pattern "conversation_members: member can select" and
-- "conversation_members: member can insert" already avoid by calling the
-- SECURITY DEFINER helpers get_user_conversation_ids()/get_user_role_in_conversation()
-- instead of querying the table directly. Bringing these two policies in
-- line with that pattern removes the recursion.

DROP POLICY IF EXISTS "conversation_members: admin can update role" ON public.conversation_members;
CREATE POLICY "conversation_members: admin can update role"
  ON public.conversation_members FOR UPDATE
  USING (
    public.get_user_role_in_conversation(auth.uid(), conversation_id) = ANY (ARRAY['owner', 'admin'])
  );

DROP POLICY IF EXISTS "conversation_members: admin can remove others" ON public.conversation_members;
CREATE POLICY "conversation_members: admin can remove others"
  ON public.conversation_members FOR DELETE
  USING (
    auth.uid() <> user_id
    AND public.get_user_role_in_conversation(auth.uid(), conversation_id) = ANY (ARRAY['owner', 'admin'])
  );
