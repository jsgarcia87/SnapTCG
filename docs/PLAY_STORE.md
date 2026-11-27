# Publicar Kard Lume en Google Play

Kard Lume es una web (HTML/CSS/JS sin compilar). Para Android se empaqueta como **Trusted Web Activity (TWA)**: una app nativa mínima que abre la web en Chrome a pantalla completa. La ventaja es que no hay que mantener dos versiones: cada vez que publicas la web, la app se actualiza sola. Solo hay que subir un AAB nuevo a Play si cambian el icono, el nombre o el paquete.

## Estado actual

| Requisito | Estado |
|---|---|
| Manifiesto de app (`manifest.webmanifest`) con nombre, colores, iconos normales y *maskable*, accesos directos | Hecho |
| Service worker (`sw.js`): la app abre sin conexión | Hecho y probado en Chromium |
| Instalable (sin errores de instalabilidad en Chrome) | Hecho y probado |
| Política de privacidad (`privacidad.html`) enlazada desde la app | Hecha. **Falta poner tu email de contacto** (busca `[EMAIL DE CONTACTO]`) |
| Aviso de marcas («no afiliada a…») en la app | Hecho |
| Icono de Play 512×512 (`store/play-icon-512.png`) | Hecho |
| Gráfico destacado 1024×500 (`store/feature-graphic-1024x500.png`) | Hecho |
| Capturas de pantalla | **Pendiente**: hazlas en tu móvil con datos reales (mínimo 2) |
| Verificación de dominio (Digital Asset Links) | **Pendiente**: ver el paso 3 |
| Cuentas para todos, colección privada por defecto, borrado de cuenta en la app y en la web | Hecho (v3.18) |
| Servidor de correo propio (SMTP) | **Pendiente**: ver «Bloqueante» |

## Modelo de cuentas (hecho en v3.18)

- **Sin sesión**: cada usuario guarda colección, seguimiento y mazos en su dispositivo.
- **Con cuenta** (cualquiera puede crearla con su email, sin contraseña): todo pasa a la nube. Al entrar, lo que había en el dispositivo se suma a la cuenta.
- **Privacidad**: la colección es **privada por defecto**. El usuario puede activar «Colección pública» y compartir el enlace `?u=<id>#coleccion`. El precio de compra nunca es público.
- **Borrado de cuenta** (obligatorio en Play): desde la app (Colección → Tu cuenta → Borrar mi cuenta) y la página web `borrar-cuenta.html`. Borra el usuario y todos sus datos en cascada.

## Bloqueante: servidor de correo propio (SMTP)

El inicio de sesión funciona con un enlace por email. Con el servidor de correo de Supabase, el proyecto **solo puede enviar 2 correos por hora en total**, para todos los usuarios. Para una app pública es imprescindible configurar un SMTP propio. Además, sin él Supabase no deja cambiar los textos del correo (siguen en inglés).

1. Crea una cuenta en un proveedor de correo transaccional (por ejemplo Resend o Brevo; ambos tienen plan gratuito) y verifica un dominio tuyo para el remitente.
2. En Supabase → **Authentication → Emails → SMTP Settings**, activa *Custom SMTP* y pega los datos del proveedor.
3. En **Authentication → Rate Limits**, sube el límite de correos por hora.
4. En **Authentication → Emails → Templates**, cambia *Magic Link* y *Confirm signup* al español con la marca Kard Lume.

## Riesgo de rechazo: marcas de terceros

La política de propiedad intelectual de Google Play puede rechazar o retirar apps que usen logos o marcas ajenas sin permiso. Kard Lume usa:

- **La Poké Ball y el símbolo de planeswalker** en los selectores de juego. Son logotipos de The Pokémon Company y Wizards of the Coast. Es el riesgo más claro: recomiendo cambiarlos por iconos propios en la versión de Play.
- **Imágenes de cartas** de TCGdex y Scryfall. Muchas apps de colección de Play hacen lo mismo, pero no es una garantía. Scryfall pide no cobrar por acceder a sus datos y no ocultar el copyright de las cartas.
- **Las palabras «Pokémon» y «Magic»** solo deben aparecer para describir la compatibilidad (en la descripción, no en el título ni en el icono).

No soy abogado: si piensas monetizar la app, consulta con alguien especializado en propiedad intelectual.

## Pasos

### 1. Cuenta de desarrollador
- Crea la cuenta en Google Play Console (pago único de 25 USD) y completa la verificación de identidad.
- **Cuentas personales nuevas**: según la política que conozco, antes de publicar en producción hay que hacer una **prueba cerrada con al menos 12 testers durante 14 días seguidos**. Compruébalo en Play Console: Google cambia estas reglas.

### 2. Generar el paquete Android con PWABuilder
1. Publica la web (GitHub Pages ya lo hace al fusionar a `main`).
2. Entra en **pwabuilder.com**, pega `https://jsgarcia87.github.io/SnapTCG/` y pulsa **Package for stores → Android**.
3. Opciones recomendadas:
   - **Package ID**: `es.sangarstudio.kardlume` (no se puede cambiar nunca después de publicar).
   - **App name**: `Kard Lume` · **Launcher name**: `Kard Lume`.
   - **Signing key**: «Create new». **Guarda el archivo `.keystore` y sus contraseñas en un sitio seguro** (gestor de contraseñas + copia offline). Si los pierdes no podrás actualizar la app con la misma firma.
4. Descarga el ZIP. Contiene el `.aab` (lo que se sube a Play), un `.apk` para probar en tu móvil y un `assetlinks.json`.

### 3. Verificar el dominio (Digital Asset Links)
Sin esto la app funciona, pero muestra una barra de navegador arriba, como si fuera una pestaña de Chrome.

El archivo debe estar en la **raíz del dominio**: `https://jsgarcia87.github.io/.well-known/assetlinks.json`. No vale dentro de `/SnapTCG/`. Opciones:

- **A. Repositorio de usuario de GitHub Pages**: crea un repositorio público llamado exactamente `jsgarcia87.github.io` con dos archivos: `.nojekyll` (vacío) y `.well-known/assetlinks.json`. Activa Pages en ese repositorio.
- **B. Dominio propio** (por ejemplo `kardlume.app` o `kardlume.sangar.studio`) apuntando a GitHub Pages. Queda mejor y no depende del nombre de usuario de GitHub. Si cambias de dominio, cambia también la URL de PWABuilder y la de redirección del inicio de sesión en Supabase.

Usa el `assetlinks.json` que te da PWABuilder. Si activas la **firma de apps de Google Play** (recomendado), añade también la huella SHA-256 que aparece en Play Console → *Integridad de la app → Firma de apps*. Hay una plantilla en `docs/assetlinks.example.json`.

### 4. Ficha de Play Store

**Nombre de la app** (máx. 30): `Kard Lume: colección TCG`

**Descripción breve** (máx. 80): `Escanea tus cartas, mira su precio y controla el valor de tu colección TCG.`

**Descripción completa:**

> Kard Lume es la forma rápida de saber cuánto vale tu colección de cartas coleccionables.
>
> ESCANEA
> Apunta con la cámara: Kard Lume lee el nombre y el número de la carta y busca la edición exacta. Todo el reconocimiento se hace en tu móvil; las fotos no salen de él.
>
> CONOCE SU PRECIO
> Precio de mercado con su fuente y fecha, tendencia de 7 y 30 días, histórico y enlaces para comprar o vender.
>
> CONTROLA TU COLECCIÓN
> • Valor total en euros, también de las cartas con precio en dólares.
> • Precio de compra y ganancia o pérdida por carta y en total.
> • Dónde está tu valor: por juego, edición, rareza e idioma.
> • Alertas cuando una carta alcanza tu precio objetivo o se mueve mucho.
> • Exporta e importa tu colección en CSV.
>
> CONSTRUYE MAZOS
> Editor con validación de formato (Standard y Commander), estadísticas y probabilidades de robo.
>
> Compatible con cartas de Pokémon TCG y Magic: The Gathering en varios idiomas.
>
> Sin anuncios y sin rastreo.
>
> Kard Lume es una aplicación independiente y no está afiliada, patrocinada ni aprobada por Nintendo, The Pokémon Company ni Wizards of the Coast. Pokémon y Magic: The Gathering son marcas de sus respectivos titulares. Datos de cartas: TCGdex y Scryfall.

**Categoría**: Herramientas (alternativa: Estilo de vida).
**Recursos gráficos**: icono `store/play-icon-512.png`, gráfico destacado `store/feature-graphic-1024x500.png`, y entre 2 y 8 capturas de móvil hechas con datos reales.
**Política de privacidad**: `https://jsgarcia87.github.io/SnapTCG/privacidad.html` (o la de tu dominio).

### 5. Seguridad de los datos (formulario de Play Console)
- ¿Recoge o comparte datos? **Sí**.
- **Información personal → Dirección de correo**: recogida, no compartida, **opcional** (solo si se crea una cuenta). Fines: *funcionalidad de la app* y *gestión de la cuenta*.
- **Actividad en la app → Otro contenido generado por el usuario** (colección, mazos, seguimiento, precio de compra): recogido, **opcional**, para *funcionalidad de la app*. Solo se hace visible para otros si el usuario activa «Colección pública».
- **Fotos y vídeos**: **no** se recogen (se procesan en el dispositivo y no se envían).
- ¿Cifrado en tránsito? **Sí** (HTTPS).
- ¿Los usuarios pueden pedir que se borren sus datos? **Sí**.
- **Enlace para borrar la cuenta** (obligatorio): `https://jsgarcia87.github.io/SnapTCG/borrar-cuenta.html` (o la de tu dominio).
- Ubicación, contactos, identificadores de publicidad, analítica: **no**.

### 6. Clasificación de contenido
Cuestionario IARC: sin violencia, sexo, lenguaje, drogas ni apuestas; sin compras ni anuncios; sin interacción entre usuarios. Debería salir **PEGI 3 / Para todos**. Si te pregunta si los usuarios pueden compartir contenido, la respuesta es sí: quien lo active puede compartir su colección por enlace.

### 7. Probar antes de enviar
1. Instala en tu móvil el `.apk` de PWABuilder.
2. Comprueba que no aparece la barra de URL arriba (si aparece, el `assetlinks.json` no está bien).
3. Prueba: escanear (Chrome pedirá permiso de cámara), buscar, añadir a la colección sin cuenta, crear una cuenta con el enlace del correo (debe volver a la app y subir lo que tenías), activar y abrir el enlace público, borrar la cuenta, y el modo sin conexión.
4. Sube el `.aab` a **Prueba cerrada**, invita a tus testers y espera los 14 días si tu cuenta lo requiere.

## Al publicar nuevas versiones de la web
- Sube `CACHE` en `sw.js` (por ejemplo `kardlume-v3.18.0`) para que los usuarios reciban los archivos nuevos.
- No hace falta subir un AAB nuevo salvo que cambie el icono, el nombre, el color o el paquete.
