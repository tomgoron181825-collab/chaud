// Service worker minimal : permet d'installer l'app sur l'écran d'accueil.
// Pas de cache hors ligne pour l'instant, tout passe par le réseau.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('fetch', () => {})
