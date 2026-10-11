/**
 * cloud.js — Colección de cartas + sincronización con Supabase
 * Author: Sangar Studio
 * Version: 2.2.0
 * Modo demo (sin config): colección y mazos en localStorage.
 * Modo nube (config.js rellenado): el dueño inicia sesión y edita; los visitantes ven la colección en solo lectura.
 * Depende de: config.js, stats.js (esc), deckbuilder.js (allDecks, saveDecks, showDeckToast), app.js (juegoActual)
 */

const COLLECTION_KEY = "snaptcg_collection";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.min.js";

let collection = [];          // [{ card, qty }]
let sbClient = null;
let sbSession = null;
let collectionFilter = { game: "all", text: "" };

const demoForced = () => new URLSearchParams(location.search).has("demo");
const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY) && !demoForced();
const cloudReady = () => cloudConfigured() && !!sbClient;
const canEditCollection = () => !cloudConfigured() || !!sbSession;
const collectionOwner = () => (sbSession ? sbSession.user.id : PUBLIC_OWNER_ID);

/* ───────────── Inicialización ───────────── */

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  });
}

async function initCloud() {
  if (cloudConfigured()) {
    try {
      await loadScript(SUPABASE_JS);
      sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data } = await sbClient.auth.getSession();
      sbSession = data.session;
      sbClient.auth.onAuthStateChange((event, session) => {
        const was = !!sbSession;
        sbSession = session;
        if (!!session !== was) onAuthChanged();
      });
    } catch (e) {
      console.error(e);
      sbClient = null;
      showDeckToast("No se pudo conectar con la nube", "warn");
    }
  }
  await onAuthChanged();
  if (location.hash === "#coleccion") switchTab("collection");
}

async function onAuthChanged() {
  if (sbSession && cloudReady()) await pullDecksFromCloud();
  await loadCollection();
  renderCollection();
  updateCollectionButton();
}

/* ───────────── Colección: datos ───────────── */

function loadLocalCollection() {
  try { return JSON.parse(localStorage.getItem(COLLECTION_KEY)) || []; } catch { return []; }
}

async function loadCollection() {
  if (!cloudReady()) { collection = loadLocalCollection(); return; }
  const owner = collectionOwner();
  if (!owner) { collection = []; return; }
  const { data, error } = await sbClient.from("collection").select("card,qty").eq("owner", owner);
  if (error) { console.error(error); showDeckToast("Error al cargar la colección", "warn"); collection = []; return; }
  collection = data.map(r => ({ card: r.card, qty: r.qty }));
}

async function persistCollectionEntry(entry, removed) {
  if (!cloudReady()) {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
    return;
  }
  const owner = sbSession.user.id;
  const q = removed
    ? sbClient.from("collection").delete().eq("owner", owner).eq("card_id", entry.card.id)
    : sbClient.from("collection").upsert({
        owner, card_id: entry.card.id, game: entry.card.tipo, qty: entry.qty,
        card: entry.card, updated_at: new Date().toISOString()
      }, { onConflict: "owner,card_id" });
  const { error } = await q;
  if (error) { console.error(error); showDeckToast("Error al guardar en la nube", "warn"); }
}

async function collectionAdd(card) {
  if (!canEditCollection()) return;
  let entry = collection.find(e => e.card.id === card.id);
  if (entry) entry.qty++;
  else { entry = { card, qty: 1 }; collection.push(entry); }
  await persistCollectionEntry(entry, false);
  renderCollection();
}

async function collectionRemove(cardId) {
  if (!canEditCollection()) return;
  const i = collection.findIndex(e => e.card.id === cardId);
  if (i < 0) return;
  const entry = collection[i];
  const removed = entry.qty <= 1;
  if (removed) collection.splice(i, 1); else entry.qty--;
  await persistCollectionEntry(entry, removed);
  renderCollection();
}

async function addCurrentCardToCollection() {
  const card = window._currentCard;
  if (!card) return;
  await collectionAdd(card);
  showDeckToast(`${card.nombre} añadida a la colección ✓`, "success");
}

/* ───────────── Mazos: copia de seguridad en la nube ───────────── */

function deckToRow(deck) {
  return {
    owner: sbSession.user.id, deck_id: String(deck.id), nombre: deck.nombre, juego: deck.juego,
    formato: deck.formato || "standard", cards: deck.cards, total: deck.total || 0,
    value: parseFloat(deck.value) || 0, updated_at: new Date().toISOString()
  };
}

async function cloudSyncDecks() {
  if (!cloudReady() || !sbSession || allDecks.length === 0) return;
  const { error } = await sbClient.from("decks").upsert(allDecks.map(deckToRow), { onConflict: "owner,deck_id" });
  if (error) { console.error(error); showDeckToast("Error al sincronizar mazos", "warn"); }
}

async function cloudDeleteDeck(id) {
  if (!cloudReady() || !sbSession) return;
  const { error } = await sbClient.from("decks").delete().eq("owner", sbSession.user.id).eq("deck_id", String(id));
  if (error) console.error(error);
}

async function pullDecksFromCloud() {
  const { data, error } = await sbClient.from("decks").select("*").eq("owner", sbSession.user.id);
  if (error) { console.error(error); return; }
  const known = new Set(allDecks.map(d => String(d.id)));
  data.forEach(r => {
    if (known.has(r.deck_id)) return;
    allDecks.push({
      id: isNaN(Number(r.deck_id)) ? r.deck_id : Number(r.deck_id), nombre: r.nombre, juego: r.juego,
      formato: r.formato, cards: r.cards, total: r.total, value: String(r.value),
      date: new Date(r.updated_at).toLocaleDateString()
    });
  });
  saveDecks();
  await cloudSyncDecks();
  if (typeof renderDeckLibrary === "function") renderDeckLibrary();
}

/* ───────────── Sesión ───────────── */

async function cloudLogin() {
  const input = document.getElementById("collection-email");
  const email = input.value.trim();
  if (!email) return;
  const { error } = await sbClient.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: location.href.split("#")[0] + "#coleccion" }
  });
  showDeckToast(error ? "No se pudo enviar el enlace" : "Revisa tu correo: enlace enviado", error ? "warn" : "success");
  if (error) console.error(error);
}

async function cloudLogout() {
  await sbClient.auth.signOut();
}

/* ───────────── UI ───────────── */

function updateCollectionButton() {
  const btn = document.getElementById("btn-add-to-collection");
  if (btn) btn.style.display = canEditCollection() ? "" : "none";
}

function copyCollectionLink() {
  const url = location.href.split("#")[0].split("?")[0] + "#coleccion";
  navigator.clipboard?.writeText(url).then(() => showDeckToast("Enlace copiado ✓", "success"));
}

function setCollectionFilter(key, value) {
  collectionFilter[key] = value;
  renderCollection();
}

function renderCollection() {
  const root = document.getElementById("collection-body");
  if (!root) return;

  const editable = canEditCollection();
  const mode = !cloudConfigured() ? "Modo demo · guardado solo en este navegador"
    : sbSession ? "Sesión iniciada · los cambios se publican"
    : "Colección pública · solo lectura";

  let auth = "";
  if (cloudConfigured()) {
    auth = sbSession
      ? `<button class="dab-btn" onclick="cloudLogout()">Cerrar sesión</button>`
      : `<div class="col-login"><input type="email" id="collection-email" class="deck-name-input" placeholder="Tu email (solo el dueño)">
         <button class="dab-btn primary" onclick="cloudLogin()">Entrar</button></div>`;
  }

  const total = collection.reduce((s, e) => s + e.qty, 0);
  const value = collection.reduce((s, e) => s + (parseFloat(e.card.precio) || 0) * e.qty, 0);
  const text = collectionFilter.text.toLowerCase();
  const list = collection
    .filter(e => collectionFilter.game === "all" || e.card.tipo === collectionFilter.game)
    .filter(e => !text || e.card.nombre.toLowerCase().includes(text))
    .sort((a, b) => a.card.nombre.localeCompare(b.card.nombre));

  const pills = [["all", "Todas"], ["pokemon", "Pokémon"], ["magic", "Magic"]]
    .map(([k, l]) => `<button class="pill-btn ${collectionFilter.game === k ? "active" : ""}" onclick="setCollectionFilter('game','${k}')">${l}</button>`).join("");

  root.innerHTML = `
    <div class="col-mode">${esc(mode)}</div>
    ${auth}
    <div class="deck-stats">
      <div class="stat-chip"><span class="stat-val">${total}</span><span class="stat-lbl">Cartas</span></div>
      <div class="stat-chip"><span class="stat-val">${collection.length}</span><span class="stat-lbl">Únicas</span></div>
      <div class="stat-chip"><span class="stat-val">${value.toFixed(2)}€</span><span class="stat-lbl">Valor</span></div>
    </div>
    <div class="pill-switcher">${pills}</div>
    <input type="search" class="deck-name-input" id="collection-search" placeholder="Filtrar por nombre..." value="${esc(collectionFilter.text)}"
      oninput="collectionFilter.text=this.value; renderCollection(); const i=document.getElementById('collection-search'); i.focus(); i.setSelectionRange(i.value.length,i.value.length);">
    <button class="dab-btn" onclick="copyCollectionLink()">🔗 Copiar enlace público</button>
    ${list.length === 0 ? `<div class="an-empty">${collection.length ? "Sin resultados." : (editable ? "Aún no tienes cartas. Búscalas en el Escáner y pulsa «Añadir a colección»." : "Esta colección está vacía.")}</div>` : ""}
    <div class="results-grid" style="display:grid">
      ${list.map(e => {
        const c = e.card, sym = c.moneda === "usd" ? "$" : "€";
        const price = c.precio ? `${parseFloat(c.precio).toFixed(2)}${sym}` : "N/D";
        return `<article class="card-item">
          <div class="possession-badge">x${e.qty}</div>
          <img src="${esc(c.imagenThumb || c.imagen || "")}" alt="${esc(c.nombre)}" class="card-thumb" loading="lazy">
          <div class="card-info">
            <h3 class="card-name">${esc(c.nombre)}</h3>
            <p class="card-meta">${esc(c.set || "Desconocido")}</p>
            <p class="card-price">${price}</p>
            ${editable ? `<div class="dcr-controls">
              <button class="dcr-btn remove" aria-label="Quitar una copia" onclick="collectionRemove('${esc(c.id)}')">−</button>
              <button class="dcr-btn" aria-label="Añadir una copia" onclick="collectionAdd(collection.find(x=>x.card.id==='${esc(c.id)}').card)">+</button>
            </div>` : ""}
          </div>
        </article>`;
      }).join("")}
    </div>`;
}
