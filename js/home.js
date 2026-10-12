/**
 * home.js — Pantalla de Inicio: valor de la colección, movimientos y accesos rápidos
 * Author: Sangar Studio
 * Version: 3.0.0
 * Depende de: cloud.js (collection, loadValueHistory, valueSeries), charts.js, prices.js, deckbuilder.js (allDecks)
 */

function irAEscanear() { switchTab("scanner"); iniciarEscaner(); }
function irABuscar() { switchTab("scanner"); document.getElementById("search-input").focus(); }
function irANuevoMazo() { switchTab("deck"); newDeck(); showDeckTab("editor"); }
function abrirMazo(idx) { switchTab("deck"); loadDeck(idx); }

const ICON = {
  scan: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  deck: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="12" height="15" rx="2"/><path d="M8 3h10a3 3 0 0 1 3 3v12"/></svg>'
};

function quickActions() {
  return `<div class="quick-actions">
    <button class="quick-btn" onclick="irAEscanear()">${ICON.scan}<span>Escanear</span></button>
    <button class="quick-btn" onclick="irABuscar()">${ICON.search}<span>Buscar</span></button>
    <button class="quick-btn" onclick="irANuevoMazo()">${ICON.deck}<span>Nuevo mazo</span></button>
  </div>`;
}

function onboardingHtml(editable) {
  if (!editable) {
    return `<section class="hero-card"><p class="eyebrow">Colección pública</p>
      <p class="hero-empty">Esta colección todavía está vacía.</p></section>${quickActions()}`;
  }
  return `<section class="hero-card">
      <p class="eyebrow">Bienvenido a CardDex</p>
      <h2 class="hero-title">Empieza tu colección</h2>
      <ol class="steps">
        <li><strong>Busca o escanea</strong> una carta de Pokémon o Magic.</li>
        <li><strong>Ábrela</strong> y pulsa «Añadir a colección».</li>
        <li><strong>Sigue su valor</strong>: el precio y su evolución se actualizan cada día.</li>
      </ol>
    </section>${quickActions()}`;
}

function moversHtml() {
  const con = collection.filter(e => e.card.tendencia && e.card.tendencia.d7 != null && Math.abs(e.card.tendencia.d7) >= 1);
  if (con.length === 0) return "";
  const sorted = [...con].sort((a, b) => b.card.tendencia.d7 - a.card.tendencia.d7);
  const up = sorted.filter(e => e.card.tendencia.d7 > 0).slice(0, 3);
  const down = sorted.filter(e => e.card.tendencia.d7 < 0).slice(-3).reverse();
  const row = (e) => `<button class="mover" onclick="abrirCartaGuardada('${esc(e.card.id)}')">
      <img src="${esc(e.card.imagenThumb || "")}" alt="" loading="lazy">
      <span class="mover-name">${esc(e.card.nombre)}<small>${esc(e.card.set || "")}</small></span>
      <span class="mover-price">${esc(formatMoney(e.card.precio, e.card.moneda) || "")}${trendBadge(e.card.tendencia.d7)}</span></button>`;
  return `<section class="home-section"><h2 class="section-title">Lo que más se mueve <small>7 días</small></h2>
    <div class="movers">${up.map(row).join("")}${down.map(row).join("")}</div></section>`;
}

function recentDecksHtml() {
  if (!allDecks.length) return "";
  const items = allDecks.map((d, i) => ({ d, i })).slice(-3).reverse();
  return `<section class="home-section"><h2 class="section-title">Tus mazos</h2>
    <div class="deck-list-home">${items.map(({ d, i }) => `
      <button class="saved-deck-item" onclick="abrirMazo(${i})">
        <span class="sdi-icon" aria-hidden="true">${d.juego === "magic" ? "✦" : "⚡"}</span>
        <span class="sdi-info"><span class="sdi-name">${esc(d.nombre)}</span>
        <span class="sdi-meta">${d.total} cartas · ${esc(d.value)}€</span></span></button>`).join("")}
    </div></section>`;
}

async function renderHome() {
  const root = document.getElementById("home-body");
  const tab = document.getElementById("tab-home");
  if (!root || !tab || !tab.classList.contains("active")) return;

  const editable = canEditCollection();
  if (collection.length === 0) { root.innerHTML = onboardingHtml(editable) + recentDecksHtml(); return; }

  const total = collection.reduce((s, e) => s + e.qty, 0);
  const value = sumValue(collection);
  const fechas = collection.map(e => priceDate(e.card)).filter(Boolean).map(f => new Date(f).getTime()).filter(t => !isNaN(t));
  const antiguo = fechas.length ? timeAgo(new Date(Math.min(...fechas)).toISOString()) : null;

  root.innerHTML = `
    <section class="hero-card">
      <p class="eyebrow">${editable ? "Valor de tu colección" : "Valor de la colección"}</p>
      <p class="hero-value">${esc(formatValue(value))}</p>
      <div class="hero-trend" id="home-trend"></div>
      <div class="hero-spark" id="home-spark"></div>
      <p class="hero-meta">${total} cartas · ${collection.length} únicas${antiguo ? ` · precios de ${antiguo}` : ""}</p>
    </section>
    ${quickActions()}
    ${moversHtml()}
    ${recentDecksHtml()}`;

  // Tendencia y sparkline del histórico (asíncrono: no bloquea el primer pintado)
  try {
    const rows = await loadValueHistory(365);
    if (!tab.classList.contains("active")) return;
    const { moneda, all, pts } = valueSeries(rows, 90);
    const t = trendFromHistory(all);
    const trend = document.getElementById("home-trend"), spark = document.getElementById("home-spark");
    if (!trend || !spark) return;
    if (t && (t.d7 != null || t.d30 != null)) {
      trend.innerHTML = `${t.d7 != null ? `7 d ${trendBadge(t.d7) || "<span class='trend'>= estable</span>"}` : ""}
        ${t.d30 != null ? ` 30 d ${trendBadge(t.d30) || "<span class='trend'>= estable</span>"}` : ""}`;
    } else {
      trend.innerHTML = `<span class="hero-hint">El histórico se va construyendo cada día</span>`;
    }
    spark.innerHTML = sparkline(pts, { label: `Evolución del valor en ${moneda === "usd" ? "dólares" : "euros"}` });
  } catch { /* sin histórico: el resumen sigue siendo válido */ }
}
