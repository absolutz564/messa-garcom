/*
 * Service worker do Messa (RF-74/PDR-019).
 *
 * Deliberadamente burro: a única coisa que ele guarda é a casca do app (ícones e a
 * página offline). NADA de API é cacheado.
 *
 * O motivo é regra de negócio, não preguiça: preço, disponibilidade e estado de mesa
 * só valem validados no backend (RNF-02). Um cache de resposta de API mostraria
 * cardápio antigo, mesa livre que já está ocupada e pedido que já foi lançado — pior
 * do que não mostrar nada. Quando a rede cai, quem avisa é o BR-19, com dado fresco.
 *
 * Existe por dois motivos concretos: tornar o app instalável (o Chrome exige um SW com
 * handler de fetch) e trocar a tela de dinossauro por um aviso nosso quando o garçom
 * anda por uma área sem sinal.
 */
const VERSION = 'messa-v1';
const SHELL = ['/offline.html', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só navegação entra aqui. GET de API, chunk do Next e imagem seguem direto para a
  // rede, com o cache HTTP normal do navegador — o SW não se mete.
  if (request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(VERSION);
      return (await cache.match('/offline.html')) ?? Response.error();
    }),
  );
});
