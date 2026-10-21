// Lets the app show notifications on phones, which only allow them through a service worker.
// It caches nothing: the app always loads fresh from the server.

// Tapping a notification brings the app back to the front, or opens it.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      return open ? open.focus() : self.clients.openWindow("/");
    })
  );
});
