/* Compartir en solo lectura + modo lectura aislado.
 * - Normal: botón «Compartir solo lectura» (Club) que genera un archivo SIN teléfonos, fechas de nacimiento, notas ni evaluaciones.
 * - Modo lectura (?lectura=1): usa una base de datos APARTE (nunca toca tus datos), carga el archivo y bloquea toda escritura.
 * Módulo independiente: no modifica el código de la app. */
(function () {
  'use strict';
  var LECTURA = !!window.ET_LECTURA;
  var META = 'et_lectura_meta';
  var E = window.EtStore;
  var permitir = false, avisadoEn = 0;

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function toast(m) { try { if (typeof window.toast === 'function') window.toast(m); else console.log(m); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function nodo(css, html) { var d = document.createElement('div'); if (css) d.style.cssText = css; if (html) d.innerHTML = html; return d; }
  function fechaCorta(t) { try { return new Date(t).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch (e) { return ''; } }
  function enlace() { try { return new URL('./?lectura=1', location.href).href; } catch (e) { return location.origin + '/?lectura=1'; } }

  // ───────── MODO LECTURA: bloquear toda escritura ─────────
  var ORIG = {};
  if (LECTURA && E) {
    ['setItem', 'removeItem', 'putBlob', 'delBlob', 'borrarDatos', 'restaurarCopia'].forEach(function (n) {
      if (typeof E[n] !== 'function') return;
      ORIG[n] = E[n];
      E[n] = function () {
        if (permitir) return ORIG[n].apply(E, arguments);
        if (Date.now() - avisadoEn > 3000) { avisadoEn = Date.now(); toast('👁️ Modo lectura: los cambios no se guardan'); }
        return (n === 'putBlob' || n === 'delBlob' || n === 'borrarDatos' || n === 'restaurarCopia') ? Promise.resolve() : undefined;
      };
    });
  }

  // ───────── MODO LECTURA: cargar archivo ─────────
  function importar(file) {
    return file.text().then(function (txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { throw new Error('El archivo no es válido.'); }
      if (!d || d.app !== 'EntrenamientoTotal' || !d.datos) throw new Error('Este archivo no es de Entrenamiento Total.');
      if (d.tipo !== 'lectura') throw new Error('Este archivo es una copia de seguridad completa, no un archivo de solo lectura.\nPide al entrenador que use «Compartir solo lectura».');
      permitir = true;
      return Promise.resolve(ORIG.borrarDatos ? ORIG.borrarDatos.call(E) : null).then(function () {
        window.backupAplicar(d);
        return E.flush();
      }).then(function () {
        lsSet(META, JSON.stringify({ fecha: d.fecha, club: (d.datos.club || {}).nombre || '', cargado: Date.now() }));
        permitir = false;
        location.reload();
      });
    }).catch(function (e) { permitir = false; throw e; });
  }
  function pedirArchivo(obligatorio) {
    var o = nodo('position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;padding:16px;background:' + (obligatorio ? 'linear-gradient(135deg,#0F2846,#1E3A5F)' : 'rgba(15,23,42,.6)') + ';font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif');
    var c = nodo('background:#fff;border-radius:16px;max-width:400px;width:100%;padding:22px;box-shadow:0 10px 40px rgba(0,0,0,.35)');
    c.innerHTML = '<div style="font-size:32px;text-align:center">👁️</div>' +
      '<div style="font-weight:800;font-size:18px;color:#1E3A5F;text-align:center">Modo solo lectura</div>' +
      '<div style="font-size:13px;color:#475569;margin-top:8px;text-align:center">Abre el archivo que te ha enviado el entrenador para ver sus datos. No podrás modificar nada y tus propios datos no se tocan.</div>' +
      '<label style="display:block;margin-top:14px;text-align:center"><span style="display:block;background:#1E3A5F;color:#fff;border-radius:10px;padding:12px;font-weight:700;cursor:pointer">📂 Elegir archivo</span>' +
      '<input type="file" style="display:none"></label>' +
      '<div class="msg" style="color:#B91C1C;font-size:13px;margin-top:10px;white-space:pre-line;text-align:center"></div>' +
      (obligatorio ? '' : '<button class="cerrar" style="margin-top:8px;width:100%;border:none;background:#F1F5F9;color:#334155;border-radius:10px;padding:10px;font-weight:600;cursor:pointer">Cancelar</button>');
    o.appendChild(c); document.body.appendChild(o);
    var inp = c.querySelector('input'), msg = c.querySelector('.msg');
    inp.onchange = function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      msg.style.color = '#475569'; msg.textContent = 'Cargando…';
      importar(f).catch(function (e) { msg.style.color = '#B91C1C'; msg.textContent = e && e.message ? e.message : 'No se pudo cargar el archivo.'; inp.value = ''; });
    };
    var cr = c.querySelector('.cerrar'); if (cr) cr.onclick = function () { o.remove(); };
  }

  function iniciarLectura() {
    var css = document.createElement('style');
    css.textContent =
      'body.modo-lectura input:not([type=search]):not([type=file]):not([type=checkbox]):not([type=radio]),body.modo-lectura textarea{pointer-events:none;background:#F8FAFC}' +
      '#et-lectura-banner{background:#FEF3C7;color:#92400E;font:600 13px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:8px 12px;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;text-align:center}' +
      '#et-lectura-banner button{border:1px solid #D97706;background:#fff;color:#92400E;border-radius:8px;padding:4px 10px;font-weight:700;cursor:pointer;font-size:12px}';
    document.head.appendChild(css);
    document.body.classList.add('modo-lectura');
    try {
      if (typeof currentRole !== 'undefined') { currentRole = 'coach'; if (typeof applyRole === 'function') applyRole(); }
      var lo = document.getElementById('login-overlay'); if (lo) lo.style.display = 'none';
      var badge = document.getElementById('role-badge'); if (badge) { badge.textContent = '👁️ Solo lectura'; badge.onclick = null; badge.removeAttribute('onclick'); }
    } catch (e) { console.error('[lectura]', e); }
    // sin copias, reset ni nada que escriba o comparta
    ['button[onclick="backupCompleto()"]', 'button[onclick*="resetAll"]'].forEach(function (q) {
      var b = document.querySelector(q), blk = b && b.closest('div[style*="margin-top:20px"]'); if (blk) blk.style.display = 'none';
    });
    var m = null; try { m = JSON.parse(ls(META) || 'null'); } catch (e) {}
    var ban = nodo('', '');
    ban.id = 'et-lectura-banner';
    ban.innerHTML = '<span>👁️ Modo lectura' + (m ? ' · datos de <b>' + esc(m.club || 'tu entrenador') + '</b> del ' + esc(fechaCorta(m.fecha)) : '') + ' · no se puede modificar nada</span><button>Cargar archivo nuevo</button>';
    ban.querySelector('button').onclick = function () { pedirArchivo(false); };
    document.body.insertBefore(ban, document.body.firstChild);
    if (!m) pedirArchivo(true);
  }

  // ───────── NORMAL: compartir solo lectura ─────────
  function vaciaEval(ev) { var o = {}; Object.keys(ev || {}).forEach(function (p) { o[p] = {}; Object.keys(ev[p] || {}).forEach(function (h) { o[p][h] = 0; }); }); return o; }
  function sinNotas(o) { return Object.assign({}, o, { notas: '' }); }
  function construir(op) {
    var full = window.backupConstruir(), x = full.datos || {}, a = full.almacen || {};
    var d = { app: 'EntrenamientoTotal', version: 1, tipo: 'lectura', fecha: new Date().toISOString(),
      datos: { club: x.club, jugadores: [], sesiones: [], partidos: [], biblioteca: [], juegos: [], asistencia: {}, ses_libres: [], pizarra_boards: [], festivos: [] },
      almacen: {} };
    if (a.clubLogo) d.almacen.clubLogo = a.clubLogo;
    if (op.plantilla) d.datos.jugadores = (x.jugadores || []).map(function (j) {
      return { id: j.id, nombre: j.nombre, posicion: j.posicion, dorsal: j.dorsal, pierna: j.pierna, activo: j.activo !== false,
        telefono1: '', telefono2: '', fechaNacimiento: '', notas: '', evaluaciones: vaciaEval(j.evaluaciones) };
    });
    if (op.sesiones) {
      d.datos.sesiones = (x.sesiones || []).map(sinNotas);
      d.datos.ses_libres = (x.ses_libres || []).map(sinNotas);
      d.datos.festivos = x.festivos || [];
      Object.keys(a).forEach(function (k) { if (/^sf\d+_sesiones_v1$/.test(k)) d.almacen[k] = a[k]; });
    }
    if (op.partidos) d.datos.partidos = (x.partidos || []).map(sinNotas);
    if (op.ejercicios) { d.datos.biblioteca = x.biblioteca || []; d.datos.juegos = x.juegos || []; }
    if (op.pizarras) { d.datos.pizarra_boards = x.pizarra_boards || []; if (a.pizarra_v2) d.almacen.pizarra_v2 = a.pizarra_v2; if (a.pizarra_boards) d.almacen.pizarra_boards = a.pizarra_boards; }
    return d;
  }
  function slug(s) { return String(s || 'club').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'club'; }
  function copiar(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { toast('🔗 Enlace copiado'); }); } catch (e) {}
    try { var i = document.createElement('input'); i.value = t; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); toast('🔗 Enlace copiado'); } catch (e) { prompt('Copia este enlace:', t); }
  }
  function descargar(nombre, json) {
    if (typeof etEntregar === 'function' && typeof etB64Texto === 'function') { etEntregar(nombre, 'application/json', etB64Texto(json)); return; }
    var u = URL.createObjectURL(new Blob([json], { type: 'application/json' })), a = document.createElement('a');
    a.href = u; a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
  }
  function compartir(op) {
    var d = construir(op), json = JSON.stringify(d);
    var nombre = 'lectura_' + slug((d.datos.club || {}).nombre) + '_' + new Date().toISOString().slice(0, 10) + '.json';
    var texto = 'Para ver mis datos en modo lectura: 1) abre este enlace, 2) elige el archivo adjunto.\n' + enlace();
    try {
      var f = new File([json], nombre, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        return navigator.share({ files: [f], title: 'Entrenamiento – solo lectura', text: texto }).catch(function (e) {
          if (!e || e.name !== 'AbortError') { descargar(nombre, json); toast('📄 Archivo listo. Envíalo junto con el enlace.'); }
        });
      }
    } catch (e) {}
    descargar(nombre, json);
    toast('📄 Archivo listo. Envíalo junto con el enlace.');
    return Promise.resolve();
  }
  var tarjeta = null;
  function pintar() {
    var chk = function (id, t, on, extra) { return '<label style="display:block;font-size:13px;margin:5px 0"><input type="checkbox" id="et-l-' + id + '"' + (on ? ' checked' : '') + '> ' + t + (extra ? ' <span style="color:#94A3B8">' + extra + '</span>' : '') + '</label>'; };
    tarjeta.innerHTML = '<div class="card-title">👁️ Compartir solo lectura</div>' +
      '<p style="font-size:12px;color:#64748B;margin-bottom:8px">Para que un ayudante vea tus datos sin poder modificarlos. Es una <b>foto de hoy</b>: si cambias algo, vuelve a compartir. <b>Nunca incluye</b> teléfonos, fechas de nacimiento, notas ni evaluaciones.</p>' +
      chk('plantilla', 'Plantilla', true, '(nombre, posición y dorsal)') + chk('sesiones', 'Sesiones y calendario', true) + chk('partidos', 'Partidos', true) + chk('ejercicios', 'Ejercicios y juegos', true) + chk('pizarras', 'Pizarras', false) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn btn-primary btn-sm" data-a="share">📤 Compartir</button><button class="btn btn-ghost btn-sm" data-a="link">🔗 Copiar enlace de lectura</button></div>' +
      '<div style="font-size:11px;color:#94A3B8;margin-top:8px">Quien reciba el archivo tendrá esos datos en su dispositivo: compártelo solo con personas de confianza.</div>';
    var get = function (id) { var i = tarjeta.querySelector('#et-l-' + id); return !!(i && i.checked); };
    tarjeta.querySelector('[data-a=share]').onclick = function () {
      compartir({ plantilla: get('plantilla'), sesiones: get('sesiones'), partidos: get('partidos'), ejercicios: get('ejercicios'), pizarras: get('pizarras') })
        .catch(function (e) { console.error(e); alert('No se pudo preparar el archivo: ' + (e && e.message ? e.message : e)); });
    };
    tarjeta.querySelector('[data-a=link]').onclick = function () { copiar(enlace()); };
  }
  function montar() {
    if (tarjeta) return true;
    var btn = document.querySelector('button[onclick*="resetAll"]'), blk = btn && btn.closest('div[style*="margin-top:20px"]');
    if (!blk || !blk.parentNode) return false;
    tarjeta = nodo('margin-top:20px;padding-top:16px;border-top:1px solid #E2E8F0'); tarjeta.id = 'et-lectura';
    blk.parentNode.insertBefore(tarjeta, blk); pintar(); return true;
  }

  function iniciar() {
    if (LECTURA) { iniciarLectura(); return; }
    var n = 0, t = setInterval(function () { if (montar() || ++n > 40) clearInterval(t); }, 500);
  }
  var listo = E && E.ready ? E.ready : Promise.resolve();
  Promise.resolve(listo).then(function () { setTimeout(iniciar, LECTURA ? 400 : 1400); });
  window.EtLectura = { construir: construir, importar: importar };
})();
