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
  // Tras el enlace mágico Supabase devuelve los tokens en el fragmento (#access_token=...)
  if (location.hash === "#coleccion" || location.hash.includes("access_token")) switchTab("collection");
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
  if (!cloudReady()) recordPriceSnapshot(card);
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

async function persistAllCollection() {
  if (!cloudReady()) { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); return; }
  if (!sbSession || collection.length === 0) return;
  const owner = sbSession.user.id;
  const rows = collection.map(e => ({
    owner, card_id: e.card.id, game: e.card.tipo, qty: e.qty, card: e.card, updated_at: new Date().toISOString()
  }));
  const { error } = await sbClient.from("collection").upsert(rows, { onConflict: "owner,card_id" });
  if (error) { console.error(error); showDeckToast("Error al guardar en la nube", "warn"); }
}

let refreshingCollection = false;
async function refreshCollectionPrices() {
  if (!canEditCollection() || refreshingCollection || collection.length === 0) return;
  refreshingCollection = true;
  const btn = document.getElementById("btn-refresh-collection");
  const setLabel = (d, t) => { if (btn) btn.textContent = `Actualizando… ${d}/${t}`; };
  if (btn) btn.disabled = true;
  try {
    const r = await refreshCardPrices(collection.map(e => e.card), setLabel);
    await persistAllCollection();
    showDeckToast(r.failed ? `Actualizadas ${r.ok}; ${r.failed} sin respuesta` : `${r.ok} precios actualizados ✓`, r.failed ? "warn" : "success");
  } catch (e) {
    console.error(e);
    showDeckToast("No se pudieron actualizar los precios", "warn");
  } finally {
    refreshingCollection = false;
    renderCollection();
  }
}

async function addCurrentCardToCollection() {
  const card = window._currentCard;
  if (!card) return;
  await collectionAdd(card);
  showDeckToast(`${card.nombre} añadida a la colección ✓`, "success");
}

/* ───────────── Histórico de precios ───────────── */

const sinceDay = (days) => new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);

/** Serie diaria [{day, v}] de una carta (nube: price_history; demo: snapshots locales). */
async function loadCardHistory(card, days = 365) {
  if (!cloudReady()) return localCardHistory(card, days);
  const { data, error } = await sbClient.from("price_history").select("day,eur,usd")
    .eq("card_id", card.id).gte("day", sinceDay(days)).order("day");
  if (error) throw error;
  const key = card.moneda === "usd" ? "usd" : "eur";
  return data.filter(r => r[key] != null).map(r => ({ day: r.day, v: Number(r[key]) }));
}

/** Valor de la colección por día: [{day, eur, usd, cards}]. */
async function loadValueHistory(days = 365) {
  if (!cloudReady()) return localValueHistory(days);
  const owner = collectionOwner();
  if (!owner) return [];
  const { data, error } = await sbClient.from("collection_value_history").select("day,eur,usd,cards")
    .eq("owner", owner).gte("day", sinceDay(days)).order("day");
  if (error) throw error;
  return data.map(r => ({ day: r.day, eur: Number(r.eur), usd: Number(r.usd), cards: r.cards }));
}

let valueRange = 90;
let valueRows = null;

function setValueRange(days) { valueRange = days; paintValueChart(); }

function paintValueChart() {
  const box = document.getElementById("value-chart");
  if (!box || !valueRows) return;
  const useUsd = valueRows.every(r => !(r.eur > 0)) && valueRows.some(r => r.usd > 0);
  const moneda = useUsd ? "usd" : "eur";
  const since = sinceDay(valueRange);
  const pts = valueRows.filter(r => r.day >= since).map(r => ({ day: r.day, v: useUsd ? r.usd : r.eur }));
  if (valueRows.length < 2 || pts.length < 2) {
    box.innerHTML = `<div class="an-muted">${cloudReady()
      ? "El histórico se registra cada día (tarea diaria a las 10:30 UTC). Vuelve mañana para ver la evolución."
      : "Cada día que abras la app se guarda el valor de tu colección. Vuelve mañana para ver la evolución."}</div>`;
    return;
  }
  const t = trendFromHistory(valueRows.map(r => ({ day: r.day, v: useUsd ? r.usd : r.eur })));
  box.innerHTML = `${rangePills(valueRange, [30, 90, 365], "setValueRange")}
    ${lineChart(pts, { moneda, label: "Valor de la colección" })}
    <div class="an-muted">Hoy <strong>${esc(formatMoney(pts[pts.length - 1].v, moneda))}</strong>
      ${t && t.d7 != null ? ` · 7 d ${trendBadge(t.d7) || "<span class='trend'>= estable</span>"}` : ""}
      ${t && t.d30 != null ? ` · 30 d ${trendBadge(t.d30) || "<span class='trend'>= estable</span>"}` : ""}</div>`;
}

async function renderValueChart() {
  const box = document.getElementById("value-chart");
  if (!box) return;
  if (!cloudReady() && collection.length) recordValueSnapshot(collection);
  try { valueRows = await loadValueHistory(365); }
  catch (e) { console.error(e); box.innerHTML = `<div class="an-muted">No se pudo cargar el histórico.</div>`; return; }
  paintValueChart();
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
    email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname }
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
  const value = sumValue(collection);
  const fechas = collection.map(e => priceDate(e.card)).filter(Boolean).map(f => new Date(f).getTime()).filter(t => !isNaN(t));
  const masAntiguo = fechas.length ? new Date(Math.min(...fechas)).toISOString() : null;
  const viejo = masAntiguo && Date.now() - new Date(masAntiguo).getTime() > 3 * 86400e3;
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
      <div class="stat-chip"><span class="stat-val">${esc(formatValue(value))}</span><span class="stat-lbl">Valor</span></div>
    </div>
    <div class="an-card"><h3>Valor en el tiempo</h3><div id="value-chart" class="value-chart"><div class="an-muted">Cargando histórico…</div></div></div>
    <div class="col-prices ${viejo ? "stale" : ""}">
      <span>Precios${masAntiguo ? ` de ${timeAgo(masAntiguo)}` : " sin fecha"}${value.usd > 0 ? " · hay cartas en $ (no convertidas)" : ""}</span>
      ${editable && collection.length ? `<button class="link-btn" id="btn-refresh-collection" onclick="refreshCollectionPrices()">↻ Actualizar precios</button>` : ""}
    </div>
    <div class="pill-switcher">${pills}</div>
    <input type="search" class="deck-name-input" id="collection-search" placeholder="Filtrar por nombre..." value="${esc(collectionFilter.text)}"
      oninput="collectionFilter.text=this.value; renderCollection(); const i=document.getElementById('collection-search'); i.focus(); i.setSelectionRange(i.value.length,i.value.length);">
    <button class="dab-btn" onclick="copyCollectionLink()">🔗 Copiar enlace público</button>
    ${list.length === 0 ? `<div class="an-empty">${collection.length ? "Sin resultados." : (editable ? "Aún no tienes cartas. Búscalas en el Escáner y pulsa «Añadir a colección»." : "Esta colección está vacía.")}</div>` : ""}
    <div class="results-grid" style="display:grid">
      ${list.map(e => {
        const c = e.card;
        return `<article class="card-item">
          <div class="possession-badge">x${e.qty}</div>
          <img src="${esc(c.imagenThumb || c.imagen || "")}" alt="${esc(c.nombre)}" class="card-thumb" loading="lazy">
          <div class="card-info">
            <h3 class="card-name">${esc(c.nombre)}</h3>
            <p class="card-meta">${esc(c.set || "Desconocido")}</p>
            <p class="card-price">${precioHtml(c)}</p>
            ${editable ? `<div class="dcr-controls">
              <button class="dcr-btn remove" aria-label="Quitar una copia" onclick="collectionRemove('${esc(c.id)}')">−</button>
              <button class="dcr-btn" aria-label="Añadir una copia" onclick="collectionAdd(collection.find(x=>x.card.id==='${esc(c.id)}').card)">+</button>
            </div>` : ""}
          </div>
        </article>`;
      }).join("")}
    </div>`;
  renderValueChart();
}
