/**
 * prices.js — Capa de precios: red resiliente, caché, formato y refresco
 * Author: Sangar Studio
 * Version: 2.2.0
 * Se carga ANTES de api.js. Fuentes: TCGdex (Pokémon, Cardmarket/TCGplayer) y Scryfall (Magic).
 */

/* ───────────── Red con timeout y reintentos ───────────── */

const RETRY_STATUS = [429, 500, 502, 503, 504];

/**
 * fetch JSON con timeout y reintentos con backoff.
 * Lanza Error con `code`: "network" (reintentable), "http" o "parse".
 * Opciones extra: okStatuses (códigos != 2xx cuyo cuerpo JSON se devuelve), retries, timeout.
 */
async function fetchJSON(url, opts = {}) {
  const { retries = 2, timeout = 10000, okStatuses = [], ...init } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok || okStatuses.includes(res.status)) {
        try { return await res.json(); }
        catch { const e = new Error("Respuesta no válida del servidor."); e.code = "parse"; throw e; }
      }
      const e = new Error(`El servicio respondió con error ${res.status}.`);
      e.code = RETRY_STATUS.includes(res.status) ? "network" : "http";
      e.status = res.status;
      if (e.code === "http") throw e;
      lastErr = e;
    } catch (err) {
      clearTimeout(timer);
      if (err.code === "http" || err.code === "parse") throw err;
      if (!err.code) { err.code = "network"; err.message = "No se pudo conectar con el servicio de precios."; }
      lastErr = err;
    }
    if (attempt < retries) await new Promise(r => setTimeout(r, 600 * 2 ** attempt));
  }
  throw lastErr;
}

/* ───────────── Caché en localStorage (con caducidad) ───────────── */

const CACHE_KEY = "snaptcg_cache_v1";
const CACHE_MAX = 40;
const TTL_SEARCH = 12 * 3600e3;
const TTL_PRICE = 6 * 3600e3;

function cacheLoad() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { return {}; }
}

/** Devuelve { data, age } o null. Con maxAge, ignora entradas más viejas. */
function cacheGet(key, maxAge = Infinity) {
  const hit = cacheLoad()[key];
  if (!hit) return null;
  const age = Date.now() - hit.t;
  return age <= maxAge ? { data: hit.d, age } : null;
}

function cacheSet(key, data) {
  try {
    const all = cacheLoad();
    all[key] = { t: Date.now(), d: data };
    const keys = Object.keys(all);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - CACHE_MAX).forEach(k => delete all[k]);
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch { /* sin espacio o bloqueado: la caché es opcional */ }
}

/* ───────────── Formato ───────────── */

function formatMoney(value, moneda = "eur") {
  if (value == null || isNaN(value)) return null;
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: moneda === "usd" ? "USD" : "EUR" }).format(value);
}

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (!iso || isNaN(t)) return null;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return "hace un momento";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  const d = Math.round(s / 86400);
  return d === 1 ? "hace 1 día" : `hace ${d} días`;
}

/** Variación porcentual de `now` respecto a `ref` (null si no es calculable). */
function pctChange(now, ref) {
  if (now == null || ref == null || !(ref > 0)) return null;
  return ((now - ref) / ref) * 100;
}

function trendBadge(pct) {
  if (pct == null || Math.abs(pct) < 1) return "";
  const up = pct > 0;
  const icon = typeof HEROICONS !== "undefined"
    ? (up ? HEROICONS.arrowTrendingUp : HEROICONS.arrowTrendingDown)
    : (up ? "▲" : "▼");
  return `<span class="trend ${up ? "trend-up" : "trend-down"}">${icon} ${Math.abs(pct).toFixed(0)}%</span>`;
}

/** Fecha de referencia del precio de una carta: la de la fuente o, si no hay, cuándo la consultamos. */
function priceDate(card) { return card.actualizado || card.consultado || null; }

/** Suma el valor de [{card, qty}] separando monedas (no se convierten). */
function sumValue(entries) {
  const out = { eur: 0, usd: 0, missing: 0 };
  entries.forEach(({ card, qty }) => {
    const p = parseFloat(card.precio);
    if (!(p > 0)) { out.missing += qty; return; }
    out[card.moneda === "usd" ? "usd" : "eur"] += p * qty;
  });
  return out;
}

function formatValue(v) {
  const parts = [];
  if (v.eur > 0 || v.usd === 0) parts.push(formatMoney(v.eur, "eur"));
  if (v.usd > 0) parts.push(formatMoney(v.usd, "usd"));
  return parts.join(" + ");
}

/* ───────────── Extracción de precios por fuente ───────────── */

/** `pricing` de TCGdex (o equivalente normalizado) → campos de CardResult. */
function applyPokemonPricing(card, pricing) {
  const cm = pricing?.cardmarket;
  const tp = pricing?.tcgplayer;
  card.consultado = new Date().toISOString();
  card.precio = null; card.precioFoil = null; card.tendencia = null; card.fuente = null; card.actualizado = null;

  if (cm && (cm.avg > 0 || cm.trend > 0)) {
    // Precio = media de ventas (avg); la tendencia compara la media de hoy (avg1) con las de 7 y 30 días,
    // siempre la misma métrica. "trend" de Cardmarket es otra métrica y no se mezcla.
    card.precio = cm.avg > 0 ? cm.avg : cm.trend;
    card.precioFoil = cm["avg-holo"] > 0 ? cm["avg-holo"] : (cm["trend-holo"] > 0 ? cm["trend-holo"] : null);
    card.moneda = "eur";
    card.fuente = "Cardmarket";
    card.actualizado = cm.updated || null;
    const hoy = cm.avg1 > 0 ? cm.avg1 : cm.avg;
    card.tendencia = { d7: pctChange(hoy, cm.avg7), d30: pctChange(hoy, cm.avg30) };
  } else if (tp) {
    const variants = ["normal", "holofoil", "reverse-holofoil", "1st-edition", "1st-edition-holofoil"]
      .map(k => tp[k]).filter(v => v && v.marketPrice > 0);
    if (variants.length) {
      card.precio = variants[0].marketPrice;
      card.precioFoil = tp.holofoil?.marketPrice > 0 ? tp.holofoil.marketPrice : null;
      card.moneda = "usd";
      card.fuente = "TCGplayer";
      card.actualizado = tp.updated || null;
    }
  }
  card.preciosCargados = true;
  return card;
}

/** Objeto `c` de Scryfall → campos de precio de CardResult. */
function applyScryfallPricing(card, c, bulkUpdatedAt) {
  const p = c.prices || {};
  const eur = parseFloat(p.eur), usd = parseFloat(p.usd);
  card.consultado = new Date().toISOString();
  card.actualizado = bulkUpdatedAt || null;
  card.tendencia = null;
  if (eur > 0) {
    card.precio = eur; card.moneda = "eur"; card.fuente = "Cardmarket (vía Scryfall)";
    card.precioFoil = parseFloat(p.eur_foil) > 0 ? parseFloat(p.eur_foil) : null;
  } else if (usd > 0) {
    card.precio = usd; card.moneda = "usd"; card.fuente = "TCGplayer (vía Scryfall)";
    card.precioFoil = parseFloat(p.usd_foil) > 0 ? parseFloat(p.usd_foil) : null;
  } else {
    card.precio = null; card.precioFoil = null; card.moneda = "eur"; card.fuente = null;
  }
  card.preciosCargados = true;
  return card;
}

/** Fecha de la última actualización diaria de precios de Scryfall (caché 6 h). */
async function scryfallPricesDate() {
  const hit = cacheGet("scryfall:bulk", TTL_PRICE);
  if (hit) return hit.data;
  try {
    const d = await fetchJSON("https://api.scryfall.com/bulk-data", { retries: 1, headers: { Accept: "application/json" } });
    const iso = d.data.find(b => b.type === "default_cards")?.updated_at || null;
    if (iso) cacheSet("scryfall:bulk", iso);
    return iso;
  } catch { return null; }
}

/* ───────────── Hidratación de precios (Pokémon / TCGdex) ───────────── */

/** Descarga la ficha de TCGdex y rellena el precio. `force` ignora la caché. */
async function hidratarPrecioPokemon(card, force = false) {
  if (card.preciosCargados && !force) return card;
  const key = `tcgdex:${card.id}`;
  const hit = !force && cacheGet(key, TTL_PRICE);
  let pricing;
  if (hit) pricing = hit.data;
  else {
    const d = await fetchJSON(`https://api.tcgdex.net/v2/en/cards/${encodeURIComponent(card.id)}`, { retries: 1, okStatuses: [404] });
    if (!d.id) { const e = new Error("Carta no encontrada en TCGdex."); e.code = "http"; throw e; }
    pricing = d.pricing || null;
    cacheSet(key, pricing);
  }
  return applyPokemonPricing(card, pricing);
}

/** Ejecuta `worker` sobre `items` con concurrencia limitada. */
async function runPool(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const item = items[i++]; await worker(item); }
  });
  await Promise.all(runners);
}

/** Carga progresivamente los precios de una lista; llama a onUpdate(card) por cada carta. */
async function hidratarPrecios(cards, onUpdate) {
  const pending = cards.filter(c => c.tipo === "pokemon" && c.preciosCargados === false);
  await runPool(pending, 6, async (card) => {
    try { await hidratarPrecioPokemon(card); }
    catch { card.preciosCargados = true; card.errorPrecio = true; }
    if (onUpdate) onUpdate(card);
  });
}

/* ───────────── Refresco de precios de cartas guardadas ───────────── */

/**
 * Vuelve a consultar el precio de cartas ya guardadas (colección o mazo), modificándolas in situ.
 * Devuelve { ok, failed }.
 */
async function refreshCardPrices(cards, onProgress) {
  const result = { ok: 0, failed: 0 };
  const magic = cards.filter(c => c.tipo === "magic");
  const pokemon = cards.filter(c => c.tipo === "pokemon");
  let done = 0;
  const tick = () => { done++; if (onProgress) onProgress(done, magic.length + pokemon.length); };

  if (magic.length) {
    const bulk = await scryfallPricesDate();
    for (let i = 0; i < magic.length; i += 75) {
      const chunk = magic.slice(i, i + 75);
      try {
        const data = await fetchJSON("https://api.scryfall.com/cards/collection", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ identifiers: chunk.map(c => ({ id: c.id })) })
        });
        const byId = new Map((data.data || []).map(c => [c.id, c]));
        chunk.forEach(card => {
          const fresh = byId.get(card.id);
          if (fresh) { applyScryfallPricing(card, fresh, bulk); recordPriceSnapshot(card); result.ok++; } else result.failed++;
          tick();
        });
      } catch { result.failed += chunk.length; chunk.forEach(tick); }
    }
  }

  await runPool(pokemon, 6, async (card) => {
    try { await hidratarPrecioPokemon(card, true); recordPriceSnapshot(card); result.ok++; }
    catch { result.failed++; }
    tick();
  });
  return result;
}

/* ───────────── Histórico: tendencia y snapshots locales (modo demo) ───────────── */

/**
 * Tendencia a partir de una serie diaria [{day:"YYYY-MM-DD", v:number}] ordenada.
 * d7/d30 comparan el último valor con el de hace 7/30 días (o el más próximo anterior); null si no hay tanto histórico.
 */
function trendFromHistory(points) {
  if (!points || points.length < 2) return null;
  const last = points[points.length - 1];
  const lastT = Date.parse(last.day);
  const at = (days) => {
    let best = null;
    for (const p of points) { if (Date.parse(p.day) <= lastT - days * 86400e3) best = p; else break; }
    return best;
  };
  const p7 = at(7), p30 = at(30);
  return { d7: p7 ? pctChange(last.v, p7.v) : null, d30: p30 ? pctChange(last.v, p30.v) : null };
}

const HIST_KEY = "snaptcg_history_v1";
const VALUE_HIST_KEY = "snaptcg_value_history_v1";
const todayUTC = () => new Date().toISOString().slice(0, 10);

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

/** Guarda el precio de hoy de una carta en el navegador (histórico del modo demo). */
function recordPriceSnapshot(card) {
  if (card.precio == null) return;
  try {
    const all = readJSON(HIST_KEY, {});
    const arr = all[card.id] || (all[card.id] = []);
    const last = arr[arr.length - 1];
    if (last && last[0] === todayUTC()) { last[1] = card.precio; last[2] = card.moneda; }
    else arr.push([todayUTC(), card.precio, card.moneda]);
    if (arr.length > 400) arr.splice(0, arr.length - 400);
    localStorage.setItem(HIST_KEY, JSON.stringify(all));
  } catch { /* almacenamiento no disponible */ }
}

function localCardHistory(card, days) {
  const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  return (readJSON(HIST_KEY, {})[card.id] || [])
    .filter(([d, , m]) => d >= since && (m || "eur") === (card.moneda || "eur"))
    .map(([day, v]) => ({ day, v }));
}

/** Guarda el valor total de la colección de hoy (modo demo). */
function recordValueSnapshot(entries) {
  try {
    const v = sumValue(entries);
    const arr = readJSON(VALUE_HIST_KEY, []);
    const n = entries.reduce((s, e) => s + e.qty, 0);
    const row = [todayUTC(), +v.eur.toFixed(2), +v.usd.toFixed(2), n];
    if (arr.length && arr[arr.length - 1][0] === todayUTC()) arr[arr.length - 1] = row; else arr.push(row);
    if (entries.length === 0 && arr.length === 1) return;
    localStorage.setItem(VALUE_HIST_KEY, JSON.stringify(arr.slice(-800)));
  } catch { /* almacenamiento no disponible */ }
}

function localValueHistory(days) {
  const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
  return readJSON(VALUE_HIST_KEY, []).filter(r => r[0] >= since).map(([day, eur, usd, cards]) => ({ day, eur, usd, cards }));
}
