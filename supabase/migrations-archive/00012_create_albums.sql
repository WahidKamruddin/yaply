-- ─── Albums & shared media ────────────────────────────────────────────────────

create table if not exists public.albums (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  name            text not null,
  created_by      uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index albums_conversation_idx on public.albums (conversation_id);

create table if not exists public.album_media (
  id          uuid primary key default gen_random_uuid(),
  album_id    uuid not null references public.albums (id) on delete cascade,
  message_id  uuid not null references public.messages (id) on delete cascade,
  media_url   text not null,
  media_mime  text not null,
  created_at  timestamptz not null default now()
);

create index album_media_album_idx on public.album_media (album_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.albums enable row level security;
alter table public.album_media enable row level security;

-- Conversation members can see albums
create policy "albums: conversation member can select"
  on public.albums for select
  using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = albums.conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "albums: member can create"
  on public.albums for insert
  with check (
    auth.uid() = created_by
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = conversation_id
        and cm.user_id = auth.uid()
    )
  );

create policy "albums: creator can delete"
  on public.albums for delete
  using (auth.uid() = created_by);

create policy "album_media: member can select"
  on public.album_media for select
  using (
    exists (
      select 1
      from public.albums a
      join public.conversation_members cm on cm.conversation_id = a.conversation_id
      where a.id = album_id
        and cm.user_id = auth.uid()
    )
  );

create policy "album_media: member can insert"
  on public.album_media for insert
  with check (
    exists (
      select 1
      from public.albums a
      join public.conversation_members cm on cm.conversation_id = a.conversation_id
      where a.id = album_id
        and cm.user_id = auth.uid()
    )
  );
