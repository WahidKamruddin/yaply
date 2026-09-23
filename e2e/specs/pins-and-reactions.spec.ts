import { test, expect } from '@playwright/test'
import { USERS } from '../fixtures/users'
import { contextFor } from '../helpers/session'
import {
  profileIdByUsername,
  directConversationBetween,
  waitForNewDevice,
  waitForNewMessage,
  messageIdsIn,
  deviceCount,
  db,
} from '../helpers/db'
import {
  gotoChat,
  startDirectChat,
  sendMessage,
  reloadClearingCaches,
  openConversation,
} from '../helpers/app'

/**
 * Pins and reactions — the two features that hang off a message without being
 * part of its wire format.
 *
 * Pins live in their own table on purpose: widening the deliberately narrow
 * `messages` UPDATE policy to allow a pin flag would also expose `content`.
 * Reactions are the documented web/iOS divergence — the primary key includes
 * `emoji`, so web allows several per user while iOS enforces one client-side.
 * Pinning that here means unifying them later is a conscious choice rather than
 * an accident.
 */
test('a pinned message shows a decrypted preview, and pinning is idempotent', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  const aliceBefore = await deviceCount(aliceId)
  const bobBefore = await deviceCount(bobId)

  const aliceCtx = await contextFor(browser, USERS.alice)
  const bobCtx = await contextFor(browser, USERS.bob)
  const alice = await aliceCtx.newPage()
  const bob = await bobCtx.newPage()

  await gotoChat(alice)
  await gotoChat(bob)
  await waitForNewDevice(aliceId, aliceBefore)
  await waitForNewDevice(bobId, bobBefore)
  await reloadClearingCaches(alice)

  const text = `pin-me ${Date.now()}`
  await startDirectChat(alice, USERS.bob.username)

  const conversationId = await directConversationBetween(aliceId, bobId)
  const sentAfter = await messageIdsIn(conversationId!)
  await sendMessage(alice, text)

  const message = await waitForNewMessage(conversationId!, sentAfter)

  // ── Pin from the hover action ─────────────────────────────────────────────
  const bubble = alice.locator(`#msg-${message.id}`)
  await bubble.hover()
  await alice.getByTitle('Pin message').first().click()

  // The banner previews the *decrypted* text — the pin row stores only ids, so
  // the preview has to come from the loaded, decrypted message.
  // exact: getByTitle substring-matches, and the bubble's hover action is
  // titled "Unpin message" once pinned. Only the banner is titled just "Unpin".
  await expect(
    alice.getByTitle('Unpin', { exact: true }),
    'the pinned banner should appear for the pinner',
  ).toBeVisible()
  await expect(alice.getByText(text).first()).toBeVisible()

  // ── Idempotent: the primary key is (conversation_id, message_id) ──────────
  const { error: dupeErr } = await db().from('pinned_messages').upsert(
    {
      conversation_id: conversationId!,
      message_id: message.id,
      pinned_by: aliceId,
    },
    { onConflict: 'conversation_id,message_id' },
  )
  expect(dupeErr, 'pinning twice must upsert, not raise').toBeNull()

  const { data: pins } = await db()
    .from('pinned_messages')
    .select('message_id')
    .eq('conversation_id', conversationId!)
  expect(
    pins,
    'a second pin of the same message must not create a second row',
  ).toHaveLength(1)

  // ── Any member can unpin, not just the pinner ────────────────────────────
  await reloadClearingCaches(bob)
  await openConversation(bob, conversationId!)
  const bobUnpin = bob.getByTitle('Unpin', { exact: true })
  await expect(bobUnpin).toBeVisible()
  await bobUnpin.click()

  await expect
    .poll(
      async () => {
        const { data } = await db()
          .from('pinned_messages')
          .select('message_id')
          .eq('conversation_id', conversationId!)
        return data?.length ?? -1
      },
      { timeout: 15_000 },
    )
    .toBe(0)

  await aliceCtx.close()
  await bobCtx.close()
})

test('web allows a user to hold several reactions on one message', async ({
  browser,
}) => {
  const aliceId = await profileIdByUsername(USERS.alice.username)
  const bobId = await profileIdByUsername(USERS.bob.username)

  const aliceCtx = await contextFor(browser, USERS.alice)
  const alice = await aliceCtx.newPage()
  await gotoChat(alice)

  const conversationId = await directConversationBetween(aliceId, bobId)
  expect(
    conversationId,
    'the earlier spec should have created this DM',
  ).not.toBeNull()

  const { data: recent } = await db()
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId!)
    .order('created_at', { ascending: false })
    .limit(1)
  const messageId = recent![0].id

  // Written directly rather than through the picker: the point is the table
  // constraint, and the emoji picker is a separate surface with its own tests
  // to earn.
  for (const emoji of ['👍', '🎉']) {
    const { error } = await db()
      .from('message_reactions')
      .insert({ message_id: messageId, user_id: aliceId, emoji })
    expect(error, `reacting with ${emoji} should be allowed`).toBeNull()
  }

  const { data: reactions } = await db()
    .from('message_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('user_id', aliceId)

  expect(
    reactions,
    'the primary key includes emoji, so one user may hold several on web — ' +
      'iOS enforces one client-side, and unifying them needs a constraint plus ' +
      'a change on both clients',
  ).toHaveLength(2)

  await db()
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', aliceId)

  await aliceCtx.close()
})
