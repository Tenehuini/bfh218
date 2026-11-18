// Cache offline: el juego funciona sin conexión una vez abierto.
// Al publicar cambios, subir el número de CACHE para que los celulares bajen los archivos nuevos.
const CACHE = 'bfh218-v2';
const FILES = [
  './', 'index.html', 'styles.css', 'game.js', 'ai.js', 'app.js', 'manifest.json',
  'assets/logo.webp', 'assets/title.webp', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/cards/air_blue.webp', 'assets/cards/air_green.webp', 'assets/cards/artillery_blue.webp', 'assets/cards/artillery_green.webp', 'assets/cards/heavy_blue.webp', 'assets/cards/heavy_green.webp', 'assets/cards/hill.webp', 'assets/cards/infantry_blue.webp', 'assets/cards/infantry_green.webp', 'assets/cards/para_blue.webp', 'assets/cards/para_green.webp', 'assets/cards/special_blue.webp', 'assets/cards/special_green.webp', 'assets/cards/tank_blue.webp', 'assets/cards/tank_green.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para recibir actualizaciones); si no hay conexión, usa el caché.
// 'no-cache' obliga a consultar al servidor: si no, el navegador puede mezclar un
// index.html nuevo con un app.js viejo guardado hasta 10 minutos.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const req = new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
