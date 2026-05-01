-- ─── Supabase Storage buckets ─────────────────────────────────────────────────
-- These SQL statements configure storage buckets and RLS policies.
-- They require the storage schema to be available (Supabase managed).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media',    'media',    false, 52428800,  array['image/jpeg','image/png','image/gif','image/webp','video/mp4','application/pdf']),
  ('stickers', 'stickers', true,  2097152,   array['image/jpeg','image/png','image/gif','image/webp']),
  ('avatars',  'avatars',  true,  5242880,   array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- ─── media bucket ─────────────────────────────────────────────────────────────
-- Authenticated users can upload to their own folder: media/{user_id}/*
create policy "media: auth upload to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "media: member can read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'media');

create policy "media: owner can delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── stickers bucket (public) ─────────────────────────────────────────────────
create policy "stickers: public read"
  on storage.objects for select
  using (bucket_id = 'stickers');

create policy "stickers: auth upload"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'stickers');

-- ─── avatars bucket (public) ──────────────────────────────────────────────────
create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: owner upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars: owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
