# Entrenamiento Local — BETA (IndexedDB)

**Enlace de la beta:** https://entrenadormanuel68-png.github.io/Entrenamiento-local-beta/

Versión de pruebas de `Entrenamiento-local` con almacenamiento ampliado (localForage / IndexedDB), sin el límite de ~5 MB de `localStorage`.

## Qué hace distinto
- Guarda los datos en IndexedDB (base `entrenamiento_total_beta`), separada de la de producción.
- La primera vez copia los datos antiguos de `localStorage` sin borrarlos ni modificarlos y los verifica antes de usarlos.
- Si IndexedDB falla, la app sigue funcionando con el almacenamiento antiguo.
- El medidor de espacio de Biblioteca usa la cuota real del navegador.
- Incluye la corrección de la pestaña Asistencia con datos importados de Firebase.

La app de producción (`Entrenamiento-local`) **no se ve afectada**.

## Antes de probar
1. En la app de producción, pulsa **Exportar JSON** y anota cuántos jugadores, partidos y ejercicios tienes.
2. Abre el enlace de la beta con internet.

## Lista de pruebas (en cada dispositivo)
- [ ] Abre la beta: aparece el aviso «Datos migrados al almacenamiento ampliado» y los recuentos coinciden con la producción.
- [ ] Edita un jugador, cierra la app del todo y reábrela: el cambio sigue ahí.
- [ ] Registra una asistencia (Campo) y compruébala en la pestaña Asistencia y en Resumen.
- [ ] Guarda una pizarra y un ejercicio; ciérralo todo y reábrelo.
- [ ] Sube o cambia el escudo.
- [ ] Biblioteca: el medidor de espacio muestra una cifra razonable.
- [ ] Exportar JSON e Importar JSON (copia de seguridad) funcionan.
- [ ] En iPhone/Safari: comprueba que no pierde datos al cerrar la app.

## Notas
- Los datos se guardan **en cada dispositivo**, no en la nube. Para llevarlos a otro, usa Exportar JSON e Importar JSON.
- La beta comparte el origen de GitHub Pages con las demás apps, por eso usa una base de datos propia.
- Si algo falla, anota el dispositivo, el navegador y qué ves en pantalla.
