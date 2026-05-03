/**
 * deckbuilder.js — Premium Deck Builder Logic
 * Actualizado con reglas competitivas y análisis de composición
 */

const DECK_RULES = {
  pokemon: {
    standard: { min: 60, max: 60, maxCopies: 4, label: "Pokémon Standard", icon: "⚡" }
  },
  magic: {
    standard:  { min: 60, max: 60, maxCopies: 4, label: "Magic Standard", icon: "✦" },
    commander: { min: 100, max: 100, maxCopies: 1, label: "Magic Commander", icon: "👑" }
  }
};

const BASIC_LANDS = ["Plains","Island","Swamp","Mountain","Forest","Wastes"];
const BASIC_ENERGIES = ["Basic Energy"];

let currentDeck = [];
let allDecks = [];
let editingDeckIdx = -1;
let currentFormat = "standard";

function saveDecks() { localStorage.setItem("snaptcg_decks", JSON.stringify(allDecks)); }
function loadDecks() {
  try {
    const raw = localStorage.getItem("snaptcg_decks");
    allDecks = raw ? JSON.parse(raw) : [];
  } catch { allDecks = []; }
}

function isUnlimited(card, juego) {
  if (juego === "magic") return BASIC_LANDS.some(l => card.nombre.includes(l));
  if (juego === "pokemon") return BASIC_ENERGIES.some(e => card.nombre.includes(e));
  return false;
}

function getRules() { 
  const rules = DECK_RULES[juegoActual][currentFormat] || DECK_RULES[juegoActual]["standard"];
  return rules;
}

function totalCards() { return currentDeck.reduce((s, e) => s + e.qty, 0); }

function updateFormat() {
  currentFormat = document.getElementById("deck-format-selector").value;
  renderDeckStats();
  renderDeckList();
}

function addCardToDeck(card, juego) {
  const rules = getRules();
  const total = totalCards();
  
  if (total >= rules.max) {
    showDeckToast(`Mazo lleno (${rules.max})`, "warn");
    return;
  }
  
  if (!isUnlimited(card, juego)) {
    const entry = currentDeck.find(e => e.card.id === card.id);
    if (entry && entry.qty >= rules.maxCopies) {
      showDeckToast(`Máximo ${rules.maxCopies} copia(s) en ${rules.label}`, "warn");
      return;
    }
  }

  const idx = currentDeck.findIndex(e => e.card.id === card.id);
  if (idx > -1) { currentDeck[idx].qty++; }
  else { currentDeck.push({ card, qty: 1 }); }

  renderDeckList();
  renderDeckStats();
  showDeckToast(`${card.nombre} añadido ✓`, "success");
}

function removeCardFromDeck(cardId, all = false) {
  const idx = currentDeck.findIndex(e => e.card.id === cardId);
  if (idx === -1) return;
  
  if (all || currentDeck[idx].qty <= 1) { currentDeck.splice(idx, 1); }
  else { currentDeck[idx].qty--; }
  
  renderDeckList();
  renderDeckStats();
}

function renderDeckStats() {
  const rules = getRules();
  const total = totalCards();
  const value = currentDeck.reduce((s, e) => s + (parseFloat(e.card.precio ?? 0) * e.qty), 0);

  document.getElementById("deck-stat-total").textContent = total;
  document.getElementById("deck-stat-uniq").textContent = currentDeck.length;
  document.getElementById("deck-stat-value").textContent = value.toFixed(2) + "€";

  const pct = Math.min(100, (total / rules.max) * 100);
  const fill = document.getElementById("deck-progress-fill");
  fill.style.width = pct + "%";
  
  // Color dinámico según validez
  if (total === rules.max) fill.style.background = "#4ade80"; // Verde: Legal
  else if (total > rules.max) fill.style.background = "#f87171"; // Rojo: Ilegal
  else fill.style.background = "var(--accent-color)";

  document.getElementById("deck-progress-label").textContent = `${total} / ${rules.max} cartas`;
  document.getElementById("deck-format-badge").textContent = rules.label;
  
  renderDeckMetrics();
}

function renderDeckMetrics() {
  const metricsContainer = document.getElementById("deck-metrics");
  if (currentDeck.length === 0) {
    metricsContainer.style.display = "none";
    return;
  }
  
  metricsContainer.style.display = "grid";
  let html = "";
  
  if (juegoActual === "pokemon") {
    let pkm = 0, tra = 0, ene = 0;
    currentDeck.forEach(e => {
      const type = (e.card.supertype || "").toLowerCase();
      if (type.includes("pokemon")) pkm += e.qty;
      else if (type.includes("trainer")) tra += e.qty;
      else if (type.includes("energy")) ene += e.qty;
    });
    html = `
      <div><strong>PKM:</strong> ${pkm}</div>
      <div><strong>TRA:</strong> ${tra}</div>
      <div><strong>ENE:</strong> ${ene}</div>
    `;
  } else {
    let cre = 0, lan = 0, spe = 0;
    currentDeck.forEach(e => {
      const type = (e.card.type || "").toLowerCase();
      if (type.includes("creature")) cre += e.qty;
      else if (type.includes("land")) lan += e.qty;
      else spe += e.qty;
    });
    html = `
      <div><strong>CRE:</strong> ${cre}</div>
      <div><strong>LAN:</strong> ${lan}</div>
      <div><strong>SPE:</strong> ${spe}</div>
    `;
  }
  metricsContainer.innerHTML = html;
}

function renderDeckList() {
  const container = document.getElementById("deck-card-list");
  container.innerHTML = "";

  if (currentDeck.length === 0) {
    container.innerHTML = `<div class="deck-list-empty">Tu mazo está vacío. Empieza añadiendo cartas.</div>`;
    return;
  }

  // Ordenar: Criaturas/Pokémon primero
  const sorted = [...currentDeck].sort((a, b) => {
    const typeA = (a.card.supertype || a.card.type || "");
    const typeB = (b.card.supertype || b.card.type || "");
    return typeA.localeCompare(typeB);
  });

  sorted.forEach(entry => {
    const row = document.createElement("div");
    row.className = "deck-card-row";
    row.innerHTML = `
      <img src="${entry.card.imagenThumb}" alt="">
      <div class="dcr-info">
        <p class="dcr-name">${entry.card.nombre}</p>
        <p class="dcr-set">${entry.card.set}</p>
      </div>
      <div class="dcr-controls">
        <button class="dcr-btn remove" onclick="removeCardFromDeck('${entry.card.id}')">−</button>
        <span class="dcr-qty">${entry.qty}</span>
        <button class="dcr-btn" onclick="addCardToDeck(currentDeck.find(e=>e.card.id==='${entry.card.id}').card, juegoActual)">+</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function saveDeck() {
  const nombre = document.getElementById("deck-name-input").value.trim() || "Nuevo Mazo";
  if (currentDeck.length === 0) return;

  const deck = {
    id: editingDeckIdx > -1 ? allDecks[editingDeckIdx].id : Date.now(),
    nombre, juego: juegoActual, formato: currentFormat, cards: [...currentDeck],
    total: totalCards(),
    value: currentDeck.reduce((s, e) => s + (parseFloat(e.card.precio ?? 0) * e.qty), 0).toFixed(2),
    date: new Date().toLocaleDateString()
  };

  if (editingDeckIdx > -1) { allDecks[editingDeckIdx] = deck; }
  else { allDecks.push(deck); }

  saveDecks();
  showDeckToast("¡Mazo guardado!", "success");
  renderDeckLibrary();
}

function renderDeckLibrary() {
  const el = document.getElementById("deck-library-list");
  el.innerHTML = "";

  if (allDecks.length === 0) {
    el.innerHTML = `<div class="deck-list-empty">No tienes mazos guardados.</div>`;
    return;
  }

  allDecks.forEach((deck, idx) => {
    const item = document.createElement("div");
    item.className = "saved-deck-item";
    item.onclick = (e) => { if(e.target.tagName !== 'BUTTON') loadDeck(idx); };
    
    const rules = DECK_RULES[deck.juego][deck.formato] || DECK_RULES[deck.juego]["standard"];
    
    item.innerHTML = `
      <div class="sdi-icon">${rules.icon}</div>
      <div class="sdi-info">
        <p class="sdi-name">${deck.nombre}</p>
        <p class="sdi-meta">${deck.total} cartas • ${deck.value}€ • ${rules.label}</p>
      </div>
      <div class="sdi-actions">
        <button class="sdi-btn danger" onclick="event.stopPropagation(); deleteDeck(${idx})">🗑</button>
      </div>
    `;
    el.appendChild(item);
  });
}

function loadDeck(idx) {
  const deck = allDecks[idx];
  currentDeck = [...deck.cards];
  editingDeckIdx = idx;
  currentFormat = deck.formato || "standard";
  
  document.getElementById("deck-name-input").value = deck.nombre;
  document.getElementById("deck-format-selector").value = currentFormat;
  
  setGame(deck.juego);
  showDeckTab('editor');
  renderDeckList();
  renderDeckStats();
  showDeckToast("Mazo cargado", "success");
}

function deleteDeck(idx) {
  if (confirm("¿Borrar este mazo?")) {
    allDecks.splice(idx, 1);
    saveDecks();
    renderDeckLibrary();
  }
}

function newDeck() {
  currentDeck = [];
  editingDeckIdx = -1;
  document.getElementById("deck-name-input").value = "";
  renderDeckList();
  renderDeckStats();
}

function showDeckTab(tab) {
  const isEditor = tab === 'editor';
  document.getElementById('deck-editor-section').style.display = isEditor ? 'flex' : 'none';
  document.getElementById('deck-library-section').style.display = isEditor ? 'none' : 'block';
  document.getElementById('deck-tab-editor').classList.toggle('active', isEditor);
  document.getElementById('deck-tab-library').classList.toggle('active', !isEditor);
  
  // Solo mostrar Commander si es Magic
  const fmtSelector = document.getElementById("deck-format-selector");
  const commanderOpt = fmtSelector.querySelector('option[value="commander"]');
  if (juegoActual === "magic") {
    commanderOpt.disabled = false;
    commanderOpt.style.display = "block";
  } else {
    commanderOpt.disabled = true;
    commanderOpt.style.display = "none";
    if (currentFormat === "commander") {
      currentFormat = "standard";
      fmtSelector.value = "standard";
    }
  }
  
  if (!isEditor) renderDeckLibrary();
}

function showDeckToast(msg, type) {
  const toast = document.createElement("div");
  toast.style.cssText = `
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
    background: ${type === 'success' ? '#4ade80' : '#f5c842'};
    color: #000; padding: 12px 24px; border-radius: 12px;
    font-weight: 800; font-size: 14px; z-index: 1000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
    animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = "toastOut 0.3s forwards";
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes toastIn { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @keyframes toastOut { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -20px); } }
`;
document.head.appendChild(style);

function addCurrentCardToDeck() {
  if (window._currentCard) {
    addCardToDeck(window._currentCard, juegoActual);
    closeModal();
  }
}

function exportCurrentDeck() {
  if (currentDeck.length === 0) return;
  let txt = `DECK: ${document.getElementById("deck-name-input").value || "Nuevo Mazo"}\n`;
  txt += `FORMAT: ${getRules().label}\n\n`;
  currentDeck.forEach(e => txt += `${e.qty} ${e.card.nombre}\n`);
  document.getElementById("modal-export-content").value = txt;
  document.getElementById("modal-overlay").classList.add("active");
}

function copyExport() {
  const area = document.getElementById("modal-export-content");
  area.select();
  document.execCommand("copy");
  showDeckToast("¡Copiado!", "success");
}

loadDecks();
renderDeckLibrary();
