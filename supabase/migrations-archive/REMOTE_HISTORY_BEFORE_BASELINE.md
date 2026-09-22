# Remote migration history as of 2026-09-22, before baselining

Recorded before `supabase migration repair --status reverted …` cleared these rows from
`supabase_migrations.schema_migrations` on the production project
(`qgbgrpsfvpglaryldbij`).

Only the bookkeeping rows were removed. No schema object and no data was touched — the
schema they describe is captured in `supabase/migrations/00000_baseline.sql`, which was
dumped from this database after the last of these had been applied.

Kept so the row set can be restored if anything ever needs to reference it.

```
00000|baseline
00001|create_profiles
00002|create_devices
00003|create_prekeys
00004|create_conversations
00005|create_messages
00006|create_ai_events_polls
00007|create_rls_policies
20260605092002|create_direct_conversation_rpc
20260605092207|fix_conversation_members_role_constraint
20260605093724|recreate_messages_table
20260605094446|fix_rls_recursion_and_devices
20260605095809|enable_realtime_messages
20260605103201|create_storage_buckets
20260605104729|fix_media_bucket_public_and_avatars_update_policy
20260605183856|add_message_reactions_and_profiles_to_realtime
20260605205652|add_message_reads
20260605205655|add_muted_until_to_conversation_members
20260605205658|add_push_subscriptions
20260606042717|delete_conversation_if_empty
20260606143101|replace_stickers_with_user_scoped
20260606143156|create_tasks
20260606143206|create_notes
20260606143215|create_reminders
20260606143228|create_albums
20260606143248|create_budgets
20260606154608|add_splitwise_group_id_to_budgets
20260606194232|evolve_events_schema
20260606194242|add_event_id_to_resources
20260607003005|reminders_shared_access
20260607003912|add_events_delete_update_policies
20260607210330|add_update_policies_for_event_linking
20260623233054|group_admin_permissions
20260624193100|fix_group_creation
20260721000746|fix_conversation_members_update_delete_recursion
20260803042332|add_username_set_flag
20260803042407|add_profile_birthdate
20260804045401|friends_system
20260804045549|friends_system_grant_hardening
20260818200633|pairing_channel_authorization
20260820191841|device_management
20260921172207|mentions
20260922000001|auth_and_storage
20260922155251|fix_messages_type_check_allow_voice
```

Note `20260922155251|fix_messages_type_check_allow_voice` — the production fix that added
`'voice'` to `messages_type_check`, applied 2026-09-22. The baseline dump was taken after
it, so the widened constraint is already in `00000_baseline.sql`.
