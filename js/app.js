/**
 * app.js — Main application logic
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
  const isScanner = tab === 'scanner';
  document.getElementById('tab-scanner').classList.toggle('active', isScanner);
  document.getElementById('tab-deck').classList.toggle('active', !isScanner);
  document.getElementById('main-tab-scanner').classList.toggle('active', isScanner);
  document.getElementById('main-tab-deck').classList.toggle('active', !isScanner);
  
  if (!isScanner) { 
    renderDeckStats(); 
    renderDeckList(); 
  }
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
  window._currentCard = null;
  ultimosResultados = [];
}

function mostrarCargando(texto = "Sincronizando...") {
  resetUI();
  document.getElementById("placeholder").style.display = "none";
  document.getElementById("spinner-text").textContent = texto;
  document.getElementById("spinner-wrap").classList.add("visible");
}

function mostrarError(msg) {
  resetUI();
  // We can add a toast or a more accessible error message here
  alert(msg); 
}

// ─────────────────────────────────────────────
//  RESULT RENDERING
// ─────────────────────────────────────────────
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
    const sym = carta.moneda === "usd" ? "$" : "€";
    const price = carta.precio ? `${parseFloat(carta.precio).toFixed(2)}${sym}` : "N/D";
    
    const cardEl = document.createElement("article");
    cardEl.className = "card-item";
    cardEl.setAttribute("role", "button");
    cardEl.setAttribute("tabindex", "0");
    cardEl.innerHTML = `
      <img src="${carta.imagenThumb || carta.imagen}" alt="${carta.nombre}" class="card-thumb" loading="lazy">
      <div class="card-info">
        <h3 class="card-name">${carta.nombre}</h3>
        <p class="card-meta">${carta.set || "Desconocido"}</p>
        <p class="card-price">${price}</p>
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
function seleccionarCarta(index) {
  const carta = ultimosResultados[index];
  window._currentCard = carta;

  const modal = document.getElementById("card-detail-modal");
  document.getElementById("card-image").src = carta.imagen;
  document.getElementById("price-card-name").textContent = carta.nombre;
  
  const sym = carta.moneda === "usd" ? "$" : "€";
  document.getElementById("price-main").textContent = carta.precio ? `${parseFloat(carta.precio).toFixed(2)} ${sym}` : "N/D";
  
  const secEl = document.getElementById("price-secondary");
  secEl.textContent = carta.set || "Edición Desconocida";
  if (carta.precioFoil) {
    secEl.innerHTML += ` • <span style="color:var(--accent-color)">Foil: ${parseFloat(carta.precioFoil).toFixed(2)}${sym}</span>`;
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

  let total = 0;
  [...sesionCartas].reverse().slice(0, 5).forEach(c => {
    const val = parseFloat(c.precio ?? 0);
    total += val;
    const sym = c.moneda === "usd" ? "$" : "€";
    
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <img src="${c.imagenThumb}" style="width:32px; height:44px; border-radius:4px; object-fit:cover;">
      <div style="flex:1; min-width:0;">
        <p style="font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.nombre}</p>
        <p style="font-size:10px; color:var(--text-muted);">${val.toFixed(2)}${sym}</p>
      </div>
    `;
    lista.appendChild(item);
  });
  
  totalBadge.textContent = `${total.toFixed(2)} €`;
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
  } catch (err) {
    mostrarError(err.message || "Error de conexión.");
  }
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  updateAppTheme();
  switchTab("scanner");
});
