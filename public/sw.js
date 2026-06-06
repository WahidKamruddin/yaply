// Yaply service worker — handles Web Push notifications.
// Deploy VAPID keys: add VITE_VAPID_PUBLIC_KEY to .env
// and VAPID_PRIVATE_KEY + VAPID_SUBJECT to Supabase Vault secrets.
// Trigger: Supabase DB webhook on messages INSERT → Edge Function send-push-notification.

self.addEventListener('push', (event) => {
  const data = event.data?.json?.() ?? {}
  const title = data.title ?? 'New message'
  const options = {
    body: data.body ?? '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    silent: false,
    data: { conversationId: data.conversationId ?? null },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const conversationId = event.notification.data?.conversationId
  const url = conversationId ? `/chat?conv=${conversationId}` : '/chat'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/chat') && 'focus' in client) {
          client.postMessage({ type: 'OPEN_CONVERSATION', conversationId })
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})
