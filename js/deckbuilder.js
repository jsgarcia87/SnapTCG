/**
 * deckbuilder.js — Premium Deck Builder Logic
 */

const DECK_RULES = {
  pokemon: { min: 60, max: 60, maxCopies: 4, label: "Pokémon Standard", icon: "⚡" },
  magic:   { min: 60, max: 60, maxCopies: 4, label: "Magic Standard", icon: "✦" }
};

const BASIC_LANDS = ["Plains","Island","Swamp","Mountain","Forest","Wastes"];
const BASIC_ENERGIES = ["Basic Energy"];

let currentDeck = [];
let allDecks = [];
let editingDeckIdx = -1;

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

function getRules(juego) { return DECK_RULES[juego] || DECK_RULES.pokemon; }
function totalCards() { return currentDeck.reduce((s, e) => s + e.qty, 0); }

function addCardToDeck(card, juego) {
  const rules = getRules(juego);
  const total = totalCards();
  
  if (total >= rules.max) {
    showDeckToast(`Mazo lleno (${rules.max})`, "warn");
    return;
  }
  
  if (!isUnlimited(card, juego)) {
    const entry = currentDeck.find(e => e.card.id === card.id);
    if (entry && entry.qty >= rules.maxCopies) {
      showDeckToast(`Máximo ${rules.maxCopies} copias`, "warn");
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
  const rules = getRules(juegoActual);
  const total = totalCards();
  const value = currentDeck.reduce((s, e) => s + (parseFloat(e.card.precio ?? 0) * e.qty), 0);

  document.getElementById("deck-stat-total").textContent = total;
  document.getElementById("deck-stat-uniq").textContent = currentDeck.length;
  document.getElementById("deck-stat-value").textContent = value.toFixed(2) + "€";

  const pct = Math.min(100, (total / rules.max) * 100);
  document.getElementById("deck-progress-fill").style.width = pct + "%";
  document.getElementById("deck-progress-label").textContent = `${total} / ${rules.max} cartas`;
  document.getElementById("deck-format-badge").textContent = rules.label;
}

function renderDeckList() {
  const container = document.getElementById("deck-card-list");
  container.innerHTML = "";

  if (currentDeck.length === 0) {
    container.innerHTML = `<div class="deck-list-empty">Tu mazo está vacío. Empieza añadiendo cartas.</div>`;
    return;
  }

  currentDeck.forEach(entry => {
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
    nombre, juego: juegoActual, cards: [...currentDeck],
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
    item.innerHTML = `
      <div class="sdi-icon">${deck.juego === 'magic' ? '✦' : '⚡'}</div>
      <div class="sdi-info">
        <p class="sdi-name">${deck.nombre}</p>
        <p class="sdi-meta">${deck.total} cartas • ${deck.value}€</p>
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
  document.getElementById("deck-name-input").value = deck.nombre;
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

// Add these animations to CSS via JS for convenience or just rely on CSS
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
  currentDeck.forEach(e => txt += `${e.qty}x ${e.card.nombre}\n`);
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
