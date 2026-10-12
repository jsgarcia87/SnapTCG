# 🎴 CardDex — SnapTCG Premium

**CardDex** es una herramienta profesional de gestión para jugadores de TCG (Trading Card Games). Permite escanear cartas físicamente, consultar precios en tiempo real y construir mazos competitivos de **Pokémon TCG** y **Magic: The Gathering** con validación de reglas avanzada.

![Versión](https://img.shields.io/badge/Versi%C3%B3n-2.0.0-gold)
![Tech](https://img.shields.io/badge/Tech-Vanilla_JS-blue)
![OCR](https://img.shields.io/badge/OCR-Tesseract.js-green)

---

## 🚀 Funcionalidades Principales

### 1. Escáner Automático (Estilo Manabox)
- **Escaneo Continuo**: No necesitas pulsar botones. La app analiza el flujo de video cada 1.5 segundos.
- **Detección Inteligente**: Recorta automáticamente el área del nombre de la carta para maximizar la precisión del OCR.
- **Feedback Visual**: Resplandor dinámico y badges de estado que indican cuando una carta ha sido leída con éxito.

### 2. Constructor de Mazos Pro
- **Validación de Formatos**:
    - **Pokémon**: Formato Estándar (60 cartas, max 4 copias).
    - **Magic**: Formato Estándar y **Commander/EDH** (100 cartas, singleton/1 copia).
- **Análisis de Composición (Métricas)**:
    - Desglose en tiempo real de Pokémon/Entrenadores/Energías o Criaturas/Tierras/Hechizos.
    - Barra de progreso dinámica que indica si el mazo es legal para torneo.
- **Gestión de Biblioteca**: Guarda múltiples mazos localmente y edítalos cuando quieras.

### 3. Consultas en Tiempo Real
- **Precios con contexto**: cada precio indica su fuente (Cardmarket / TCGplayer) y cuándo se actualizó. En Pokémon se muestra la tendencia frente a las medias de 7 y 30 días.
- **Fuentes**: **TCGdex** (Pokémon, con respaldo en Pokémon TCG API) y **Scryfall** (Magic). Caché local, reintentos automáticos y botón «Actualizar precios» en Colección y en el análisis de mazos.
- **Indicador de Posesión**: Al buscar cartas, la app te indica si ya tienes copias de esa carta en tu mazo actual mediante un badge visual.

---

## 🎨 Diseño y UX
- **Estética Neo-Brutalista Premium**: Diseño oscuro con efectos de "Glassmorphism" y contrastes optimizados.
- **Tematización Dinámica**: La interfaz cambia de color de acento según el juego seleccionado (Oro para Pokémon, Violeta para Magic).
- **Navegación Móvil**: Barra de navegación inferior optimizada para uso con el pulgar.
- **Micro-interacciones**: Efectos de escala, pop-ups y animaciones de carga (Skeletons) para una experiencia fluida.

---

## 🛠️ Stack Tecnológico
- **Frontend**: HTML5, CSS3 (Variables, Flexbox, Grid).
- **Lógica**: JavaScript Vanilla (ES6+).
- **OCR**: [Tesseract.js](https://tesseract.projectnaptha.com/).
- **APIs**:
    - [Scryfall API](https://scryfall.com/docs/api) para Magic: The Gathering.
    - [Pokémon TCG API](https://pokemontcg.io/) para Pokémon.

---

## 📦 Estructura del Proyecto
```bash
SnapTCG/
├── index.html         # Estructura semántica y accesible
├── css/
│   └── style.css      # Sistema de diseño unificado y animaciones
├── js/
│   ├── app.js         # Gestión de estados, temas y navegación
│   ├── api.js         # Integración con servicios externos
│   ├── scanner.js     # Lógica del OCR y flujo de cámara
│   └── deckbuilder.js # Reglas competitivas y métricas de mazos
└── README.md          # Documentación
```

---

## 💡 Cómo usar
1. Abre `index.html` en cualquier navegador moderno.
2. Selecciona tu juego preferido (Pokémon o Magic).
3. Usa el **Buscador** o el **Escáner en Vivo** para encontrar cartas.
4. Pulsa "Añadir al mazo" para empezar a construir.
5. En la pestaña **Mazos**, ajusta las cantidades y exporta tu lista para usarla en simuladores online (PTCGL, Arena, etc.).

---

Desarrollado con ❤️ para la comunidad de TCG.

---

## 🌐 Demo pública y colección en la nube

### Demo (GitHub Pages)
La app es estática (sin build), así que se publica tal cual:
**Settings → Pages → Source: *Deploy from a branch* → Branch: `main` / `(root)`**.
URL: `https://jsgarcia87.github.io/SnapTCG/`. Añade `?demo` a la URL para forzar el modo local aunque la nube esté configurada.

### Colección pública con Supabase (opcional)
Sin configurar nada, la colección y los mazos se guardan en `localStorage` (modo demo). Para publicar tus cartas:

1. Crea un proyecto en [supabase.com](https://supabase.com) y ejecuta [`supabase/schema.sql`](supabase/schema.sql) en el **SQL Editor**.
2. **Authentication → Users → Add user**: crea tu usuario (email). Copia su **UUID**.
3. **Authentication → Providers/Sign In**: desactiva *Allow new users to sign up*.
4. **Authentication → URL Configuration**: añade `https://jsgarcia87.github.io/SnapTCG/` a *Redirect URLs* (y como *Site URL*).
5. Rellena [`js/config.js`](js/config.js) con `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Project Settings → API → *anon public*) y `PUBLIC_OWNER_ID` (el UUID del paso 2).
6. Haz commit y push. Entra en la pestaña **Colección**, inicia sesión con tu email (enlace mágico) y añade cartas desde el detalle de carta.

**Seguridad:** la *anon key* es pública por diseño; las políticas RLS permiten a cualquiera **leer** la colección, pero solo el dueño autenticado puede escribir. Los mazos son privados (solo tú los ves). No pongas nunca la `service_role key` en el repositorio.

### Histórico de precios (tendencias y gráficas)
Una tarea diaria de GitHub Actions ([`.github/workflows/update-prices.yml`](.github/workflows/update-prices.yml), 10:30 UTC) guarda en Supabase el precio de cada carta de tu colección y mazos, la tendencia de Magic y el valor total de la colección. La web dibuja las gráficas de 30 d / 90 d / 1 año. Para activarla:

1. Vuelve a ejecutar [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor (es idempotente; crea `price_history` y `collection_value_history`).
2. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**, y crea dos secretos:
   - `SUPABASE_URL`: la URL de tu proyecto.
   - `SUPABASE_SERVICE_ROLE_KEY`: la clave **secreta** (*Project Settings → API Keys → Secret key* o `service_role`). Solo en secretos de Actions, **nunca** en el repo ni en `config.js`.
3. Lánzala una vez a mano: **Actions → Actualizar histórico de precios → Run workflow**. A partir de ahí se ejecuta sola cada día.

Notas: el histórico empieza el día que se activa (no hay datos anteriores) y GitHub desactiva las tareas programadas tras 60 días sin actividad en el repo. En modo demo (sin Supabase) el histórico se acumula en el navegador cuando actualizas precios o abres la colección.

