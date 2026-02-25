/* Service Worker: 离线缓存 + 推送 */
const CACHE_NAME = "super-project-agent-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(["/", "/login", "/manifest.webmanifest"]);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.url.startsWith("http") && event.request.method === "GET") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          if (res.ok && (event.request.url.startsWith(self.location.origin)))
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || caches.match("/")))
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "今日最重要事项";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    tag: data.tag || "daily-digest",
    data: data.url ? { url: data.url } : {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length) clients[0].focus();
      else if (self.clients.openWindow) self.clients.openWindow(url);
    })
  );
});
