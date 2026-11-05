/* Sincronización opcional con Google Drive (carpeta oculta de la app, scope drive.appdata).
 * Módulo independiente: reutiliza backupConstruir() / backupAplicar() de la app y NO modifica nada existente.
 * Si no se conecta, la app funciona exactamente igual que antes. Los datos solo viven en el Drive de cada usuario. */
(function () {
  'use strict';
  var CLIENT_ID = '1081887031857-5e6bn1l8e8hdm94m641fuku4n9kjh8pi.apps.googleusercontent.com';
  var SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  var FILE_NAME = 'entrenamiento_total_sync.json';
  var CFG_KEY = 'et_sync_cfg';          // localStorage (fuera de EtStore: no lo tocan copias ni resets)
  var INTERVALO = 120000;               // comprobación automática cada 2 min mientras la app está abierta
  var COPIA_PREFIJO = 'entrenamiento_total_copia_';   // copias de versiones anteriores, también en la carpeta oculta de la app
  var COPIAS_MAX = 5;                   // cuántas versiones anteriores se conservan
  var COPIA_CADA = 6 * 3600 * 1000;     // como mucho una copia nueva cada 6 h (salvo que los datos nuevos sean mucho más pequeños)

  var token = null, tokenExp = 0, tokenClient = null, gisPromise = null, busy = false, timer = null;
  var estado = { texto: '', tipo: '' };

  // ───────── utilidades ─────────
  function cfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY) || '{}'); } catch (e) { return {}; } }
  function setCfg(o) { try { localStorage.setItem(CFG_KEY, JSON.stringify(Object.assign(cfg(), o))); } catch (e) {} }
  function toast(m) { try { if (typeof window.toast === 'function') window.toast(m); else console.log(m); } catch (e) {} }
  function hash(s) { // cyrb53
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, ch; i < s.length; i++) { ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function snapLocal() {
    var d = window.backupConstruir();
    d.dispositivo = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
    return { d: d, hash: hash(JSON.stringify({ datos: d.datos, almacen: d.almacen })) };
  }
  function setEstado(texto, tipo) { estado = { texto: texto, tipo: tipo || '' }; pintar(); }

  // ───────── Google Identity Services ─────────
  function cargarGIS() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () { ok(); };
      s.onerror = function () { gisPromise = null; ko(new Error('Sin conexión con Google')); };
      document.head.appendChild(s);
    });
    return gisPromise;
  }
  // ───────── APK (Capacitor): inicio de sesión nativo de Android ─────────
  // Google bloquea el login web dentro del WebView de una APK; ahí se usa el plugin nativo.
  // En el navegador / PWA nada de esto se ejecuta.
  function esNativo() {
    try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (e) { return false; }
  }
  var gsi = null, gsiInit = null;
  function pedirTokenNativo(interactivo) {
    if (!interactivo) return Promise.reject(new Error('Sesión caducada'));   // sin ventanas por sorpresa: pide pulsar «Sincronizar ahora»
    // Sin empaquetador no existe Capacitor.registerPlugin: se llama al puente nativo directamente.
    var cap = window.Capacitor;
    if (!gsi) {
      if (cap && typeof cap.registerPlugin === 'function') { try { gsi = cap.registerPlugin('GoogleSignIn'); } catch (e) {} }
      if (!gsi && cap && typeof cap.nativePromise === 'function') {
        gsi = {
          initialize: function (o) { return cap.nativePromise('GoogleSignIn', 'initialize', o); },
          signIn: function (o) { return cap.nativePromise('GoogleSignIn', 'signIn', o || {}); },
          signOut: function () { return cap.nativePromise('GoogleSignIn', 'signOut', {}); }
        };
      }
      if (!gsi) return Promise.reject(new Error('Plugin de Google no disponible'));
    }
    gsiInit = gsiInit || gsi.initialize({ clientId: CLIENT_ID, scopes: [SCOPE] });   // clientId = cliente WEB, también en Android
    return gsiInit.then(function () { return gsi.signIn(); }).then(function (r) {
      if (!r || !r.accessToken) throw new Error('Google no dio permiso para Drive');
      token = r.accessToken; tokenExp = Date.now() + 3300 * 1000; setCfg({ conectado: true });
      return token;
    }).catch(function (e) { gsiInit = null; throw new Error((e && (e.message || e.code)) || 'Acceso cancelado'); });
  }

  function pedirToken(interactivo) {
    if (esNativo()) return (token && Date.now() < tokenExp - 60000) ? Promise.resolve(token) : pedirTokenNativo(interactivo);
    return cargarGIS().then(function () {
      if (token && Date.now() < tokenExp - 60000) return token;
      return new Promise(function (ok, ko) {
        if (!tokenClient) {
          tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: function () {} });
        }
        tokenClient.callback = function (r) {
          if (r && r.access_token) { token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; setCfg({ conectado: true }); ok(token); }
          else ko(new Error((r && r.error) || 'Acceso denegado'));
        };
        tokenClient.error_callback = function (e) { ko(new Error((e && e.type) || 'Acceso cancelado')); };
        tokenClient.requestAccessToken({ prompt: interactivo ? '' : 'none' });
      });
    });
  }

  // ───────── Drive (solo appDataFolder) ─────────
  function api(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ Authorization: 'Bearer ' + token }, opts.headers || {});
    return fetch(url, opts).then(function (r) {
      if (r.status === 401) { token = null; tokenExp = 0; throw new Error('Sesión caducada'); }
      if (!r.ok) throw new Error('Drive ' + r.status);
      return r;
    });
  }
  function buscar() {
    var q = encodeURIComponent("name='" + FILE_NAME + "'");
    return api('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=' + q + '&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime,size)')
      .then(function (r) { return r.json(); }).then(function (j) { return (j.files && j.files[0]) || null; });
  }
  function bajar(id) { return api('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media').then(function (r) { return r.text(); }); }
  function subir(json, id, nombre) {
    if (id) {
      return api('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media&fields=id,modifiedTime',
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json }).then(function (r) { return r.json(); });
    }
    var b = '----etsync' + Date.now();
    var cuerpo = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify({ name: nombre || FILE_NAME, parents: ['appDataFolder'] }) + '\r\n--' + b +
      '\r\nContent-Type: application/json\r\n\r\n' + json + '\r\n--' + b + '--';
    return api('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime',
      { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: cuerpo }).then(function (r) { return r.json(); });
  }

  // ───────── versiones anteriores (protegen de subir datos vacíos o equivocados) ─────────
  function listarCopias() {
    return api('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=100&fields=files(id,name,modifiedTime,size)')
      .then(function (r) { return r.json(); }).then(function (j) {
        return (j.files || []).filter(function (x) { return String(x.name).indexOf(COPIA_PREFIJO) === 0; })
          .sort(function (a, b) { return a.name < b.name ? 1 : -1; });   // la más reciente primero
      });
  }
  function podarCopias() {
    return listarCopias().then(function (l) {
      return Promise.all(l.slice(COPIAS_MAX).map(function (x) { return api('https://www.googleapis.com/drive/v3/files/' + x.id, { method: 'DELETE' }).catch(function () {}); }));
    });
  }
  // Antes de sustituir el archivo de Drive, guarda lo que había (como mucho cada 6 h, o siempre si lo nuevo es mucho más pequeño).
  function copiaPrevia(f, nuevoTam) {
    if (!f) return Promise.resolve();
    var reducido = !!(f.size && nuevoTam < Number(f.size) * 0.6);
    var toca = !cfg().copiaT || Date.now() - cfg().copiaT > COPIA_CADA;
    if (!reducido && !toca) return Promise.resolve();
    return bajar(f.id).then(function (txt) { return subir(txt, null, COPIA_PREFIJO + Date.now() + '.json'); })
      .then(function () { setCfg({ copiaT: Date.now() }); return podarCopias(); })
      .catch(function () {
        if (reducido) throw new Error('No se pudo guardar la versión anterior en Drive; no se sube para no perder datos');
      });
  }
  function kb(n) { return Math.max(1, Math.round(Number(n || 0) / 1024)) + ' KB'; }
  function restaurarVersion() {
    if (busy) return Promise.resolve();
    busy = true; setEstado('Buscando versiones anteriores…', 'info');
    return pedirToken(true).then(function () { return Promise.all([listarCopias(), buscar()]); }).then(function (r) {
      var copias = r[0], actual = r[1];
      busy = false; setEstado('', '');
      if (!copias.length) { setEstado('Aún no hay versiones anteriores guardadas en Drive', 'aviso'); return; }
      var botones = copias.map(function (x) { return { t: fecha(Number(x.name.slice(COPIA_PREFIJO.length, -5)) || x.modifiedTime) + ' · ' + kb(x.size), v: x }; });
      botones.push({ t: 'Cancelar', v: null });
      return preguntar('Restaurar una versión anterior', 'Elige la versión de Drive que quieres recuperar en este dispositivo. Antes se guarda una copia local, y la versión elegida pasará a ser la de Drive en la siguiente sincronización.', botones).then(function (x) {
        if (!x) return;
        busy = true; setEstado('Restaurando…', 'info');
        return bajar(x.id).then(function (txt) {
          var d; try { d = JSON.parse(txt); } catch (e) { throw new Error('La versión elegida no es válida'); }
          if (!d || d.app !== 'EntrenamientoTotal' || !d.datos) throw new Error('La versión elegida no es válida');
          return Promise.resolve(window.EtStore.snapshot('antes-de-restaurar')).then(function () { window.backupAplicar(d); return window.EtStore.flush(); });
        }).then(function () {
          // baseHash vacío = «hay cambios locales»: la siguiente sincronización sube lo restaurado a Drive
          setCfg({ baseHash: '', baseTime: actual ? actual.modifiedTime : '', rebase: false, ultima: Date.now() });
          toast('☁️ Versión restaurada. Recargando…');
          setTimeout(function () { location.reload(); }, 1500);
        });
      });
    }).catch(function (e) { setEstado('No se pudo restaurar: ' + String(e && e.message || e), 'error'); })
      .then(function () { busy = false; pintar(); });
  }

  // ───────── lógica de sincronización ─────────
  function subirLocal(loc, f) {
    var json = JSON.stringify(loc.d);
    return copiaPrevia(f, json.length).then(function () { return subir(json, f && f.id); }).then(function (m) {
      setCfg({ baseHash: loc.hash, baseTime: m.modifiedTime, ultima: Date.now() });
      return m;
    });
  }
  function aplicarRemoto(f) {
    return bajar(f.id).then(function (txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { throw new Error('El archivo de Drive no es válido'); }
      if (!d || d.app !== 'EntrenamientoTotal' || !d.datos) throw new Error('El archivo de Drive no es válido');
      return Promise.resolve(window.EtStore.snapshot('antes-de-sync')).then(function () {
        window.backupAplicar(d);
        return window.EtStore.flush();
      }).then(function () {
        setCfg({ baseTime: f.modifiedTime, rebase: true, ultima: Date.now() }); // baseHash se fija tras recargar
        toast('☁️ Datos de Drive cargados. Recargando…');
        setTimeout(function () { location.reload(); }, 1500);
      });
    });
  }
  function preguntar(titulo, texto, botones) { // botones: [{t, cls, v}] -> Promise(v)
    return new Promise(function (ok) {
      var o = document.createElement('div');
      o.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
      var c = document.createElement('div');
      c.style.cssText = 'background:#fff;border-radius:14px;max-width:420px;width:100%;padding:20px;font-family:inherit';
      c.innerHTML = '<div style="font-weight:700;font-size:16px;margin-bottom:8px"></div><div style="font-size:13px;color:#475569;white-space:pre-line;margin-bottom:14px"></div><div style="display:flex;flex-direction:column;gap:8px"></div>';
      c.children[0].textContent = titulo; c.children[1].textContent = texto;
      botones.forEach(function (b) {
        var x = document.createElement('button'); x.className = 'btn ' + (b.cls || 'btn-ghost'); x.textContent = b.t;
        x.onclick = function () { o.remove(); ok(b.v); }; c.children[2].appendChild(x);
      });
      o.appendChild(c); document.body.appendChild(o);
    });
  }
  function hace(t) {
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 1) return 'hace un momento'; if (m < 60) return 'hace ' + m + ' min';
    var h = Math.floor(m / 60); if (h < 24) return 'hace ' + h + ' h'; var d = Math.floor(h / 24); return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  function fecha(t) { try { return new Date(t).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; } }

  // opts.manual: pulsado por el usuario (puede abrir la ventana de Google y descargar sin preguntar si no hay conflicto)
  function sincronizar(opts) {
    opts = opts || {};
    // Con la pantalla de contraseña puesta no se sincroniza solo: la ventana de Google interrumpía al escribir. Se sincroniza justo al desbloquear.
    if (!opts.manual && window.EtAcceso && window.EtAcceso.bloqueada && window.EtAcceso.bloqueada()) return Promise.resolve();
    if (busy) return Promise.resolve();
    if (!window.backupConstruir || !window.EtStore) return Promise.resolve();
    busy = true; setEstado('Sincronizando…', 'info');
    return pedirToken(!!opts.manual).then(function () {
      var loc = snapLocal(), c = cfg();
      return buscar().then(function (f) {
        if (!f) return subirLocal(loc, null).then(function () { setEstado('Subida inicial hecha · ' + fecha(Date.now()), 'ok'); });
        var localCambio = !c.baseHash || loc.hash !== c.baseHash;
        var remotoCambio = !c.baseTime || f.modifiedTime !== c.baseTime;
        if (!localCambio && !remotoCambio) { setCfg({ ultima: Date.now() }); setEstado('Al día · ' + fecha(Date.now()), 'ok'); return; }
        if (localCambio && !remotoCambio) return subirLocal(loc, f).then(function () { setEstado('Cambios subidos · ' + fecha(Date.now()), 'ok'); });
        if (!localCambio && remotoCambio) {
          if (!opts.manual) {
            return preguntar('Hay datos más recientes en Drive', 'Otro dispositivo guardó cambios (' + fecha(f.modifiedTime) + '). ¿Cargarlos aquí? Se hará una copia de seguridad local antes.',
              [{ t: 'Cargar datos de Drive', cls: 'btn-primary', v: true }, { t: 'Ahora no', v: false }]).then(function (si) {
              if (si) return aplicarRemoto(f); setEstado('Hay cambios en Drive sin cargar', 'aviso');
            });
          }
          return aplicarRemoto(f);
        }
        // cambios en los dos lados (o primera conexión con datos en ambos)
        return preguntar('¿Qué datos conservar?',
          'Este dispositivo y Drive tienen datos distintos.\nDrive: ' + fecha(f.modifiedTime) + '\n\nLa opción elegida sustituye a la otra. Antes de cargar Drive se guarda una copia local.',
          [{ t: 'Usar los de este dispositivo (subir)', cls: 'btn-primary', v: 'local' }, { t: 'Usar los de Drive (descargar)', v: 'drive' }, { t: 'Cancelar', v: null }]).then(function (el) {
          if (el === 'local') return subirLocal(loc, f).then(function () { setEstado('Drive actualizado · ' + fecha(Date.now()), 'ok'); });
          if (el === 'drive') return aplicarRemoto(f);
          setEstado('Sincronización cancelada', 'aviso');
        });
      });
    }).catch(function (e) {
      var m = String(e && e.message || e);
      if (!opts.manual && /popup|none|interaction|login|consent|denied|cancel|caduc|Sesión/i.test(m)) setEstado('Pulsa «Sincronizar ahora» para reconectar', 'aviso');
      else setEstado('No se pudo sincronizar: ' + m, 'error');
    }).then(function () {
      busy = false;
      try { pendiente = !!(cfg().activa && window.backupConstruir && snapLocal().hash !== cfg().baseHash); } catch (e) {}
      pintar();
    });
  }

  function conectar() { setCfg({ activa: true }); return sincronizar({ manual: true }).then(arrancarAuto); }
  function desconectar(sinPreguntar) {
    if (sinPreguntar !== true && !confirm('¿Desconectar Google Drive en este dispositivo?\n\nLos datos de este dispositivo no se borran. La copia en tu Drive tampoco.')) return;
    try { if (token && window.google) google.accounts.oauth2.revoke(token, function () {}); } catch (e) {}
    try { if (esNativo() && gsi) gsi.signOut(); } catch (e) {}
    token = null; tokenExp = 0;
    try { localStorage.removeItem(CFG_KEY); } catch (e) {}
    clearInterval(timer); timer = null;
    setEstado('', ''); pintar();
  }
  function arrancarAuto() {
    if (timer || !cfg().activa) return;
    timer = setInterval(function () { if (!document.hidden && token) sincronizar({ manual: false }); }, INTERVALO);
  }

  // ───────── interfaz (tarjeta bajo «Copia de seguridad») ─────────
  var tarjeta = null, pendiente = false;
  function calcPendiente() {   // ¿hay cambios locales sin subir? solo si la tarjeta se ve (evita trabajo inútil)
    try {
      if (!tarjeta || !tarjeta.offsetParent || !cfg().activa || busy || !window.backupConstruir) return;
      var p = snapLocal().hash !== cfg().baseHash;
      if (p !== pendiente) { pendiente = p; pintar(); }
    } catch (e) {}
  }
  function pintar() {
    if (!tarjeta) return;
    var c = cfg(), activa = !!c.activa;
    var col = { ok: '#15803D', error: '#B91C1C', aviso: '#B45309', info: '#475569' }[estado.tipo] || '#64748B';
    var ult = c.ultima ? 'Última sincronización: ' + hace(c.ultima) + ' (' + fecha(c.ultima) + ')' : (activa ? 'Aún sin sincronizar' : '');
    var pend = activa && pendiente ? '<div style="font-size:12px;margin-top:4px;color:#B45309">⚠️ Tienes cambios que aún no están en Drive (se suben solos o pulsa «Sincronizar ahora»).</div>' : '';
    tarjeta.innerHTML =
      '<div class="card-title">☁️ Sincronizar con Google Drive</div>' +
      '<p style="font-size:12px;color:#64748B;margin-bottom:10px">Opcional. Guarda una copia en una carpeta oculta de <b>tu</b> Google Drive para ver lo mismo en tu móvil, tablet u ordenador. Nadie más la ve. Sin esto, la app sigue guardando solo en este dispositivo.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      (activa
        ? '<button class="btn btn-primary btn-sm" data-a="sync"' + (busy ? ' disabled' : '') + '>🔄 Sincronizar ahora</button><button class="btn btn-ghost btn-sm" data-a="ver"' + (busy ? ' disabled' : '') + '>🕓 Versiones anteriores</button><button class="btn btn-ghost btn-sm" data-a="off">Desconectar</button>'
        : '<button class="btn btn-primary btn-sm" data-a="on">☁️ Conectar con Google Drive</button>') +
      '</div>' +
      '<div style="font-size:12px;margin-top:8px;color:' + col + '">' + (estado.texto || ult) + '</div>' +
      (estado.texto && ult ? '<div style="font-size:12px;margin-top:2px;color:#64748B">' + ult + '</div>' : '') + pend;
    tarjeta.querySelectorAll('button[data-a]').forEach(function (b) {
      b.onclick = function () { var a = b.getAttribute('data-a'); if (a === 'on') conectar(); else if (a === 'sync') sincronizar({ manual: true }); else if (a === 'ver') restaurarVersion(); else desconectar(); };
    });
  }
  function montar() {
    if (tarjeta) return true;
    var btn = document.querySelector('button[onclick="backupCompleto()"]');
    var bloque = btn && btn.closest('div[style*="margin-top:20px"]');
    if (!bloque || !bloque.parentNode) return false;
    tarjeta = document.createElement('div');
    tarjeta.id = 'et-sync-drive';
    tarjeta.style.cssText = 'margin-top:20px;padding-top:16px;border-top:1px solid #E2E8F0';
    bloque.parentNode.insertBefore(tarjeta, bloque.nextSibling);
    pintar(); return true;
  }

  function iniciar() {
    var c = cfg();
    if (c.rebase) { try { setCfg({ baseHash: snapLocal().hash, rebase: false }); } catch (e) {} } // tras cargar datos de Drive
    var intentos = 0, t = setInterval(function () { if (montar() || ++intentos > 40) clearInterval(t); }, 500);
    setInterval(function () { if (tarjeta && tarjeta.offsetParent && cfg().activa) { calcPendiente(); pintar(); } }, 30000);   // refresca «hace X min» y los cambios pendientes
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && cfg().activa && token) sincronizar({ manual: false });
    });
    document.addEventListener('et-desbloqueado', function () { if (cfg().activa) setTimeout(function () { sincronizar({ manual: false }); }, 800); });
    if (c.activa) { arrancarAuto(); setTimeout(function () { sincronizar({ manual: false }); }, 3000); }
  }

  var listo = window.EtStore && window.EtStore.ready ? window.EtStore.ready : Promise.resolve();
  Promise.resolve(listo).then(function () { setTimeout(iniciar, 1500); });
  window.EtSync = {
    sincronizar: sincronizar, conectar: conectar, desconectar: desconectar, _hash: hash,
    activa: function () { return !!cfg().activa; },
    antesDeResetear: function () { if (cfg().activa) desconectar(true); },   // evita que tras resetear se suban datos vacíos a Drive
    restaurarVersion: restaurarVersion
  };
})();
