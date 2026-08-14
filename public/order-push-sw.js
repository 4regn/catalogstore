// Minimal service worker whose only job is to turn an incoming Web Push
// message into an OS-level notification -- the actual "new order" event
// still comes from the server (see lib/push-notify.ts), this just displays
// it, including while the dashboard tab isn't open at all (the entire
// reason this exists: app/dashboard/page.tsx's own Supabase Realtime
// "orders-<sellerId>" toast only fires while that tab is open and focused).
// Registered from the dashboard at /dashboard (see the enablePush() flow in
// app/dashboard/page.tsx), scoped to /dashboard by its registration call,
// not site-wide.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "New order", body: "You've received a new order.", url: "/dashboard" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      data: { url: data.url || "/dashboard" },
      tag: "catalogstore-order",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/dashboard") && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
