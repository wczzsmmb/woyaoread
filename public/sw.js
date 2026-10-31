/* 对页 PWA：静态资源 stale-while-revalidate；页面 network-first。 */
const V = 'duiye-v1'
const SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(V)
      .then((c) => c.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== V).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  // 批注接口永远走网络
  if (url.pathname.startsWith('/api/')) return
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(V).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))),
    )
    return
  }

  e.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(V).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => cached)
      return cached || net
    }),
  )
})
