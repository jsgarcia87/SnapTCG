# Registro de Cambios (Changelog) — CardDex / SnapTCG

Todos los cambios notables de este proyecto se documentan en este archivo según los principios de [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/).

---

## [3.8.0] - 2026-10-14

### Añadido
- **Adaptación Visual Completa al Diseño Oficial de Figma (CardDex Pro)**:
  - **Paleta Cromática y Tokens de Alta Gama**:
    - Fondo de lienzo ultra limpio en blanco roto (`#F8FAFC`).
    - Tarjetas de contenido en blanco puro (`#FFFFFF`) con bordes sutiles (`#E2E8F0`) y sombras de elevación suaves.
    - Tarjetas de contraste hero en Obsidian Oscuro / Midnight Slate (`#172231`).
    - Color de acento primario Verde Lima Eléctrico (`#AFF33F`, RGB `175, 243, 63`) con texto de contraste oscuro (`#0F172A`).
  - **Nueva Cabecera Global de Escritorio (`.app-header`)**:
    - Emblema estilizado CardDex con tipografía geométrica e indicador de versión.
    - Barra de búsqueda rápida integrada con indicador de atajo de teclado `⌘K` (`Ctrl+K`).
    - Conmutador directo de juego activo (Pokémon / Magic).
    - Botón de acción destacado `+ Añadir carta` en verde lima eléctrico con apertura directa al buscador.
  - **Arquitectura de Navegación Dual Unificada (`.main-nav`)**:
    - Barra lateral izquierda (sidebar) en pantallas de escritorio (`min-width: 900px`) con cabecera de navegación, enlaces con píldora de acento lima activa, tarjeta promocional de escáner en obsidian (`#172231`) y ficha de perfil de usuario.
    - Transformación fluida en barra de navegación inferior en dispositivos móviles preservando los mismos IDs y listeners de eventos.
  - **Nuevo Dashboard de Inicio (`js/home.js`)**:
    - **Cabecera de Bienvenida**: Píldora de estado `MI COLECCIÓN`, saludo personalizado `Hola. Todo bajo control.`, subtítulo explicativo y selector de rango temporal (`Todos`, `30 días`, `7 días`).
    - **Fila 1 (3 Tarjetas de Métricas)**:
      - Tarjeta Hero Oscura (`#172231`): Valor total de colección con badge de tendencia a 7 días y barra de acción lima.
      - Tarjeta Total Cartas: Conteo total y desglose proporcional con barra de progreso segmentada en colores y leyenda por tipos.
      - Tarjeta Rendimiento Estimado: Porcentaje de rentabilidad y curva de tendencia SVG suavizada.
    - **Fila 2 (Columnas Centrales)**:
      - Columna izquierda «Lo que más se mueve»: Ranking con badges numéricos (`01`, `02`, `03`), miniaturas de cartas, minibarritas de rendimiento lima, cotización actual y badges de tendencia.
      - Columna derecha «Mazo activo»: Vista previa con abanico 3D de cartas en perspectiva (`.fanned-cards`), barra de progreso de rareza y estadísticas del mazo.
    - **Fila 3 (Pie de Dashboard)**:
      - Banner Hero Escáner Oscuro (`#172231`): Retícula de visor de cámara HUD con pulso luminoso, descripción persuasiva y botón circular verde lima con flecha para escaneo inmediato.
      - Columna derecha «Últimas cartas añadidas»: Carrusel de actividad reciente con miniaturas y precios.
  - **Armonización Estilística de Vistas Internas (Colección, Mazos, Escáner y Modal)**:
    - **Pestaña Colección (`#tab-collection`)**: Portfolio Hero Card adaptado a Obsidian Oscuro (`#172231`) con tipografía de alto contraste, desglose de estadísticas en chips con borde sutil, tarjetas de análisis de evolución del portfolio con gráficos en verde lima (`#AFF33F`) y barra de filtros estilo Collectr.
    - **Pestaña Editor de Mazos (`#tab-deck`)**: Selector de subpestañas (`.pill-switcher`) en blanco puro con píldora activa oscura, chips de estadísticas del mazo con cifras destacadas en 20px, barra de progreso con llenado lima, botones de acción primarios de alto impacto (`#AFF33F`), filas de cartas en mazo y tarjetas de mazos guardados con transiciones suaves.
    - **Escáner Activo de Cámara (`#tab-scanner`)**: Visor de cámara en Obsidian `#172231`, esquinas de encuadre en verde lima eléctrico (`#AFF33F`), retícula ROI para título con línea láser animada, píldoras de idioma del escáner en obsidian con activación lima y botón de disparo manual de captura.
    - **Modal de Detalle de Carta (`#card-detail-modal`)**: Selectores de variantes interactivas (`.variant-pill`) con cotizaciones actualizadas, selector de idioma (`.lang-pill`), selector de condición (`.condition-pill`) y cuadrícula de estadísticas de mercado (mínimo, media, máximo).
  - **Atajo Global de Teclado (`⌘K`)**:
    - Registrado listener global en `js/app.js` para enfocar de forma instantánea el campo de búsqueda rápida al pulsar `⌘K` en macOS o `Ctrl+K` en Windows/Linux.

---

## [3.7.0] - 2026-10-14

### Añadido
- **Integración y Coexistencia del SDK Oficial TCGdex (`@tcgdex/sdk@2`)**:
  - **Carga Global en Shell (`index.html`)**: Incorporado el bundle de navegador oficial `tcgdex.browser.global.min.js` (~8.9 KB minificado) vía CDN de jsDelivr manteniendo la arquitectura Zero-Build sin bundlers ni compiladores.
  - **Singleton Global y Sincronización de Idioma (`js/api.js`)**: Instanciación segura de `window.tcgdexClient = new TCGdex("es")` con TTL de caché configurado en 3600 segundos y helpers `normalizeTCGdexSDKLang` y `sincIdiomaTCGdexSDK` que mantienen sincronizado el idioma del SDK cuando el usuario cambia el selector de idioma en la búsqueda (`js/app.js`) o el escáner (`js/scanner.js`).
  - **Arquitectura Híbrida de Coexistencia Resiliente**:
    - **Hidratación y Búsqueda por Coleccionista (`pokemonTCGdexLocalId`)**: Intenta listar cartas mediante `tcgdexClient.card.list({ localId })` y obtener fichas individuales con `tcgdexClient.card.get(id)`, recurriendo automáticamente a peticiones directas REST `fetchJSON` con reintentos si el SDK no está disponible o la conexión falla.
    - **Búsqueda por Idioma Específico (`pokemonTCGdexLang`)**: Consulta híbrida mediante `tcgdexClient.card.list({ name })` e hidratación concurrente con `runPool`.
    - **Hidratación de Precios de Pokémon (`js/prices.js`)**: `hidratarPrecioPokemon` prioriza `tcgdexClient.card.get(id)` para cargar precios oficiales con caché local antes de recurrir a REST directo.
    - **Preservación de la Escalera de Búsqueda de Alto Rendimiento**: La consulta masiva en inglés conserva GraphQL (`/v2/graphql`) para obtener hasta 100 cartas en una única ida y vuelta de red, combinada con la normalización de nombres base, números de coleccionista y respaldo internacional.
  - **Nuevos Métodos de Utilidad del SDK**:
    - `obtenerCartaTCGdexSDK(cardId, lang)`: Ficha completa tipada de carta con precios normalizados.
    - `obtenerCartaAleatoriaSDK(lang)`: Acceso al endpoint aleatorio `/random/card` del SDK.
    - `obtenerSetTCGdexSDK(setId, lang)`: Consulta de metadatos y cartas de una expansión o set.

---

## [3.6.0] - 2026-10-13

### Añadido
- **Escalera de Búsqueda Resiliente con Fallbacks Multi-Nivel en la API (`js/api.js`)**:
  - **Detección y Búsqueda por Número de Coleccionista (`extraerNumeroColeccionista` / `pokemonTCGdexLocalId`)**:
    - Reconoce patrones de número de carta tipo `025/165` o `25/102`.
    - Si el nombre escaneado contiene número de coleccionista o falla la búsqueda por texto, consulta directamente por `localId` en TCGdex e hidrata precios con `runPool`.
    - Da máxima prioridad en la ordenación (`ordenarPorRelevancia`) a las cartas cuyo número coincide exactamente con el escaneado.
  - **Normalización y Extracción de Nombre Base (`normalizarNombrePokemon`)**:
    - Si la búsqueda exacta falla (p. ej. "Charizard VSTAR" frente al nombre español de TCGdex "Charizard V-ASTRO"), elimina sufijos de mecánicas (`VSTAR`, `VMAX`, `V`, `ex`, `EX`, `GX`, `BREAK`, `Prime`, `LV.X`, `Tag Team`) y reintenta con el nombre base ("Charizard").
  - **Fallback Internacional Translingüe**:
    - Si la carta no se localiza en el idioma activo (p. ej. carta escaneada en inglés mientras el filtro está en español, o viceversa), el sistema recurre a la base de datos en inglés y preserva los resultados.
    - Notificación informativa contextual (`showDeckToast`) indicando el idioma de respaldo.
  - **Búsqueda Resiliente en Magic: The Gathering**:
    - Limpieza de palabras de tipo de criatura/hechizo (`Creature`, `Sorcery`, `Instant`, `Legendary`, etc.) y búsqueda general tolerante a fallos en Scryfall.

### Corregido
- **Corrección de Prioridad de Línea de Título en OCR (`js/scanner.js`)**:
  - `getBestLine` ahora ejecuta `cleanOcrText` en cada línea candidata antes de evaluarla, descartando textos de encabezado genéricos como "Basic", "Stage 1", "Fase 2", "1阶", etc.
  - Puntuación de líneas ponderada por longitud útil de texto (`confidence + lenBonus`) para evitar que tokens o letras aisladas superen al nombre de la carta.
- **Ajuste de Umbrales de Confianza OCR**:
  - Reducidos los umbrales excesivamente restrictivos (`MIN_CONF_PASS1 = 38`, `MIN_CONF_PASS2 = 30`, `MIN_CONF_CJK = 30`) para permitir lecturas en cámaras móviles con iluminación moderada.
- **Ampliación de Margen de la Región de Interés (ROI)**:
  - Añadido margen de seguridad dinámico (+12% horizontal, +20% vertical) en `extractHeaderRoi` para evitar que el título de la carta quede cortado si la carta se inclina levemente.
  - Fallback en captura manual (`capturarYProcesar`) a la franja superior del 35% del fotograma si la ROI estrecha no arroja texto.
- **Prevención de Filtrado Accidental en Resultados de Fallback (`js/app.js`)**:
  - `filterAndSortCards` ahora preserva las cartas devueltas por fallback lingüístico en lugar de descartarlas a lista vacía.

---

## [3.5.0] - 2026-10-13

### Añadido
- **Soporte Multilingüe Completo en el Escáner de Cámara (Chino, Japonés, Coreano)**:
  - **Modelos Lingüísticos Especializados Tesseract.js**:
    - **Chino (`chi_sim + chi_tra + eng`)**: Reconocimiento en paralelo de caracteres Hanzi Simplificados (China continental) y Tradicionales (Taiwán, Hong Kong) junto a sufijos latinos de cartas Pokémon ("ex", "V", "VMAX", "VSTAR", "GX").
    - **Japonés (`jpn + eng`)**: Soporte para kanji y silabarios kana (Hiragana y Katakana).
    - **Coreano (`kor + eng`)**: Soporte para caracteres hangul y jamo.
    - Carga asíncrona optimizada de modelos `4.0.0_fast` con barra de progreso de descarga y caché permanente en IndexedDB.
  - **Selector Rápido de Idioma en el Escáner (`.scanner-lang-bar`)**:
    - Píldoras interactivas en pantalla (`Auto (EN/ES)`, `中文 (ZH)`, `日本語 (JA)`, `한국어 (KO)`).
    - Sincronización bidireccional inmediata con los filtros de búsqueda Collectr (`syncScannerLanguage` / `setScannerLanguage`).
  - **Sanitización y Limpieza de Caracteres CJK (`cleanOcrText`)**:
    - Soporte de rangos Unicode de ideogramas (`\u4E00-\u9FFF`, `\u3400-\u4DBF`, `\u3040-\u30FF`, `\uAC00-\uD7AF`).
    - Eliminación de prefijos/sufijos de HP y fases evolutivas en chino y japonés (`基础`, `1阶`, `たね`, `血量`, etc.).
    - Umbral de longitud adaptado a ideogramas (permite nombres válidos de 2 caracteres como 耿鬼 o 快龙).
  - **Búsqueda Automática Inteligente por Ideogramas en `js/api.js`**:
    - Si el texto escaneado o introducido contiene caracteres chinos (`/[\u4E00-\u9FFF]/`), `buscarPokemon` consulta automáticamente en paralelo `zh-cn` y `zh-tw` incluso con el filtro general en "Todos" (`all`).
    - En Magic: The Gathering, `buscarMagic` busca por `printed:"[nombre]"` si la resolución fuzzy en inglés no encuentra la carta.

### Corregido
- **Error `updateCollectionButton is not defined`**:
  - Eliminada doble declaración `let collectionFilter` en `js/cloud.js` que provocaba un fallo de sintaxis en el intérprete del navegador e impedía que `cloud.js` exportase sus funciones.
  - Blindada la llamada en `abrirDetalle` con comprobación condicional segura `typeof updateCollectionButton === "function"`.

---

## [3.4.0] - 2026-10-13

### Añadido
- **Escáner de Cámara Profesional de Nueva Generación**:
  - **Algoritmo de Binarización Adaptativa Otsu (`computeOtsuThreshold`)**:
    - Preprocesamiento matemático en Canvas puro (`getImageData`) que calcula el umbral óptimo de binarización sin dependencias pesadas de WASM.
    - Elimina completamente reflejos parásitos de cartas holográficas, brillos directos, sombras y fondos coloreados.
  - **Filtro Laplaciano de Nitidez y Movimiento en Tiempo Real (`calculateSharpness`)**:
    - Aplica un operador diferencial discreto 3x3 para medir la varianza de gradientes en el fotograma.
    - Si el usuario mueve la mano o la cámara desenfoca (varianza < 130), el estado muestra en ámbar *"MANTÉN LA CARTA QUIETA"* y salta la ejecución del OCR.
    - Evita recalentamiento de CPU y ahorra batería drásticamente en dispositivos móviles.
  - **Estrategia Multi-Pase de Reconocimiento OCR**:
    - **Pase 1 (Otsu)**: Binarizado blanco/negro de alta confianza para texto nítido sobre arte brillante.
    - **Pase 2 (Contraste Normalizado)**: Fallback para gradientes sutiles o tipografías oscuras.
  - **Proyección Geométrica Exacta de la Región de Interés (ROI)**:
    - Mapeo matemático entre el recuadro visual en pantalla y las coordenadas nativas del video stream considerando la escala y desfase de `object-fit: cover`.
    - Solo recorta y analiza la franja superior de la carta donde reside el nombre.
  - **Controles de Hardware de Cámara**:
    - **Linterna / Torch (`toggleLinterna`)**: Detección de `track.getCapabilities().torch` con botón de activación directa para escanear en interiores con poca luz.
    - **Cambio de Cámara (`cambiarCamara`)**: Alternancia entre cámara trasera (`environment`) y delantera (`user`).
    - **Botón de Cierre Rápido (`detenerEscaner`)**: Icono `xMark` para salir del modo escáner sin desconfigurar la vista.
  - **Subida y Análisis de Fotos desde Galería (`procesarImagenArchivo`)**:
    - Soporte completo para seleccionar fotos existentes desde la biblioteca del dispositivo mediante `<input type="file">`.
  - **Feedback Auditivo y Háptico Inmediato**:
    - **Chime Sintetizado Web Audio API (`playSuccessChime`)**: Genera un tono de confirmación ascendente (880Hz -> 1320Hz) sin necesidad de descargar archivos de audio externos.
    - **Vibración Táctil (`triggerHaptic`)**: Pulso doble (`[45, 30, 45]ms`) en dispositivos móviles compatibles.
  - **Rediseño UI del Escáner (Estilo TCG Pro 63:88)**:
    - Marco de proporción estándar de carta coleccionable con 4 esquinas de enfoque en color neón `--primary`.
    - Recuadro objetivo *"ÁREA DEL NOMBRE"* con haz láser animado continuo.
    - Recorte visual con scrim oscuro radial (`box-shadow: 0 0 0 9999px rgba(0,0,0,0.52)`).
    - Barra inferior con acceso directo a galería y disparador manual de fotograma.
- **Iconografía Heroicons v2**:
  - Incorporados `photo` (galería) y `arrowPathRoundedSquare` (conmutación de cámara).


### Añadido
- **Soporte de Nuevos Idiomas (Chino y Lenguas Internacionales)**:
  - **Chino Completo**:
    - `ZH`: Búsqueda unificada en chino (consulta en paralelo tanto Simplificado como Tradicional).
    - `ZH-CN`: Chino Simplificado (cartas de China continental en TCGdex `/v2/zh-cn/` y Scryfall `lang:zhs`).
    - `ZH-TW`: Chino Tradicional (cartas de Taiwán y Hong Kong en TCGdex `/v2/zh-tw/` y Scryfall `lang:zht`).
  - **Idiomas Asiáticos y Europeos Adicionales**:
    - Coreano (`KO`), Francés (`FR`), Alemán (`DE`), Italiano (`IT`) y Portugués (`PT`).
  - **Selector de Idioma en la Ficha de Detalle** (`.lang-section` / `.lang-picker`):
    - Permite al usuario conmutar el idioma de la carta directamente desde el modal (`EN`, `ES`, `JA`, `ZH-CN`, `ZH-TW`, `KO`, `FR`, `DE`, `IT`, `PT`).
    - Actualiza en vivo el badge visual de la carta, los chips de información y persiste el idioma al guardarla en la colección.
  - **Filtros Expandidos en Buscador y Colección**:
    - Incorporación de las nuevas píldoras de idioma en la barra de búsqueda y en el portfolio de colección.
    - Filtrado inteligente con `matchCardLang` (permite agrupar `ZH` o filtrar específicamente por sub-variante).
  - **Funciones de Normalización en `js/api.js`**:
    - `SUPPORTED_LANGUAGES`: catálogo estructurado de idiomas.
    - `formatLanguageBadge`: genera etiquetas cortas normalizadas (`ZH-CN`, `ZH-TW`, etc.).
    - `formatLanguageName`: nombres legibles en español con descripciones completas.
    - `matchCardLang`: matching flexible entre variantes regionales.
    - `getScryfallLangFilter`: genera filtros precisos de Scryfall con fallback automático y aviso toast si no existen impresiones en ese idioma.

---

## [3.2.0] - 2026-10-13

### Añadido
- **Rediseño UI/UX Inspirado en Collectr (getcollectr.com)**:
  - **Barra de Filtros y Ordenación estilo Collectr** (`.collectr-filter-bar`):
    - Filtro de **Idioma**: `Todos`, `EN` (Inglés), `ES` (Español) y `JA` (Japonés).
    - Filtro de **Acabado / Estilo Holo**: `Todos`, `Holofoil`, `Normal` y `Reverse`.
    - Selector de **Ordenación**: Relevancia, Mayor precio, Menor precio y Nombre (A-Z).
  - **Ficha de Detalle de Carta Enriquecida**:
    - Marco de carta coleccionable con efecto de brillo holográfico dinámico (`.holo-glare`).
    - **Selector interactivo de Variante / Acabado** (`.variant-picker`): Normal, Holofoil, Reverse Holo y 1st Edition con indicación de precio en tiempo real por variante.
    - **Selector de Condición de la Carta** (`.condition-picker`): NM (Near Mint), LP (Light Play), MP (Moderate Play) y HP (Heavy Play).
    - **Panel de Estadísticas de Mercado** (`.market-stats-grid`): Indicadores de precio Mínimo, Media y Máximo.
  - **Portfolio y Colección Rediseñados**:
    - **Hero Card de Portfolio** (`.portfolio-hero-card`) con métricas globales consolidadas: Valor total en EUR y USD, Total de cartas, Cartas únicas, Cantidad de Holo/Foil y Desglose por Idiomas.
    - Filtros rápidos en la colección por Juego (Pokémon/Magic), Acabado e Idioma, con ordenación por Valor, Cantidad o Nombre.
    - Tarjetas de colección con badges de condición, acabado, idioma y controles táctiles de cantidad (`+`/`-`).
- **Soporte Multilingüe y Modelado de Variantes**:
  - Normalización en `js/api.js` de variantes de TCGdex (`normal`, `holo`, `reverse`, `firstEdition`) y Scryfall (`nonfoil`, `foil`, `etched`).
  - Búsqueda por idioma con claves de caché segregadas (`search:${juego}:${lang}:${nombre}`).
  - Desglose y cálculo de precios por variante en `js/prices.js` (`variantPrices`, `variantTrends`, `getCardActivePrice`, `getCardActiveTrend`).
- **Iconografía Heroicons v2**:
  - Incorporación de nuevos iconos SVG vectoriales: `funnel` (embudo de filtros), `globeAlt` (idioma), `check` (confirmación) y `arrowsUpDown` (ordenación).
  - Cero emojis en toda la aplicación, manteniendo consistencia visual profesional.

---

## [3.1.0] - 2026-10-12

### Añadido
- **Nuevo Sistema de Diseño y Tokens Modernos**:
  - Incorporación del conjunto de tokens CSS estándar (`:root`, `.dark` y `@theme inline`) con paleta de alto contraste, negro OLED (`#000000`) y acento verde eléctrico (`#2fe92b`).
  - Soporte explícito para clase `.dark` en `<html>` y `<body>`.
  - Inclusión de la tipografía **Inter** vía Google Fonts (`--font-sans`).
  - Escala cromática para gráficos (`--chart-1` a `--chart-5`), destructivo (`--destructive: #ff5102`), superficies (`--card: #0f0f0f`), entradas (`--input: #1b1b1d`) y bordes (`--border: #26272d`).
  - Tokens de geometría y espaciado: `--radius: 0.25rem`, `--spacing: 0.25rem`.
- **Iconografía Profesional con Heroicons v2 (Cero Emojis)**:
  - Creación de [`js/icons.js`](js/icons.js) con catálogo centralizado `HEROICONS` conteniendo SVGs vectoriales inline extraídos de [Heroicons](https://heroicons.com/).
  - Iconos integrados: `bolt`, `sparkles`, `trophy`, `home`, `magnifyingGlass`, `camera`, `rectangleStack`, `archiveBox`, `bookmark`, `arrowUpTray`, `plusCircle`, `trash`, `arrowPath`, `link`, `play`, `xMark`, `plus`, `minus`, `arrowTrendingUp`, `arrowTrendingDown`.
  - Reemplazo total de emojis y caracteres unicode en la interfaz (botones de juego, barra de búsqueda, navegación inferior, acciones del editor de mazos, simulación Monte Carlo, refresco de precios, indicadores de tendencia y diálogos modales).
- **Documentación**:
  - Actualización completa de la guía técnica en [`agent.md`](agent.md) reflejando los nuevos tokens, jerarquía visual, catálogo de iconos y reglas de desarrollo sin emojis.
  - Creación del archivo [`CHANGELOG.md`](CHANGELOG.md).

### Modificado
- [`css/style.css`](css/style.css):
  - Definición completa de `:root`, `.dark` y `@theme inline`.
  - Mapeo de tokens base (`--bg-color`, `--surface-color`, `--surface-hover`, `--border-color`, `--text-primary`, `--text-secondary`, `--text-muted`, `--radius-*`, `--font-main`).
  - Acento primario actualizado a `#2fe92b` con preservación del modo Magic (`--mtg-accent: #a78bfa`).
  - Outline de foco `:focus-visible` actualizado para usar `var(--ring)`.
  - Botones principales y de búsqueda adaptados para usar `var(--primary-foreground)`.
  - Botones de peligro/eliminación actualizados para usar `var(--destructive)` y `var(--destructive-foreground)`.
  - Clases utilitarias y de dimensionamiento para iconos Heroicons (`.heroicon`, `.heroicon-sm`, `.heroicon-lg`, `.btn-icon`, `.trend-icon`, `.sdi-icon svg`, `.placeholder-icon svg`).
- [`css/design.css`](css/design.css):
  - Mapeo de espaciados (`--space-1` a `--space-6`) dependientes de `--spacing`.
  - Fondo de la barra de navegación fija (`.main-nav`) adaptado a negro OLED puro (`rgba(0, 0, 0, 0.92)`).
  - Anillo de selección de cartas adaptado a `var(--ring)`.
- [`index.html`](index.html):
  - Añadida la clase `dark` a las etiquetas `<html>` y `<body>`.
  - Añadida la fuente `Inter` al enlace de Google Fonts.
  - Carga prioritaria de `js/icons.js`.
  - Reemplazo de emojis en botones de alternancia de juego, barra de búsqueda, navegación fija, barra de acciones de mazos y modales por iconos SVG de Heroicons.
- [`js/home.js`](js/home.js), [`js/deckbuilder.js`](js/deckbuilder.js), [`js/cloud.js`](js/cloud.js), [`js/stats.js`](js/stats.js), [`js/prices.js`](js/prices.js), [`js/app.js`](js/app.js):
  - Sustitución de emojis y caracteres especiales por iconos de `HEROICONS`.
  - Compatibilidad defensiva (`typeof HEROICONS !== 'undefined'`) en módulos consumidos en Node.js CI (`prices.js`).

---

## [3.0.0] - 2026-10-12
### Añadido
- Rediseño UX/UI con pantalla de Inicio (hero de valor, movimientos y onboarding).
- Navegación de 4 destinos (Inicio, Buscar, Mazos, Colección) responsive (barra inferior en móvil, lateral en escritorio).
- Ficha de detalle de carta enriquecida con gráficos de evolución y selector de rango de fechas.

## [2.3.0] - 2026-10-11
### Añadido
- Histórico de precios en la nube (Supabase) y almacenamiento local.
- Gráficas SVG interactivas sin dependencias externas (`charts.js`).
- Cálculo de tendencias a 7 y 30 días para Magic y Pokémon.

## [2.2.0] - 2026-10-10
### Añadido
- Integración de precios en tiempo real con TCGdex (Cardmarket y TCGplayer).
- Caché resiliente de precios con reintentos y tolerancia offline.
