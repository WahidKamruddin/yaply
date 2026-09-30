-- Storage bucket for link-preview images (see CLAUDE.md "Link previews").
--
-- The `link-preview` edge function fetches a page's og:image server-side and
-- re-uploads it here, keyed by a hash of the *page* URL, so the client always
-- renders our own Storage URL rather than an arbitrary third-party domain.
-- That's deliberate: it needs zero CSP `img-src` changes (already allows
-- `https://*.supabase.co`) and follows the same "proxy, don't allowlist every
-- domain" precedent as avatars/media.
--
-- Public, like avatars/media — a preview thumbnail is not message content and
-- carries no more sensitivity than the media bucket already does.
--
-- Only the edge function (service-role client, bypasses RLS) writes here.
-- Deliberately no insert/update/delete policy for anon/authenticated: a
-- client-side write would let anyone stash arbitrary public files under this
-- bucket for free, same risk the avatars/media owner-scoped policies exist to
-- avoid — but this bucket has no "owner" folder convention to scope by, so the
-- simplest safe answer is no direct client write at all.

insert into storage.buckets (id, name, public)
values ('link-preview-images', 'link-preview-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "link_preview_images_public_read" on storage.objects;

create policy "link_preview_images_public_read" on storage.objects
  for select using (bucket_id = 'link-preview-images');
