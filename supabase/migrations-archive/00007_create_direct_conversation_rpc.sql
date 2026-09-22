-- ─── RPC: find_or_create_direct_conversation ─────────────────────────────────
-- Returns the conversation_id for an existing DM between the caller and
-- target_user_id, or creates a new one if none exists.

create or replace function public.find_or_create_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_conversation_id uuid;
begin
  -- Look for an existing direct conversation shared by both users
  select cm1.conversation_id into v_conversation_id
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id
   and cm2.user_id = target_user_id
  join public.conversations c
    on c.id = cm1.conversation_id
   and c.type = 'direct'
  where cm1.user_id = auth.uid()
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  -- Create the conversation
  insert into public.conversations (type, created_by)
  values ('direct', auth.uid())
  returning id into v_conversation_id;

  -- Add both members
  insert into public.conversation_members (conversation_id, user_id, role)
  values
    (v_conversation_id, auth.uid(),      'owner'),
    (v_conversation_id, target_user_id,  'member');

  return v_conversation_id;
end;
$$;
