/**
 * cloud.js — Colección de cartas + sincronización con Supabase
 * Author: Sangar Studio
 * Version: 2.2.0
 * Sin sesión: la colección, el seguimiento y los mazos se guardan en este dispositivo (localStorage).
 * Con sesión (cualquiera puede crear cuenta): todo se guarda en Supabase, privado por defecto.
 * Colección pública: solo si su dueño la activa; se ve con el enlace ?u=<id>#coleccion (solo lectura).
 * Depende de: config.js, stats.js (esc), deckbuilder.js (allDecks, saveDecks, showDeckToast), app.js (juegoActual)
 */

const COLLECTION_KEY = "snaptcg_collection";
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.min.js";
const SUPABASE_JS_SRI = "sha384-WmjsOVSSw3JNqIKfmDU35+uddOzBdP9PlYIWCg7xdnVOesjWVGpRcooOVheFFwH4";

let collection = [];          // [{ card, qty }]
let sbClient = null;
let sbSession = null;
let collectionFilter = { game: "all", finish: "all", lang: "all", sort: "value-desc", text: "" };
let colTab = location.hash === "#cuenta" ? "cuenta" : "cartas";   // pestañas de Colección: cartas | analisis | cuenta

/** Clave de una fila de colección: la misma carta en otra variante, estado o idioma es otra fila. */
const entryKey = (c) => [c.id, c.selectedVariant || "normal", c.condition || "NM", (c.lang || "en").toLowerCase()].join("~");
/** Codifica una clave para usarla dentro de un atributo onclick sin poder romper la cadena JS. */
const encKey = (k) => encodeURIComponent(k).replace(/'/g, "%27");

const demoForced = () => new URLSearchParams(location.search).has("demo");
const cloudConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY) && !demoForced();
const cloudReady = () => cloudConfigured() && !!sbClient;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Dueño de la colección pública que se está viendo por enlace (?u=…), o null. */
const sharedOwner = () => { const u = new URLSearchParams(location.search).get("u"); return u && UUID_RE.test(u) ? u.toLowerCase() : null; };
const viewingOther = () => !!sharedOwner() && (!sbSession || sbSession.user.id !== sharedOwner());
/** Los datos propios van a la nube solo con sesión iniciada; si no, al dispositivo. */
const useCloud = () => cloudReady() && !!sbSession && !viewingOther();
const canEditCollection = () => !viewingOther();
const collectionOwner = () => (viewingOther() ? sharedOwner() : sbSession ? sbSession.user.id : null);
let profile = { public_collection: false };
const initialHash = location.hash;   // #cuenta abre directamente el panel de cuenta (enlace de borrado de Play)

/* ───────────── Inicialización ───────────── */

function loadScript(src, integrity) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    if (integrity) { s.integrity = integrity; s.crossOrigin = "anonymous"; }
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("No se pudo cargar " + src));
    document.head.appendChild(s);
  });
}

async function initCloud() {
  if (cloudConfigured()) {
    try {
      await loadScript(SUPABASE_JS, SUPABASE_JS_SRI);
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
  // El tipo de cambio llega después: al tenerlo, se repinta el valor total
  initFx().then(f => { if (f) { renderCollection(); if (typeof renderHome === "function") renderHome(); } });
  // Tras el enlace mágico Supabase devuelve los tokens en el fragmento (#access_token=...)
  if (location.hash.includes("access_token")) switchTab("collection");
  if (initialHash === "#cuenta") { switchTab("collection"); document.getElementById("cuenta")?.scrollIntoView({ block: "start" }); }
}

async function onAuthChanged() {
  if (sbSession && cloudReady()) {
    await loadProfile();
    await pullDecksFromCloud();
  }
  await loadCollection();
  if (useCloud()) await uploadLocalData();
  if (typeof loadWatchlist === "function") await loadWatchlist();
  renderCollection();
  updateCollectionButton();
  if (typeof renderHome === "function") renderHome();
  setSyncStatus();
}

function setSyncStatus() {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = viewingOther() ? "Colección compartida · solo lectura"
    : useCloud() ? `Sesión iniciada · ${profile.public_collection ? "colección pública" : "colección privada"}`
    : "Sin sesión · datos en este dispositivo";
}

/* ───────────── Colección: datos ───────────── */

function loadLocalCollection() {
  try {
    return (JSON.parse(localStorage.getItem(COLLECTION_KEY)) || []).map(e => ({ ...e, key: entryKey(e.card) }));
  } catch { return []; }
}

async function loadCollection() {
  if (viewingOther() && !cloudReady()) { collection = []; return; }
  if (!viewingOther() && !useCloud()) { collection = loadLocalCollection(); return; }
  const owner = collectionOwner();
  if (!owner) { collection = []; return; }
  const { data, error } = await sbClient.from("collection").select("card_id,card,qty").eq("owner", owner);
  if (error) { console.error(error); showDeckToast("Error al cargar la colección", "warn"); collection = []; return; }
  collection = data.map(r => ({ key: r.card_id, card: r.card, qty: r.qty }));
  await migrateLegacyKeys();
  await loadCosts();
}

/* ───────────── Precio de compra: tabla privada (la colección es de lectura pública) ───────────── */

/** Copia de la carta sin el coste: lo único que se publica en `collection`. */
const publicCard = (card) => { const { coste, ...rest } = card; return rest; };

async function loadCosts() {
  if (!useCloud()) return;   // solo el dueño ve sus costes
  const { data, error } = await sbClient.from("collection_cost").select("card_id,coste").eq("owner", sbSession.user.id);
  if (error) { console.error(error); return; }
  const byKey = new Map(data.map(r => [r.card_id, Number(r.coste)]));
  collection.forEach(e => { if (byKey.has(e.key)) e.card.coste = byKey.get(e.key); });
}

async function persistCost(entry, removed) {
  if (!useCloud()) return;
  const owner = sbSession.user.id;
  const has = !removed && entry.card.coste != null && entry.card.coste >= 0;
  const { error } = has
    ? await sbClient.from("collection_cost").upsert({ owner, card_id: entry.key, coste: entry.card.coste, updated_at: new Date().toISOString() }, { onConflict: "owner,card_id" })
    : await sbClient.from("collection_cost").delete().eq("owner", owner).eq("card_id", entry.key);
  if (error) { console.error(error); showDeckToast("Error al guardar el precio de compra", "warn"); }
}

/** Filas antiguas (card_id = id de carta): se reescriben con la clave id+variante+estado+idioma. */
async function migrateLegacyKeys() {
  if (!useCloud()) return;
  const legacy = collection.filter(e => e.key === e.card.id && entryKey(e.card) !== e.key);
  for (const e of legacy) {
    const owner = sbSession.user.id, newKey = entryKey(e.card);
    const { error } = await sbClient.from("collection").upsert({
      owner, card_id: newKey, game: e.card.tipo, qty: e.qty, card: publicCard(e.card), updated_at: new Date().toISOString()
    }, { onConflict: "owner,card_id" });
    if (error) { console.error(error); continue; }
    const del = await sbClient.from("collection").delete().eq("owner", owner).eq("card_id", e.key);
    if (del.error) { console.error(del.error); continue; }
    e.key = newKey;
  }
}

async function persistCollectionEntry(entry, removed) {
  if (!useCloud()) {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
    return;
  }
  const owner = sbSession.user.id;
  const q = removed
    ? sbClient.from("collection").delete().eq("owner", owner).eq("card_id", entry.key)
    : sbClient.from("collection").upsert({
        owner, card_id: entry.key, game: entry.card.tipo, qty: entry.qty,
        card: publicCard(entry.card), updated_at: new Date().toISOString()
      }, { onConflict: "owner,card_id" });
  const { error } = await q;
  if (error) { console.error(error); showDeckToast("Error al guardar en la nube", "warn"); }
  await persistCost(entry, removed);
}

/** Suma `qty` copias de una carta a la colección en memoria (sin guardar). Devuelve la fila. */
function addToCollectionMemory(card, variant = null, condition = null, qty = 1) {
  const cardToSave = {
    ...card,
    selectedVariant: variant || card.selectedVariant || "normal",
    condition: condition || card.condition || "NM",
    lang: card.lang || "en"
  };
  // Coste por carta (€): al sumar copias a otro precio se guarda la media ponderada
  const coste = card.coste == null || card.coste === "" ? NaN : parseFloat(card.coste);
  if (coste >= 0) cardToSave.coste = coste; else delete cardToSave.coste;

  const key = entryKey(cardToSave);
  let entry = collection.find(e => e.key === key);
  if (entry) {
    if (coste >= 0) {
      const previo = parseFloat(entry.card.coste);
      entry.card.coste = previo >= 0 ? (previo * entry.qty + coste * qty) / (entry.qty + qty) : coste;
    }
    entry.qty += qty;
  } else {
    entry = { key, card: cardToSave, qty };
    collection.push(entry);
  }
  return entry;
}

async function collectionAdd(card, variant = null, condition = null) {
  if (!canEditCollection()) return;
  if (!useCloud()) recordPriceSnapshot(card);
  const entry = addToCollectionMemory(card, variant, condition, 1);
  await persistCollectionEntry(entry, false);
  renderCollection();
}

/** Añade muchas cartas de una vez ([{card, qty}]) con una sola escritura. Devuelve cuántas copias añadió. */
async function collectionAddBatch(items) {
  if (!canEditCollection() || !items.length) return 0;
  const tocadas = new Set();
  let copias = 0;
  for (const { card, qty } of items) {
    if (!(qty > 0)) continue;
    if (!useCloud()) recordPriceSnapshot(card);
    tocadas.add(addToCollectionMemory(card, null, null, qty));
    copias += qty;
  }
  if (!useCloud()) {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
  } else {
    const owner = sbSession.user.id, now = new Date().toISOString();
    const filas = [...tocadas].map(e => ({ owner, card_id: e.key, game: e.card.tipo, qty: e.qty, card: publicCard(e.card), updated_at: now }));
    const { error } = await sbClient.from("collection").upsert(filas, { onConflict: "owner,card_id" });
    if (error) { console.error(error); showDeckToast("Error al guardar en la nube", "warn"); await loadCollection(); renderCollection(); return 0; }
    for (const e of tocadas) await persistCost(e, false);
  }
  renderCollection();
  if (typeof renderHome === "function") renderHome();
  return copias;
}

async function collectionRemove(encodedKey) {
  if (!canEditCollection()) return;
  const key = decodeURIComponent(encodedKey);
  const i = collection.findIndex(e => e.key === key);
  if (i < 0) return;
  const entry = collection[i];
  const removed = entry.qty <= 1;
  if (removed) collection.splice(i, 1); else entry.qty--;
  await persistCollectionEntry(entry, removed);
  renderCollection();
}

/** Fija el coste por carta (€) de una fila de la colección; null lo borra. */
async function collectionSetCost(key, coste) {
  if (!canEditCollection()) return false;
  const entry = collection.find(e => e.key === key);
  if (!entry) return false;
  if (coste != null && coste >= 0) entry.card.coste = coste; else delete entry.card.coste;
  await persistCollectionEntry(entry, false);
  renderCollection();
  if (typeof renderHome === "function") renderHome();
  return true;
}

async function persistAllCollection() {
  if (!useCloud()) { localStorage.setItem(COLLECTION_KEY, JSON.stringify(collection)); return; }
  if (collection.length === 0) return;
  const owner = sbSession.user.id;
  const rows = collection.map(e => ({
    owner, card_id: e.key, game: e.card.tipo, qty: e.qty, card: publicCard(e.card), updated_at: new Date().toISOString()
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
  const qty = typeof altaQty === "number" && altaQty > 0 ? altaQty : 1;
  const n = await collectionAddBatch([{ card: { ...card, selectedVariant: variant, condition: cond }, qty }]);
  if (!n) return;
  if (typeof cambiarCantidadAlta === "function") cambiarCantidadAlta(0, true);
  pintarPoseidaModal(card);
  showDeckToast(`${qty > 1 ? qty + " × " : ""}${card.nombre} (${formatVariantName(variant)} · ${cond} · ${langName}) añadida${qty > 1 ? "s" : ""} a tu colección`, "success");
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
  if (!useCloud() && !(viewingOther() && cloudReady())) return localValueHistory(days);
  const owner = collectionOwner();
  if (!owner) return [];
  const { data, error } = await sbClient.from("collection_value_history").select("day,eur,usd,cards,eur_all")
    .eq("owner", owner).gte("day", sinceDay(days)).order("day");
  if (error) throw error;
  return data.map(r => ({ day: r.day, eur: Number(r.eur), usd: Number(r.usd), cards: r.cards, eur_all: r.eur_all == null ? null : Number(r.eur_all) }));
}

/** Abre el detalle de una carta guardada en la colección (sin registrarla en el historial de búsqueda). */
function abrirCartaGuardada(encodedKey) {
  const key = decodeURIComponent(encodedKey);
  const e = collection.find(x => x.key === key);
  if (e) abrirDetalle(e.card, false);
}

let valueRange = 90;
let valueRows = null, valueRowsOwner = null, valueRowsAt = 0;

function setValueRange(days) { valueRange = days; paintValueChart(); }

/** Serie del valor de la colección en una sola moneda (EUR salvo que solo haya USD). */
function valueSeries(rows, days) {
  // Una sola serie en €: el job diario guarda eur_all (con el cambio de ese día); si falta, se convierte con el cambio actual
  const fx = readFx();
  const toAll = r => r.eur_all != null ? r.eur_all : !(r.usd > 0) ? r.eur : fx ? r.eur + r.usd * fx.rate : null;
  const converted = rows.map(r => ({ day: r.day, v: toAll(r) }));
  const useUsd = converted.every(p => p.v == null) && rows.some(r => r.usd > 0);
  const all = useUsd ? rows.map(r => ({ day: r.day, v: r.usd })) : converted.filter(p => p.v != null);
  const since = sinceDay(days);
  return { moneda: useUsd ? "usd" : "eur", all, pts: all.filter(p => p.day >= since) };
}

function paintValueChart() {
  const box = document.getElementById("value-chart");
  if (!box || !valueRows) return;
  const { moneda, pts, all } = valueSeries(valueRows, valueRange);
  const useUsd = moneda === "usd";
  if (valueRows.length < 2 || pts.length < 2) {
    box.innerHTML = `<div class="an-muted">${useCloud() || viewingOther()
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
  if (!useCloud() && !viewingOther() && collection.length) recordValueSnapshot(collection);
  // En la nube el histórico lo escribe el trabajo diario: basta con pedirlo cada 5 min por dueño
  const enNube = useCloud() || (viewingOther() && cloudReady());
  const owner = enNube ? collectionOwner() : "local";
  if (enNube && valueRows && valueRowsOwner === owner && Date.now() - valueRowsAt < 300e3) { paintValueChart(); return; }
  try { valueRows = await loadValueHistory(365); valueRowsOwner = owner; valueRowsAt = Date.now(); }
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
  const email = (input ? input.value : "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showDeckToast("Escribe un email válido", "warn"); return; }
  if (!sbClient) { showDeckToast("No hay conexión con la nube", "warn"); return; }
  const btn = document.getElementById("btn-login");
  if (btn) btn.disabled = true;
  // shouldCreateUser: si el email no tiene cuenta, se crea al confirmar el enlace
  const { error } = await sbClient.auth.signInWithOtp({
    email, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname }
  });
  if (btn) btn.disabled = false;
  if (error) {
    console.error(error);
    const limite = /rate|limit|too many/i.test(error.message || "");
    showDeckToast(limite ? "Demasiados intentos: espera unos minutos y vuelve a probar" : "No se pudo enviar el enlace", "warn");
    return;
  }
  showDeckToast("Revisa tu correo y abre el enlace en este dispositivo", "success");
}

async function cloudLogout() {
  await sbClient.auth.signOut();
  profile = { public_collection: false };
}

/* ───────────── Cuenta: perfil, subida de datos locales y borrado ───────────── */

async function loadProfile() {
  profile = { public_collection: false };
  const { data, error } = await sbClient.from("profiles").select("public_collection").eq("id", sbSession.user.id).maybeSingle();
  if (error) { console.error(error); return; }
  if (data) profile = data;
}

async function setPublicCollection(on) {
  if (!useCloud()) return;
  const { error } = await sbClient.from("profiles").upsert({ id: sbSession.user.id, public_collection: !!on, updated_at: new Date().toISOString() });
  if (error) { console.error(error); showDeckToast("No se pudo cambiar la visibilidad", "warn"); renderCollection(); return; }
  profile.public_collection = !!on;
  setSyncStatus();
  renderCollection();
  showDeckToast(on ? "Tu colección es pública: cualquiera con el enlace puede verla" : "Tu colección vuelve a ser privada", "success");
}

/**
 * Al iniciar sesión, lo que había en este dispositivo se suma a la cuenta (cantidades y coste medio)
 * y se borra del dispositivo para no volver a subirlo dos veces.
 */
async function uploadLocalData() {
  const local = loadLocalCollection();
  let subidas = 0;
  if (local.length) {
    for (const l of local) {
      const e = collection.find(x => x.key === l.key);
      if (e) {
        const cl = parseFloat(l.card.coste), ce = parseFloat(e.card.coste);
        if (cl >= 0) e.card.coste = ce >= 0 ? (ce * e.qty + cl * l.qty) / (e.qty + l.qty) : cl;
        e.qty += l.qty;
      } else collection.push({ key: l.key, card: l.card, qty: l.qty });
      subidas += l.qty;
    }
    const filas = collection.map(e => ({ owner: sbSession.user.id, card_id: e.key, game: e.card.tipo, qty: e.qty, card: publicCard(e.card), updated_at: new Date().toISOString() }));
    const { error } = await sbClient.from("collection").upsert(filas, { onConflict: "owner,card_id" });
    if (error) { console.error(error); showDeckToast("No se pudieron subir las cartas de este dispositivo", "warn"); await loadCollection(); return; }
    for (const e of collection) await persistCost(e, false);
    try { localStorage.removeItem(COLLECTION_KEY); } catch { /* opcional */ }
  }
  if (typeof uploadLocalWatchlist === "function") await uploadLocalWatchlist();
  if (subidas) showDeckToast(`${subidas} carta(s) de este dispositivo añadidas a tu cuenta`, "success");
}

async function deleteAccount() {
  if (!useCloud()) return;
  const email = sbSession.user.email || "tu cuenta";
  const ok = prompt(`Vas a borrar ${email} y TODOS sus datos en la nube: colección, mazos, seguimiento y precios de compra. No se puede deshacer.\n\nEscribe BORRAR para confirmar.`);
  if ((ok || "").trim().toUpperCase() !== "BORRAR") { showDeckToast("No se ha borrado nada", "info"); return; }
  const { error } = await sbClient.rpc("delete_my_account");
  if (error) { console.error(error); showDeckToast("No se pudo borrar la cuenta. Escríbenos y lo haremos nosotros.", "warn"); return; }
  try { await sbClient.auth.signOut(); } catch { /* la sesión ya no existe */ }
  try { ["snaptcg_decks", WATCH_KEY, COLLECTION_KEY].forEach(k => localStorage.removeItem(k)); } catch { /* opcional */ }
  if (typeof loadDecks === "function") { loadDecks(); if (typeof renderDeckLibrary === "function") renderDeckLibrary(); }
  sbSession = null; profile = { public_collection: false };
  await onAuthChanged();
  showDeckToast("Cuenta y datos borrados", "success");
}

function accountPanelHtml() {
  if (!cloudConfigured()) return "";
  if (viewingOther()) {
    return `<div class="account-panel" id="cuenta"><p class="account-title">Estás viendo una colección compartida</p>
      <p class="an-muted">Es de otra persona y solo puedes verla.</p>
      <a class="dab-btn" href="${esc(location.pathname)}#coleccion">Ir a mi colección</a></div>`;
  }
  if (!sbSession) {
    return `<div class="account-panel" id="cuenta">
      <p class="account-title">Guarda tu colección en la nube</p>
      <p class="an-muted">Ahora tus cartas están solo en este dispositivo. Con una cuenta las tendrás en todos y podrás compartirlas. Te enviamos un enlace al correo: no hay contraseña.${collection.length ? " Las cartas de este dispositivo se añadirán a tu cuenta." : ""}</p>
      <div class="col-login"><input type="email" id="collection-email" class="deck-name-input" placeholder="tu@email.com" autocomplete="email" inputmode="email"
        onkeydown="if(event.key==='Enter') cloudLogin()">
      <button class="dab-btn primary" id="btn-login" onclick="cloudLogin()">Entrar o crear cuenta</button></div>
      <p class="an-muted account-legal">Al crear una cuenta aceptas la <a href="privacidad.html">política de privacidad</a>.</p></div>`;
  }
  const pub = !!profile.public_collection;
  return `<div class="account-panel" id="cuenta">
    <p class="account-title">Tu cuenta</p>
    <p class="an-muted">${esc(sbSession.user.email || "")}</p>
    <label class="account-toggle"><input type="checkbox" ${pub ? "checked" : ""} onchange="setPublicCollection(this.checked)">
      <span><strong>Colección pública</strong><br><small>${pub ? "Cualquiera con el enlace puede ver tus cartas y su valor (no tu precio de compra)." : "Solo tú puedes verla."}</small></span></label>
    <div class="account-actions">
      ${pub ? `<button class="dab-btn" onclick="copyCollectionLink()">${HEROICONS.link} Copiar enlace público</button>` : ""}
      <button class="dab-btn" onclick="cloudLogout()">Cerrar sesión</button>
      <button class="dab-btn danger" onclick="deleteAccount()">Borrar mi cuenta</button>
    </div></div>`;
}

/* ───────────── UI ───────────── */

function updateCollectionButton() {
  const btn = document.getElementById("btn-add-to-collection");
  if (btn) btn.style.display = canEditCollection() ? "" : "none";
  const qty = document.querySelector(".detail-actions-sticky .qty-stepper");
  if (qty) qty.style.display = canEditCollection() ? "" : "none";
}

function copyCollectionLink() {
  if (!useCloud() || !profile.public_collection) { showDeckToast("Activa «Colección pública» en tu cuenta para compartirla", "info"); return; }
  const url = `${location.origin}${location.pathname}?u=${sbSession.user.id}#coleccion`;
  if (navigator.share) { navigator.share({ title: "Mi colección en Kard Lume", url }).catch(() => {}); return; }
  navigator.clipboard?.writeText(url).then(() => showDeckToast("Enlace copiado", "success"), () => prompt("Copia este enlace:", url));
}

function setColTab(tab) {
  if (tab !== colTab && typeof setOpen !== "undefined") setOpen = null;
  colTab = tab; renderCollection(); window.scrollTo({ top: 0 });
}

function setCollectionFilter(key, value) {
  collectionFilter[key] = value;
  renderCollection();
}

function renderCollection() {
  const root = document.getElementById("collection-body");
  if (!root) return;

  const editable = canEditCollection();
  // conserva lo escrito en el email si se repinta mientras se escribe
  const emailPrevio = document.getElementById("collection-email")?.value || "";
  const auth = accountPanelHtml().replace('id="collection-email"', `id="collection-email" value="${esc(emailPrevio)}"`);

  const total = collection.reduce((s, e) => s + e.qty, 0);
  const value = sumValue(collection);
  const pnl = sumPnL(collection);
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

  const finishPills = [["all", "Todos"], ["holo", "Holofoil"], ["normal", "Normal"], ["reverse", "Reverse"]]
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

  const filtrosActivos = ["game", "finish", "lang"].filter(k => collectionFilter[k] !== "all").length;
  const tabs = [["cartas", "Cartas"], ["sets", "Sets"], ["analisis", "Análisis"], ["cuenta", cloudConfigured() ? "Cuenta" : "Datos"]]
    .map(([k, l]) => `<button type="button" role="tab" class="col-tab ${colTab === k ? "active" : ""}" aria-selected="${colTab === k}" onclick="setColTab('${k}')">${l}</button>`).join("");

  const cartasHtml = `
    <!-- Hero Portfolio Card estilo Collectr -->
    <div class="portfolio-hero-card">
      <div class="phc-header">
        <span class="eyebrow">Mi Portfolio</span>
        <h2 class="phc-total">${esc(formatValue(value))}</h2>
        ${pnl.conCoste > 0
          ? `<p class="phc-pl ${pnl.ganancia >= 0 ? "pl-up" : "pl-down"}">Invertido ${esc(formatMoney(pnl.invertido, "eur"))} · ${pnl.ganancia >= 0 ? "Ganancia" : "Pérdida"} ${esc(formatPnL(pnl.ganancia, pnl.pct))}${pnl.sinCoste ? ` · ${pnl.sinCoste} sin precio de compra` : ""}</p>`
          : `<p class="phc-pl pl-none">Añade el precio de compra en la ficha de cada carta para ver tu ganancia o pérdida.</p>`}
        ${value.missing ? `<p class="phc-pl pl-none">${value.missing} carta(s) sin precio no están incluidas en el total.</p>` : ""}
      </div>
    </div>

    <div class="col-prices ${viejo ? "stale" : ""}">
      <span>Precios${masAntiguo ? ` de ${timeAgo(masAntiguo)}` : " sin fecha"}${fxNote(value) ? " · " + esc(fxNote(value)) : ""}</span>
      ${editable && collection.length ? `<button class="link-btn" id="btn-refresh-collection" onclick="refreshCollectionPrices()">${HEROICONS.arrowPath} Actualizar precios</button>` : ""}
    </div>


    <div class="col-find">
    <div class="search-bar" >
      <input type="search" class="search-input" id="collection-search" placeholder="Filtrar colección por nombre..." value="${esc(collectionFilter.text)}"
        oninput="collectionFilter.text=this.value; renderCollection(); const i=document.getElementById('collection-search'); i.focus(); i.setSelectionRange(i.value.length,i.value.length);">
    </div>

      <details class="col-filters" ${filtrosActivos ? "open" : ""}>
        <summary>Filtros y orden${filtrosActivos ? ` (${filtrosActivos})` : ""}</summary>
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

      </details>
    </div>
`;

  const analisisHtml = `
    <div class="portfolio-hero-card phc-compact">
      <div class="phc-stats-grid">
        <div class="phc-stat"><span class="phc-num">${total}</span><span class="phc-lbl">Cartas</span></div>
        <div class="phc-stat"><span class="phc-num">${collection.length}</span><span class="phc-lbl">Únicas</span></div>
        <div class="phc-stat"><span class="phc-num">${holosCount}</span><span class="phc-lbl">Holos / Foils</span></div>
        <div class="phc-stat"><span class="phc-num">${langsCount}</span><span class="phc-lbl">Idiomas</span></div>
      </div>
    </div>
    <div class="an-card"><h3>Dónde está tu valor</h3>${analysisHtml()}</div>

    <div class="an-card"><h3>Evolución del Portfolio</h3><div id="value-chart" class="value-chart"><div class="an-muted">Cargando histórico…</div></div></div>

`;

  const cuentaHtml = `
    ${auth}
    <div class="col-tools">
      ${useCloud() && profile.public_collection ? `<button class="dab-btn" onclick="copyCollectionLink()">${HEROICONS.link} Compartir enlace público</button>` : ""}
      <button class="dab-btn" onclick="exportCollectionCsv()">Exportar CSV</button>
      ${editable ? `<button class="dab-btn" id="btn-import-csv" onclick="document.getElementById('csv-file').click()">Importar CSV</button>
      <input type="file" id="csv-file" accept=".csv,text/csv" style="display:none" onchange="importCollectionCsv(this.files[0]); this.value=''">` : ""}
    </div>
`;

  root.innerHTML = `
    <div class="col-tabs" role="tablist" aria-label="Secciones de la colección">${tabs}</div>
    ${colTab === "analisis" ? analisisHtml : colTab === "cuenta" ? cuentaHtml : colTab === "sets" ? (typeof setsHtml === "function" ? setsHtml() : "") : cartasHtml + `
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
          finishBadge = `<span class="badge-finish holo">Holo</span>`;
        } else if (isReverse) {
          finishBadge = `<span class="badge-finish reverse">Rev Holo</span>`;
        } else if (variant === "firstEdition") {
          finishBadge = `<span class="badge-finish first-ed">1st Ed</span>`;
        }

        return `<article class="card-item ${isHolo ? 'is-holo-card' : ''}" tabindex="0" role="button" aria-label="Ver ${esc(c.nombre)}"
          onclick="abrirCartaGuardada('${encKey(e.key)}')" onkeydown="if(event.key==='Enter') abrirCartaGuardada('${encKey(e.key)}')">
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
            ${(() => { const pl = pnlOf(c, e.qty); return pl ? `<p class="card-pl ${pl.ganancia >= 0 ? "pl-up" : "pl-down"}">${esc(formatPnL(pl.ganancia, pl.pct))}</p>` : ""; })()}
            ${editable ? `<div class="dcr-controls" style="margin-top:4px;">
              <button class="dcr-btn remove" aria-label="Quitar una copia" onclick="event.stopPropagation(); collectionRemove('${encKey(e.key)}')">${HEROICONS.minus}</button>
              <button class="dcr-btn" aria-label="Añadir una copia" onclick="event.stopPropagation(); collectionAdd(collection.find(x=>x.key===decodeURIComponent('${encKey(e.key)}')).card)">${HEROICONS.plus}</button>
            </div>` : ""}
          </div>
        </article>`;
      }).join("")}
    </div>`}`;
  renderValueChart();
}
