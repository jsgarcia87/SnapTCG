# 🤖 Guía del Agente — SnapTCG (CardDex)

Este documento sirve como manual de referencia técnico, arquitectónico y operativo para cualquier **Agente de Inteligencia Artificial** o desarrollador que trabaje, mantenga o expanda el repositorio **SnapTCG** (comercialmente **CardDex**).

---

## 📌 1. Visión General del Proyecto

- **Nombre del Producto:** CardDex — SnapTCG Premium
- **Versión Actual:** 3.2.0
- **Autor / Estudio:** Sangar Studio
- **Propósito:** Herramienta web móvil (mobile-first) de alto rendimiento para jugadores y coleccionistas de Trading Card Games (TCG). Permite escanear cartas físicas mediante la cámara con OCR continuo, consultar precios en tiempo real desde APIs públicas, gestionar colecciones con estética inspirada en Collectr y construir mazos competitivos con validación estricta de reglas de formato (Pokémon Standard, Magic Standard y Commander).
- **Filosofía Técnica:** **Vanilla Web Stack puro (Zero-Build)**. Sin compiladores, sin bundlers pesados, sin TypeScript o frameworks SPA como React/Vue. Todo se ejecuta directamente en el navegador con HTML5 semántico, CSS3 moderno con variables y JavaScript modular (ES6+).

---

## 🛠️ 2. Stack Tecnológico y Dependencias

| Capa | Tecnología / Servicio | Descripción |
|---|---|---|
| **Frontend** | HTML5 + CSS3 (Variables, Grid, Flexbox) | Interfaz accesible, diseño Neo-Brutalista Premium OLED (`#000000`), estética inspirada en Collectr, marcos coleccionables con brillo holográfico (`.card-holo-sheen`) y shell móvil responsive (`max-width: 500px` hasta 1360px). |
| **Lógica** | JavaScript Vanilla (ES6+) | Módulos desacoplados en el ámbito global mediante etiquetas `<script>`. |
| **OCR / Visión** | [Tesseract.js v5](https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js) | Worker OCR en el navegador configurado en modo `SINGLE_LINE` con whitelist de caracteres. |
| **Tipografía** | Google Fonts | `Inter` (UI/textos principales), `DM Sans` (cuerpo alternativo) y `Cinzel` (títulos/display). |
| **API Pokémon** | [TCGdex](https://tcgdex.dev/) (principal) y [Pokémon TCG API v2](https://pokemontcg.io/) (respaldo) | TCGdex: consulta multilingüe (EN vía GraphQL, ES y JA vía REST) con variantes (`normal`, `holo`, `reverse`, `firstEdition`), número de coleccionista (`localId`) y desglose de precios (`pricing.cardmarket` y `pricing.tcgplayer`). |
| **API Magic** | [Scryfall API](https://scryfall.com/docs/api) | Resolución difusa, listado de ediciones (`/cards/search?q=!&unique=prints`), acabados (`finishes: ['nonfoil', 'foil', 'etched']`), filtrado por idioma (`lang:${lang}`) y número de coleccionista. |
| **Persistencia** | Web Storage (`localStorage`) y Supabase | Colección y mazos sincronizables con RLS en Postgres o utilizables en modo demo local. |

---

## 📂 3. Estructura de Archivos y Responsabilidades

```bash
SnapTCG/
├── index.html         # Shell principal de la app, navegación, barra de filtros Collectr, modales y carga de scripts
├── css/
│   ├── style.css      # Base: tokens OLED, componentes Collectr (filtros, tarjetas 63/88, brillo holo, pickers, portfolio)
│   └── design.css     # Capa v3 (se carga DESPUÉS): layout responsive, navegación, Inicio, detalle de carta, accesibilidad
├── js/
│   ├── icons.js       # Catálogo centralizado de iconos SVG (Heroicons v2, zero-build, cero emojis)
│   ├── charts.js      # Gráficas de línea en SVG (sin librerías) y selector de rango
│   ├── prices.js      # Red resiliente, cálculo de variantes (holo/reverse/normal), market stats (mín/med/máx), caché y refresco
│   ├── api.js         # Normalización multilingüe (EN, ES, JA), variantes y APIs externas (TCGdex/Scryfall)
│   ├── scanner.js     # Gestión de WebRTC (getUserMedia), preprocesamiento Canvas y ciclo OCR continuo
│   ├── deckbuilder.js # Motor de reglas de mazos (Standard, Commander), métricas y persistencia
│   ├── config.js      # URL/anon key de Supabase y PUBLIC_OWNER_ID (vacío = modo demo local)
│   ├── home.js        # Pantalla de Inicio: valor de la colección, tendencia, movimientos, mazos recientes y onboarding
│   ├── cloud.js       # Colección de cartas, hero de portfolio Collectr con métricas, login y sincronización
│   ├── stats.js       # Estadísticas del mazo, probabilidades hipergeométricas y simulación Monte Carlo
│   └── app.js         # Orquestación de estado, filtros Collectr (idioma, acabado, orden), modales y tematización
├── supabase/
│   └── schema.sql     # Tablas collection, decks, price_history y collection_value_history con RLS
├── scripts/
│   └── update-prices.mjs  # Trabajo diario (Node 20): guarda el histórico en Supabase; reutiliza js/prices.js
├── .github/workflows/
│   └── update-prices.yml  # Cron diario 10:30 UTC + ejecución manual; usa los secretos SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
├── .gitignore
├── README.md          # Documentación orientada al usuario final
├── CHANGELOG.md       # Registro histórico de versiones y cambios del producto
└── agent.md           # Guía de contexto, arquitectura y reglas operativas para agentes IA
```

### Detalle de Módulos JavaScript:

1. **`index.html`**:
   - Define el contenedor `.app-shell`.
   - Barra de filtros Collectr (`.collectr-filter-bar`): selector de idioma (`Todos`, `EN`, `ES`, `JA`), acabado (`Todos`, `Holofoil`, `Normal`, `Reverse`) y ordenación (`search-sort-select`).
   - Control de pestañas: `#tab-home` (Inicio), `#tab-scanner` (escáner + buscador + historial), `#tab-deck` (editor de mazos + biblioteca) y `#tab-collection` (portfolio de colección).
   - Modal emergente enriquecido `#card-detail-modal`: marco coleccionable con brillo `.holo-glare`, selector de variante `.variant-picker`, selector de condición `.condition-picker`, estadísticas de mercado `.market-stats-grid` y gráfico histórico.
   - Carga ordenada de scripts al pie:
     ```html
     <script src="js/icons.js"></script>
     <script src="js/config.js"></script>
     <script src="js/prices.js"></script>
     <script src="js/charts.js"></script>
     <script src="js/api.js"></script>
     <script src="js/scanner.js"></script>
     <script src="js/deckbuilder.js"></script>
     <script src="js/stats.js"></script>
     <script src="js/cloud.js"></script>
     <script src="js/home.js"></script>
     <script src="js/app.js"></script>
     ```

2. **`js/icons.js`** (se carga primero):
   - Catálogo `HEROICONS` con iconos SVG vectoriales basados en [Heroicons v2](https://heroicons.com/).
   - **Cero emojis en la interfaz**: `bolt`, `sparkles`, `trophy`, `home`, `magnifyingGlass`, `camera`, `rectangleStack`, `archiveBox`, `bookmark`, `arrowUpTray`, `plusCircle`, `trash`, `arrowPath`, `link`, `play`, `xMark`, `plus`, `minus`, `arrowTrendingUp`, `arrowTrendingDown`, `funnel`, `globeAlt`, `check`, `arrowsUpDown`.
   - Clases de soporte CSS: `.heroicon` (18px), `.heroicon-sm` (14px), `.heroicon-lg` (24px), `.btn-icon`, `.trend-icon`.

3. **`js/prices.js`** (se carga antes que `api.js`):
   - `fetchJSON(url, {retries, timeout, okStatuses})`: fetch con timeout y reintentos con backoff (429/5xx/red). Lanza errores con `code` (`network`, `http`, `parse`).
   - Caché: `cacheGet/cacheSet` (clave `snaptcg_cache_v1`, máx. 40 entradas). TTL: búsquedas 12 h, precios por carta 6 h. Sin conexión se sirve la caché caducada (`card.enCache`).
   - `applyPokemonPricing` / `applyScryfallPricing`:
     - Rellenan precios principales (`precio`, `precioFoil`, `moneda`, `fuente`, `actualizado`, `consultado`, `tendencia`).
     - Desglosan cotizaciones específicas por variante en `card.variantPrices`: `normal`, `holo`, `reverse`, `firstEdition`.
     - Calculan estadísticas de mercado (`marketLow`, `marketMid`, `marketHigh`).
   - Helpers de precios:
     - `getCardActivePrice(card, variantKey)`: obtiene el precio de la variante seleccionada o activa.
     - `getCardActiveTrend(card, variantKey)`: obtiene la tendencia correspondiente a la variante.
     - `formatVariantName(key)`: traduce claves de variante a etiquetas en español (`Holofoil`, `Reverse Holo`, `1st Edition`, `Normal`).
   - `hidratarPrecios(cards, onUpdate)` (progresivo, concurrencia 6), `hidratarPrecioPokemon`, `refreshCardPrices(cards)` (Scryfall por lotes de 75 en `/cards/collection`; TCGdex por ficha).
   - Utilidades: `formatMoney`, `timeAgo`, `trendBadge`, `sumValue`/`formatValue` (EUR y USD se suman por separado, nunca se convierten).
   - Histórico: `trendFromHistory(points)` (d7/d30 desde una serie diaria), y snapshots locales para el modo demo (`recordPriceSnapshot`, `recordValueSnapshot`, `localCardHistory`, `localValueHistory`).

   **`js/charts.js`**: `lineChart(points, {moneda, label})` devuelve un SVG accesible (`role="img"` + `aria-label` con el resumen; puntos con `<title>` como tooltip) y `rangePills(actual, opciones, fn)` el selector 30 d / 90 d / 1 año.

   **Histórico en la nube** (`cloud.js`): `loadCardHistory(card)` lee `price_history` (lectura pública) o los snapshots locales; `loadValueHistory()` lee `collection_value_history` del dueño.

   **Trabajo diario** (`scripts/update-prices.mjs`): lee `collection` y `decks` con la service key, consulta Scryfall y TCGdex, hace upsert en `price_history`, calcula la tendencia de Magic, actualiza `collection.card` con `PATCH` y guarda el valor por dueño.

   **`js/api.js`**:
   - `buscarPokemon(nombre, lang)`: TCGdex con filtro de idioma (`all`, `en`, `es`, `ja`). Para inglés consulta GraphQL `/v2/graphql` (con `variants` y `localId`). Para español o japonés consulta `/v2/{lang}/cards` por REST. Respaldo en Pokémon TCG API.
   - `buscarMagic(nombre, lang)`: Scryfall con filtro de idioma (`lang:${lang}`). Extrae acabados (`finishes`), `collector_number`, idioma y precios.
   - `buscarCartas(nombre, juego, lang)`: enrutador con caché por juego e idioma (`search:${juego}:${lang}:${nombre}`).

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
   - **Portfolio Hero Card estilo Collectr** (`.portfolio-hero-card`): visualiza valor total (EUR y USD), total de cartas, cartas únicas, conteo de acabados Holo/Foil y distribución por idiomas (`EN`, `ES`, `JA`).
   - **Filtros de Colección**: filtros rápidos por juego (Todos, Pokémon, Magic), acabado (Todos, Holofoil, Normal, Reverse), idioma y ordenación (Mayor valor, Menor valor, Nombre, Cantidad).
   - **Tarjetas de Colección Coleccionables**: marco con relación de aspecto 63/88, controles táctiles de cantidad (`+`/`-`), badge de condición (`NM`, `LP`, etc.) y acabado holo.
   - Modelo: el dueño inicia sesión (`signInWithOtp`, `shouldCreateUser: false`) y edita; los visitantes ven la colección de `PUBLIC_OWNER_ID` en solo lectura (`canEditCollection()`).
   - Colección: `collectionAdd(card, variant, condition)`, `collectionRemove`, `addCurrentCardToCollection`, `renderCollection`. Tabla `collection` (pública en lectura, escritura solo del dueño; el objeto `card` persiste `selectedVariant` y `condition`).
   - Mazos: `cloudSyncDecks`, `cloudDeleteDeck`, `pullDecksFromCloud` (copia de seguridad privada, tabla `decks`). `deckbuilder.js` los llama tras guardar/borrar.
   - `renderCollection` escapa todo con `esc()` (datos de APIs externas). `#coleccion` en la URL abre directamente la pestaña.
   - La *anon key* es pública; la seguridad la dan las políticas RLS de `supabase/schema.sql`. Nunca incluir la `service_role key`.

7. **`js/home.js`** (pestaña **Inicio**, `#tab-home`, destino por defecto):
   - `renderHome()`: se pinta solo si la pestaña está activa; `onAuthChanged()` la refresca al cargar la colección. Muestra `hero-card` (valor total con `formatValue`, tendencia 7 d/30 d y `sparkline` desde `loadValueHistory`), accesos rápidos (`irAEscanear`, `irABuscar`, `irANuevoMazo`), «Lo que más se mueve» (top 3 subidas y bajadas por `tendencia.d7`) y los 3 últimos mazos.
   - Estado vacío = onboarding de 3 pasos; en modo visitante (solo lectura) no se ofrece añadir.

8. **`js/app.js`**:
   - Variables de estado globales: `juegoActual` (`"pokemon"` | `"magic"`), `rawSearchResults`, `searchFilters` (`{ lang: 'all', finish: 'all', sort: 'relevance' }`), `cardCondition` (`"NM"`), `ultimosResultados`, `sesionCartas`.
   - **Filtros y Ordenación estilo Collectr**:
     - `setSearchFilter(tipo, valor)`: actualiza filtros y refresca vista o dispara búsqueda multilingüe si cambia el idioma.
     - `filterAndSortCards(cards)`: aplica filtros de acabado y ordenación (relevancia, precio descendente/ascendente, alfabético).
   - **Detalle de Carta Estilo Collectr**:
     - `pintarVariantesModal(carta)`: renderiza botones interactivos de variante (`.variant-pill`) con precio en tiempo real por cada acabado detectado.
     - `selectCardVariant(key)`: conmuta la variante activa (`normal`, `holo`, `reverse`, `firstEdition`) recalculando precio, gráfica y brillo holo.
     - `updateDetailHoloState(carta)`: activa o desactiva la capa de brillo `.holo-glare` según el acabado seleccionado.
     - `setCardCondition(cond)`: establece la condición activa (`NM`, `LP`, `MP`, `HP`).
   - `setGame(juego)` y `updateAppTheme()`: Alterna tema visual modificando variables CSS (`--accent-color`, `--accent-rgb`, clases de `body` `.mode-pokemon` o `.mode-magic`).
   - `switchTab(tab)`: Controla la navegación (`'home'`, `'scanner'` = Buscar, `'deck'`, `'collection'`), actualiza `aria-current` y el hash (`#buscar`, `#mazos`, `#coleccion`; `#inicio` o vacío = Inicio). `initCloud()` se llama en `DOMContentLoaded`.
   - `setGame(juego)`: sincroniza selectores de juego en Buscar y en el editor de mazos; recuerda el juego en `localStorage` (`snaptcg_game`).
   - `abrirDetalle(carta, registrar)`: abre el modal (hoja inferior en móvil, diálogo de dos columnas en ≥ 900 px); inicializa variantes, condición, chips, estadísticas mín/med/máx y gráfica.
   - `renderizarLista(resultados)`: Pinta tarjetas coleccionables en cuadrícula (aspect-ratio 63/88) con badges de acabado, idioma, brillo holo (`.card-holo-sheen`) y estado de posesión en mazo (`possession-badge`).
   - `ejecutarBusqueda()`: Punto de entrada principal de búsqueda (manual o desde OCR) pasando el filtro de idioma activo a `buscarCartas`.
   - `seleccionarCarta(index)` y `añadirAHistorial(carta)`: Despliega el modal y actualiza el historial de escaneos de la sesión.
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
  localId?: string;         // Número de coleccionista en el set (ej. "25", "182/198")
  lang?: string;            // Código de idioma ("en", "es", "ja")
  precio: number | null;    // Precio base en EUR/USD (o null si no disponible)
  precioFoil?: number | null; // Precio versión foil
  moneda: "eur" | "usd";    // Moneda base del precio
  tipo: "pokemon" | "magic";// Juego de procedencia
  manaCost?: string;        // (Magic) Coste de maná
  typeLine?: string;        // (Magic) Línea de tipo
  cmc?: number | null;      // (Magic) Coste de maná convertido
  supertype?: string;       // (Pokémon) Pokémon / Trainer / Energy
  subtypes?: string[];      // (Pokémon) ej. ["Basic"], ["Stage 1"]
  
  // Atributos de acabado, variantes y estado estilo Collectr:
  variants?: {
    normal?: boolean;
    reverse?: boolean;
    holo?: boolean;
    firstEdition?: boolean;
  };
  finishes?: string[];      // (Magic) ["nonfoil", "foil", "etched"]
  selectedVariant?: "normal" | "holo" | "reverse" | "firstEdition";
  condition?: "NM" | "LP" | "MP" | "HP";
  variantPrices?: Record<string, number | null>;
  variantTrends?: Record<string, { d7: number | null; d30: number | null }>;
  marketLow?: number | null;
  marketMid?: number | null;
  marketHigh?: number | null;
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

El sistema se apoya en una paleta moderna de tokens CSS definidos en `:root`, `.dark` y `@theme inline` en [`css/style.css`](css/style.css) (con extensiones en [`css/design.css`](css/design.css)):

### Tokens Principales del Tema:
- **Fondo base (`--background`):** `#000000` (OLED black, mapeado a `--bg-color`).
- **Superficies y Tarjetas (`--card` / `--popover`):** `#0f0f0f` (mapeado a `--surface-color`).
- **Secundario y Hover (`--secondary` / `--accent`):** `#2a2a2c` / `#1b1b1d` (mapeado a `--surface-hover`).
- **Bordes (`--border`):** `#26272d` (mapeado a `--border-color`).
- **Texto y Tipografía:**
  - Primario (`--foreground`): `#ffffff` (mapeado a `--text-primary`).
  - Secundario (`--muted-foreground`): `#bbcbb2` (mapeado a `--text-secondary`).
  - Apagado (`--chart-5`): `#6b7367` (mapeado a `--text-muted`).
  - Fuentes: `--font-sans` (`"Inter", ui-sans-serif, ...`), `--font-mono`, `--font-serif`, y `--font-display` (`'Cinzel', serif`).
- **Color Primario y Acentos:**
  - Primario de marca (`--primary` / `--ring` / `--sidebar-primary`): `#2fe92b` (verde neón eléctrico, RGB `47, 233, 43`, foreground `#0f0f0f`).
  - Destructivo / Peligro (`--destructive`): `#ff5102` (foreground `#ffffff`).
  - Acentos dinámicos de juego:
    - Pokémon: `--pk-accent: var(--primary)` (RGB `47, 233, 43`).
    - Magic: `--mtg-accent: #a78bfa` (RGB `167, 139, 250`).
    - `--accent-color` y `--accent-rgb` cambian dinámicamente según el juego activo vía `updateAppTheme()`.
- **Escala de Gráficos (`--chart-1` a `--chart-5`):**
  - `--chart-1: #2fe92b`, `--chart-2: #ff9821`, `--chart-3: #f57733`, `--chart-4: #ff5102`, `--chart-5: #6b7367`.
- **Geometría y Sombras:**
  - Radio base (`--radius`): `0.25rem` (4px). Derivados: `--radius-sm` (8px), `--radius-md` (16px), `--radius-lg` (24px).
  - Espaciado base (`--spacing`): `0.25rem` (4px) y escala `--space-1` a `--space-6`.
  - Sombras: `--shadow-blur: 24px`, `--shadow-color: #000000`, `--shadow-opacity: 0.08`, `--shadow-offset-y: 1px`.
- **Estructura del Shell:** Ancho adaptativo (`max-width: 500px` en móvil, responsive hasta 1360px en escritorio con navegación lateral y diálogo de dos columnas), respetando la barra de navegación fija y safe-area de iOS (`calc(var(--nav-height) + var(--safe-area-bottom))`).

### Componentes de UI Inspirados en Collectr:
- **Barra de Filtros y Ordenación (`.collectr-filter-bar`):**
  - Contenedor con scroll horizontal optimizado para móviles sin romper el layout.
  - Píldoras interactivas (`.filter-pill`): estados activo con acento neón y fondo sutil.
  - Desplegable de ordenación (`.filter-select`) para ordenar por relevancia, precio o nombre.
- **Tarjetas Coleccionables en Cuadrícula (`.card-item`):**
  - Contenedor de arte (`.card-artwork-wrapper`) con relación de aspecto coleccionable `63 / 88`.
  - Capa de brillo holográfico (`.card-holo-sheen`) con gradiente angular animado para cartas foil/holo.
  - Badges superpuestos: `.badge-lang` (idioma de la carta), `.badge-finish` (Holo, Reverse, 1st Ed) y `.possession-badge` (cantidad en mazo).
- **Detalle de Carta Coleccionable:**
  - Marco con reflejo dinámico (`.detail-card-wrapper` + `.holo-glare`).
  - Selector de Variante (`.variant-picker` / `.variant-pill`): muestra botones de acabado con precio en vivo por variante.
  - Selector de Condición (`.condition-picker` / `.condition-pill`): NM, LP, MP, HP con subtexto descriptivo.
  - Cuadrícula de Mercado (`.market-stats-grid`): tarjetas con Mínimo, Media y Máximo de mercado.
- **Hero Card de Portfolio (`.portfolio-hero-card`):**
  - Resumen visual en la pestaña Colección con valor total en EUR y USD, total de cartas, cartas únicas, acabados holo y desglose de idiomas.

### Iconografía (Heroicons v2):
- **Cero Emojis:** Todos los iconos de la UI provienen de [Heroicons v2](https://heroicons.com/) definidos en `js/icons.js` como SVGs vectoriales inline.
- **Acceso:** Vía `HEROICONS.<nombreIcono>` (ej. `HEROICONS.bolt`, `HEROICONS.magnifyingGlass`, `HEROICONS.camera`).
- **Resiliencia en Node.js:** En archivos compartidos con scripts de servidor (como `js/prices.js`), siempre se comprueba `typeof HEROICONS !== "undefined"`.

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
7. **Iconografía Profesional y Sin Emojis**:
   - **NO** usar emojis en la UI (botones, cabeceras, badges, acciones, mensajes o estados vacíos). Usar siempre los iconos SVG de `HEROICONS` en `js/icons.js` estilizados con `.heroicon`, `.heroicon-sm`, etc.

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
- **Histórico solo para cartas seguidas**: el trabajo diario registra únicamente cartas de la colección y los mazos; una carta que solo se busca no tiene gráfica. El histórico empieza el día que se activa el trabajo (no hay backfill).
- **Tendencia de Magic**: necesita ≥ 7 días de histórico (≥ 30 para d30). Pokémon usa las medias de Cardmarket y no depende del histórico propio.
- **Cron de GitHub**: se desactiva tras 60 días sin actividad en el repo; puede retrasarse unos minutos.
- **Dos monedas**: Cardmarket (EUR) y, en su defecto, TCGplayer (USD). No se convierten; los totales las muestran por separado.
- **Orden de resultados de TCGdex**: llega arbitrario (no cronológico), no hay fecha de lanzamiento en la lista.
- **Precio de TCGdex**: `trend` y `avg` de Cardmarket pueden diferir mucho en cartas poco vendidas; se usa `avg`.
- **Responsive verificado en**: 320, 360, 390, 412, 768, 980, 1024 y 1280 px, sin desbordes horizontales en las 7 vistas (Inicio, Buscar, editor, análisis, biblioteca, colección y detalle). Para repetirlo: cargar datos de prueba, redimensionar y comprobar que ningún elemento visible tiene `getBoundingClientRect().right > clientWidth`. Reglas que evitan los desbordes: `min-width: 0` en hijos flex/grid con texto, columnas `minmax(0, …)` y truncado con `text-overflow` en bloques (no en `inline`).
- **Escritorio en móvil**: si Chrome tiene «Sitio para ordenador», el ancho de página es ~980 px y se muestra el diseño de escritorio; `avisarModoEscritorio()` (app.js) lo detecta (táctil + pantalla ≤ 500 px + ancho ≥ 900 px) y muestra un aviso para desactivarlo.
- **Escapado**: todo texto de APIs/usuario que va a `innerHTML` debe pasar por `esc()` (definida en stats.js); ya se aplica en búsqueda, colección, editor y biblioteca de mazos.
- **Dos hojas de estilo**: `design.css` sobrescribe partes de `style.css` (p. ej. `.bottom-nav` quedó sin uso, `.search-container` y varios estilos del modal antiguo). Pendiente consolidarlas en una sola.
- **Sin tests automatizados**: la validación es manual en navegador.
- **`.DS_Store` commiteado**: ya está en `.gitignore`, pero el archivo sigue en el repositorio; elimínalo con `git rm --cached .DS_Store`.
- **Nube sin probar contra Supabase real**: la lógica se probó con un cliente simulado; falta una prueba de extremo a extremo con un proyecto real.
- **Sin caché-busting**: los scripts no llevan versión en la URL; tras desplegar, el navegador puede servir un JS antiguo hasta recargar.
- **`agent.md` aún sin trackear** en git en el momento de esta revisión.
