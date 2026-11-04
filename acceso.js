/* Acceso: bloqueo opcional con contraseña propia + entrada directa como Manager.
 * Módulo independiente: no modifica el código de la app. Si no activas la contraseña, la app abre directamente.
 * Protección BÁSICA contra curiosos si te cogen el móvil. No cifra los datos: la verdadera protección es el bloqueo del móvil. */
(function () {
  'use strict';
  var LECTURA = !!window.ET_LECTURA;
  var K_LOCK = 'et_lock', K_PROMPT = 'et_lock_prompt', K_FAIL = 'et_lock_fail';
  var SEGUNDOS_SEGUNDO_PLANO = 60;   // vuelve a pedir la contraseña si la app estuvo >1 min en segundo plano
  var ITER = 150000, MIN_LEN = 4;
  var overlay = null, hiddenAt = 0;

  // ───────── utilidades ─────────
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function jget(k) { try { return JSON.parse(ls(k) || 'null'); } catch (e) { return null; } }
  function cfg() { var c = jget(K_LOCK); return c && c.hash && c.salt ? c : null; }
  function disponible() { return !!(window.crypto && crypto.subtle && window.TextEncoder); }
  function toast(m) { try { if (typeof window.toast === 'function') window.toast(m); } catch (e) {} }
  function b64e(u8) { var s = ''; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function b64d(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function derivar(pass, salt, iter) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']).then(function (k) {
      return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: b64d(salt), iterations: iter, hash: 'SHA-256' }, k, 256);
    }).then(function (bits) { return b64e(new Uint8Array(bits)); });
  }
  function crearCfg(pass) {
    var salt = b64e(crypto.getRandomValues(new Uint8Array(16)));
    return derivar(pass, salt, ITER).then(function (h) { return { v: 1, salt: salt, iter: ITER, hash: h }; });
  }
  function verificar(pass, c) { return derivar(pass, c.salt, c.iter).then(function (h) { return h === c.hash; }); }
  function espera() { var f = jget(K_FAIL) || {}; return Math.max(0, Math.ceil(((f.hasta || 0) - Date.now()) / 1000)); }
  function fallo() {
    var f = jget(K_FAIL) || {}; f.n = (f.n || 0) + 1;
    if (f.n % 5 === 0) f.hasta = Date.now() + 30000 * Math.min(8, f.n / 5);
    lsSet(K_FAIL, JSON.stringify(f));
  }
  function nodo(css, html) { var d = document.createElement('div'); d.style.cssText = css; if (html) d.innerHTML = html; return d; }
  var BASE = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';
  var CAJA = 'background:#fff;border-radius:16px;max-width:380px;width:100%;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.35);';
  var INP = 'width:100%;box-sizing:border-box;border:1px solid #CBD5E1;border-radius:10px;padding:11px 12px;font-size:15px;margin-top:10px;';
  var BTN = 'border:none;border-radius:10px;padding:11px 14px;font-size:14px;font-weight:700;cursor:pointer;width:100%;margin-top:10px;';

  // ───────── pantalla de bloqueo ─────────
  function bloquear() {
    var c = cfg();
    if (LECTURA || !c || overlay || !disponible()) return;
    overlay = nodo(BASE + 'z-index:2147483000;background:linear-gradient(135deg,#0F2846,#1E3A5F)');
    var caja = nodo(CAJA);
    caja.innerHTML =
      '<div style="font-size:34px;text-align:center">🔒</div>' +
      '<div style="font-weight:800;font-size:18px;color:#1E3A5F;text-align:center;margin-top:4px">Entrenamiento Total</div>' +
      '<div style="font-size:13px;color:#64748B;text-align:center;margin-top:2px">Introduce tu contraseña para abrir la app</div>' +
      '<input type="password" autocomplete="current-password" placeholder="Contraseña" style="' + INP + '">' +
      '<div class="msg" style="color:#B91C1C;font-size:13px;margin-top:8px;min-height:18px"></div>' +
      '<button class="entrar" style="' + BTN + 'background:#1E3A5F;color:#fff">Entrar</button>' +
      (LECTURA ? '' : '<button class="olvido" style="' + BTN + 'background:none;color:#64748B;font-weight:600;font-size:12px;margin-top:2px">He olvidado la contraseña</button>');
    overlay.appendChild(caja);
    document.body.appendChild(overlay);
    var inp = caja.querySelector('input'), msg = caja.querySelector('.msg'), ok = caja.querySelector('.entrar');
    function intentar() {
      var w = espera();
      if (w > 0) { msg.textContent = 'Demasiados intentos. Espera ' + w + ' s.'; return; }
      ok.disabled = true;
      verificar(inp.value, c).then(function (bien) {
        ok.disabled = false;
        if (bien) { lsDel(K_FAIL); overlay.remove(); overlay = null; return; }
        fallo(); inp.value = ''; inp.focus();
        var w2 = espera(); msg.textContent = w2 > 0 ? 'Demasiados intentos. Espera ' + w2 + ' s.' : 'Contraseña incorrecta';
      }).catch(function () { ok.disabled = false; msg.textContent = 'No se pudo comprobar la contraseña'; });
    }
    ok.onclick = intentar;
    inp.onkeydown = function (e) { if (e.key === 'Enter') intentar(); };
    var ol = caja.querySelector('.olvido'); if (ol) ol.onclick = olvido;
    setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);
  }
  // Olvidar la contraseña = borrar los datos de ESTE dispositivo (si no, quien coja el móvil podría saltarse el bloqueo).
  function olvido() {
    if (!confirm('¿Has olvidado la contraseña?\n\nPara proteger los datos, se BORRARÁN los datos de este dispositivo y se quitará la contraseña.\nPodrás recuperarlos desde Google Drive o desde una copia de seguridad.\n\n¿Continuar?')) return;
    if (!confirm('Última confirmación: se borrarán todos los datos de la app en este dispositivo. ¿Seguro?')) return;
    var E = window.EtStore;
    if (!E || !E.borrarDatos || !E.state || E.state.mode !== 'idb') { alert('No se pudo borrar de forma segura en este dispositivo. No se ha cambiado nada.'); return; }
    Promise.resolve(E.borrarDatos()).then(function () {
      lsDel(K_LOCK); lsDel(K_FAIL); lsDel('et_sync_cfg'); lsDel('bib_role');   // se desconecta Drive para no subir datos vacíos
      location.reload();
    }).catch(function () { alert('No se pudo borrar. No se ha cambiado nada.'); });
  }

  // ───────── ventanas para crear / cambiar / quitar ─────────
  function ventana(titulo, texto, campos, textoOk, alOk, textoNo) {
    var o = nodo(BASE + 'z-index:2147482000;background:rgba(15,23,42,.6)'), c = nodo(CAJA);
    c.innerHTML = '<div style="font-weight:800;font-size:17px;color:#1E3A5F"></div><div class="t" style="font-size:13px;color:#475569;margin-top:6px;white-space:pre-line"></div>';
    c.children[0].textContent = titulo; c.children[1].textContent = texto;
    var ins = campos.map(function (ph) { var i = document.createElement('input'); i.type = 'password'; i.placeholder = ph; i.style.cssText = INP; i.autocomplete = 'new-password'; c.appendChild(i); return i; });
    var msg = nodo('color:#B91C1C;font-size:13px;margin-top:8px;min-height:18px'); c.appendChild(msg);
    var ok = document.createElement('button'); ok.textContent = textoOk; ok.style.cssText = BTN + 'background:#1E3A5F;color:#fff';
    var no = document.createElement('button'); no.textContent = textoNo || 'Cancelar'; no.style.cssText = BTN + 'background:#F1F5F9;color:#334155';
    c.appendChild(ok); c.appendChild(no); o.appendChild(c); document.body.appendChild(o);
    function cerrar() { o.remove(); }
    no.onclick = function () { cerrar(); if (alOk && alOk.cancelar) alOk.cancelar(); };
    ok.onclick = function () {
      ok.disabled = true;
      Promise.resolve(alOk(ins.map(function (i) { return i.value; }), function (m) { msg.textContent = m; ok.disabled = false; })).then(function (res) { if (res === true) cerrar(); else ok.disabled = false; });
    };
    if (ins[0]) setTimeout(function () { try { ins[0].focus(); } catch (e) {} }, 50);
  }
  var AVISO = 'Si te olvidas de la contraseña, la única forma de volver a entrar es borrar los datos de este dispositivo (podrás recuperarlos desde Google Drive o una copia de seguridad).\nEs una protección básica: no sustituye al bloqueo de pantalla del móvil.';
  function crearPass(alTerminar) {
    ventana('🔒 Crear contraseña', AVISO, ['Contraseña (mínimo ' + MIN_LEN + ' caracteres)', 'Repite la contraseña'], 'Guardar contraseña', function (v, err) {
      if (v[0].length < MIN_LEN) { err('Usa al menos ' + MIN_LEN + ' caracteres'); return false; }
      if (v[0] !== v[1]) { err('Las contraseñas no coinciden'); return false; }
      return crearCfg(v[0]).then(function (c) { lsSet(K_LOCK, JSON.stringify(c)); lsSet(K_PROMPT, '1'); toast('🔒 Contraseña activada'); if (alTerminar) alTerminar(); return true; });
    });
  }
  function cambiarPass() {
    var c = cfg(); if (!c) return;
    ventana('Cambiar contraseña', '', ['Contraseña actual', 'Nueva contraseña (mínimo ' + MIN_LEN + ' caracteres)', 'Repite la nueva contraseña'], 'Cambiar', function (v, err) {
      if (v[1].length < MIN_LEN) { err('Usa al menos ' + MIN_LEN + ' caracteres'); return false; }
      if (v[1] !== v[2]) { err('Las contraseñas nuevas no coinciden'); return false; }
      return verificar(v[0], c).then(function (b) {
        if (!b) { err('La contraseña actual no es correcta'); return false; }
        return crearCfg(v[1]).then(function (n) { lsSet(K_LOCK, JSON.stringify(n)); toast('🔒 Contraseña cambiada'); pintar(); return true; });
      });
    });
  }
  function quitarPass() {
    var c = cfg(); if (!c) return;
    ventana('Quitar contraseña', 'La app volverá a abrirse sin pedir contraseña.', ['Contraseña actual'], 'Quitar contraseña', function (v, err) {
      return verificar(v[0], c).then(function (b) {
        if (!b) { err('La contraseña no es correcta'); return false; }
        lsDel(K_LOCK); lsDel(K_FAIL); toast('Contraseña quitada'); pintar(); return true;
      });
    });
  }

  // ───────── tarjeta en Club ─────────
  var tarjeta = null;
  function pintar() {
    if (!tarjeta) return;
    var c = cfg();
    tarjeta.innerHTML = '<div class="card-title">🔒 Bloqueo con contraseña</div>' +
      '<p style="font-size:12px;color:#64748B;margin-bottom:10px">' + (disponible()
        ? 'Opcional. Pide tu contraseña al abrir la app (y al volver tras más de un minuto en segundo plano), por si alguien coge tu móvil. Es una protección básica: usa también el bloqueo de pantalla del móvil.'
        : 'No disponible en este navegador (necesita una conexión segura).') + '</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' + (!disponible() ? '' : (c
        ? '<button class="btn btn-primary btn-sm" data-a="cambiar">Cambiar contraseña</button><button class="btn btn-ghost btn-sm" data-a="quitar">Quitar contraseña</button>'
        : '<button class="btn btn-primary btn-sm" data-a="crear">🔒 Crear contraseña</button>')) + '</div>';
    tarjeta.querySelectorAll('button[data-a]').forEach(function (b) {
      b.onclick = function () { var a = b.getAttribute('data-a'); if (a === 'crear') crearPass(pintar); else if (a === 'cambiar') cambiarPass(); else quitarPass(); };
    });
  }
  function montar() {
    if (tarjeta) return true;
    var btn = document.querySelector('button[onclick*="resetAll"]');
    var bloque = btn && btn.closest('div[style*="margin-top:20px"]');
    if (!bloque || !bloque.parentNode) return false;
    tarjeta = nodo('margin-top:20px;padding-top:16px;border-top:1px solid #E2E8F0');
    tarjeta.id = 'et-acceso';
    bloque.parentNode.insertBefore(tarjeta, bloque);
    pintar(); return true;
  }

  // ───────── entrada directa y limpieza de la pantalla de roles ─────────
  function entradaDirecta() {
    try {
      var h = document.querySelectorAll('#login-step1 div');
      for (var i = 0; i < h.length; i++) if (/contraseña por defecto/i.test(h[i].textContent)) h[i].remove();   // quita el aviso del «1234»
    } catch (e) {}
    if (LECTURA) return;
    try {
      if (typeof currentRole !== 'undefined' && !currentRole) {   // primera vez: entra como Manager (cada uno manda sobre su propia copia)
        currentRole = 'manager';
        window.EtStore.setItem('bib_role', 'manager');
        if (typeof applyRole === 'function') applyRole();
        var o = document.getElementById('login-overlay'); if (o) o.style.display = 'none';
      }
    } catch (e) { console.error('[acceso]', e); }
  }

  function iniciar() {
    entradaDirecta();
    if (!LECTURA) { var n = 0, t = setInterval(function () { if (montar() || ++n > 40) clearInterval(t); }, 500); }
    if (!LECTURA && disponible() && !cfg() && !ls(K_PROMPT)) {
      setTimeout(function () {
        if (cfg() || ls(K_PROMPT)) return;
        var f = function () { lsSet(K_PROMPT, '1'); crearPass(pintar); return true; };
        f.cancelar = function () { lsSet(K_PROMPT, '1'); };   // «Ahora no»: no vuelve a preguntar
        ventana('¿Proteger la app con contraseña?', 'Si alguien coge tu móvil, no podrá abrir la app sin ella. Es opcional y puedes activarlo luego en Club.', [], 'Crear contraseña', f, 'Ahora no');
      }, 1500);
    }
  }

  // El bloqueo se pone nada más cargar, antes de que la app se pinte
  bloquear();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > SEGUNDOS_SEGUNDO_PLANO * 1000) { hiddenAt = 0; bloquear(); }
  });
  var listo = window.EtStore && window.EtStore.ready ? window.EtStore.ready : Promise.resolve();
  Promise.resolve(listo).then(function () { setTimeout(iniciar, 1200); });
  window.EtAcceso = { bloquear: bloquear, _cfg: cfg };
})();
