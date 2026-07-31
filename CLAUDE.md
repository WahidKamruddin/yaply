# yaply — Codebase Reference

## Working Mode & Workflow Rules

### Platform Context

When the user says **"native"** (or "ios", or "mobile") — work exclusively inside `yaply-native/`. That directory is the React Native/Expo app (TypeScript) and is its own git repo connected to its own GitHub. It is the active client for iOS (and, later, Android) — build/iOS-specific work happens here now. Do not reference or modify files in the web root.

When the user says **"web"** — work exclusively inside the yaply root folder (this repo). Ignore `yaply-native/` and `yaply-ios/` entirely.

`yaply-ios/` (Swift/SwiftUI) is **deprecated** — superseded by `yaply-native/` (see Sister Projects below for why). Do not add new work there. It's kept around only as a historical reference for its encryption-contract/DB-schema notes until it's formally archived. If the user says "ios" and means the old Swift app specifically, confirm before touching it.

All three (web, yaply-native, legacy yaply-ios) are independent repos: separate git histories, separate GitHub remotes, separate issue trackers. Any reported bug or feature request must be filed against the correct repo — never mix them.

**GitHub Remotes:**
- Web: https://github.com/WahidKamruddin/yaply
- Native (iOS/Android): https://github.com/WahidKamruddin/yaply-native
- iOS (legacy, deprecated): https://github.com/WahidKamruddin/yaply-ios

### GitHub Issues

When the user describes a problem or request, determine which platform(s) it affects and push the issue to that repo's GitHub only. Categorize by label (bug, enhancement, etc.) and use the repo's existing label conventions. Never create a web issue for an iOS-only concern, or vice versa.

### Committing & Pushing

When the user says **"both apps are good"**:
1. Stage all changed files in each repo separately (`git add` the relevant files in `yaply-native/` and in the web root). `yaply-ios/` is deprecated and no longer part of this workflow unless the user explicitly asks to touch it.
2. Propose a commit message following the repo's existing style — conventional commits format: `feat(): …`, `fix(): …`, `refactor(): …`, etc. Generate a message, then ask the user what to change before committing.
3. **Never include "Co-authored-by: Claude" or any AI attribution in commit messages.**
4. After the user approves the message, commit and push to `main`. Create a branch only if the user asks; by default push straight to `main` since this is a solo project.

### Feature Completion Reminder

After every feature is finished and the user confirms it's good, ask: "Want to commit and push?" Then follow the steps above.

---

## What This Is

yaply is a web-based E2E encrypted messaging application. It is a Progressive Web App (PWA-capable) built with React and backed entirely by Supabase. It lives as the web platform in a monorepo alongside `yaply-native` (React Native/Expo, TypeScript — the active iOS and future Android client) and the deprecated `yaply-ios` (Swift/SwiftUI, kept only as a historical reference). All platforms share one Supabase project.

---

## Tech Stack

### Frontend Framework: TanStack Start + React 19

TanStack Start = a Vite-based full-stack meta-framework (like Next/Remix, TanStack ecosystem). Chosen for route-level type safety (TanStack Router), first-class TanStack Query SSR/hydration, Vite speed, and future flexibility (can add SSR/server functions later without migrating). Currently runs as a client-side SPA on Netlify; SSR features are not relied on (Supabase handles all data).

### Routing: TanStack Router (file-based)

Routes live in `src/routes/`. The router auto-generates `routeTree.gen.ts` from the file structure — never edit that file manually. There are only three routes:

| File | Path | Purpose |
|------|------|---------|
| `__root.tsx` | (layout wrapper) | HTML shell, loads auth state |
| `index.tsx` | `/` | Public marketing landing page (see **Landing Page** below) — not an auth redirect |
| `auth.tsx` | `/auth` | Sign in / sign up |
| `chat.tsx` | `/chat` | Main app: conversation list + chat |

### State Management: Jotai + TanStack Query

Two separate state layers are used intentionally:

**TanStack Query** (`@tanstack/react-query`) manages **server state** — Supabase data needing caching, pagination, background refetch (conversation list, message pages).

**Jotai** manages **UI state** — ephemeral client state not belonging in a query cache (active conversation id, reply target). Chosen over Redux/Zustand for zero-boilerplate atoms shared across components (e.g. `activeConversationIdAtom` set by the list, read by `ChatView`) without prop drilling.

### Styling: Tailwind CSS v4 + Radix UI

**Tailwind CSS v4** is used via the Vite plugin (`@tailwindcss/vite`). Version 4 is a major rewrite — configuration is done in CSS (`@theme`) rather than `tailwind.config.js`. The project uses a custom blue-slate color palette (`#1a2744`, `#5b8def`, `#dce7f8`, `#edf1fa`) defined inline via class values.

**Radix UI** provides headless, accessible primitives: Avatar, Dialog, Dropdown Menu, Scroll Area, Tabs, Tooltip. These are unstyled components that handle keyboard navigation, focus trapping, and ARIA roles. Tailwind classes are applied on top. This was chosen over shadcn/ui (which wraps Radix) to keep direct control over the markup.

**Lucide React** provides icons.

### Backend: Supabase

Supabase serves as the entire backend. No custom server is needed. It provides:

- **PostgreSQL** — primary database with Row-Level Security (RLS) policies
- **Auth** — email/password auth with session management
- **Realtime** — WebSocket-based Postgres change subscriptions
- **Storage** — S3-compatible file storage for media, avatars, stickers

**Why Supabase (over Firebase / custom API):** Postgres's relational model fits the conversation/member/message schema (FKs, JOINs) better than Firestore's document model; RLS enforces authorization at the DB level, so the client talks directly to Supabase with no middleware layer to maintain.

### Encryption: Web Crypto API (envelope encryption, wire format v2)

Messages are encrypted end-to-end with **per-message envelope encryption**. The primitives live in `packages/crypto/src/`; the protocol glue lives in `src/features/chat/hooks/useEncryption.ts`. This replaced the original pairwise-ECDH scheme in migration `00029_multi_device_envelopes.sql` (all pre-v2 messages, conversations, and device rows were wiped by explicit decision — there is no legacy data to support; any stray `iv`-set/`enc_v`-NULL row renders as `decryptFailed`).

**Why v2 exists (the single-slot bug):** the old scheme stored ONE identity key per user (`devices.device_id` hard-coded to 1) and every login upserted the local browser's key into that slot. Any second browser/device/cleared-storage overwrote the published key, permanently orphaning all messages sealed under the previous key — including the user's own sent history. Messages also recorded nothing about which key they were sealed to.

**Algorithm:**
- **Message cipher:** AES-GCM, random 256-bit *message key* (mk) per message, 12-byte random nonce
- **Key wrap:** one ephemeral P-256 keypair per message; per recipient device, `KEK = ECDH(eph_priv, device_pub)` and `AES-GCM(KEK, raw mk)` with its own 12-byte nonce

**How a send works:**
1. On login, each install registers its own `devices` row: a P-256 identity keypair + a random 31-bit `device_id`, both stored locally (IndexedDB). The upsert conflicts only on `(user_id, device_id)` — an install can only ever touch its own row, never another install's.
2. To send, the client fetches **every active device of every conversation member** (including all of the sender's own devices — mandatory, or the sender's other installs can't read the message), generates mk, encrypts the plaintext once, and wraps mk for each device.
3. The message row gets `content`, `iv`, `enc_v = 2`; one `message_envelopes` row per recipient device records `(recipient_user_id, recipient_fp, eph_pub, key_iv, wrapped_key)`. Both are inserted atomically by the `send_message_with_envelopes` RPC (security definer), which **rejects an empty envelope set**.
4. To decrypt, a device looks up the envelope whose `recipient_fp` equals its own key fingerprint (JWK `x.y`), unwraps mk with its identity private key + the envelope's ephemeral public key, and decrypts the content. **No envelope for my fingerprint on an `enc_v = 2` message is a legitimate, permanent state** — the message was sealed before this device existed — and renders as an explicit "couldn't decrypt" (`DecryptedMessage.decryptFailed`), never raw ciphertext or `atob()` garbage.

**Wire format v2 (critical for cross-platform compatibility):**
```
messages.content       = base64( ciphertext + GCM tag[16] )   — AES-GCM(mk, plaintext)
messages.iv            = base64( nonce[12] )
messages.enc_v         = 2   (NULL = unencrypted phase-1; iv must then also be NULL)
envelope.eph_pub       = JSON-stringified JWK of the per-message ephemeral P-256 public key
envelope.key_iv        = base64( nonce[12] ) for the key wrap
envelope.wrapped_key   = base64( AES-GCM(KEK, raw 32-byte mk) + GCM tag[16] )
envelope.recipient_fp  = JWK x + '.' + y of the recipient device's identity key
```
**Key derivation:** the KEK is the raw 32-byte ECDH shared secret (x-coordinate of the shared point) used directly as an AES-256-GCM key — **no HKDF**. iOS/Android must mirror this exactly (CryptoKit: `P256.KeyAgreement`, raw shared secret bytes as the AES key).

**Invariants (each one guards a real regression):**
- `enc_v = 2` ⟺ envelopes exist ⟺ `iv` non-NULL. The phase-1 fallback is always written as `enc_v = NULL` **and** `iv = NULL` — never `enc_v = 2` without envelopes (the RPC enforces this server-side).
- Decrypt branches on `enc_v` **first**, then `iv = NULL` (phase-1), and anything else is `decryptFailed`. Applied identically at all three decrypt sites: `ChatView`'s effect, `ThreadView.loadReplies`, and the sidebar previews in `api/conversations.ts`.
- The sender's own devices are always in the recipient set (`encryptForMembers` unions the sender's id and adds the local device key even if the DB read races device registration).
- Media/sticker/gif/system messages never enter v2 — they send `content: '', iv: null` and stay `enc_v = NULL`.
- Sender-side fan-out bound: only devices with `last_active_at` within 90 days receive envelopes.

**Groups ARE E2E encrypted (since v2):** the envelope scheme keys groups and DMs identically — one mk wrapped for every member device. There is no group/DM split anywhere in the crypto path anymore.

**Fallback (phase-1):** if **any** member has zero registered devices (brand-new account that never logged in), the client sends plain base64 (`enc_v = NULL`, `iv = NULL`) so that member isn't handed permanently undecryptable ciphertext. **Always `TextEncoder`/`TextDecoder` for phase-1 — never `btoa()`/`atob()` on raw text** (`btoa()` breaks on non-Latin-1). Decode via `decodePhase1` in `useEncryption.ts`.

**Message editing (contract only — no edit UI exists):** an edit of a v2 message is a **re-seal**: generate a fresh mk, new `content`/`iv`, and replace ALL envelope rows in one transaction (a future `edit_message_with_envelopes` RPC). Never reuse the old mk. Side effect: edits become readable by devices added after the original send.

**Device registration must be single-flight (critical):** `useEncryption` is mounted by more than one component (`ChatView` and `ThreadView`), so `registerDevice` can run concurrently for the same user. Without a guard, two calls on a fresh install each generate a *different* keypair and race to publish — leaving the locally stored private key out of sync with the published public key, which breaks every message sealed to the losing key. `registrationInFlight: Map<userId, Promise>` makes concurrent calls share one registration. Both `encryptForMembers` and `decryptV2ForUser` **await** that promise, so a message sent or read immediately after login is never silently downgraded to unencrypted phase-1 (or reported as a false decrypt failure) merely because registration hadn't finished. iOS must apply the same single-flight rule.

**Key storage:** IndexedDB via `idb`, DB `yaply-keys` **version 3** (v3 dropped the pairwise `derived` store and legacy unscoped keypair entries). Store `identity` holds, **scoped per user**: `pub:<userId>` / `priv:<userId>` (identity JWKs) and `deviceId:<userId>` (this install's `devices.device_id`).

**In-memory cache must be keyed by userId, not a single mutable slot (critical):** `useEncryption.ts` keeps an in-JS-memory cache on top of IndexedDB (`identityPairMemCache`) so repeated encrypts/decrypts don't hit IndexedDB every time. An earlier version stored this as one mutable variable plus a "clear everything when a different userId shows up" check (`cacheOwner`) — this had a real race: sign out and back into a *different* account fast enough in the same tab, and a straggling async call still in flight for the old account (e.g. the sidebar's preview decryption, which runs independently of `ChatView`) could resolve *after* the new account's session had already reset the cache, and overwrite it with the old account's keypair while the tracker still said it belonged to the new user. Every decrypt for the new account then silently used the wrong private key — **every message failed**, specifically when testing multiple accounts by signing in/out in one browser tab (the common way to test multi-user flows solo). Fixed by making `identityPairMemCache` a `Map<userId, pair>`. `devicesMemCache` (60s TTL) is intentionally global/unscoped by requester since a user's public device list is the same no matter who is asking. iOS must not replicate the single-slot-plus-owner-check pattern for any per-user in-memory cache.

**Why Web Crypto and not a JS crypto library (e.g. TweetNaCl, forge):** built into every browser (no bundle cost), runs in a secure context; keys *could* be non-extractable (current impl exports to JWK for IndexedDB — a trade-off).

**What we build vs. what's provided:** the crypto *algorithms* are the browser's Web Crypto (`crypto.subtle`) — not hand-rolled. Supabase does *zero* crypto; it only stores ciphertext + public keys and never sees a private key. The *protocol* tying primitives together (key gen/storage, public-key exchange via `devices`, wire format, envelope scheme, rotation handling) is custom yaply code — this middle layer is where the risk lives (the historical single-slot bug was a protocol flaw, not an algorithm flaw). A future hardening path is adopting a vetted protocol lib (libsignal) instead of the custom ECDH+AES scheme.

### Security Model — Known Gaps & Limitations

E2E here means **text message content is encrypted between a user's active devices** — not "everything is private from everyone." Do not overstate it. Known gaps (treat as documented limitations, not bugs):

- **Explicitly out of scope (future work):** reading pre-device history on a *new* device (needs key backup/escrow — cryptographically impossible otherwise); server-side pruning of stale device rows; recovering already-orphaned legacy messages (permanent `decryptFailed`); message-editing implementation (no UI; contract only).
- **No key verification (MITM):** the server distributes public keys and there is no safety-number/fingerprint verification UI, so an *active* or compromised server could substitute keys. Protects against a *passive* server, not an active one.
- **No forward secrecy / no ratchet:** a device's identity key never rotates; the per-message ephemeral key wraps to a *static* recipient key, so compromise of a device's private key exposes all past **and** future messages sent to it. No Double-Ratchet-style evolution.
- **Metadata is unprotected:** who talks to whom, timing, frequency, reply chains, conversation membership, and message sizes are all plaintext in the DB.
- **Private keys stored extractable** in IndexedDB (JWK) → exfiltratable via XSS or malicious code. Non-extractable keys would harden this.
- **Media is NOT encrypted:** images, files, and stickers live at public Storage URLs. Encryption covers text content only.
- **No device management / revocation:** users can't list, name, or revoke devices or "log out everywhere"; a lost/stolen device keeps receiving envelopes, and the `devices` table only grows.
- **Group membership changes unhandled:** new members can't read pre-join history; removed members aren't cryptographically cut off (no group re-keying).
- **Push previews / reactions leak:** notification content routes through a push provider outside E2E; reactions are stored in plaintext.
- **Search:** no server-side search over ciphertext; client-side search only covers already-decrypted, loaded messages.
- **Fan-out scaling:** envelope rows = messages × recipients × devices, bounded only by the 90-day `last_active_at` filter; large groups are heavy on writes/storage.
- **Cross-platform interop window:** until yaply-native implements the v2 envelope format, mixed web/native conversations can't read each other's v2 messages. (Legacy yaply-ios never completed this and is deprecated.)
- **Browser-E2E trust:** the app *ships the JavaScript that does the crypto*, so whoever controls delivery could exfiltrate keys/plaintext via a malicious update. This is an *active* attack (detectable via open-source/audits) and can't retroactively recover messages sealed to a key that was never captured — but it means "the server can't read it" is not the same as "the operator physically cannot read it."

### Packages (Monorepo)

The project is a pnpm workspace monorepo with two internal packages:

| Package | Path | Contents |
|---------|------|---------|
| `@yaply/crypto` | `packages/crypto/` | `generateKeyPair`, `deriveSharedKey`, `publicKeyFingerprint`, `generateMessageKey`, `encryptWithEnvelopes(plaintext, recipients)`, `unwrapAndDecrypt(myPriv, envelope, content, iv)`, `encryptMessage`, `decryptMessage`, `storeIdentityKeyPair(userId, …)`, `loadIdentityKeyPair(userId)`, `storeLocalDeviceId(userId, id)`, `loadLocalDeviceId(userId)`, `clearAllKeys` |
| `@yaply/shared` | `packages/shared/` | TypeScript type definitions, constants, validators |

**Why a monorepo:** The iOS and Android apps will need to understand the same data shapes. `packages/shared/types.ts` is the canonical type reference. The `packages/crypto` package documents the encryption contract that all platforms must implement (even though iOS and Android use different crypto libraries, the same wire format and key derivation logic applies).

### Build & Deploy

- **Vite 8** builds the app. The output goes to `dist/client/` (configured in `netlify.toml`).
- **Netlify** hosts the app as a prerendered SPA, not a live SSR function. Build command is `vite build && node scripts/generate-html.mjs`: the first step builds client + SSR bundles, the second (`scripts/generate-html.mjs`) imports the SSR server, renders route `/` once at build time, and writes the result over `dist/client/index.html`. A catch-all redirect (`/* → /index.html`, status 200) then serves that one prerendered shell for every route — the Netlify SSR function is built but not invoked at runtime.
- Because of this, **route loaders must not depend on request-time data to render correctly on `/`** — `auth.tsx`/`chat.tsx` guard their `beforeLoad` with `if (typeof document === 'undefined') return` so auth/session state is never baked into the static shell; it loads client-side after hydration.
- **`@netlify/vite-plugin-tanstack-start`** handles Netlify-specific SSR adapter concerns (used for the build step above, not for live routing).

### Landing Page (`src/routes/index.tsx`)

The `/` route is a single-file marketing page (all markup, styles, and interactive demos live in `index.tsx`; CSS is a template-literal string injected via `<style>`, scoped under a `.lp` root class rather than Tailwind). It is intentionally decoupled from the app's design system (`#1a2744` blue-slate) — it uses its own dark-navy/mint palette with a full light-mode override (`.lp-light`), toggled via a nav button and persisted to `localStorage['yaply-theme']`.

**Font:** Bricolage Grotesque, self-hosted at `public/fonts/BricolageGrotesque-var-latin.woff2` (variable weight 200–800) and loaded via `@font-face` inside the page's own `<style>` block. Self-hosted deliberately — the CSP's `font-src 'self'` has no exception for a Google Fonts CDN, so a `<link>` to fonts.googleapis.com would be blocked.

**Progressive enhancement pattern (repeated across every interactive element on the page):** every component server-renders its *final, most legible* state (e.g. `EncryptWire` renders already-sealed ciphertext; `EventFlowDemo` renders the confirmed event; `KothaDemo` renders the completed summary). A `useEffect` then "rewinds" to the initial state and replays the animation once the element scrolls into view via `IntersectionObserver`. This means the prerendered HTML (see Build & Deploy above) is never empty or mid-animation for no-JS/crawler contexts — `npm run build && node scripts/generate-html.mjs` must be re-run and `dist/client/index.html` spot-checked after any change here. All animations respect `prefers-reduced-motion` (checked via `prefersReducedMotion()`) by skipping straight to the final state.

**Interactive demo components** (all decorative — they mimic app behavior with local component state, not real Supabase calls):
- `ChatMock` — scripted hero conversation that types itself out.
- `EventFlowDemo` — a clickable when2meet-style availability grid that flips into a confirmed event card; mirrors the real `/plan` → `/event` flow.
- `GroupCarousel` — autoplaying carousel (Tasks/Notes/Albums/Budgets) with dot nav and arrows, pauses on hover.
- `KothaDemo` — "chaotic thread → AI summary" demo for the **Kotha AI** feature section. **Kotha does not exist in the app** — per the Feature Map, `ai_conversations` is schema-only with no UI or API integration. This section (and the "built-in translation" card in the small-details bento) are forward-looking marketing copy, not documented features. Do not treat landing-page copy as a source of truth for what's implemented — check the Feature Map below instead.
- `EncryptWire` — "what you see" → "what we see" demo: real plaintext scrambles into ciphertext on scroll-into-view. Characters lock to their final glyph as the sweep passes (only a small trailing "wavefront" flickers) so the sweep's end state always exactly equals the sealed display — this was a deliberate fix for a visual "pop" when the old version snapped from random scramble to the real ciphertext in one frame.
- `DecryptText` — reusable glyph-scramble-to-plaintext text reveal, scoped to the "Sealed, end to end." header only (previous versions used it more broadly; kept restrained per product feedback).

---

## Database Schema

The migrations in `supabase/migrations/` match the live database. All runtime code uses the column names below.

**`conversations` table:**
```
id          uuid
type        text   ('direct' | 'group' | 'ai')
name        text
avatar_url  text
created_by  uuid
created_at  timestamptz
updated_at  timestamptz
```

**`conversation_members` table:**
```
conversation_id  uuid
user_id          uuid
role             text   ('owner' | 'admin' | 'member')
joined_at        timestamptz
last_read_at     timestamptz
muted_until      timestamptz   — null = not muted; future date = muted until then; 8640000000000 ms epoch = muted forever
```

**`messages` table:**
```
id              uuid
conversation_id uuid
sender_id       uuid
type            text   ('text' | 'image' | 'gif' | 'sticker' | 'file' | 'system' | 'ai')
content         text   — base64(AES-GCM ciphertext+tag) or plain base64 (phase-1)
iv              text   — base64(nonce[12]); NULL = phase-1 fallback
enc_v           smallint — 2 = envelope-encrypted (see message_envelopes); NULL = phase-1
media_url       text
media_mime      text
reply_to_id     uuid
thread_id       uuid
edited_at       timestamptz
deleted_at      timestamptz
created_at      timestamptz
```

**Encryption wire format (v2):** `content = base64(AES-GCM(message key, plaintext) + tag[16])`, `iv = base64(nonce[12])`, `enc_v = 2`, with one `message_envelopes` row per recipient device. `enc_v = NULL` means phase-1 (and `iv` must also be NULL — content is plain base64). See the Encryption section above; these three columns move together and the invariant is enforced by the `send_message_with_envelopes` RPC.

**`message_envelopes` table:** `id, message_id (FK → messages ON DELETE CASCADE), recipient_user_id (FK → profiles), recipient_fp (text — JWK x.y of the recipient device key), eph_pub (text — JSON-stringified JWK of the per-message ephemeral public key), key_iv (text — base64 nonce[12]), wrapped_key (text — base64(AES-GCM(KEK, raw 32-byte message key) + tag)), created_at`. UNIQUE(message_id, recipient_user_id, recipient_fp); index (recipient_user_id, message_id). RLS: SELECT for the recipient or the message's sender; INSERT/DELETE for the message's sender only. Migration `00029_multi_device_envelopes.sql`.

**`profiles` table:** id, username, display_name, avatar_url, bio, public_key, is_online, last_seen_at, created_at, updated_at.

**`devices` table:** user_id, device_id (int), identity_key (text — JSON-stringified JWK public key), key_fingerprint (text — JWK `x.y`, matches `message_envelopes.recipient_fp`), signed_prekey, device_name, push_subscription, last_active_at, created_at. UNIQUE(user_id, device_id); index (user_id, key_fingerprint). **One row per install** — each browser/device generates its own random `device_id` (stored locally as `deviceId:<userId>` in IndexedDB) and upserts only that row. Never hard-code `device_id = 1`: that was the single-slot bug where every login overwrote the one published key and orphaned history. RLS: owner can manage own rows; any authenticated user can read (needed to encrypt to a peer's devices). Codified in `00027_create_devices.sql`; `key_fingerprint` added in `00029_multi_device_envelopes.sql`.

**`notes` table:** `id, user_id, conversation_id, title, content, created_at, updated_at` — RLS: `user_id = auth.uid()` (owner only).

**`tasks` table:** `id, conversation_id, created_by, assigned_to, title, description, status ('todo'|'in_progress'|'done'), priority ('low'|'medium'|'high'), due_at, completed_at, created_at, updated_at` — RLS: conversation members can SELECT; creator/assignee can UPDATE; creator can DELETE.

**`reminders` table:** `id, user_id, conversation_id, message, remind_at, status ('pending'|'sent'|'dismissed'), created_at` — RLS after migration 00022: all conversation members can view/update/delete. Creator identified by `user_id`.

**`events` table:** `id, conversation_id, created_by, name, description, location, status ('planning'|'confirmed'), starts_at, ends_at, created_at, updated_at` — migration 00020. `planning` = when2meet mode (no date locked), `confirmed` = date set.

**`event_availability` table:** `id, event_id, user_id, slots (jsonb — array of ISO datetime strings for 30-min slots), updated_at` — UNIQUE(event_id, user_id).

**`event_rsvp` table:** `id, event_id, user_id, response ('going'|'maybe'|'not_going'|'pending'), updated_at` — UNIQUE(event_id, user_id).

**`albums` table:** `id, conversation_id, name, created_by, created_at, event_id (nullable FK → events)` — RLS: conversation members can SELECT/INSERT; creator can DELETE.

**`album_media` table:** `id, album_id, message_id, media_url, media_mime, created_at` — RLS: conversation members.

**`budgets` table:** `id, conversation_id, name, total_amount, currency, created_by, created_at, event_id (nullable FK → events)` — RLS: conversation members can SELECT/INSERT; creator can DELETE.

**`expenses` table:** `id, budget_id, paid_by, description, amount, category (expense_category enum), split_between (uuid[]), created_at`.

**FK cascade note:** `albums.event_id`, `notes.event_id`, `budgets.event_id` → `ON DELETE SET NULL` (migration 00021). Deleting an event detaches linked albums/notes/budgets rather than cascading their deletion.

**Key RPCs:**
- `find_or_create_direct_conversation(target_user_id uuid)` — finds or creates a direct DM, inserts both members correctly. Security definer. Always use this instead of manual inserts for direct chats.
- `send_message_with_envelopes(p_conversation_id, p_content, p_iv, p_envelopes jsonb, p_type, p_reply_to_id, p_thread_id, p_media_url, p_media_mime)` — inserts an `enc_v = 2` message **and** all its `message_envelopes` rows in one transaction. Security definer; validates conversation membership and **rejects an empty envelope array or a NULL iv**, so a v2 message can never exist without envelopes. Always use this for encrypted sends; the plain `messages` insert is only for phase-1/system/media rows.

**Postgres trigger — orphan conversation cleanup:**
`trg_delete_empty_conversation` (AFTER DELETE on `conversation_members`, FOR EACH ROW) — calls `delete_conversation_if_empty()` which deletes the `conversations` row if no members remain. This means deleting your membership from a DM where the other user already left cascades to deleting all messages and the conversation itself. Migration: `delete_conversation_if_empty`.

---

## Feature Map

### Implemented

| Feature | Files |
|---------|-------|
| Auth (sign in / sign up) | `src/routes/auth.tsx`, `src/lib/auth.ts` |
| Conversation list | `src/features/chat/components/ConversationList.tsx`, `src/features/chat/hooks/useConversations.ts` |
| Direct messaging | `src/features/chat/components/ChatView.tsx` |
| Group conversations | `createGroupConversation` in `src/features/chat/api/conversations.ts` |
| Message pagination (50/page) | `src/features/chat/hooks/useMessages.ts` |
| Real-time messages | `src/features/chat/hooks/useRealtimeMessages.ts` |
| E2E encryption (envelope, v2 — DMs **and** groups) | `packages/crypto/`, `src/features/chat/hooks/useEncryption.ts`, `message_envelopes` + `send_message_with_envelopes` (migration 00029) |
| Multi-device support | One `devices` row per install (random `device_id`); every message sealed to all member devices incl. the sender's own |
| Soft delete messages (own messages only) | `deleteMessage` in `src/features/chat/api/messages.ts`; deletes update `deleted_at` column |
| Delete message confirmation modal | Radix UI Dialog in `MessageBubble.tsx` |
| Reply quotation with deleted-message handling | Reply block in `MessageBubble.tsx` |
| Message reply | `replyToMessageIdAtom`, `ReplyStrip` in `MessageInput` |
| Mute conversations | `muteConversation` in conversations API; `muted_until` column in `conversation_members` |
| Mark conversations read | `markConversationRead` in conversations API |
| Conversation swipe-to-delete | `ConversationItem.tsx` |
| Delete conversation (self-only) | `deleteConversation` in `src/features/chat/api/conversations.ts` |
| User presence (is_online) | Migration `00014_add_presence_to_profiles.sql` |
| User search | `searchUsers` in conversations API |
| Slash command system (local feedback only) | `src/features/commands/` — outputs shown only to the typing user via `commandFeedbackAtom`, never written to DB |
| /remind, /mute, /thread, /create | `src/features/commands/handlers/` |
| **Threads** (tier 3) | `thread_id` filter in `fetchMessages`; `/thread` returns local usage text |
| **Stickers** (tier 3) | `stickers` table (user_id, storage_path, name); `src/features/media/` components |
| **Tasks** (tier 3) | `src/features/chat/hooks/useTasks.ts`, `src/features/chat/components/panel/TaskList.tsx`, ConversationPanel Tasks tab |
| **Notes** (tier 3) | `src/features/chat/hooks/useNotes.ts`, `src/features/chat/components/panel/NoteList.tsx`, ConversationPanel Notes tab |
| **Reminders** (tier 3) | `src/features/chat/hooks/useReminders.ts`, `src/features/chat/components/panel/ReminderList.tsx`, 60s polling + Web Notifications API. **Shared** — all conversation members can view/dismiss (migration 00022). |
| **Albums** (tier 3) | `src/features/chat/hooks/useAlbums.ts`, `src/features/chat/components/panel/AlbumList.tsx`, gallery grid with add-photos (chat images + device upload) + event link editor |
| **Budgets + Splitwise** (tier 3) | `src/features/chat/hooks/useBudgets.ts`, `src/features/chat/hooks/useSplitwise.ts`, `src/lib/splitwise.ts`, `src/features/chat/components/panel/BudgetList.tsx` — delete with confirmation |
| ConversationPanel right panel | `src/features/chat/components/ConversationPanel.tsx` — tabs: Tasks, Notes, Reminders, **Events**, Albums, Budgets |
| **Events** (tier 4) | DB: `events`, `event_availability`, `event_rsvp` tables (migrations 00020–00021). `src/features/chat/hooks/useEvents.ts`, `src/features/chat/components/panel/EventList.tsx`, `src/features/chat/components/event/EventModal.tsx`, `src/features/chat/components/event/AvailabilityCalendar.tsx`. `/plan` → status='planning', `/event` → status='confirmed'. |
| **System message hyperlinks** (tier 4) | `MessageBubble.tsx` — system messages show inline "Open {Tab} →" button that opens sidebar at the relevant tab. 1-week auto-destruct: `deleted_at = now + 7d` at insert. Expired system messages are hidden silently. |
| **Command cache invalidation** (tier 4) | `CommandProvider.tsx` threads `QueryClient` through `CommandContext`; `CommandModal.tsx` invalidates the right query key after insert; `/remind` invalidates `['reminders']`. Fixes sidebar not updating after slash command creation. |
| **Delete confirmations** (tier 4) | All list views (TaskList, NoteList, AlbumList, BudgetList, EventList, ReminderList) use Radix Dialog for destructive confirmations before deletes. |

### Not yet integrated

| Feature | Status |
|---------|--------|
| Media upload (images, files) | Service and drag-drop zone built; picker shown as "Phase 3" placeholder in ChatView |
| GIF picker (Giphy) | `src/features/media/` — UI exists, wired as phase 3 placeholder |
| AI conversations | Schema migrated; no UI or AI API integration |

---

## Cross-Platform Implementation Reference (iOS / Android)

Web is the reference implementation; all platforms share one Supabase project and
the same schema (see **Database Schema** and **Feature Map** above). Per-feature
native how-to lives in `yaply-native/CLAUDE.md` — do not duplicate it here.
(`yaply-ios/CLAUDE.md` still documents the same contracts accurately since the
backend hasn't changed, but is otherwise deprecated — see Sister Projects.) Only
cross-platform **contracts** that must match byte-for-byte or behave identically
belong in this repo:

- **Encryption wire format v2 & key handling** — see the Encryption section
  above. Every platform must reproduce it exactly:
  - Content: `AES-GCM(message key, plaintext)` → `content = base64(ct+tag[16])`,
    `iv = base64(nonce[12])`, `enc_v = 2`. Fresh random 256-bit message key per
    message.
  - Key wrap: one ephemeral P-256 keypair per message; per recipient device
    `KEK = ECDH(eph_priv, device_pub)` with the **raw 32-byte shared secret used
    directly as the AES-256 key — no HKDF**; `wrapped_key = base64(AES-GCM(KEK,
    raw message key) + tag)`, `key_iv = base64(nonce[12])`. iOS: CryptoKit
    `P256.KeyAgreement`, take the shared secret's raw bytes (do **not** use
    `hkdfDerivedSymmetricKey`).
  - Recipients: **every active device (90-day `last_active_at`) of every member,
    including all of the sender's own devices.** Omitting the sender's devices
    breaks reading your own sent messages — the original bug.
  - Device registration: one `devices` row per install with its own random
    `device_id` persisted locally; upsert only that row. Never write
    `device_id = 1` unconditionally.
  - Decrypt: pick the envelope whose `recipient_fp` equals this device's
    fingerprint (JWK `x.y`); no envelope ⇒ permanent, honest "couldn't decrypt".
    Branch on `enc_v` **before** looking at `iv`.
  - Editing (when built): re-seal with a new message key and replace all
    envelopes in one transaction; never reuse the old key.
  - Per-user in-memory caches only — never a single-slot-plus-owner-check.
- **Events availability slot keys** — each slot key is the **UTC ISO string** of
  the slot start (e.g. `"2025-06-10T14:00:00.000Z"`), 8am–10pm local in 30-min
  increments, 7 days × 28 rows. iOS must build local-time `Date`s then format with
  `ISO8601DateFormatter`, `timeZone = UTC`, `.withFractionalSeconds`. Any drift
  breaks heatmap overlap across platforms.
- **Reminders** — creator is `user_id`; RLS lets all conversation members
  view/dismiss (migration 00022). Web polls every 60s; iOS should instead schedule
  a local `UNNotificationRequest` and mark `status='sent'` on delivery. Same time
  parsing (`30m`, `2h`, `tomorrow`=next 9am).
- **Command feedback is local-only (critical)** — command output (help, errors,
  "Reminder set") is **never** written to the DB; shown only to the typing user as
  an ephemeral banner. The **only** thing written to a conversation is a
  `type='system'` message on task/note/album/budget creation (`iv = NULL`,
  `content = base64(TextEncoder(text))`), rendered as centered grey text (no
  bubble, no sender). System messages auto-destruct after 1 week
  (`deleted_at = now + 7d`); expired ones are hidden silently.
- **Stickers / media are not encrypted** — `media_url` is a public Storage URL;
  render directly, no decryption.
- **Splitwise** — REST API `https://secure.splitwise.com/api/v3.0/`, OAuth2 client
  credentials; when adding an expense the payer's `paid_share` maps by index in the
  members array (not always index 0); `simplified_debts` may be null.

## Project Structure

```
yaply/
├── src/
│   ├── app/
│   │   └── Providers.tsx          # React Query client setup
│   ├── features/
│   │   ├── chat/                  # Core messaging feature
│   │   │   ├── api/               # Supabase calls (conversations.ts, messages.ts)
│   │   │   ├── components/        # UI (ChatView, MessageBubble, MessageInput, etc.)
│   │   │   ├── hooks/             # Data hooks (useConversations, useMessages, useEncryption, etc.)
│   │   │   ├── store/             # Jotai atoms (chat.atoms.ts)
│   │   │   └── types.ts           # Runtime types (source of truth for DB schema)
│   │   ├── commands/              # Slash command system
│   │   │   ├── commandParser.ts
│   │   │   ├── commandRegistry.ts
│   │   │   ├── components/        # CommandModal, CommandProvider
│   │   │   └── handlers/          # remindHandler, muteHandler, threadHandler, createHandler
│   │   └── media/                 # GIF, image, sticker media
│   │       ├── api/               # gifs.ts (Giphy), upload.ts (Supabase Storage)
│   │       ├── components/        # GifPicker, StickerPicker, MediaPicker, DragDropZone
│   │       └── hooks/             # useGifSearch, useStickers, useUpload
│   ├── lib/
│   │   ├── auth.ts                # getUser(), onAuthStateChange(), DEV_BYPASS flag
│   │   ├── supabase.ts            # Supabase client singleton
│   │   └── database.types.ts      # Auto-generated Supabase types (may be stale — see discrepancy note)
│   └── routes/                    # File-based routes (TanStack Router)
│       └── index.tsx              # `/` — self-contained marketing landing page (see Landing Page above)
├── public/
│   └── fonts/                     # Self-hosted webfonts (CSP font-src is 'self' — no external font CDNs)
├── packages/
│   ├── crypto/src/
│   │   ├── encryption.ts          # generateKeyPair, deriveSharedKey, encryptMessage, decryptMessage
│   │   └── keyStore.ts            # IndexedDB read/write for identity and derived keys
│   └── shared/src/
│       ├── types.ts               # Canonical type definitions (aspirational schema)
│       └── constants/             # Command definitions, app constants
└── supabase/
    └── migrations/                # 14 SQL files — NOT all applied to live DB (see discrepancy note above)
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=         # From Supabase project settings
VITE_SUPABASE_ANON_KEY=    # From Supabase project settings (public/anon key)
VITE_GIPHY_API_KEY=        # From Giphy Developer Dashboard
VITE_DEV_BYPASS_AUTH=false # Set to true to skip Supabase auth entirely during local dev
```

When `VITE_DEV_BYPASS_AUTH=true`, all auth calls return a hardcoded dev user (`dev-user-00000000-0000-0000-0000-000000000000`). This is useful when testing UI changes without needing a live Supabase instance.

---

## Development

```bash
npm install       # Install dependencies (uses npm workspaces)
npm run dev       # Start dev server at http://localhost:3000
npm run build     # Production build → dist/client/
npm run test      # Vitest unit tests
npm run lint      # ESLint
npm run format    # Prettier + ESLint fix
```

The dev server is also accessible via Netlify Dev at port 8888 (configured in `netlify.toml`).

---

## Key Architectural Patterns

**Feature-folder structure:** Each product domain (chat, commands, media) is self-contained under `src/features/`. A feature owns its API layer, components, hooks, and local types. Cross-feature concerns live in `src/lib/`.

**No custom API server:** The client talks directly to Supabase. Authorization is enforced by RLS policies in Postgres. This eliminates backend infrastructure but means all auth-sensitive logic must be expressed as Postgres policies.

**Separation of raw DB types from display types:** `DbMessage` holds the raw encrypted fields from the database. `DecryptedMessage` holds the post-decryption display representation. The UI only touches `DecryptedMessage` — it never renders raw ciphertext.

**Real-time via Supabase channels:** Instead of parsing the Realtime payload (which contains the raw encrypted DB row), `useRealtimeMessages` uses the channel event as a trigger to invalidate and re-fetch via TanStack Query. This avoids having to maintain duplicate decryption logic in the realtime handler.

**Monorepo for cross-platform parity:** `packages/crypto` documents the encryption contract. `packages/shared/types.ts` documents the intended canonical schema. Even though the iOS/Android apps will use different crypto libraries (CryptoKit, BouncyCastle), they must reproduce the same wire format. These packages are the specification, not just the web implementation.

---

## Sister Projects (this monorepo)

| Directory | Platform | GitHub | Status |
|-----------|----------|--------|--------|
| `.` (root) | Web (React + Supabase) | https://github.com/WahidKamruddin/yaply | Active |
| `yaply-native/` | iOS + (future) Android — React Native/Expo, TypeScript | https://github.com/WahidKamruddin/yaply-native | Active — the client for iOS and Android going forward. Own GitHub repo, gitignored here. |
| `yaply-ios/` | iOS (Swift + SwiftUI) | https://github.com/WahidKamruddin/yaply-ios | **Deprecated** — superseded by `yaply-native/`. SwiftUI's native look didn't allow the design customizability wanted (a Meta Messenger–esque UI); React Native was chosen instead so one codebase can eventually cover iOS and Android. No new feature work happens here. Kept as a historical reference for its encryption wire-format v2 and DB schema notes until formally archived — do not treat its SwiftUI implementation patterns or its `Known Issues to Fix` list as applicable to `yaply-native/`. |

The web repo's `.gitignore` excludes `yaply-native/`, `yaply-ios/`, and `yaply-android/` since each has (or will have) its own GitHub repository. The monorepo root exists so Claude Code can cross-reference all platforms in the same working directory.

`yaply-native/CLAUDE.md` contains its architecture notes and design direction. `yaply-ios/CLAUDE.md` still documents the encryption/schema contract accurately (the backend hasn't changed) but its UI architecture is no longer the target to build against. Any change to the encryption wire format or database schema **must be reflected in all active platform CLAUDE.md files** (web and yaply-native) and implemented consistently across both.
