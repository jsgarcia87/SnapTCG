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
let collectionFilter = { game: "all", finish: "all", lang: "all", sort: "value-desc", text: "" };

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
  if (location.hash.includes("access_token")) switchTab("collection");
}

async function onAuthChanged() {
  if (sbSession && cloudReady()) await pullDecksFromCloud();
  await loadCollection();
  renderCollection();
  updateCollectionButton();
  if (typeof renderHome === "function") renderHome();
  setSyncStatus();
}

function setSyncStatus() {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = !cloudConfigured() ? "Modo demo · datos en este navegador"
    : sbSession ? "Sesión iniciada · colección publicada" : "Colección pública · solo lectura";
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

async function collectionAdd(card, variant = null, condition = null) {
  if (!canEditCollection()) return;
  if (!cloudReady()) recordPriceSnapshot(card);

  const chosenVariant = variant || card.selectedVariant || "normal";
  const chosenCondition = condition || card.condition || "NM";
  const chosenLang = card.lang || "en";

  const cardToSave = {
    ...card,
    selectedVariant: chosenVariant,
    condition: chosenCondition,
    lang: chosenLang
  };

  let entry = collection.find(e => e.card.id === card.id);
  if (entry) {
    entry.qty++;
    entry.card.selectedVariant = chosenVariant;
    entry.card.condition = chosenCondition;
    entry.card.lang = chosenLang;
  } else {
    entry = { card: cardToSave, qty: 1 };
    collection.push(entry);
  }
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
    showDeckToast(r.failed ? `Actualizadas ${r.ok}; ${r.failed} sin respuesta` : `${r.ok} precios actualizados`, r.failed ? "warn" : "success");
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
  const variant = card.selectedVariant || "normal";
  const cond = (typeof cardCondition !== "undefined" ? cardCondition : "NM");
  const langName = typeof formatLanguageName === "function" ? formatLanguageName(card.lang || "en") : (card.lang || "en").toUpperCase();
  await collectionAdd(card, variant, cond);
  pintarPoseidaModal(card);
  showDeckToast(`${card.nombre} (${formatVariantName(variant)} · ${cond} · ${langName}) añadida a tu colección`, "success");
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

/** Abre el detalle de una carta guardada en la colección (sin registrarla en el historial de búsqueda). */
function abrirCartaGuardada(id) {
  const e = collection.find(x => x.card.id === id);
  if (e) abrirDetalle(e.card, false);
}

let valueRange = 90;
let valueRows = null;

function setValueRange(days) { valueRange = days; paintValueChart(); }

/** Serie del valor de la colección en una sola moneda (EUR salvo que solo haya USD). */
function valueSeries(rows, days) {
  const useUsd = rows.length > 0 && rows.every(r => !(r.eur > 0)) && rows.some(r => r.usd > 0);
  const all = rows.map(r => ({ day: r.day, v: useUsd ? r.usd : r.eur }));
  const since = sinceDay(days);
  return { moneda: useUsd ? "usd" : "eur", all, pts: all.filter(p => p.day >= since) };
}

function paintValueChart() {
  const box = document.getElementById("value-chart");
  if (!box || !valueRows) return;
  const { moneda, pts, all } = valueSeries(valueRows, valueRange);
  const useUsd = moneda === "usd";
  if (valueRows.length < 2 || pts.length < 2) {
    box.innerHTML = `<div class="an-muted">${cloudReady()
      ? "El histórico se registra cada día (tarea diaria a las 10:30 UTC). Vuelve mañana para ver la evolución."
      : "Cada día que abras la app se guarda el valor de tu colección. Vuelve mañana para ver la evolución."}</div>`;
    return;
  }
  const t = trendFromHistory(all);
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
  navigator.clipboard?.writeText(url).then(() => showDeckToast("Enlace copiado", "success"));
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
  const holosCount = collection.filter(e => e.card.selectedVariant === "holo" || e.card.selectedVariant === "reverse" || e.card.variants?.holo).reduce((s, e) => s + e.qty, 0);
  const langsCount = new Set(collection.map(e => (e.card.lang || "en").toLowerCase())).size;

  const fechas = collection.map(e => priceDate(e.card)).filter(Boolean).map(f => new Date(f).getTime()).filter(t => !isNaN(t));
  const masAntiguo = fechas.length ? new Date(Math.min(...fechas)).toISOString() : null;
  const viejo = masAntiguo && Date.now() - new Date(masAntiguo).getTime() > 3 * 86400e3;
  const text = (collectionFilter.text || "").toLowerCase();

  let list = collection
    .filter(e => collectionFilter.game === "all" || e.card.tipo === collectionFilter.game)
    .filter(e => {
      if (collectionFilter.finish === "all") return true;
      const v = e.card.selectedVariant;
      if (collectionFilter.finish === "holo") return v === "holo" || e.card.variants?.holo;
      if (collectionFilter.finish === "normal") return v === "normal" || e.card.variants?.normal !== false;
      if (collectionFilter.finish === "reverse") return v === "reverse" || e.card.variants?.reverse;
      return true;
    })
    .filter(e => {
      if (collectionFilter.lang === "all") return true;
      return typeof matchCardLang === "function" 
        ? matchCardLang(e.card.lang, collectionFilter.lang)
        : (e.card.lang || "en").toLowerCase() === collectionFilter.lang.toLowerCase();
    })
    .filter(e => !text || e.card.nombre.toLowerCase().includes(text));

  // Ordenación
  if (collectionFilter.sort === "value-desc") {
    list.sort((a, b) => ((getCardActivePrice(b.card) || 0) * b.qty) - ((getCardActivePrice(a.card) || 0) * a.qty));
  } else if (collectionFilter.sort === "value-asc") {
    list.sort((a, b) => ((getCardActivePrice(a.card) || 0) * a.qty) - ((getCardActivePrice(b.card) || 0) * b.qty));
  } else if (collectionFilter.sort === "name-asc") {
    list.sort((a, b) => a.card.nombre.localeCompare(b.card.nombre));
  } else if (collectionFilter.sort === "qty-desc") {
    list.sort((a, b) => b.qty - a.qty);
  }

  const gamePills = [["all", "Todas"], ["pokemon", "Pokémon"], ["magic", "Magic"]]
    .map(([k, l]) => `<button class="filter-pill ${collectionFilter.game === k ? "active" : ""}" onclick="setCollectionFilter('game','${k}')">${l}</button>`).join("");

  const finishPills = [["all", "Todos"], ["holo", `${HEROICONS.sparkles} Holofoil`], ["normal", "Normal"], ["reverse", "Reverse"]]
    .map(([k, l]) => `<button class="filter-pill ${collectionFilter.finish === k ? "active" : ""}" onclick="setCollectionFilter('finish','${k}')">${l}</button>`).join("");

  const langPills = [
    ["all", "Todos"],
    ["en", "EN"],
    ["es", "ES"],
    ["ja", "JA"],
    ["zh", "ZH (Chino)"],
    ["zh-cn", "ZH-CN"],
    ["zh-tw", "ZH-TW"],
    ["ko", "KO"],
    ["fr", "FR"],
    ["de", "DE"],
    ["it", "IT"]
  ].map(([k, l]) => `<button class="filter-pill ${collectionFilter.lang === k ? "active" : ""}" onclick="setCollectionFilter('lang','${k}')">${l}</button>`).join("");

  root.innerHTML = `
    <div class="col-mode">${esc(mode)}</div>
    ${auth}
    
    <!-- Hero Portfolio Card estilo Collectr -->
    <div class="portfolio-hero-card">
      <div class="phc-header">
        <span class="eyebrow">Mi Portfolio</span>
        <h2 class="phc-total">${esc(formatValue(value))}</h2>
      </div>
      <div class="phc-stats-grid">
        <div class="phc-stat"><span class="phc-num">${total}</span><span class="phc-lbl">Cartas</span></div>
        <div class="phc-stat"><span class="phc-num">${collection.length}</span><span class="phc-lbl">Únicas</span></div>
        <div class="phc-stat"><span class="phc-num">${holosCount}</span><span class="phc-lbl">Holos / Foils</span></div>
        <div class="phc-stat"><span class="phc-num">${langsCount}</span><span class="phc-lbl">Idiomas</span></div>
      </div>
    </div>

    <div class="an-card"><h3>Evolución del Portfolio</h3><div id="value-chart" class="value-chart"><div class="an-muted">Cargando histórico…</div></div></div>

    <div class="col-prices ${viejo ? "stale" : ""}">
      <span>Precios${masAntiguo ? ` de ${timeAgo(masAntiguo)}` : " sin fecha"}${value.usd > 0 ? " · hay cartas en $ (no convertidas)" : ""}</span>
      ${editable && collection.length ? `<button class="link-btn" id="btn-refresh-collection" onclick="refreshCollectionPrices()">${HEROICONS.arrowPath} Actualizar precios</button>` : ""}
    </div>

    <!-- Barra de Filtros Collectr dentro de la Colección -->
    <div class="collectr-filter-bar" style="margin-top: 8px;">
      <div class="filter-group">
        <span class="filter-group-label">Juego:</span>
        ${gamePills}
      </div>
      <div class="filter-divider"></div>
      <div class="filter-group">
        <span class="filter-group-label">Estilo:</span>
        ${finishPills}
      </div>
      <div class="filter-divider"></div>
      <div class="filter-group">
        <span class="filter-group-label">Idioma:</span>
        ${langPills}
      </div>
      <div class="filter-divider"></div>
      <div class="filter-group">
        <span class="filter-group-label">Orden:</span>
        <select class="filter-select" onchange="setCollectionFilter('sort', this.value)">
          <option value="value-desc" ${collectionFilter.sort === "value-desc" ? "selected" : ""}>Mayor valor</option>
          <option value="value-asc" ${collectionFilter.sort === "value-asc" ? "selected" : ""}>Menor valor</option>
          <option value="name-asc" ${collectionFilter.sort === "name-asc" ? "selected" : ""}>Nombre (A-Z)</option>
          <option value="qty-desc" ${collectionFilter.sort === "qty-desc" ? "selected" : ""}>Mayor cantidad</option>
        </select>
      </div>
    </div>

    <div class="search-bar" style="margin: 12px 0 6px;">
      <input type="search" class="search-input" id="collection-search" placeholder="Filtrar colección por nombre..." value="${esc(collectionFilter.text)}"
        oninput="collectionFilter.text=this.value; renderCollection(); const i=document.getElementById('collection-search'); i.focus(); i.setSelectionRange(i.value.length,i.value.length);">
    </div>

    <button class="dab-btn" onclick="copyCollectionLink()" style="margin-bottom:12px;">${HEROICONS.link} Compartir enlace público</button>

    ${list.length === 0 ? `<div class="an-empty">${collection.length ? "No hay cartas que coincidan con los filtros aplicados." : (editable ? "Aún no tienes cartas en tu colección. Búscalas o escanéalas y pulsa «Añadir a colección»." : "Esta colección está vacía.")}</div>` : ""}

    <div class="results-grid" style="display:grid">
      ${list.map(e => {
        const c = e.card;
        const variant = c.selectedVariant || "normal";
        const cond = c.condition || "NM";
        const isHolo = variant === "holo" || (c.precioFoil != null && c.precioFoil > 0);
        const isReverse = variant === "reverse";
        const langBadge = typeof formatLanguageBadge === "function" ? formatLanguageBadge(c.lang) : (c.lang || "en").toUpperCase();
        const langName = typeof formatLanguageName === "function" ? formatLanguageName(c.lang) : (c.lang || "en").toUpperCase();

        let finishBadge = "";
        if (isHolo) {
          finishBadge = `<span class="badge-finish holo">${HEROICONS.sparkles} Holo</span>`;
        } else if (isReverse) {
          finishBadge = `<span class="badge-finish reverse">Rev Holo</span>`;
        } else if (variant === "firstEdition") {
          finishBadge = `<span class="badge-finish first-ed">1st Ed</span>`;
        }

        return `<article class="card-item ${isHolo ? 'is-holo-card' : ''}" tabindex="0" role="button" aria-label="Ver ${esc(c.nombre)}"
          onclick="abrirCartaGuardada('${esc(c.id)}')" onkeydown="if(event.key==='Enter') abrirCartaGuardada('${esc(c.id)}')">
          <div class="card-artwork-wrapper">
            <div class="possession-badge">x${e.qty}</div>
            <div class="card-badges-overlay">
              <span class="badge-lang" title="${esc(langName)}">${esc(langBadge)}</span>
              ${finishBadge}
              <span class="badge-condition">${esc(cond)}</span>
            </div>
            <img src="${esc(c.imagenThumb || c.imagen || "")}" alt="${esc(c.nombre)}" class="card-thumb" loading="lazy">
            ${isHolo ? '<div class="card-holo-sheen" aria-hidden="true"></div>' : ''}
          </div>
          <div class="card-info">
            <h3 class="card-name">${esc(c.nombre)}</h3>
            <p class="card-meta">${esc(c.set || "Desconocido")}${c.localId ? ' · #' + esc(c.localId) : ''}</p>
            <p class="card-price">${precioHtml(c)}</p>
            ${editable ? `<div class="dcr-controls" style="margin-top:4px;">
              <button class="dcr-btn remove" aria-label="Quitar una copia" onclick="event.stopPropagation(); collectionRemove('${esc(c.id)}')">${HEROICONS.minus}</button>
              <button class="dcr-btn" aria-label="Añadir una copia" onclick="event.stopPropagation(); collectionAdd(collection.find(x=>x.card.id==='${esc(c.id)}').card)">${HEROICONS.plus}</button>
            </div>` : ""}
          </div>
        </article>`;
      }).join("")}
    </div>`;
  renderValueChart();
}
