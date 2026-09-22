# Migrations

## What these files are

- **`00000_baseline.sql`** — a `supabase db dump` of the live database, taken 2026-09-22.
  This _is_ the schema. It is the starting point for any local stack.
- **`20260922000001_auth_and_storage.sql`** — the parts a public-schema dump cannot carry:
  the `on_auth_user_created` trigger on `auth.users` (without it, signups never get a
  `profiles` row and the app sits on a loading screen forever), plus the `avatars` and
  `media` storage buckets and their policies.

Everything after this point should be additive and normally named.

## Why the old files are in `../migrations-archive/`

The 43 files previously here were a **reconstruction, not the applied history**. They
were first executed on 2026-09-22 — against a local stack, never production — and they
do not build the live schema. Concretely, they:

- defined three enums production never had (`conversation_type`, `member_role`,
  `message_type`); production uses `text` with CHECK constraints
- created three tables production does not have (`ai_messages`, `key_exchanges`,
  `sticker_packs`)
- omitted three that it does (`polls`, `prekeys`, `message_receipts`)
- never created five live functions, including `delete_conversation_if_empty` — the
  orphan-cleanup trigger CLAUDE.md calls load-bearing, which appeared only in a comment
- `00026` compared an enum to `text[]`, and `00037` altered an enum that does not exist,
  which is why voice messages were rejected in production until it was fixed directly

They are kept for their commentary, which explains _why_ objects exist in a way a schema
dump cannot. **Do not apply them.**

## History, and why it is only two entries

The remote used to carry a completely different migration list
(`00001_create_profiles`, `00002_create_devices`, … `20260921172207_mentions`) —
the record of a schema built by hand, which the files in this directory never
matched. On 2026-09-22 those rows were cleared with
`supabase migration repair --status reverted …`, and `00000` plus
`20260922000001` were marked applied. Only bookkeeping rows changed; no schema
object and no data was touched.

`supabase/migrations-archive/REMOTE_HISTORY_BEFORE_BASELINE.md` records the old
list in full, in case anything ever needs to reference it.

`supabase db push` is clean as of that change — it reports "Remote database is up
to date" — and future migrations push normally.

CI never pushes: `.github/workflows/e2e.yml` only runs `supabase db reset` against
a throwaway local stack.
