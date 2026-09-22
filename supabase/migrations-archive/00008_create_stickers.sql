-- ─── Sticker packs & stickers ────────────────────────────────────────────────

create table if not exists public.sticker_packs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  is_public  boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.stickers (
  id         uuid primary key default gen_random_uuid(),
  pack_id    uuid not null references public.sticker_packs (id) on delete cascade,
  name       text not null,
  url        text not null,
  created_at timestamptz not null default now()
);

create index stickers_pack_idx on public.stickers (pack_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.sticker_packs enable row level security;
alter table public.stickers enable row level security;

create policy "sticker_packs: public packs visible to all"
  on public.sticker_packs for select
  using (is_public = true or created_by = auth.uid());

create policy "sticker_packs: auth can create"
  on public.sticker_packs for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "sticker_packs: owner can update"
  on public.sticker_packs for update
  using (auth.uid() = created_by);

create policy "sticker_packs: owner can delete"
  on public.sticker_packs for delete
  using (auth.uid() = created_by);

create policy "stickers: visible if pack visible"
  on public.stickers for select
  using (
    exists (
      select 1 from public.sticker_packs sp
      where sp.id = pack_id
        and (sp.is_public = true or sp.created_by = auth.uid())
    )
  );

create policy "stickers: owner of pack can insert"
  on public.stickers for insert
  with check (
    exists (
      select 1 from public.sticker_packs sp
      where sp.id = pack_id
        and sp.created_by = auth.uid()
    )
  );

create policy "stickers: owner of pack can delete"
  on public.stickers for delete
  using (
    exists (
      select 1 from public.sticker_packs sp
      where sp.id = pack_id
        and sp.created_by = auth.uid()
    )
  );
