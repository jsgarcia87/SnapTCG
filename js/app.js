/**
 * app.js — Main application logic
 * Author: Sangar Studio
 * Version: 3.0.0
 * Improved feedback, accessibility support, and dynamic theming
 */

let juegoActual = "pokemon";
let ultimosResultados = [];
let sesionCartas = [];

// ─────────────────────────────────────────────
//  DYNAMIC THEMING
// ─────────────────────────────────────────────
function updateAppTheme() {
  const isMagic = juegoActual === "magic";
  const root = document.documentElement;
  
  if (isMagic) {
    root.style.setProperty('--accent-color', 'var(--mtg-accent)');
    root.style.setProperty('--accent-rgb', 'var(--mtg-accent-rgb)');
    document.body.className = "mode-magic dark";
  } else {
    root.style.setProperty('--accent-color', 'var(--pk-accent)');
    root.style.setProperty('--accent-rgb', 'var(--pk-accent-rgb)');
    document.body.className = "mode-pokemon dark";
  }
}

function setGame(juego) {
  juegoActual = juego;
  updateAppTheme();
  try { localStorage.setItem("snaptcg_game", juego); } catch { /* opcional */ }

  const esMagic = juego === "magic";
  // Hay un selector de juego en Buscar y otro en el editor de mazos: se mantienen sincronizados
  document.querySelectorAll(".game-toggle [data-game]").forEach(btn => {
    const activo = btn.dataset.game === juego;
    btn.classList.toggle("active-pokemon", activo && !esMagic);
    btn.classList.toggle("active-magic", activo && esMagic);
    btn.setAttribute("aria-pressed", activo);
  });

  document.getElementById("search-input").placeholder = esMagic
    ? "Ej: Black Lotus, Jace..."
    : "Ej: Pikachu, Charizard...";

  detenerEscaner();
  resetUI();
}

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
const TAB_HASH = { home: "", scanner: "#buscar", deck: "#mazos", collection: "#coleccion" };
const HASH_TAB = { "#buscar": "scanner", "#mazos": "deck", "#coleccion": "collection", "#inicio": "home" };

function switchTab(tab) {
  ["home", "scanner", "deck", "collection"].forEach(t => {
    document.getElementById("tab-" + t).classList.toggle("active", t === tab);
    const btn = document.getElementById("main-tab-" + t);
    btn.classList.toggle("active", t === tab);
    if (t === tab) btn.setAttribute("aria-current", "page"); else btn.removeAttribute("aria-current");
  });
  if (tab !== "scanner") detenerEscaner();

  if (tab === "home") renderHome();
  if (tab === "deck") { renderDeckStats(); renderDeckList(); }
  if (tab === "collection") renderCollection();

  try { history.replaceState(null, "", location.pathname + location.search + TAB_HASH[tab]); } catch { /* file:// */ }
  window.scrollTo({ top: 0 });
}

// ─────────────────────────────────────────────
//  UI HELPERS
// ─────────────────────────────────────────────
function resetUI() {
  document.getElementById("placeholder").style.display = "flex";
  document.getElementById("spinner-wrap").classList.remove("visible");
  document.getElementById("results-grid").innerHTML = "";
  document.getElementById("scanner-wrap").style.display = "none";
  document.getElementById("btn-back").style.display = "none";
  document.getElementById("error-box").style.display = "none";
  window._currentCard = null;
  ultimosResultados = [];
}

function mostrarCargando(texto = "Sincronizando...") {
  resetUI();
  document.getElementById("placeholder").style.display = "none";
  document.getElementById("spinner-text").textContent = texto;
  document.getElementById("spinner-wrap").classList.add("visible");
}

function mostrarError(err) {
  resetUI();
  document.getElementById("placeholder").style.display = "none";
  const e = typeof err === "string" ? { message: err } : err;
  const sinResultados = e.code === "notfound";
  const red = e.code === "network";
  document.getElementById("error-title").textContent = sinResultados ? "Sin resultados"
    : red ? "Servicio de precios no disponible" : "No se pudo completar la búsqueda";
  document.getElementById("error-text").textContent = (e.message || "Error de conexión.") +
    (red ? " Revisa tu conexión e inténtalo de nuevo." : sinResultados ? " Prueba con otro nombre o con el nombre en inglés." : "");
  document.getElementById("error-retry").style.display = sinResultados ? "none" : "";
  document.getElementById("error-box").style.display = "flex";
}

// ─────────────────────────────────────────────
//  RESULT RENDERING
// ─────────────────────────────────────────────
function getCardCountInDeck(cardId) {
  if (typeof currentDeck === 'undefined') return 0;
  const entry = currentDeck.find(e => e.card.id === cardId);
  return entry ? entry.qty : 0;
}

function precioHtml(carta) {
  if (carta.preciosCargados === false && carta.tipo === "pokemon") return `<span class="price-loading">Cargando…</span>`;
  if (carta.errorPrecio) return `<span class="price-none">No disponible</span>`;
  if (carta.precio == null) return `<span class="price-none">Sin precio</span>`;
  return `${formatMoney(carta.precio, carta.moneda)} ${trendBadge(carta.tendencia?.d7)}`;
}

/** Actualiza en pantalla el precio de una carta cuando termina de cargar. */
function actualizarPrecioEnLista(carta) {
  const el = document.querySelector(`[data-price-id="${CSS.escape(carta.id)}"]`);
  if (el) el.innerHTML = precioHtml(carta);
  if (window._currentCard && window._currentCard.id === carta.id) pintarPrecioModal(carta);
}

function renderizarLista(resultados) {
  document.getElementById("spinner-wrap").classList.remove("visible");
  document.getElementById("placeholder").style.display = "none";
  document.getElementById("btn-back").style.display = "none";

  ultimosResultados = resultados;
  const grid = document.getElementById("results-grid");
  grid.innerHTML = "";

  if (resultados.length === 1) { 
    seleccionarCarta(0); 
    return; 
  }

  resultados.forEach((carta, index) => {
    const inDeckCount = getCardCountInDeck(carta.id);
    
    const cardEl = document.createElement("article");
    cardEl.className = "card-item";
    cardEl.setAttribute("role", "button");
    cardEl.setAttribute("tabindex", "0");
    cardEl.innerHTML = `
      ${inDeckCount > 0 ? `<div class="possession-badge">x${inDeckCount}</div>` : ''}
      <img src="${esc(carta.imagenThumb || carta.imagen)}" alt="${esc(carta.nombre)}" class="card-thumb" loading="lazy">
      <div class="card-info">
        <h3 class="card-name">${esc(carta.nombre)}</h3>
        <p class="card-meta">${esc(carta.set || "Desconocido")}</p>
        <p class="card-price" data-price-id="${esc(carta.id)}">${precioHtml(carta)}</p>
      </div>
    `;
    
    cardEl.onclick = () => seleccionarCarta(index);
    cardEl.onkeypress = (e) => { if(e.key==='Enter') seleccionarCarta(index); };
    grid.appendChild(cardEl);
  });

  grid.style.display = "grid";
}

// ─────────────────────────────────────────────
//  CARD SELECTION & MODAL
// ─────────────────────────────────────────────
function pintarPrecioModal(carta) {
  const main = document.getElementById("price-main");
  const sec = document.getElementById("price-secondary");
  const meta = document.getElementById("price-trend");

  main.textContent = carta.preciosCargados === false && carta.tipo === "pokemon" ? "…"
    : carta.precio != null ? formatMoney(carta.precio, carta.moneda) : "Sin precio";

  sec.textContent = carta.set || "Edición Desconocida";
  if (carta.precioFoil) {
    sec.innerHTML += ` • <span style="color:var(--accent-color)">Foil: ${formatMoney(carta.precioFoil, carta.moneda)}</span>`;
  }

  let html = "";
  if (carta.errorPrecio) {
    html = `<span class="price-none">No se pudo cargar el precio.</span> <button class="link-btn" onclick="reintentarPrecioModal()">Reintentar</button>`;
  } else if (carta.preciosCargados && carta.precio == null) {
    html = `<span class="price-none">${carta.tipo === "pokemon" ? "Cardmarket y TCGplayer no tienen precio para esta carta." : "Scryfall no tiene precio para esta carta."}</span>`;
  } else if (carta.precio != null) {
    const t = carta.tendencia;
    if (t && (t.d7 != null || t.d30 != null)) {
      html += `<div class="trend-row">${t.d7 != null ? `7 d ${trendBadge(t.d7) || "<span class='trend'>= estable</span>"}` : ""}
        ${t.d30 != null ? ` · 30 d ${trendBadge(t.d30) || "<span class='trend'>= estable</span>"}` : ""}
        <small>${carta.tipo === "magic" ? "frente a su precio guardado" : "media de hoy vs. media de ventas"}</small></div>`;
    }
    const fecha = timeAgo(priceDate(carta));
    html += `<small class="price-source">${esc(carta.fuente || "")}${fecha ? ` · actualizado ${fecha}` : ""}${carta.moneda === "usd" ? " · en dólares" : ""}</small>`;
  }
  if (carta.enCache) html += `<small class="price-source">Resultados guardados (sin conexión)</small>`;
  meta.innerHTML = html;

  const box = document.getElementById("price-chart");
  if (carta.precio != null && box.dataset.cardId !== carta.id) cargarHistorialModal(carta, 90);
  else if (carta.precio == null && !(carta.preciosCargados === false)) { box.innerHTML = ""; box.dataset.cardId = ""; }
}

let modalHist = { id: null, pts: [] };

async function cargarHistorialModal(carta, days = 90) {
  const box = document.getElementById("price-chart");
  box.dataset.cardId = carta.id;
  box.innerHTML = `<div class="an-muted">Cargando histórico…</div>`;
  let pts;
  try { pts = await loadCardHistory(carta, 365); }
  catch { if (window._currentCard === carta) box.innerHTML = ""; return; }
  if (window._currentCard !== carta) return;
  modalHist = { id: carta.id, pts };
  // Magic no trae tendencia de la API: se calcula con el histórico propio
  if (carta.tipo === "magic") {
    const t = trendFromHistory(pts);
    if (t && (t.d7 != null || t.d30 != null)) { carta.tendencia = t; pintarPrecioModal(carta); }
  }
  pintarGraficoModal(carta, days);
}

function pintarGraficoModal(carta, days) {
  const box = document.getElementById("price-chart");
  const pts = modalHist.id === carta.id ? modalHist.pts : [];
  const visibles = pts.filter(p => p.day >= sinceDay(days));
  if (pts.length < 2 || visibles.length < 2) {
    box.innerHTML = `<div class="an-muted">${pts.length < 2
      ? "Aún no hay histórico de esta carta. Se registra cada día para las cartas de tu colección."
      : "No hay datos en este rango."}</div>${pts.length >= 2 ? rangePills(days, [30, 90, 365], "cambiarRangoModal") : ""}`;
    return;
  }
  box.innerHTML = `${rangePills(days, [30, 90, 365], "cambiarRangoModal")}${lineChart(visibles, { moneda: carta.moneda, label: "Evolución del precio" })}`;
}

function cambiarRangoModal(days) {
  if (window._currentCard) pintarGraficoModal(window._currentCard, days);
}

async function reintentarPrecioModal() {
  const carta = window._currentCard;
  if (!carta) return;
  carta.errorPrecio = false; carta.preciosCargados = false;
  pintarPrecioModal(carta);
  try { await hidratarPrecioPokemon(carta, true); } catch { carta.errorPrecio = true; carta.preciosCargados = true; }
  pintarPrecioModal(carta);
}

let focoPrevio = null;

function seleccionarCarta(index) {
  abrirDetalle(ultimosResultados[index], true);
}

/** Abre el detalle de una carta. `registrar`: añadirla al historial de la sesión (solo si viene de una búsqueda). */
function abrirDetalle(carta, registrar = false) {
  if (!carta) return;
  if (carta.tipo !== juegoActual) setGame(carta.tipo);   // las reglas de mazo dependen del juego
  window._currentCard = carta;
  focoPrevio = document.activeElement;

  document.getElementById("card-image").src = carta.imagen;
  document.getElementById("card-image").alt = `Carta ${carta.nombre}`;
  document.getElementById("price-card-name").textContent = carta.nombre;
  pintarChipsModal(carta);
  pintarPrecioModal(carta);
  pintarPoseidaModal(carta);
  updateCollectionButton();

  if (carta.preciosCargados === false && carta.tipo === "pokemon") {
    hidratarPrecioPokemon(carta)
      .catch(() => { carta.errorPrecio = true; carta.preciosCargados = true; })
      .then(() => { if (window._currentCard === carta) pintarPrecioModal(carta); });
  }

  document.getElementById("card-detail-modal").classList.add("active");
  document.body.classList.add("modal-open");
  document.getElementById("btn-close-detail").focus();
  if (registrar) añadirAHistorial(carta);
}

/** Ficha técnica en chips: rareza, código de edición y tipo. */
function pintarChipsModal(carta) {
  const chips = [];
  if (carta.rarity) chips.push(carta.rarity);
  if (carta.setCode) chips.push(carta.setCode.toUpperCase());
  if (carta.tipo === "magic" && carta.typeLine) chips.push(carta.typeLine);
  if (carta.tipo === "pokemon") { if (carta.supertype) chips.push(carta.supertype); (carta.subtypes || []).forEach(t => chips.push(t)); }
  document.getElementById("card-chips").innerHTML = chips.map(c => `<span class="chip">${esc(c)}</span>`).join("");
}

/** «Tienes ×N en tu colección · ×M en el mazo»: contexto de posesión. */
function pintarPoseidaModal(carta) {
  const enColeccion = (typeof collection !== "undefined" ? collection : []).find(e => e.card.id === carta.id)?.qty || 0;
  const enMazo = typeof getCardCountInDeck === "function" ? getCardCountInDeck(carta.id) : 0;
  const partes = [];
  if (enColeccion) partes.push(`<strong>×${enColeccion}</strong> en tu colección`);
  if (enMazo) partes.push(`<strong>×${enMazo}</strong> en el mazo actual`);
  document.getElementById("card-owned").innerHTML = partes.length ? "Tienes " + partes.join(" · ") : "Aún no la tienes en tu colección";
}

function closeModal() {
  document.getElementById("card-detail-modal").classList.remove("active");
  document.getElementById("modal-overlay").classList.remove("active");
  document.body.classList.remove("modal-open");
  if (focoPrevio && document.body.contains(focoPrevio)) focoPrevio.focus();
  focoPrevio = null;
}

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// Aviso si un móvil carga la versión de escritorio ("Sitio para ordenador" activado en el navegador)
function avisarModoEscritorio() {
  try {
    const pequena = Math.min(screen.width, screen.height) <= 500;
    const tactil = matchMedia("(pointer: coarse)").matches;
    if (pequena && tactil && innerWidth >= 900 && !sessionStorage.getItem("snaptcg_hint_escritorio")) {
      document.getElementById("desktop-hint").hidden = false;
    }
  } catch { /* sin sessionStorage o matchMedia */ }
}

function cerrarAvisoEscritorio() {
  document.getElementById("desktop-hint").hidden = true;
  try { sessionStorage.setItem("snaptcg_hint_escritorio", "1"); } catch { /* opcional */ }
}

function volverALista() {
  document.getElementById("btn-back").style.display = "none";
  document.getElementById("results-grid").style.display = "grid";
  window._currentCard = null;
}

// ─────────────────────────────────────────────
//  SESSION HISTORY
// ─────────────────────────────────────────────
function añadirAHistorial(carta) {
  // Only add if not already the last one (avoid duplicates on re-clicks)
  if (sesionCartas.length > 0 && sesionCartas[sesionCartas.length - 1].id === carta.id) return;
  
  sesionCartas.push(carta);
  actualizarVistaHistorial();
}

function actualizarVistaHistorial() {
  const contenedor = document.getElementById("session-history-container");
  const lista = document.getElementById("history-list");
  const totalBadge = document.getElementById("total-value-badge");

  if (sesionCartas.length === 0) { 
    contenedor.style.display = "none"; 
    return; 
  }
  
  contenedor.style.display = "block";
  lista.innerHTML = "";

  const recientes = [...sesionCartas].reverse().slice(0, 5);
  recientes.forEach(c => {
    
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <img src="${esc(c.imagenThumb)}" alt="" style="width:32px; height:44px; border-radius:4px; object-fit:cover;">
      <div style="flex:1; min-width:0;">
        <p style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(c.nombre)}</p>
        <p style="font-size:10px; color:var(--text-muted);">${c.precio != null ? formatMoney(c.precio, c.moneda) : "Sin precio"}</p>
      </div>
    `;
    lista.appendChild(item);
  });
  
  totalBadge.textContent = formatValue(sumValue(recientes.map(card => ({ card, qty: 1 }))));
}

function exportarLista() {
  if (sesionCartas.length === 0) return;
  const txt = sesionCartas.map(c => `${c.nombre} (${c.set}) — ${c.precio != null ? formatMoney(c.precio, c.moneda) : "sin precio"}`).join("\n");
  const ok = () => showDeckToast("Lista copiada al portapapeles ✓", "success");
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(txt).then(ok, () => showDeckToast("No se pudo copiar la lista", "warn"));
  else showDeckToast("Tu navegador no permite copiar", "warn");
}

// ─────────────────────────────────────────────
//  SEARCH EXECUTION
// ─────────────────────────────────────────────
async function ejecutarBusqueda() {
  const nombre = document.getElementById("search-input").value.trim();
  if (!nombre) return;
  
  mostrarCargando(`Buscando "${nombre}"...`);
  try {
    const resultados = await buscarCartas(nombre, juegoActual);
    renderizarLista(resultados);
    if (resultados[0]?.enCache) showDeckToast("Sin conexión: resultados guardados", "warn");
    hidratarPrecios(resultados, actualizarPrecioEnLista);
  } catch (err) {
    mostrarError(err);
  }
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  let juego = "pokemon";
  try { juego = localStorage.getItem("snaptcg_game") === "magic" ? "magic" : "pokemon"; } catch { /* opcional */ }
  setGame(juego);
  switchTab(HASH_TAB[location.hash] || "home");
  actualizarVistaHistorial();
  avisarModoEscritorio();
  initCloud();
});
