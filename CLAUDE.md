# yaply — Codebase Reference

## Working Mode & Workflow Rules

### Platform Context

When the user says **"ios"**, **"swift"**, or **"native"/"mobile"** — work exclusively inside `yaply-ios/`. That directory is the Swift/SwiftUI app and is its own git repo connected to its own GitHub. It is the active client for iOS — build/iOS-specific work happens here now. Do not reference or modify files in the web root.

When the user says **"web"** — work exclusively inside the yaply root folder (this repo). Ignore `yaply-ios/` entirely.

**`yaply-native/` (React Native/Expo, TypeScript) no longer exists** — as of 2026-08-03 the user reverted course: it has been deleted and `yaply-ios/` (Swift/SwiftUI) is once again the active iOS client, not deprecated. SwiftUI's native look didn't allow the design customizability wanted, which is why React Native was tried, but that path was abandoned. If you see stale references to `yaply-native/` elsewhere in this file or in `yaply-ios/CLAUDE.md`, they describe the old (now-reversed) direction — treat `yaply-ios/` as the current, actively-developed iOS app.

Web and yaply-ios are independent repos: separate git histories, separate GitHub remotes, separate issue trackers. Any reported bug or feature request must be filed against the correct repo — never mix them.

**GitHub Remotes:**
- Web: https://github.com/WahidKamruddin/yaply
- iOS: https://github.com/WahidKamruddin/yaply-ios

### GitHub Issues

When the user describes a problem or request, determine which platform(s) it affects and push the issue to that repo's GitHub only. Categorize by label (bug, enhancement, etc.) and use the repo's existing label conventions. Never create a web issue for an iOS-only concern, or vice versa.

### Committing & Pushing

When the user says **"both apps are good"**:
1. Stage all changed files in each repo separately (`git add` the relevant files in `yaply-ios/` and in the web root).
2. Propose a commit message following the repo's existing style — conventional commits format: `feat(): …`, `fix(): …`, `refactor(): …`, etc. Generate a message, then ask the user what to change before committing.
3. **Never include "Co-authored-by: Claude" or any AI attribution in commit messages.**
4. After the user approves the message, commit and push to `main`. Create a branch only if the user asks; by default push straight to `main` since this is a solo project.

### Feature Completion Reminder

After every feature is finished and the user confirms it's good, ask: "Want to commit and push?" Then follow the steps above.

### UI Verification

Do not launch the dev server, open a browser, or otherwise check UI changes live — the user reviews all UI changes themselves. Verify with `tsc`/`lint` and code review only, unless the user explicitly asks for a live check.

---

## What This Is

yaply is a web-based E2E encrypted messaging application. It is a Progressive Web App (PWA-capable) built with React and backed entirely by Supabase. It lives as the web platform in a monorepo alongside `yaply-ios` (Swift/SwiftUI — the active iOS client). Both platforms share one Supabase project.

---

## Tech Stack

### Frontend Framework: TanStack Start + React 19

TanStack Start = a Vite-based full-stack meta-framework (like Next/Remix, TanStack ecosystem). Chosen for route-level type safety (TanStack Router), first-class TanStack Query SSR/hydration, Vite speed, and future flexibility (can add SSR/server functions later without migrating). Currently runs as a client-side SPA on Netlify; SSR features are not relied on (Supabase handles all data).

### Routing: TanStack Router (file-based)

Routes live in `src/routes/`. The router auto-generates `routeTree.gen.ts` from the file structure — never edit that file manually. There are only four routes:

| File | Path | Purpose |
|------|------|---------|
| `__root.tsx` | (layout wrapper) | HTML shell, loads auth state |
| `index.tsx` | `/` | Public marketing landing page (see **Landing Page** below) — not an auth redirect |
| `auth.tsx` | `/auth` | Sign in / sign up |
| `chat.tsx` | `/chat` | Main app: conversation list + chat |
| `settings.tsx` | `/settings` | Account/profile editing, billing, privacy policy, terms, help, report-a-problem (see Feature Map) |
| `link.tsx` | `/link` | Landing point for the pairing QR deep link (`/link#c=<code>`) — see Live device pairing |

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

**Key storage:** IndexedDB via `idb`, DB `yaply-keys` **version 3** (v3 dropped the pairwise `derived` store and legacy unscoped keypair entries). Store `identity` holds, **scoped per user**: `pub:<userId>` / `priv:<userId>` (identity JWKs), `deviceId:<userId>` (this install's `devices.device_id`), and `escrow:<userId>` (an array of `{ deviceId, pub, priv }` adopted from another device via live pairing — see below).

**In-memory cache must be keyed by userId, not a single mutable slot (critical):** `useEncryption.ts` keeps an in-JS-memory cache on top of IndexedDB (`identityPairMemCache`) so repeated encrypts/decrypts don't hit IndexedDB every time. An earlier version stored this as one mutable variable plus a "clear everything when a different userId shows up" check (`cacheOwner`) — this had a real race: sign out and back into a *different* account fast enough in the same tab, and a straggling async call still in flight for the old account (e.g. the sidebar's preview decryption, which runs independently of `ChatView`) could resolve *after* the new account's session had already reset the cache, and overwrite it with the old account's keypair while the tracker still said it belonged to the new user. Every decrypt for the new account then silently used the wrong private key — **every message failed**, specifically when testing multiple accounts by signing in/out in one browser tab (the common way to test multi-user flows solo). Fixed by making `identityPairMemCache` a `Map<userId, pair>`. `devicesMemCache` (60s TTL) is intentionally global/unscoped by requester since a user's public device list is the same no matter who is asking. iOS must not replicate the single-slot-plus-owner-check pattern for any per-user in-memory cache.

**Why Web Crypto and not a JS crypto library (e.g. TweetNaCl, forge):** built into every browser (no bundle cost), runs in a secure context; keys *could* be non-extractable (current impl exports to JWK for IndexedDB — a trade-off).

**What we build vs. what's provided:** the crypto *algorithms* are the browser's Web Crypto (`crypto.subtle`) — not hand-rolled. Supabase does *zero* crypto; it only stores ciphertext + public keys and never sees a private key. The *protocol* tying primitives together (key gen/storage, public-key exchange via `devices`, wire format, envelope scheme, rotation handling) is custom yaply code — this middle layer is where the risk lives (the historical single-slot bug was a protocol flaw, not an algorithm flaw). A future hardening path is adopting a vetted protocol lib (libsignal) instead of the custom ECDH+AES scheme.

### Live device pairing (history sync across devices)

Every install has its own identity keypair, which is why a new device cannot read
messages sealed before it existed. **Live pairing** closes that gap: an
already-linked device (the *sender*) hands its key material to a newly signed-in
one (the *receiver*) over an ephemeral, authenticated Realtime channel. Nothing
is stored server-side — there is no PIN, no vault, no recovery blob. Code lives
in `packages/crypto/src/pairing.ts`, `src/features/pairing/`,
`src/features/settings/components/DevicePairingSettings.tsx`, and `src/routes/link.tsx`.

**Two independent role axes — do not conflate them:**
- **Trust role**: `sender` (holds keys) vs `receiver` (needs them). Fixed by which device has history.
- **Rendezvous role**: `presenter` (shows the code) vs `entrant` (scans or types it). Free choice.

All four combinations are supported, which is the whole point: the pairing code
carries only a short rendezvous id — **never key material** — so it is small
enough to type. That is what makes a camera optional and covers desktop→phone,
phone→desktop, desktop→desktop and phone→phone. The QR is a convenience layer
over the same code, never the only path; the "Scan QR" control is only rendered
when `enumerateDevices()` actually reports a `videoinput`, so a camera-less
desktop never sees a dead end.

**Pairing code:** 8 characters of Crockford base32 (`0-9`, `A-Z` minus I/L/O/U),
displayed `XXXX-XXXX`. `normalizePairingCode` parses leniently (case-insensitive,
strips dashes/spaces, folds `O→0` and `I,L→1`). **It is a rendezvous identifier,
not a secret.**

**QR deep link:** `https://<origin>/link#c=<code>` — the code is in the
**fragment** on purpose, so it never reaches server logs, proxies, or a Referer
header. `/link` reads it from `window.location.hash` (not search params) and
drops the user into the receiver flow.

**Channel:** `supabase.channel('pairing:<userId>:<code>', { config: { private: true } })`.
Migration `00034_pairing_channel_authorization.sql` adds the first-ever RLS
policies on `realtime.messages`, scoping SELECT/INSERT to topics matching
`pairing:<auth.uid()>:%`. Every other channel in the app (typing, presence,
message invalidation) is public and unaffected — RLS on `realtime.messages` only
applies to channels opened with `private: true`.

**Protocol** (roles are *trust* roles; either side may have presented the code):
1. Both subscribe. Sender broadcasts `ready`; receiver broadcasts `hello { ephPub }`
   both on subscribe and on `ready` — neither side can assume it joined first.
2. Sender derives the shared secret + SAS, broadcasts `ack { ephPub }`.
3. Receiver derives the same secret + SAS independently.
4. Human compares the two 6-digit codes and confirms **on the sender**.
5. Sender broadcasts `payload { iv, ciphertext }`; receiver decrypts, merges into
   its local escrow, broadcasts `done`.

**Wire format (iOS must match byte-for-byte):**
- Ephemeral P-256 keypair per side, **memory-only** — never IndexedDB, never Postgres.
- `secret = raw 32-byte ECDH shared secret` used **directly** as the AES-256-GCM
  transfer key — same no-HKDF convention as the message envelope KEK.
- `sas = SHA-256(secret ‖ "yaply-sas-v1")`, first 4 bytes big-endian, `mod 1_000_000`, zero-padded to 6 digits.
- `ciphertext = base64(AES-GCM(secret, JSON.stringify(EscrowedKey[])) + tag)`,
  `iv = base64(nonce[12])`, where `EscrowedKey = { deviceId, pub: JsonWebKey, priv: JsonWebKey }`.

**Invariants (each guards a real failure mode):**
- **The SAS step is load-bearing, not decorative.** It is what stops a *second
  authenticated session on the same account* (a stolen JWT / logged-in tab) from
  racing to join the channel and impersonating the receiver — that attacker
  passes the RLS policy. A relay in the middle necessarily holds two different
  shared secrets and produces two different codes. Never ship a "skip
  verification" path.
- **Abort on a second joiner.** If a *different* `ephPub` arrives on a live
  session, the whole session is cancelled rather than picking a winner. Silently
  choosing one is exactly how a race becomes key exfiltration.
- **Escrowed keys are decrypt-only.** They are never published to `devices` and
  never used as a recipient when sealing new messages — this install still seals
  to its own key. They exist solely so old envelopes stay readable.
- **Import merges, never overwrites** (`mergeEscrowedKeys`, de-duped by
  fingerprint): pairing twice from two devices unions history access.
- **Candidate fingerprints, not one fingerprint.** `getCandidateFingerprints()`
  returns own fp first, then escrowed ones; `fetchEnvelopesForMessages` filters
  `.in('recipient_fp', candidateFps)` and `decryptV2ForUser` picks the private key
  matching `envelope.recipient_fp`. Applied identically at all three decrypt
  sites (`ChatView` effect, `ThreadView.loadReplies`, `api/conversations.ts`
  previews) — the same lockstep rule as the `enc_v`/`iv` invariants above.
- Session TTL is 90s and single-use; expiry surfaces an explicit "code expired"
  state, never a silent stall.

**Accepted limitation:** both devices must be online at the same time. There is
no cold-start recovery — lose every linked device at once and history is
permanently `decryptFailed`. This is the deliberate trade for storing no
recovery secret server-side. Anyone holding an unlocked linked device can also
mint new linked devices, exactly as in Signal/WhatsApp.

### Security Model — Known Gaps & Limitations

E2E here means **text message content is encrypted between a user's active devices** — not "everything is private from everyone." Do not overstate it. Known gaps (treat as documented limitations, not bugs):

- **Pre-device history: solved for the online case only.** Live device pairing (above) lets a new device adopt an existing device's keys and read history sealed before it existed. It requires an **already-linked device online at the same time** — there is no cold-start recovery, by design, because nothing that could unlock messages is stored server-side.
- **Explicitly out of scope (future work):** cold-start history recovery when every linked device is lost (would require key escrow, which was deliberately rejected — see the pairing section); server-side pruning of stale device rows; recovering already-orphaned legacy messages (permanent `decryptFailed`); message-editing implementation (no UI; contract only).
- **Device linking is as strong as an unlocked device.** Whoever holds an unlocked, signed-in device can approve linking a new one. Inherent to every device-linking design (Signal/WhatsApp included); the SAS confirmation defends against a network/relay attacker, not against physical access.
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
- **Cross-platform interop window:** until yaply-ios implements the v2 envelope format, mixed web/iOS conversations can't read each other's v2 messages.
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
request_state    text   ('accepted' | 'pending' | 'declined') default 'accepted' — message requests, see Friends System
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

**`profiles` table:** id, username (`unique` DB constraint — the actual source of truth), display_name, avatar_url, bio, birthdate (date, nullable — migration `00032_add_profile_birthdate.sql`), public_key, is_online, last_seen_at, created_at, updated_at.

**Username uniqueness check (pre-save, both places a username is set):** `src/features/chat/hooks/useUsernameAvailability.ts` debounces a `select id from profiles where username = candidate` (excluding the caller's own id when editing) so the UI can block Save *before* attempting a write, rather than only reacting to the Postgres `23505` unique-violation after a failed insert/update. Both call sites still catch `23505` on the actual write as a last-resort guard against a race between the check and the save — the DB constraint remains the real enforcement, the live check is UX. Used by `UsernameSetupModal.tsx` (first-login username prompt) and `AccountSettings.tsx` (Settings → Account username field).

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

**Account deletion FK cascade note:** every FK referencing `profiles(id)` is `ON DELETE CASCADE` except `conversations.created_by` and `messages.sender_id`, which are `ON DELETE SET NULL` (a departed creator's conversation stays around for remaining members; a departed sender's messages stay visible, attributed to no one) — migration `00031_fix_profile_delete_fk_actions.sql` closed the last gaps (`conversations.created_by`, `events.created_by`, `polls.created_by`, `message_receipts.user_id` previously had no `ON DELETE` action and would have thrown a foreign key violation on account deletion). `profiles.id` itself is `ON DELETE CASCADE` off `auth.users.id`, so deleting the `auth.users` row (only done by the `delete-account` Edge Function, see Supabase Edge Functions below) is what triggers the entire cascade.

**`friendships` table:** `id, requester_id (FK → profiles), recipient_id (FK → profiles), status ('pending' | 'accepted'), created_at, updated_at`. **One row per pair**, direction preserved so incoming and outgoing requests are distinguishable. A duplicate in either direction is impossible via the functional unique index `friendships_pair_uq on (least(requester_id, recipient_id), greatest(...))`. There is deliberately **no `declined` status** — decline, cancel and unfriend all DELETE the row so a later re-request stays possible; blocking is the permanent tool. RLS: participants can SELECT and DELETE; **no INSERT/UPDATE policy at all** — those carry invariants and go through RPCs. In the `supabase_realtime` publication. Migration `00033_friends_system.sql`.

**`user_blocks` table:** `blocker_id, blocked_id, created_at`, PK (blocker_id, blocked_id). Directed. RLS restricts SELECT/INSERT/DELETE to `blocker_id = auth.uid()`, so **the blocked user can never see the row** — they get no signal, their sends simply fail.

**Key RPCs:**
- `find_or_create_direct_conversation(target_user_id uuid)` — finds or creates a direct DM, inserts both members correctly. Security definer. Always use this instead of manual inserts for direct chats. Raises `blocked` if either party blocked the other, and `cannot message yourself`. On create the recipient's `request_state` is `'accepted'` if the pair are friends, else `'pending'` (a message request). If the caller had previously declined an existing thread, reaching this RPC is an explicit intent to talk and resets **their own** side to `'accepted'`.
- `send_message_with_envelopes(p_conversation_id, p_content, p_iv, p_envelopes jsonb, p_type, p_reply_to_id, p_thread_id, p_media_url, p_media_mime)` — inserts an `enc_v = 2` message **and** all its `message_envelopes` rows in one transaction. Security definer; **rejects an empty envelope array or a NULL iv**, so a v2 message can never exist without envelopes. Gates on `can_send_in_conversation()` (raises `cannot send in this conversation`). Always use this for encrypted sends; the plain `messages` insert is only for phase-1/system/media rows.
- `create_group_conversation(p_name, p_member_ids)` / `add_group_member(p_conversation_id, p_user_id)` — both raise `can only add friends to groups` for a non-friend.
- `send_friend_request(p_recipient_id)` / `accept_friend_request(p_request_id)` / `block_user(p_user_id)` — the only write paths into `friendships`. `send_friend_request` auto-accepts when a reverse pending request already exists, and raises `friend request already exists` / `blocked` / `cannot friend yourself`. `block_user` inserts the block **and** deletes any friendship atomically.
- `get_relationships(p_user_ids uuid[])` → `(user_id, status, request_id, mutual_friends)` where status ∈ `none | pending_out | pending_in | friends | blocked | blocked_by`. **Batched — always resolve a whole list in one call**, never per row.
- `search_users(p_query)` — matches username **or** display_name and excludes anyone blocked in either direction. Use instead of querying `profiles` directly (see the Friends System note below).
- `get_friend_suggestions(p_limit)` — "People You May Know": friends-of-friends by mutual count merged with shared-group co-members, excluding self, existing friends/requests, and blocks.

**Helper functions (security definer, used by both RLS policies and RPC bodies):** `are_friends(a,b)`, `is_blocked_between(a,b)`, `mutual_friend_count(a,b)`, `can_send_in_conversation(user, conversation)`. Per migration 00028's recursion lesson, a policy on table T may never contain an `EXISTS` over T itself — route every cross-table check through one of these. `sync_direct_request_state(a,b)` is **revoked from `anon`/`authenticated`**: it takes both user ids and has no `auth.uid()` guard, so exposing it over PostgREST would let anyone accept a message request on someone else's behalf; only the security-definer callers reach it.

### Friends System (migration 00033)

Two separate consent mechanisms that are easy to conflate — they are not the same thing:

- **Friend requests** (`friendships`) — a social relationship. Needed to be added to a group; drives the friends list, suggestions and mutual counts.
- **Message requests** (`conversation_members.request_state`) — permission to talk. A DM from a **non-friend** arrives with the recipient's own member row set to `'pending'`: they can read it but **cannot reply until they accept**. Accepting a message request does **not** create a friendship — it only opens the thread. Friends skip this entirely and chat immediately.

`request_state` semantics (per-member, asymmetric):
- `'accepted'` — normal. The default, so every pre-existing row and every group membership is unaffected.
- `'pending'` — this member may read but not send. Excluded from the unread count and from in-app notification banners; shown in the sidebar's "Message requests" section.
- `'declined'` — hidden from the list, and `can_send_in_conversation` returns false for **everyone** in the conversation, so the sender cannot keep messaging into a wall. The declining user can reopen their own side by explicitly starting the chat again (which routes through `find_or_create_direct_conversation`).

**Declining must never delete the membership row** — `trg_delete_empty_conversation` (below) would take the entire conversation and its messages with it. It is always a `request_state` UPDATE.

**Block semantics (v1):** sends are blocked in both directions, new DM creation raises `blocked`, any friendship is deleted, and the blocked user is hidden from the blocker's search results and suggestions. History is not deleted. The blocked party sees no indication — the block row is invisible to them and their send simply fails, which the client renders as "You can't message this person right now."

**Why `profiles` RLS was left as `using (true)`:** tightening it to hide blocked users would silently null out the nested `profiles(...)` joins that `fetchConversations`, message senders and the encryption device lookups all depend on. Block-hiding therefore lives in `search_users` plus client-side filtering. **Known, accepted limitation:** a blocked user can still read the blocker's profile row directly.

**All gating is server-side.** Both conversation-creating RPCs are `SECURITY DEFINER` and bypass RLS, so a client-side check is decorative — and iOS shares this backend. Add rules to the RPC body and/or an RLS policy, never to the client. (Migration 00033 also fixed the `messages` INSERT policy, whose membership subquery compared `cm.conversation_id = cm.conversation_id` and was consequently always true.)

**Postgres trigger — orphan conversation cleanup:**
`trg_delete_empty_conversation` (AFTER DELETE on `conversation_members`, FOR EACH ROW) — calls `delete_conversation_if_empty()` which deletes the `conversations` row if no members remain. This means deleting your membership from a DM where the other user already left cascades to deleting all messages and the conversation itself. Migration: `delete_conversation_if_empty`.

---

## Feature Map

### Implemented

| Feature | Files |
|---------|-------|
| Auth (sign in / sign up) | `src/routes/auth.tsx`, `src/lib/auth.ts`, `src/lib/passwordStrength.ts` — signup requires a password meeting all 5 checks (8+ chars, upper, lower, number, symbol) shown live via a strength meter + checklist (`isPasswordStrongEnough` gates the submit button); password/confirm-password fields have a show/hide toggle. Email/password signups require clicking an emailed confirmation link before `signInWithPassword` succeeds — Google OAuth accounts are exempt since Google already verifies the address. **This is enforced by the Supabase project's "Confirm email" toggle (Dashboard → Authentication → Sign In / Providers → Email), not by app code** — no migration/RLS/Edge Function can set it, only the Dashboard or the Management API with a personal access token. The client handles an unconfirmed-login attempt by surfacing a "Resend confirmation email" action (`supabase.auth.resend({ type: 'signup', email })`). |
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
| **Settings page** (tier 5) | `src/routes/settings.tsx` — full replacement for the old `ProfileModal` popup. Tabs: Account (name, unique username, avatar upload to `avatars` bucket, bio, birthdate, email-auth-only password change, danger-zone account deletion via the `delete-account` Edge Function), Billing/Privacy Policy/Terms of Service (sample content), Help (FAQ accordion), Report a Problem (known-issues list + a form that emails the developer via the `report-problem` Edge Function, see below). `src/features/settings/components/`. |
| Shared `Avatar` component | `src/components/Avatar.tsx` — single source of truth for avatar rendering app-wide; shows the real photo or a neutral person-silhouette placeholder (never initials) when `avatar_url` is null. |
| **Friends system** (tier 6) | `src/routes/friends.tsx` (`/friends` — tabs: Friends, Requests, Sent, Discover, Blocked, plus a people search that takes over the panel), `src/features/friends/` (`api/friends.ts`, `hooks/useFriends.ts`, components incl. `ProfileModal`, `FriendActionButton`, `MessageRequestBar`, `UserRow`, `ConfirmDialog`). DB: `friendships`, `user_blocks`, `conversation_members.request_state` (migration 00033). Entry point: Users icon + pending badge in the `ConversationList` header. |
| **Live device pairing** (history sync) | `packages/crypto/src/pairing.ts`, `src/features/pairing/` (`hooks/useDevicePairing.ts`, `components/PairingQr.tsx`, `components/QrScanner.tsx`), `src/features/settings/components/DevicePairingSettings.tsx` (Settings → Devices), `src/routes/link.tsx`. Migration `00034_pairing_channel_authorization.sql`. Deps: `qrcode`, `jsqr`. |
| **User profile view** | `src/features/friends/components/ProfileModal.tsx` — the app's only profile card, opened from the `ChatView` header avatar and every friends list. Shows public profile fields only (never email/account data). |
| **Message requests** | Non-friend DMs land in the "Message requests" section of `ConversationList`; `ChatView` swaps `MessageInput` for `MessageRequestBar` (Accept / Decline / Block) while `requestState === 'pending'`. |

### Not yet integrated

| Feature | Status |
|---------|--------|
| Media upload (images, files) | Service and drag-drop zone built; picker shown as "Phase 3" placeholder in ChatView |
| GIF picker (Giphy) | `src/features/media/` — UI exists, wired as phase 3 placeholder |
| AI conversations | Schema migrated; no UI or AI API integration |

---

## Cross-Platform Implementation Reference (iOS)

Web is the reference implementation; both platforms share one Supabase project and
the same schema (see **Database Schema** and **Feature Map** above). Per-feature
iOS how-to lives in `yaply-ios/CLAUDE.md` — do not duplicate it here. Only
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
- **Live device pairing** — see the Live device pairing section above for the
  full protocol. The contract iOS must reproduce exactly:
  - Code alphabet Crockford base32 (no I/L/O/U), 8 chars, displayed `XXXX-XXXX`;
    normalise leniently (case-insensitive, strip dashes/spaces, `O→0`, `I,L→1`).
  - Channel topic `pairing:<userId>:<code>`, opened **private** (`isPrivate = true`
    in swift-supabase). The RLS policy scopes it to `auth.uid()`.
  - Ephemeral P-256 per side, memory-only. `secret` = the **raw** ECDH shared
    secret bytes used directly as an AES-256-GCM key (CryptoKit:
    `P256.KeyAgreement`, raw bytes — **not** `hkdfDerivedSymmetricKey`).
  - `sas = SHA-256(secret ‖ "yaply-sas-v1")`, first 4 bytes big-endian,
    `mod 1_000_000`, zero-padded to 6 digits. Any drift here and the two devices
    show different numbers and the user correctly refuses to pair.
  - Payload `base64(AES-GCM(secret, JSON [{deviceId, pub, priv}]) + tag)` with
    `iv = base64(nonce[12])`; JWKs, not DER/SEC1.
  - Handshake events `ready` / `hello {ephPub}` / `ack {ephPub}` /
    `payload {iv, ciphertext}` / `done`, with the receiver re-sending `hello` on
    `ready`; abort on a second, different `ephPub`.
  - **iOS is most often the *sender* to a desktop receiver**, so it must ship the
    presenter-with-typed-code path (show an 8-char code), not just QR scanning.
    Never gate pairing behind the camera.
  - Adopted keys are decrypt-only: never publish them to `devices`, never seal
    new messages to them, and merge (don't overwrite) on a second pairing.
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
- **Friends & message requests (not yet on iOS)** — see the Friends System
  section above for full semantics. The contract iOS must honour:
  - Never write `friendships` or `user_blocks` directly for create/accept/block.
    Use `send_friend_request` / `accept_friend_request` / `block_user`; there is
    no INSERT or UPDATE RLS policy, so a direct write silently fails. Decline,
    cancel and unfriend are all a plain `DELETE` on the `friendships` row.
  - Resolve relationship state with the **batched** `get_relationships(uuid[])`,
    never one call per user, and render the same six states everywhere a person
    appears (`none | pending_out | pending_in | friends | blocked | blocked_by`).
    `blocked_by` must be indistinguishable from `none` in the UI.
  - Use `search_users(p_query)` for people search — querying `profiles` directly
    skips the block filter.
  - Honour `conversation_members.request_state`: hide `'declined'`, put
    `'pending'` in a separate Message requests section, disable the composer
    there, and exclude both from unread counts and notification banners.
    Accepting/declining is an UPDATE of **your own** member row — never a DELETE.
  - Expect these RPC errors and map them to human text rather than surfacing
    raw: `blocked`, `cannot send in this conversation`,
    `can only add friends to groups`, `friend request already exists`.
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
│   │   └── settings/               # Settings page tabs (Account, Billing, Privacy, Terms, Help, Report)
│   │       └── components/
│   ├── components/                # Cross-feature shared UI: YaplyLogo, Avatar (avatar_url → img, else person-silhouette placeholder)
│   ├── lib/
│   │   ├── auth.ts                # getUser(), onAuthStateChange(), DEV_BYPASS flag
│   │   ├── supabase.ts            # Supabase client singleton
│   │   └── database.types.ts      # Auto-generated Supabase types (may be stale — see discrepancy note)
│   └── routes/                    # File-based routes (TanStack Router)
│       ├── index.tsx              # `/` — self-contained marketing landing page (see Landing Page above)
│       └── settings.tsx           # `/settings` — profile + account settings
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
    ├── functions/                 # Edge Functions (server secrets) — report-problem, delete-account (see Environment Variables)
    └── migrations/                # NOT all applied to live DB (see discrepancy note above)
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=         # From Supabase project settings
VITE_SUPABASE_ANON_KEY=    # From Supabase project settings (public/anon key)
VITE_GIPHY_API_KEY=        # From Giphy Developer Dashboard
```

### Supabase Edge Functions

`supabase/functions/` holds server-side functions deployed separately from the client build (`supabase functions deploy <name>`), for logic that needs a secret the client must never see.

- **`report-problem`** — relays the Settings → Report a Problem form to the developer's email via [Resend](https://resend.com), so that address never appears in client code. Requires the secret `RESEND_API_KEY` (`supabase secrets set RESEND_API_KEY=...`) — **not** a `VITE_*` client env var, and not in `.env.example`. Sends from Resend's shared `onboarding@resend.dev` test address unless/until a verified sending domain is configured.
- **`delete-account`** — permanently deletes the caller's own account (Settings → Account → Danger zone, confirmed via a "type delete to confirm" dialog). Client-side code cannot delete an `auth.users` row directly — only the service role can — so the function identifies the caller from **their own JWT** (`auth.getUser()` on a client built with the forwarded `Authorization` header) and never accepts a user id from the request body, which is what guarantees a caller can only ever delete their own account, not someone else's. It then uses a **separate** service-role client (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided to every Edge Function — not a secret you set yourself) to best-effort remove the user's `avatars` storage objects and call `auth.admin.deleteUser(userId)`. Deleting the `auth.users` row cascades through `profiles` (`profiles_id_fkey ... on delete cascade`) and from there through every other table via the `profiles(id)`-referencing FKs — see the FK cascade note below; this is why `profiles` intentionally has **no DELETE RLS policy** (only `SELECT`/`UPDATE`) — row deletion is never exposed to PostgREST/the client directly, it only ever happens as a cascade side effect of the admin API call.

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

**Monorepo for cross-platform parity:** `packages/crypto` documents the encryption contract. `packages/shared/types.ts` documents the intended canonical schema. Even though yaply-ios uses a different crypto library (CryptoKit), it must reproduce the same wire format. These packages are the specification, not just the web implementation.

---

## Sister Projects (this monorepo)

| Directory | Platform | GitHub | Status |
|-----------|----------|--------|--------|
| `.` (root) | Web (React + Supabase) | https://github.com/WahidKamruddin/yaply | Active |
| `yaply-ios/` | iOS (Swift + SwiftUI) | https://github.com/WahidKamruddin/yaply-ios | **Active** — the client for iOS. A React Native rewrite (`yaply-native/`) was tried and abandoned as of 2026-08-03 — SwiftUI's native look didn't give the design customizability wanted (a Meta Messenger–esque UI), and rather than persist with React Native the user reverted to this Swift app and deleted `yaply-native/` entirely. If you encounter any documentation elsewhere describing `yaply-ios` as deprecated or `yaply-native` as the active client, it is stale — this table is the current source of truth. |

The web repo's `.gitignore` excludes `yaply-ios/` and `yaply-android/` (not yet started) since each has (or will have) its own GitHub repository. The monorepo root exists so Claude Code can cross-reference both platforms in the same working directory.

`yaply-ios/CLAUDE.md` contains its architecture notes and design direction. Any change to the encryption wire format or database schema **must be reflected in both active platform CLAUDE.md files** (web and yaply-ios) and implemented consistently across both.
