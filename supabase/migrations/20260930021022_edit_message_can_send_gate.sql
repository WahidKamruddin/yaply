-- Deploys the can_send_in_conversation gate that de49413 added to
-- 20260928035810_edit_message_with_envelopes.sql after that migration had
-- already been applied, so production was still running the ungated version:
-- a member of a declined or blocked conversation could still edit their old
-- messages there. Body is otherwise identical to that migration.

CREATE OR REPLACE FUNCTION "public"."edit_message_with_envelopes"(
  "p_message_id" "uuid",
  "p_content" "text",
  "p_iv" "text",
  "p_envelopes" "jsonb"
) RETURNS "public"."messages"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_msg public.messages;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into v_msg from public.messages where id = p_message_id;
  if not found then
    raise exception 'message not found';
  end if;
  if v_msg.sender_id is distinct from auth.uid() then
    raise exception 'not the sender of this message';
  end if;
  if v_msg.type <> 'text' then
    raise exception 'only text messages can be edited';
  end if;
  if v_msg.deleted_at is not null then
    raise exception 'cannot edit a deleted message';
  end if;
  if not public.can_send_in_conversation(auth.uid(), v_msg.conversation_id) then
    raise exception 'cannot send in this conversation';
  end if;

  if p_envelopes is null
     or jsonb_typeof(p_envelopes) <> 'array'
     or jsonb_array_length(p_envelopes) = 0 then
    raise exception 'a v2 message requires at least one envelope';
  end if;

  if p_iv is null or p_iv = '' then
    raise exception 'a v2 message requires an iv';
  end if;

  delete from public.message_envelopes where message_id = p_message_id;

  update public.messages
  set content = p_content, iv = p_iv, enc_v = 2, edited_at = now()
  where id = p_message_id
  returning * into v_msg;

  insert into public.message_envelopes
    (message_id, recipient_user_id, recipient_fp, eph_pub, key_iv, wrapped_key)
  select
    v_msg.id,
    (e->>'recipient_user_id')::uuid,
    e->>'recipient_fp',
    e->>'eph_pub',
    e->>'key_iv',
    e->>'wrapped_key'
  from jsonb_array_elements(p_envelopes) as e;

  return v_msg;
end;
$$;

ALTER FUNCTION "public"."edit_message_with_envelopes"("p_message_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."edit_message_with_envelopes"("p_message_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_message_with_envelopes"("p_message_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_message_with_envelopes"("p_message_id" "uuid", "p_content" "text", "p_iv" "text", "p_envelopes" "jsonb") TO "service_role";
