# 🤖 Guía del Agente — SnapTCG (CardDex)

Este documento sirve como manual de referencia técnico, arquitectónico y operativo para cualquier **Agente de Inteligencia Artificial** o desarrollador que trabaje, mantenga o expanda el repositorio **SnapTCG** (comercialmente **CardDex**).

---

## 📌 1. Visión General del Proyecto

- **Nombre del Producto:** CardDex — SnapTCG Premium
- **Versión Actual:** 2.0.0
- **Autor / Estudio:** Sangar Studio
- **Propósito:** Herramienta web móvil (mobile-first) de alto rendimiento para jugadores y coleccionistas de Trading Card Games (TCG). Permite escanear cartas físicas mediante la cámara con OCR continuo, consultar precios en tiempo real desde APIs públicas y construir mazos competitivos con validación estricta de reglas de formato (Pokémon Standard, Magic Standard y Commander).
- **Filosofía Técnica:** **Vanilla Web Stack puro (Zero-Build)**. Sin compiladores, sin bundlers pesados, sin TypeScript o frameworks SPA como React/Vue. Todo se ejecuta directamente en el navegador con HTML5 semántico, CSS3 moderno con variables y JavaScript modular (ES6+).

---

## 🛠️ 2. Stack Tecnológico y Dependencias

| Capa | Tecnología / Servicio | Descripción |
|---|---|---|
| **Frontend** | HTML5 + CSS3 (Variables, Grid, Flexbox) | Interfaz accesible, diseño Neo-Brutalista Premium con Glassmorphism y shell móvil (`max-width: 500px`). |
| **Lógica** | JavaScript Vanilla (ES6+) | Módulos desacoplados en el ámbito global mediante etiquetas `<script>`. |
| **OCR / Visión** | [Tesseract.js v5](https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js) | Worker OCR en el navegador configurado en modo `SINGLE_LINE` con whitelist de caracteres. |
| **Tipografía** | Google Fonts | `DM Sans` (cuerpo/UI) y `Cinzel` (títulos/display). |
| **API Pokémon** | [TCGdex](https://tcgdex.dev/) (principal) y [Pokémon TCG API v2](https://pokemontcg.io/) (respaldo) | TCGdex: lista por GraphQL (`/v2/graphql`, solo inglés) y fichas REST con precios (`pricing.cardmarket` con `avg`, `avg1`, `avg7`, `avg30`, y `tcgplayer`). Sin resultados en inglés se busca en español por REST. pokemontcg.io solo si TCGdex falla (es inestable: 502 y latencias de 20 s). |
| **API Magic** | [Scryfall API](https://scryfall.com/docs/api) | Resolución difusa (`/cards/named?fuzzy=...`) y listado de todas las ediciones (`/cards/search?q=!&unique=prints`). |
| **Persistencia** | Web Storage (`localStorage`) | Clave `snaptcg_decks` para la biblioteca de mazos del usuario. |

---

## 📂 3. Estructura de Archivos y Responsabilidades

```bash
SnapTCG/
├── index.html         # Shell principal de la app, navegación, modales y carga de scripts
├── css/
│   └── style.css      # Sistema de diseño, tokens de color dinámicos, media queries y animaciones
├── js/
│   ├── prices.js      # Red resiliente (timeout + reintentos), caché localStorage, formato de precios y refresco
│   ├── api.js         # Integración y normalización de APIs externas (TCGdex/Pokémon TCG API y Scryfall)
│   ├── scanner.js     # Gestión de WebRTC (getUserMedia), preprocesamiento Canvas y ciclo OCR continuo
│   ├── deckbuilder.js # Motor de reglas de mazos (Standard, Commander), métricas y persistencia
│   ├── config.js      # URL/anon key de Supabase y PUBLIC_OWNER_ID (vacío = modo demo local)
│   ├── cloud.js       # Colección de cartas, login (magic link) y sincronización de mazos con Supabase
│   ├── stats.js       # Estadísticas del mazo, probabilidades hipergeométricas y simulación Monte Carlo
│   └── app.js         # Orquestación de estado general, tematización dinámica, navegación y UI
├── supabase/
│   └── schema.sql     # Tablas collection y decks con políticas RLS
├── .gitignore
├── README.md          # Documentación orientada al usuario final
├── .DS_Store          # Basura de macOS (commiteada por error; ver sección 9)
└── agent.md           # Guía de contexto, arquitectura y reglas operativas para agentes IA
```

### Detalle de Módulos JavaScript:

1. **`index.html`**:
   - Define el contenedor `.app-shell`.
   - Control de pestañas: `#tab-scanner` (escáner + buscador + historial) y `#tab-deck` (editor de mazos + biblioteca).
   - Modales emergentes: `#card-detail-modal` (ficha de carta y precios) y `#modal-overlay` (exportador de listas de mazo).
   - Carga ordenada de scripts al pie:
     ```html
     <script src="js/config.js"></script>
     <script src="js/prices.js"></script>
     <script src="js/api.js"></script>
     <script src="js/scanner.js"></script>
     <script src="js/deckbuilder.js"></script>
     <script src="js/stats.js"></script>
     <script src="js/cloud.js"></script>
     <script src="js/app.js"></script>
     ```

2. **`js/prices.js`** (se carga antes que `api.js`):
   - `fetchJSON(url, {retries, timeout, okStatuses})`: fetch con timeout y reintentos con backoff (429/5xx/red). Lanza errores con `code` (`network`, `http`, `parse`).
   - Caché: `cacheGet/cacheSet` (clave `snaptcg_cache_v1`, máx. 40 entradas). TTL: búsquedas 12 h, precios por carta 6 h. Sin conexión se sirve la caché caducada (`card.enCache`).
   - `applyPokemonPricing` / `applyScryfallPricing`: rellenan `precio`, `precioFoil`, `moneda`, `fuente`, `actualizado` (fecha de la fuente), `consultado` (cuándo se pidió) y `tendencia {d7, d30}`. Pokémon: precio = `avg` de Cardmarket; tendencia = media de hoy (`avg1`) vs `avg7`/`avg30` (misma métrica; `trend` de Cardmarket no se mezcla). Sin Cardmarket, cae a TCGplayer (USD).
   - `hidratarPrecios(cards, onUpdate)` (progresivo, concurrencia 6), `hidratarPrecioPokemon`, `refreshCardPrices(cards)` (Scryfall por lotes de 75 en `/cards/collection`; TCGdex por ficha).
   - Utilidades: `formatMoney`, `timeAgo`, `trendBadge`, `sumValue`/`formatValue` (EUR y USD se suman por separado, nunca se convierten).

   **`js/api.js`**:
   - `buscarPokemon(nombre)`: TCGdex GraphQL (inglés) → TCGdex REST en español → Pokémon TCG API (respaldo, admite `POKEMON_API_KEY`). Los precios llegan después, por ficha (`preciosCargados: false` hasta entonces). Orden: coincidencias exactas primero, cartas sin imagen al final; máx. 60.
   - `buscarMagic(nombre)`: Scryfall en dos pasos (fuzzy + prints). Su `actualizado` es la fecha de `bulk-data` (`default_cards`), ya que Scryfall refresca los precios una vez al día.
   - `buscarCartas(nombre, juego)`: enrutador con caché y recurso a la caché caducada si hay fallo de red.

3. **`js/scanner.js`**:
   - `iniciarEscaner()` / `detenerEscaner()`: Gestiona el flujo `navigator.mediaDevices.getUserMedia` (`facingMode: 'environment'`, resolución ideal 1280x720).
   - `initOcrWorker()`: Inicializa el worker de Tesseract con parámetros optimizados (`tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE`).
   - `startContinuousScan()` / `autoScan()`: Escanea automáticamente cada 1.5 s (`SCAN_INTERVAL_MS = 1500`).
   - `captureAndOcr(video)`: Recorta el 25% superior del frame (área donde se ubica el título de la carta), aplica filtro en canvas (`grayscale(100%) contrast(200%) brightness(120%)`) y filtra por confianza mínima (`MIN_CONF = 65`).
   - `cleanOcrText(raw)`: Sanitiza caracteres residuales antes de transferir el texto al buscador.

4. **`js/deckbuilder.js`**:
   - Reglas de juego (`DECK_RULES`):
     - **Pokémon Standard**: 60 cartas exactas, máx. 4 copias de la misma carta (excepto energías básicas).
     - **Magic Standard**: 60 cartas exactas, máx. 4 copias (excepto tierras básicas).
     - **Magic Commander / EDH**: 100 cartas exactas, máx. 1 copia (singleton, excepto tierras básicas).
   - `getRules()`: Devuelve la regla activa según `juegoActual` y `currentFormat`, con fallback a `standard`.
   - `isUnlimited(card, juego)`: Identifica tierras y energías básicas permitidas sin límite. Magic: `typeLine` con "Basic ... Land" o nombre exacto en `BASIC_LANDS` (admite prefijo `Snow-Covered`). Pokémon: `supertype === "Energy"` con subtipo `Basic`, o nombre exacto en `BASIC_ENERGIES` (fallback para mazos antiguos sin `supertype`).
   - `addCardToDeck(card, juego)` y `removeCardFromDeck(cardId, all)`: Mutación y control de límites del mazo actual (`currentDeck`).
   - `renderDeckStats()`, `renderDeckList()`, `renderDeckLibrary()`: Pintan estadísticas, lista del mazo y biblioteca guardada.
   - `newDeck()`, `loadDeck(idx)`, `showDeckTab(tab)`, `showDeckToast(msg, type)`, `addCurrentCardToDeck()`, `copyExport()`: Gestión de la UI del editor.
   - `renderDeckMetrics()`: Métricas en vivo por tipo:
     - Pokémon: `PKM` (Pokémon), `TRA` (Trainers), `ENE` (Energías).
     - Magic: `CRE` (Creatures), `LAN` (Lands), `SPE` (Spells).
   - Persistencia: `saveDeck()` (guarda el mazo actual), `saveDecks()` (escribe `allDecks` en `localStorage`), `loadDecks()` (lee y tolera JSON corrupto), `deleteDeck(idx)`, `exportCurrentDeck()`.

5. **`js/stats.js`** (pestaña **Análisis** del editor de mazos, `#deck-analysis-section`):
   - Matemática: `hyperPMF`, `hyperAtLeast`, `hyperBetween` (distribución hipergeométrica con log-factoriales) y `probBothGroups` (≥1 de dos grupos disjuntos, p. ej. Básico + energía).
   - `analyzeDeck(deck, juego)`: composición por tipo, curva de maná (CMC 0–7+), símbolos de color, subtipos Pokémon, valor y cartas más caras. Las cartas sin `typeLine`/`supertype` (mazos antiguos) se avisan y se excluyen.
   - `renderDeckAnalysis()`: pinta el panel solo si la pestaña es visible; `renderDeckStats()` la refresca en cada cambio del mazo.
   - Probabilidades: Magic (mano 2–4 tierras, tierras por turno), Pokémon (mulligan, ≥1/≥2 Básicos, Básico + energía, energías por turno), calculadora por carta (≥1/≥2 copias por turno y riesgo de premio completo en Pokémon).
   - `simulateLandDrops()` / `runDeckSimulation()`: Monte Carlo de 10.000 partidas (Magic) para cumplir la tierra de cada turno hasta T5. Convención: se roba desde el T2 jugando primero.
   - Los gráficos son HTML/CSS (`.bar-row`, `.curve`), sin librerías.

6. **`js/cloud.js`** (pestaña **Colección**, `#tab-collection`):
   - Dos modos: **demo** (sin config o con `?demo`: `localStorage`, clave `snaptcg_collection`) y **nube** (`config.js` rellenado: `supabase-js` se carga por CDN bajo demanda).
   - Modelo: el dueño inicia sesión (`signInWithOtp`, `shouldCreateUser: false`) y edita; los visitantes ven la colección de `PUBLIC_OWNER_ID` en solo lectura (`canEditCollection()`).
   - Colección: `collectionAdd`, `collectionRemove`, `addCurrentCardToCollection`, `renderCollection`. Tabla `collection` (pública en lectura, escritura solo del dueño).
   - Mazos: `cloudSyncDecks`, `cloudDeleteDeck`, `pullDecksFromCloud` (copia de seguridad privada, tabla `decks`). `deckbuilder.js` los llama tras guardar/borrar.
   - `renderCollection` escapa todo con `esc()` (datos de APIs externas). `#coleccion` en la URL abre directamente la pestaña.
   - La *anon key* es pública; la seguridad la dan las políticas RLS de `supabase/schema.sql`. Nunca incluir la `service_role key`.

7. **`js/app.js`**:
   - Variables de estado globales: `juegoActual` (`"pokemon"` | `"magic"`), `ultimosResultados`, `sesionCartas`.
   - `setGame(juego)` y `updateAppTheme()`: Alterna tema visual modificando variables CSS (`--accent-color`, `--accent-rgb`, clases de `body` `.mode-pokemon` o `.mode-magic`).
   - `switchTab(tab)`: Controla la navegación inferior (`'scanner'`, `'deck'`, `'collection'`); `initCloud()` se llama en `DOMContentLoaded`.
   - `renderizarLista(resultados)`: Pinta tarjetas en la cuadrícula de resultados y muestra el badge `possession-badge` (`xN`) si la carta ya está en el mazo.
   - `ejecutarBusqueda()`: Punto de entrada principal de la búsqueda (manual o desde el OCR); llama a `buscarCartas` y renderiza.
   - `seleccionarCarta(index)` y `añadirAHistorial(carta)`: Despliega el bottom sheet de detalle y actualiza el historial de escaneos de la sesión.
   - `closeModal()`, `volverALista()`, `exportarLista()`, `mostrarCargando(texto)`, `mostrarError(msg)`, `resetUI()`: Utilidades de UI y modales.

---

## 📊 4. Modelos de Datos Unificados

### Objeto `CardResult` (Normalizado entre Pokémon y Magic):
> La notación TypeScript es solo ilustrativa; el proyecto no usa TypeScript (en el código se documenta con JSDoc).

```typescript
interface CardResult {
  id: string;               // ID único (ej: "swsh4-25" o UUID Scryfall)
  imagenThumb: string;      // URL imagen miniatura (~150-250px)
  imagen: string;           // URL imagen alta resolución
  nombre: string;           // Nombre oficial de la carta
  set: string;              // Nombre de la colección / edición
  setCode: string;          // Código corto del set
  precio: number | null;    // Precio en EUR/USD (o null si no disponible)
  precioFoil?: number | null; // Precio versión foil
  moneda: "eur" | "usd";    // Moneda base del precio
  tipo: "pokemon" | "magic";// Juego de procedencia
  manaCost?: string;        // (Magic) Coste de maná
  typeLine?: string;        // (Magic) Línea de tipo
  cmc?: number | null;      // (Magic) Coste de maná convertido
  supertype?: string;       // (Pokémon) Pokémon / Trainer / Energy
  subtypes?: string[];      // (Pokémon) ej. ["Basic"], ["Stage 1"]
}
```

### Estructura de Mazos (`Deck` en `localStorage`):
```typescript
interface DeckEntry {
  card: CardResult;
  qty: number;
}

interface Deck {
  id: number | string;
  nombre: string;
  juego: "pokemon" | "magic";
  formato: "standard" | "commander";
  cards: DeckEntry[];
  total: number;
  value: string;
  date: string;
}
```

---

## 🎨 5. Sistema de Diseño y Tokens CSS

El sistema se apoya en variables CSS definidas en `:root` de [`css/style.css`](css/style.css):

- **Fondo base:** `--bg-color: #080a0f`
- **Superficie de tarjetas:** `--surface-color: #12151c`, hover `--surface-hover: #1a1f29`
- **Acentos dinámicos:**
  - Pokémon: `--pk-accent: #f5c842` (RGB `245, 200, 66`)
  - Magic: `--mtg-accent: #a78bfa` (RGB `167, 139, 250`)
- **Tokens de estado dinámico:** `--accent-color` y `--accent-rgb` cambian en caliente mediante `updateAppTheme()`.
- **Estructura del Shell:** Ancho máximo fijo en móviles y escritorio centrado (`max-width: 500px`), con padding inferior que respeta la navegación fija y la safe-area de iOS (`calc(var(--nav-height) + var(--safe-area-bottom))`).

---

## 🧭 6. Reglas Críticas para Agentes al Modificar el Código

Cuando un agente trabaje en este proyecto, debe acatar estrictamente las siguientes directrices:

1. **Preservar la Arquitectura Zero-Build**:
   - **NO** añadir `npm`, `package.json`, `webpack`, `vite` ni transpiladores a menos que el usuario lo solicite expresamente.
   - Mantener las dependencias externas a través de CDNs estables.
2. **Respetar el Orden y Ámbito de Scripts**:
   - Las funciones y variables se declaran en el ámbito global (window) debido al orden de carga en `index.html`.
   - Si creas nuevas utilidades o módulos, añádelos respetando el flujo de dependencias y regístralos en `index.html`.
3. **Compatibilidad con Dispositivos Móviles**:
   - `getUserMedia` requiere HTTPS o `localhost` para funcionar. Recuerda esto si depuras el escáner.
   - Mantener los tamaños de botones, tap targets (mínimo 44x44px) y soporte para gestos táctiles.
4. **Validación de Reglas de Juego**:
   - Cualquier cambio en formatos de mazo debe reflejarse en `DECK_RULES` en [`js/deckbuilder.js`](js/deckbuilder.js).
   - Comprueba siempre excepciones de copias para tierras básicas (`BASIC_LANDS`) y energías (`BASIC_ENERGIES`).
5. **Idioma y Tono**:
   - La interfaz de usuario, placeholders, toasts y mensajes de error están en **Español** (`es`). Mantén la coherencia idiomática en las cadenas visibles.
6. **Integridad del OCR**:
   - Al ajustar el escáner, ten presente que procesar cada frame consume CPU en dispositivos móviles. Mantener `SCAN_INTERVAL_MS` entre 1200ms y 2000ms y no eliminar el recorte previo del 25% superior en el canvas antes de pasar la imagen a Tesseract.

---

## 🚀 7. Cómo Ejecutar y Probar Localmente

Dado que es una aplicación estática con Web APIs (cámara y fetch):

```bash
# Opción 1: Python HTTP Server
python3 -m http.server 8000

# Opción 2: Node npx serve
npx serve .

# Opción 3: Abrir directamente en el navegador
open index.html
# (Nota: La cámara requiere servir bajo localhost o https://)
```

---

## 🔮 8. Puntos de Extensión Futuros (Backlog Recomendado)

Orden de prioridad sugerido: 1) Tendencias de precio (`avg7`/`avg30` de Cardmarket + histórico en `localStorage`), 2) Importador de mazos, 3) PWA, 4) más TCGs, 5) detección visual.

- **Soporte para más TCGs**: Incorporar **Yu-Gi-Oh!** (vía YGOProDeck API), **Disney Lorcana** (vía Lorcast API) o **One Piece TCG**.
- **Importador de Mazos**: Soporte para pegar listas en formato PTCGL (Pokémon TCG Live) y MTG Arena para poblar automáticamente el mazo.
- **PWA / Modo Offline**: Añadir `manifest.json` y Service Worker para instalación como aplicación nativa en iOS/Android y cacheo de vistas offline.
- **Detección por Coincidencia Visual / Hash**: Integración con algoritmos de comparación perceptual de arte de cartas para mejorar el reconocimiento en condiciones de baja iluminación.

---

## ⚠️ 9. Limitaciones Conocidas

- **Mazos antiguos**: los mazos guardados antes de añadir `supertype`/`subtypes` a las cartas Pokémon muestran métricas PKM/TRA/ENE a 0 hasta volver a añadir las cartas (las energías básicas sí se reconocen por nombre).
- **Sin histórico de precios**: solo hay tendencia en Pokémon (medias de Cardmarket). Magic no tiene tendencia hasta implementar `price_history` (Fase 2).
- **Dos monedas**: Cardmarket (EUR) y, en su defecto, TCGplayer (USD). No se convierten; los totales las muestran por separado.
- **Orden de resultados de TCGdex**: llega arbitrario (no cronológico), no hay fecha de lanzamiento en la lista.
- **Precio de TCGdex**: `trend` y `avg` de Cardmarket pueden diferir mucho en cartas poco vendidas; se usa `avg`.
- **Sin tests automatizados**: la validación es manual en navegador.
- **`.DS_Store` commiteado**: ya está en `.gitignore`, pero el archivo sigue en el repositorio; elimínalo con `git rm --cached .DS_Store`.
- **Nube sin probar contra Supabase real**: la lógica se probó con un cliente simulado; falta una prueba de extremo a extremo con un proyecto real.
- **Sin caché-busting**: los scripts no llevan versión en la URL; tras desplegar, el navegador puede servir un JS antiguo hasta recargar.
- **`agent.md` aún sin trackear** en git en el momento de esta revisión.
