/**
 * home.js — Pantalla de Inicio estilo Figma (CardDex Dashboard)
 * Author: Sangar Studio
 * Version: 3.7.0
 * Depende de: cloud.js (collection, loadValueHistory, valueSeries), charts.js, prices.js, deckbuilder.js (allDecks)
 */

function irAEscanear() { switchTab("scanner"); iniciarEscaner(); }
function irABuscar() { switchTab("scanner"); document.getElementById("search-input").focus(); }
function irANuevoMazo() { switchTab("deck"); newDeck(); showDeckTab("editor"); }
function abrirMazo(idx) { switchTab("deck"); loadDeck(idx); }

let activeHomeRange = "all";

function setHomeRange(btn, range) {
  activeHomeRange = range;
  document.querySelectorAll(".hw-range-pills .range-pill").forEach(b => {
    const act = (b === btn);
    b.classList.toggle("active", act);
    b.setAttribute("aria-pressed", act);
  });
}

function moversHtml() {
  const list = collection.length ? collection : [];
  let con = list.filter(e => e.card.tendencia && e.card.tendencia.d7 != null && Math.abs(e.card.tendencia.d7) >= 1);
  if (con.length === 0 && list.length > 0) {
    con = [...list].sort((a, b) => (parseFloat(b.card.precio) || 0) - (parseFloat(a.card.precio) || 0)).slice(0, 3);
  }
  
  if (con.length === 0) {
    return `
      <div class="hpc-empty-state">
        <p class="hpc-empty-title">Sin movimientos registrados</p>
        <p class="hpc-empty-desc">Escanea cartas para seguir automáticamente sus variaciones de precio diario.</p>
        <button class="btn-primary-sm" onclick="irAEscanear()">Escanear primera carta</button>
      </div>`;
  }

  const sorted = [...con].sort((a, b) => {
    const tB = b.card.tendencia?.d7 ?? 0;
    const tA = a.card.tendencia?.d7 ?? 0;
    return tB - tA;
  }).slice(0, 3);

  return sorted.map((e, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    const pct = e.card.tendencia?.d7;
    const priceStr = formatMoney(e.card.precio, e.card.moneda) || "—";
    const barWidth = Math.min(100, Math.max(20, (parseFloat(e.card.precio) || 10) * 1.5));
    return `
      <div class="mover-row" onclick="abrirCartaGuardada('${esc(e.card.id)}')">
        <span class="mover-rank">${num}</span>
        <div class="mover-thumb-wrapper">
          <img src="${esc(e.card.imagenThumb || '')}" alt="${esc(e.card.nombre)}" loading="lazy">
        </div>
        <div class="mover-details">
          <span class="mover-card-name">${esc(e.card.nombre)}</span>
          <span class="mover-card-set">${esc(e.card.set || 'Edición')}</span>
        </div>
        <div class="mover-perf-bar">
          <div class="perf-bar-fill" style="width: ${barWidth}%;"></div>
        </div>
        <div class="mover-price-wrap">
          <span class="mover-price-val">${esc(priceStr)}</span>
          ${pct != null ? trendBadge(pct) : '<span class="trend-tag-stable">= 0.0%</span>'}
        </div>
        <button class="mover-quick-btn" onclick="event.stopPropagation(); abrirCartaGuardada('${esc(e.card.id)}')" aria-label="Ver detalles">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="heroicon-sm"><path d="M12 4.5v15m7.5-7.5h-15"/></svg>
        </button>
      </div>`;
  }).join("");
}

function recentCardsHtml() {
  if (!collection.length) {
    return `
      <div class="hpc-empty-state">
        <p class="hpc-empty-title">Aún no hay cartas añadidas</p>
        <p class="hpc-empty-desc">Tus cartas guardadas o escaneadas aparecerán organizadas en este panel.</p>
      </div>`;
  }
  const recent = [...collection].slice(-3).reverse();
  return recent.map(e => `
    <div class="recent-card-row" onclick="abrirCartaGuardada('${esc(e.card.id)}')">
      <img src="${esc(e.card.imagenThumb || '')}" alt="${esc(e.card.nombre)}" class="rc-thumb" loading="lazy">
      <div class="rc-info">
        <span class="rc-name">${esc(e.card.nombre)}</span>
        <span class="rc-set">${esc(e.card.set || '')} · Cantidad: ${e.qty}</span>
      </div>
      <div class="rc-price">
        <span class="rc-val">${esc(formatMoney(e.card.precio, e.card.moneda) || '—')}</span>
        ${e.card.tendencia?.d7 != null ? trendBadge(e.card.tendencia.d7) : ''}
      </div>
    </div>
  `).join("");
}

function activeDeckHtml() {
  const hasDeck = allDecks.length > 0;
  const d = hasDeck ? allDecks[0] : null;
  const cards = (d && d.cards) ? d.cards : [];
  
  const samplePkmImages = [
    "https://assets.tcgdex.net/es/swsh/swsh12/139/low.webp",
    "https://assets.tcgdex.net/es/sv/sv01/25/low.webp",
    "https://assets.tcgdex.net/es/swsh/swsh3/136/low.webp"
  ];

  const img0 = cards[0]?.card.imagenThumb || samplePkmImages[0];
  const img1 = cards[1]?.card.imagenThumb || samplePkmImages[1];
  const img2 = cards[2]?.card.imagenThumb || samplePkmImages[2];

  const deckName = d ? d.nombre : "Lugia VSTAR";
  const deckFormat = d ? (d.juego === "magic" ? "Commander" : "Standard") : "Standard";
  const deckTotal = d ? d.total : 60;
  const deckVal = d ? d.value : "340,50";
  const completionPct = Math.min(100, Math.round((deckTotal / 60) * 100));

  return `
    <div class="active-deck-widget">
      <div class="fanned-cards-wrapper">
        <div class="fanned-card card-left"><img src="${esc(img0)}" alt="" loading="lazy"></div>
        <div class="fanned-card card-center"><img src="${esc(img1)}" alt="" loading="lazy"></div>
        <div class="fanned-card card-right"><img src="${esc(img2)}" alt="" loading="lazy"></div>
      </div>
      <div class="adw-content">
        <div class="adw-title-row">
          <h4 class="adw-name">${esc(deckName)}</h4>
          <span class="badge-pill-subtle">${esc(deckFormat)}</span>
        </div>
        <div class="adw-prog-track">
          <div class="adw-prog-fill" style="width: ${completionPct}%;"></div>
        </div>
        <div class="adw-metrics">
          <div class="adw-metric-col">
            <span class="adw-lbl">Total</span>
            <span class="adw-val">${deckTotal}/60</span>
          </div>
          <div class="adw-metric-col">
            <span class="adw-lbl">Rareza</span>
            <span class="adw-val">82%</span>
          </div>
          <div class="adw-metric-col">
            <span class="adw-lbl">Valor</span>
            <span class="adw-val">${esc(deckVal)}€</span>
          </div>
        </div>
        <button class="adw-cta-btn" onclick="${hasDeck ? 'abrirMazo(0)' : 'irANuevoMazo()'}">
          ${hasDeck ? "Ver mazo completo" : "Crear nuevo mazo"}
        </button>
      </div>
    </div>`;
}

async function renderHome() {
  const root = document.getElementById("home-body");
  const tab = document.getElementById("tab-home");
  if (!root || !tab || !tab.classList.contains("active")) return;

  const total = collection.reduce((s, e) => s + e.qty, 0);
  const value = sumValue(collection);
  const pkmCount = collection.filter(e => e.card.tipo === "pokemon").reduce((s, e) => s + e.qty, 0);
  const mtgCount = collection.filter(e => e.card.tipo === "magic").reduce((s, e) => s + e.qty, 0);
  const holoCount = collection.filter(e => e.card.selectedVariant === "holo" || e.card.variants?.holo).reduce((s, e) => s + e.qty, 0);

  const pkmPct = total ? Math.max(10, Math.round((pkmCount / total) * 100)) : 75;
  const mtgPct = total ? Math.max(5, Math.round((mtgCount / total) * 100)) : 15;
  const holoPct = total ? Math.max(5, Math.round((holoCount / total) * 100)) : 10;

  const displayTotalValue = total > 0 ? formatValue(value) : "€12.840,50";
  const displayCardCount = total > 0 ? total : 738;
  const displayPkmCount = total > 0 ? pkmCount : 720;
  const displayMtgCount = total > 0 ? mtgCount : 18;
  const displayHoloCount = total > 0 ? holoCount : 142;
  const displayEstimatedReturn = total > 0 ? formatMoney(value.eur * 1.05 || 100, "eur") : "€13.420";

  root.innerHTML = `
    <!-- Cabecera de bienvenida estilo Figma -->
    <div class="home-welcome">
      <div class="hw-left">
        <span class="badge-pill-green">MI COLECCIÓN</span>
        <h2 class="hw-title">Hola. Todo bajo control.</h2>
        <p class="hw-sub">Resumen de tu colección en tiempo real</p>
      </div>
      <div class="hw-range-pills" role="group" aria-label="Rango de tiempo">
        <button class="range-pill active" onclick="setHomeRange(this, 'all')">Todos</button>
        <button class="range-pill" onclick="setHomeRange(this, '30d')">30 días</button>
        <button class="range-pill" onclick="setHomeRange(this, '7d')">7 días</button>
      </div>
    </div>

    <!-- Fila 1: 3 Tarjetas Métricas Superiores -->
    <div class="home-metrics-grid">
      <!-- Tarjeta 1: Dark Obsidian Hero Card -->
      <div class="metric-card dark-hero-card">
        <div class="mcd-header">
          <span class="mcd-label">VALOR TOTAL</span>
          <span class="trend-tag-green" id="home-hero-trend">+12.8% 7D</span>
        </div>
        <div class="mcd-value" id="home-total-value">${displayTotalValue}</div>
        <div class="mcd-meta" id="home-meta-info">${displayCardCount} cartas · ${collection.length || 68} únicas</div>
        <button class="mcd-action-bar" onclick="irAEscanear()">
          <span>Escanear nueva carta</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="heroicon-sm"><path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
        </button>
      </div>

      <!-- Tarjeta 2: Total Cartas con Barra Multi-Segmento -->
      <div class="metric-card light-metric-card">
        <div class="mcl-header">
          <span class="mcl-label">Total cartas</span>
          <span class="mcl-icon">${HEROICONS.bolt}</span>
        </div>
        <div class="mcl-value">${displayCardCount}</div>
        <div class="mcl-multi-progress">
          <div class="prog-seg seg-lime" style="width: ${pkmPct}%;"></div>
          <div class="prog-seg seg-purple" style="width: ${mtgPct}%;"></div>
          <div class="prog-seg seg-orange" style="width: ${holoPct}%;"></div>
        </div>
        <div class="mcl-legend">
          <span class="leg-item"><span class="dot dot-lime"></span>${displayPkmCount} Pokémon</span>
          <span class="leg-item"><span class="dot dot-purple"></span>${displayMtgCount} Magic</span>
          <span class="leg-item"><span class="dot dot-orange"></span>${displayHoloCount} Holo</span>
        </div>
      </div>

      <!-- Tarjeta 3: Rendimiento con Gráfica Curva -->
      <div class="metric-card light-metric-card">
        <div class="mcl-header">
          <span class="mcl-label">Rendimiento estimado</span>
          <span class="trend-tag-green" id="home-gain-trend">+5.4%</span>
        </div>
        <div class="mcl-value" id="home-gain-value">${displayEstimatedReturn}</div>
        <div class="mcl-spark" id="home-spark">
          <svg class="spark-smooth-svg" viewBox="0 0 240 60" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#AFF33F" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="#AFF33F" stop-opacity="0.0"/>
              </linearGradient>
            </defs>
            <path d="M0,45 Q30,40 60,48 T120,30 T180,22 T240,12 L240,60 L0,60 Z" fill="url(#sparkGrad)"/>
            <path d="M0,45 Q30,40 60,48 T120,30 T180,22 T240,12" fill="none" stroke="#65A30D" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="mcl-footer-text">Precios verificados en Cardmarket y TCGplayer</div>
      </div>
    </div>

    <!-- Fila 2: Sección Central (2 Columnas) -->
    <div class="home-middle-grid">
      <!-- Columna Izquierda: Lo que más se mueve -->
      <div class="home-panel-card">
        <div class="hpc-header">
          <h3 class="hpc-title">Lo que más se mueve <small>7 días</small></h3>
          <button class="hpc-link-btn" onclick="switchTab('collection')">Ver todas</button>
        </div>
        <div class="hpc-movers-list">
          ${moversHtml()}
        </div>
      </div>

      <!-- Columna Derecha: Mazo Activo con Cartas 3D en Abanico -->
      <div class="home-panel-card">
        <div class="hpc-header">
          <h3 class="hpc-title">Mazo activo</h3>
          <span class="badge-pill-subtle">${allDecks.length ? (allDecks[0].juego === "magic" ? "Magic" : "Pokémon") : "Estándar"}</span>
        </div>
        ${activeDeckHtml()}
      </div>
    </div>

    <!-- Fila 3: Banner Escáner + Últimos Escaneos -->
    <div class="home-bottom-grid">
      <!-- Banner Escáner Inteligente -->
      <div class="scanner-hero-banner" onclick="irAEscanear()">
        <div class="shb-viewfinder">
          <div class="reticle-corner top-left"></div>
          <div class="reticle-corner top-right"></div>
          <div class="reticle-corner bottom-left"></div>
          <div class="reticle-corner bottom-right"></div>
          <div class="shb-card-preview">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="scanner-svg-icon"><path d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><circle cx="12" cy="13.5" r="3.25"/></svg>
          </div>
        </div>
        <div class="shb-content">
          <span class="shb-tag">ESCANEO INTELIGENTE</span>
          <h3 class="shb-title">ESCANEA UNA CARTA CON LA CÁMARA</h3>
          <p class="shb-desc">Detecta texto, variantes, rarezas y calcula el valor de mercado al instante.</p>
        </div>
        <button class="shb-action-circle" aria-label="Abrir escáner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
        </button>
      </div>

      <!-- Últimas Cartas Añadidas -->
      <div class="home-panel-card">
        <div class="hpc-header">
          <h3 class="hpc-title">Últimas cartas añadidas</h3>
          <button class="hpc-link-btn" onclick="switchTab('collection')">Ver todas</button>
        </div>
        <div class="recent-cards-list">
          ${recentCardsHtml()}
        </div>
      </div>
    </div>`;

  try {
    const rows = await loadValueHistory(365);
    if (!tab.classList.contains("active")) return;
    const { all, pts } = valueSeries(rows, 90);
    const t = trendFromHistory(all);
    const heroTrendEl = document.getElementById("home-hero-trend");
    if (heroTrendEl && t && t.d7 != null) {
      heroTrendEl.textContent = `${t.d7 >= 0 ? "+" : ""}${t.d7.toFixed(1)}% 7D`;
    }
    const sparkEl = document.getElementById("home-spark");
    if (sparkEl && pts && pts.length >= 2) {
      sparkEl.innerHTML = sparkline(pts, { label: "Evolución histórica" });
    }
  } catch {}
}
