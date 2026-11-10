// Minimal service worker to make DyskFocus an installable PWA (webview-ready).
const CACHE = 'dyskfocus-v3'
// The SPA shell: any navigation can be served by it when offline.
const SHELL = '/'
// Keep at most this many cached navigations/misc entries (build assets excluded).
const MAX_PAGES = 30

self.addEventListener('install', () => self.skipWaiting())

// --- Web push ---
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'DyskFocus'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'dyskfocus',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((c) => 'focus' in c)
      if (client) {
        // navigate() only works on controlled clients and rejects otherwise —
        // still focus the existing window rather than failing silently.
        if (client.url !== new URL(target, location.origin).href && 'navigate' in client) {
          await client.navigate(target).catch(() => {})
        }
        return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== location.origin) return
  // Never cache API / auth traffic.
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/sanctum')) return

  // Content-hashed build assets → cache-first.
  if (url.pathname.startsWith('/build/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then(
          (hit) =>
            hit ||
            fetch(request).then((res) => {
              // Never pin an error/redirect page under an immutable asset URL.
              if (res.ok && res.type === 'basic') cache.put(request, res.clone())
              return res
            })
        )
      )
    )
    return
  }

  // Navigations & everything else → network-first, fall back to cache when offline.
  const isNavigation = request.mode === 'navigate'
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          // Every SPA route returns the same shell, so store navigations under one key.
          const key = isNavigation ? SHELL : request
          event.waitUntil(caches.open(CACHE).then((cache) => cache.put(key, copy)).then(trimCache))
        }
        return res
      })
      .catch(async () => (await caches.match(isNavigation ? SHELL : request)) || (await caches.match(request)) || Response.error())
  )
})

/** Drop the oldest non-build entries so the cache can't grow without bound. */
async function trimCache() {
  const cache = await caches.open(CACHE)
  const keys = (await cache.keys()).filter((r) => !new URL(r.url).pathname.startsWith('/build/'))
  for (const req of keys.slice(0, Math.max(0, keys.length - MAX_PAGES))) await cache.delete(req)
}
