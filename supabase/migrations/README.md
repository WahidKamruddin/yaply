# Migrations

⚠️ **Do not run `supabase db push` until the remote history is reconciled.** See below.

## What these files are

- **`00000_baseline.sql`** — a `supabase db dump` of the live database, taken 2026-09-22.
  This *is* the schema. It is the starting point for any local stack.
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

They are kept for their commentary, which explains *why* objects exist in a way a schema
dump cannot. **Do not apply them.**

## The `db push` hazard

`supabase migration list` shows the remote history is a completely different set
(`00001_create_profiles`, `00002_create_devices`, … `20260921172207_mentions`). Local
`00000` has no remote counterpart, so `supabase db push` would try to **apply the
baseline to production** — running `CREATE TABLE` / `CREATE TYPE` / `CREATE POLICY`
against a database that already has all of it.

To make push safe, mark the baseline as already applied remotely without running it:

```bash
supabase migration repair --status applied 00000
```

The auth/storage migration is timestamped rather than numbered for the same reason: a
local `00001` would collide with the remote's unrelated `00001_create_profiles`, and the
CLI would treat it as already applied and never push it.

CI is unaffected: `.github/workflows/e2e.yml` only ever runs `supabase db reset` against
a throwaway local stack, never `push`.
