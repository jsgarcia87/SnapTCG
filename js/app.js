/**
 * app.js — Main application logic
 * Author: Sangar Studio
 * Version: 2.0.0
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
    document.body.className = "mode-magic";
  } else {
    root.style.setProperty('--accent-color', 'var(--pk-accent)');
    root.style.setProperty('--accent-rgb', 'var(--pk-accent-rgb)');
    document.body.className = "mode-pokemon";
  }
}

function setGame(juego) {
  juegoActual = juego;
  updateAppTheme();
  
  const esMagic = juego === "magic";
  document.getElementById("btn-pokemon").classList.toggle("active-pokemon", !esMagic);
  document.getElementById("btn-magic").classList.toggle("active-magic", esMagic);
  document.getElementById("btn-pokemon").setAttribute("aria-pressed", !esMagic);
  document.getElementById("btn-magic").setAttribute("aria-pressed", esMagic);
  
  document.getElementById("subtitle").textContent = esMagic
    ? "Magic: The Gathering · Gestión Premium"
    : "Pokémon TCG · Gestión Premium";
  
  document.getElementById("search-input").placeholder = esMagic 
    ? "Ej: Black Lotus, Jace..." 
    : "Ej: Pikachu, Charizard...";

  detenerEscaner();
  resetUI();
}

// ─────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────
function switchTab(tab) {
  ['scanner', 'deck', 'collection'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === tab);
    document.getElementById('main-tab-' + t).classList.toggle('active', t === tab);
  });

  if (tab === 'deck') {
    renderDeckStats();
    renderDeckList();
  }
  if (tab === 'collection') renderCollection();
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
        <small>media de hoy vs. media de ventas</small></div>`;
    }
    const fecha = timeAgo(priceDate(carta));
    html += `<small class="price-source">${esc(carta.fuente || "")}${fecha ? ` · actualizado ${fecha}` : ""}${carta.moneda === "usd" ? " · en dólares" : ""}</small>`;
  }
  if (carta.enCache) html += `<small class="price-source">Resultados guardados (sin conexión)</small>`;
  meta.innerHTML = html;
}

async function reintentarPrecioModal() {
  const carta = window._currentCard;
  if (!carta) return;
  carta.errorPrecio = false; carta.preciosCargados = false;
  pintarPrecioModal(carta);
  try { await hidratarPrecioPokemon(carta, true); } catch { carta.errorPrecio = true; carta.preciosCargados = true; }
  pintarPrecioModal(carta);
}

function seleccionarCarta(index) {
  const carta = ultimosResultados[index];
  window._currentCard = carta;

  const modal = document.getElementById("card-detail-modal");
  document.getElementById("card-image").src = carta.imagen;
  document.getElementById("price-card-name").textContent = carta.nombre;
  pintarPrecioModal(carta);

  if (carta.preciosCargados === false && carta.tipo === "pokemon") {
    hidratarPrecioPokemon(carta)
      .catch(() => { carta.errorPrecio = true; carta.preciosCargados = true; })
      .then(() => { if (window._currentCard === carta) pintarPrecioModal(carta); });
  }

  modal.classList.add("active");
  añadirAHistorial(carta);
}

function closeModal() {
  document.getElementById("card-detail-modal").classList.remove("active");
  document.getElementById("modal-overlay").classList.remove("active");
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
  console.table(sesionCartas.map(c => ({ Nombre: c.nombre, Set: c.set, Precio: c.precio })));
  alert("Lista exportada a la consola (F12)");
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
  updateAppTheme();
  switchTab("scanner");
  actualizarVistaHistorial();
  initCloud();
});
