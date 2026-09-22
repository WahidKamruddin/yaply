-- ─── E2E encryption key exchange ──────────────────────────────────────────────
-- Stores per-conversation AES keys, each encrypted with the recipient's ECDH
-- public key.  The server only ever sees opaque ciphertext.

create table if not exists public.key_exchanges (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  recipient_id    uuid not null references public.profiles (id) on delete cascade,
  encrypted_key   text not null,  -- AES key encrypted with recipient's ECDH public key
  created_at      timestamptz not null default now(),
  primary key (conversation_id, sender_id, recipient_id)
);

create index key_exchanges_recipient_idx on public.key_exchanges (recipient_id);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.key_exchanges enable row level security;

-- Only the intended recipient (or sender) can read a key exchange record
create policy "key_exchanges: parties can select"
  on public.key_exchanges for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

create policy "key_exchanges: sender can insert"
  on public.key_exchanges for insert
  with check (auth.uid() = sender_id);

create policy "key_exchanges: sender can delete"
  on public.key_exchanges for delete
  using (auth.uid() = sender_id);
