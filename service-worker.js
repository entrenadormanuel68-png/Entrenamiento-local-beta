// Entrenamiento Total — service worker
// Páginas y archivos propios: primero la red (así siempre ves la última versión) y, sin conexión, la copia guardada.
// Si cambias algo en la lógica de caché, sube el número de VERSION.
var VERSION='et-v2';
var SHELL=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    return Promise.all(SHELL.map(function(u){return c.add(u).catch(function(){});}));
  }).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k!==VERSION;}).map(function(k){return caches.delete(k);}));
  }).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var req=e.request;
  if(req.method!=='GET')return;
  var url=new URL(req.url);
  var propio=url.origin===self.location.origin;
  var sdk=url.hostname==='www.gstatic.com';   // SDK de Firebase
  if(!propio&&!sdk)return;                       // Firebase (datos), fuentes, etc.: sin tocar
  e.respondWith(
    fetch(req).then(function(res){
      if(res&&(res.ok||res.type==='opaque')){var copia=res.clone();caches.open(VERSION).then(function(c){c.put(req,copia);});}
      return res;
    }).catch(function(){
      return caches.match(req).then(function(m){
        return m||(req.mode==='navigate'?caches.match('./index.html'):undefined)||Response.error();
      });
    })
  );
});
