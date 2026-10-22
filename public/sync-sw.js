self.addEventListener('sync', (event) => {
  if (event.tag !== 'nutapos-sync') return;
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: 'window' })
      .then((clients) => Promise.all(clients.map((client) => client.postMessage({ type: 'nutapos-sync' })))),
  );
});
