-- Everything outside the `public` schema.
--
-- 00000_baseline.sql is a `supabase db dump`, which covers `public` only. Three
-- kinds of object therefore fall through it, and all three are load-bearing:
--
--   1. The trigger on auth.users that creates a profile row. Without it a new
--      signup lands in auth.users with no matching profiles row, the app renders
--      a permanent loading state, and every lookup by username returns nothing.
--   2. The storage buckets and their policies.
--   3. (Not needed here — the realtime publication and messages' replica
--      identity survive the dump; verified against production.)
--
-- Keep this file in step with production by hand; a future dump will not.

-- ─── Profile creation on signup ───────────────────────────────────────────────
-- handle_new_user() itself lives in the baseline (it is a public function); only
-- the trigger binding is missing, because auth.users is not in the public schema.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── Storage buckets ──────────────────────────────────────────────────────────
-- Both are public: avatars and chat media are served as plain public URLs.
-- Media being unencrypted is a documented limitation, not an oversight.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('media', 'media', true)
on conflict (id) do update set public = excluded.public;

-- ─── Storage policies ─────────────────────────────────────────────────────────
-- Transcribed from production. The duplicated read/update policies below exist
-- there too (avatars_public_read vs "media: public read" etc.); they are
-- reproduced as-is rather than tidied, so local matches live exactly.

drop policy if exists "avatars_public_read"   on storage.objects;
drop policy if exists "avatars_auth_insert"   on storage.objects;
drop policy if exists "avatars_owner_update"  on storage.objects;
drop policy if exists "avatars: owner update" on storage.objects;
drop policy if exists "avatars_owner_delete"  on storage.objects;

create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_auth_insert" on storage.objects
  for insert with check (bucket_id = 'avatars');

create policy "avatars_owner_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "avatars: owner update" on storage.objects
  for update using (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text
  ) with check (
    bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text
  );

create policy "avatars_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'avatars' and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "media_public_read"  on storage.objects;
drop policy if exists "media: public read" on storage.objects;
drop policy if exists "media_auth_insert"  on storage.objects;
drop policy if exists "media_owner_delete" on storage.objects;

create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

create policy "media: public read" on storage.objects
  for select using (bucket_id = 'media');

create policy "media_auth_insert" on storage.objects
  for insert with check (bucket_id = 'media');

create policy "media_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'media' and (auth.uid())::text = (storage.foldername(name))[1]
  );
