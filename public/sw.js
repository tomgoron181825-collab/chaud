// Service worker : installation sur l'écran d'accueil, notifications, et ouverture sans réseau.
// L'app elle-même (pages, scripts, icônes) est gardée sur le téléphone ; les données passent par Supabase.
const CACHE = 'chaud-v3'

self.addEventListener('install', (e) => {
  self.skipWaiting()
  // On garde tout de suite la page et ses scripts, pour que l'app s'ouvre même sans réseau
  e.waitUntil((async () => {
    try {
      const c = await caches.open(CACHE)
      const r = await fetch('./', { cache: 'no-cache' })
      const html = await r.clone().text()
      await c.put('./', r)
      const files = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png|svg|webmanifest))"/g)].map((m) => m[1])
      await Promise.all([...new Set(['icon-192.png', ...files])].map((f) => c.add(f).catch(() => {})))
    } catch {}
  })())
})
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase : jamais en cache
  // Pages : réseau d'abord (pour avoir la dernière version), sinon la copie gardée
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      const copy = r.clone()
      caches.open(CACHE).then((c) => c.put('./', copy))
      return r
    }).catch(() => caches.match('./', { ignoreVary: true })))
    return
  }
  // Scripts, styles, icônes : la copie gardée d'abord (leurs noms changent à chaque version)
  e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
    return r
  })))
})

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { title: 'Chaud', body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || 'Chaud', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag,
    data: { url: d.url || self.registration.scope },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus()
        return w.navigate ? w.navigate(url) : undefined
      }
    }
    return self.clients.openWindow(url)
  })())
})
