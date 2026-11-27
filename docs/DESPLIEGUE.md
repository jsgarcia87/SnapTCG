# Lanzamiento en servidor propio

Todo lo que depende del dominio o de credenciales tuyas está preparado en el repositorio y **sin aplicar**. Orden recomendado:

## 0. Antes de nada (en el código)
- [ ] Pon tu email de contacto en `privacidad.html` y `borrar-cuenta.html` (busca `[EMAIL DE CONTACTO]`).
- [ ] Decide si sustituyes la Poké Ball y el símbolo de planeswalker por iconos propios (riesgo de rechazo en Play; ver `PLAY_STORE.md`).
- [ ] Fusiona la rama a `main`.

## 1. Servidor
- [ ] Dominio con **HTTPS** (la cámara, el service worker y Android lo exigen). Mejor en la raíz del dominio o subdominio (p. ej. `kardlume.tudominio.com`) que en un subdirectorio.
- [ ] `bash scripts/build-dist.sh` → genera `dist/` solo con los archivos públicos (sin docs, scripts, SQL ni skills).
- [ ] Sube el **contenido** de `dist/` a la raíz web (incluye `.htaccess` y `.well-known/`, que son carpetas/archivos ocultos: actívalos en tu cliente FTP).
- [ ] **Apache**: el `.htaccess` ya fuerza HTTPS, pone las cabeceras de seguridad (CSP con `frame-ancestors`, HSTS, permisos de cámara) y evita que se queden en caché el HTML, el service worker y el manifiesto. **Nginx**: usa `deploy/nginx.conf` como base.
- [ ] Comprueba: `https://TU-DOMINIO/` abre, `https://TU-DOMINIO/manifest.webmanifest` responde con `application/manifest+json`, y en Chrome (móvil) aparece «Instalar app».

## 2. Supabase
- [ ] Cuenta en un proveedor de correo transaccional (Resend, Brevo…) con tu dominio verificado como remitente.
- [ ] Token personal en Supabase (Account → Access Tokens). Bórralo al terminar.
- [ ] Aplica todo de una vez (primero en modo prueba):
  ```bash
  export SUPABASE_ACCESS_TOKEN=…  APP_URL=https://TU-DOMINIO/
  export SMTP_HOST=…  SMTP_PORT=465  SMTP_USER=…  SMTP_PASS=…  SMTP_FROM=hola@TU-DOMINIO
  DRY_RUN=1 bash scripts/supabase-go-live.sh   # muestra lo que hará
  bash scripts/supabase-go-live.sh             # lo aplica (pide confirmación)
  ```
  Cambia: URL del sitio y redirecciones del enlace mágico, SMTP y límite de correos, plantillas en español (`supabase/templates/`) y **abre los registros**.
- [ ] Crea una cuenta de prueba desde `https://TU-DOMINIO/#cuenta`, comprueba que llega el correo en español y que el enlace vuelve a la app. Bórrala después desde la app (prueba el borrado).
- [ ] Tu colección: ya no hay una colección pública por defecto. Si quieres compartirla, activa «Colección pública» en tu cuenta y usa el enlace que te da la app.

Ya aplicado en Supabase (compatible con la versión actual de GitHub Pages): tablas `watchlist`, `collection_cost` y `profiles`, colección privada por defecto (la tuya marcada como pública para que tu enlace actual siga funcionando) y la función de borrado de cuenta. Los registros siguen **cerrados** hasta el paso anterior.

## 3. Google Play
Sigue `docs/PLAY_STORE.md` con la URL de tu dominio: PWABuilder → rellena `deploy/assetlinks.json` con las huellas → vuelve a ejecutar `build-dist.sh` y sube `dist/.well-known/assetlinks.json` → prueba el APK → prueba cerrada → producción.

## Cada versión nueva
1. Sube `CACHE` en `sw.js` (p. ej. `kardlume-v3.19.0`).
2. `bash scripts/build-dist.sh` y sube `dist/`.
3. El AAB de Play solo se vuelve a generar si cambian el icono, el nombre, los colores del manifiesto o el paquete.

## GitHub Pages
Mientras tanto, `https://jsgarcia87.github.io/SnapTCG/` sigue sirviendo lo que haya en `main`. Cuando el servidor propio esté listo, puedes desactivar Pages (Settings → Pages) o dejarlo como copia. El trabajo diario de precios (GitHub Actions) no depende de dónde esté alojada la web.
