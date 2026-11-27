/**
 * alerts.js — Seguimiento de cartas y alertas de precio
 * Author: Sangar Studio
 * Version: 1.0.0
 * «Seguir» una carta (la tengas o no) y fijar un precio objetivo de bajada o de subida.
 * Las alertas se calculan al abrir la app con los precios guardados: objetivos alcanzados y
 * movimientos de 7 días mayores que el umbral. No envían notificaciones fuera de la app.
 * Depende de: cloud.js (cloudReady, sbClient, sbSession, collection, entryKey), prices.js, stats.js (esc)
 */

const WATCH_KEY = "snaptcg_watchlist";
const ALERT_PCT_KEY = "snaptcg_alert_pct";
let watchlist = [];   // [{ id, card, below, above }]

const alertPct = () => { const v = parseFloat(localStorage.getItem(ALERT_PCT_KEY)); return v > 0 ? v : 10; };
function setAlertPct(v) {
  const n = parseFloat(v);
  try { if (n > 0) localStorage.setItem(ALERT_PCT_KEY, String(n)); } catch { /* opcional */ }
  if (typeof renderHome === "function") renderHome();
}

const watchOf = (card) => card ? watchlist.find(w => w.id === card.id) : null;

/* ───────────── Datos ───────────── */

function loadLocalWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY)) || []; } catch { return []; }
}

async function loadWatchlist() {
  if (!useCloud()) { watchlist = viewingOther() ? [] : loadLocalWatchlist(); if (!viewingOther()) refreshWatchlistIfStale(); return; }
  const { data, error } = await sbClient.from("watchlist").select("card_id,card,below,above").eq("owner", sbSession.user.id);
  if (error) { console.error(error); watchlist = []; return; }
  watchlist = data.map(r => ({ id: r.card_id, card: r.card, below: r.below == null ? null : Number(r.below), above: r.above == null ? null : Number(r.above) }));
}

async function persistWatch(w, removed) {
  if (!useCloud()) { try { localStorage.setItem(WATCH_KEY, JSON.stringify(watchlist)); } catch { /* sin espacio */ } return; }
  const owner = sbSession.user.id;
  const q = removed
    ? sbClient.from("watchlist").delete().eq("owner", owner).eq("card_id", w.id)
    : sbClient.from("watchlist").upsert({ owner, card_id: w.id, game: w.card.tipo, card: w.card, below: w.below, above: w.above,
        updated_at: new Date().toISOString() }, { onConflict: "owner,card_id" });
  const { error } = await q;
  if (error) { console.error(error); showDeckToast("Error al guardar el seguimiento", "warn"); }
}

/** Al iniciar sesión: sube el seguimiento guardado en el dispositivo y lo borra de él. */
async function uploadLocalWatchlist() {
  const local = loadLocalWatchlist();
  if (!local.length) return;
  for (const l of local) {
    if (watchlist.some(w => w.id === l.id)) continue;
    watchlist.push(l);
    await persistWatch(l, false);
  }
  try { localStorage.removeItem(WATCH_KEY); } catch { /* opcional */ }
}

/** Sin sesión: refresca los precios de las cartas seguidas si tienen más de 6 h (en la nube lo hace el job diario). */
async function refreshWatchlistIfStale() {
  const viejas = watchlist.map(w => w.card).filter(c => !c.consultado || Date.now() - new Date(c.consultado).getTime() > 6 * 3600e3);
  if (!viejas.length) return;
  try { await refreshCardPrices(viejas); await persistWatch(null, false); } catch (e) { console.warn(e); }
  if (typeof renderHome === "function") renderHome();
}

/* ───────────── Acciones desde la ficha de carta ───────────── */

function readTarget(id) {
  const el = document.getElementById(id);
  const v = el && el.value !== "" ? parseFloat(el.value) : NaN;
  return v > 0 ? v : null;
}

async function guardarSeguimiento() {
  const card = window._currentCard;
  if (!card) return;
  if (viewingOther()) return;
  const below = readTarget("alert-below"), above = readTarget("alert-above");
  if (below != null && above != null && below >= above) { showDeckToast("El precio de bajada debe ser menor que el de subida", "warn"); return; }
  let w = watchOf(card);
  if (w) { w.card = { ...card }; w.below = below; w.above = above; }
  else { w = { id: card.id, card: { ...card }, below, above }; watchlist.push(w); }
  await persistWatch(w, false);
  pintarSeguimientoModal(card);
  if (typeof renderHome === "function") renderHome();
  showDeckToast(below == null && above == null ? "Carta en seguimiento (sin objetivos)" : "Seguimiento guardado", "success");
}

async function dejarDeSeguir() {
  const card = window._currentCard;
  const w = watchOf(card);
  if (!w) return;
  watchlist = watchlist.filter(x => x !== w);
  await persistWatch(w, true);
  pintarSeguimientoModal(card);
  if (typeof renderHome === "function") renderHome();
  showDeckToast("Carta fuera del seguimiento", "success");
}

function pintarSeguimientoModal(card) {
  const w = watchOf(card);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? "" : v; };
  set("alert-below", w ? w.below : null);
  set("alert-above", w ? w.above : null);
  const un = document.getElementById("btn-unfollow");
  if (un) un.style.display = w ? "" : "none";
  const save = document.getElementById("btn-follow");
  if (save) save.textContent = w ? "Actualizar" : "Seguir";
  const cur = document.getElementById("alert-currency");
  if (cur) cur.textContent = card.moneda === "usd" ? "$" : "€";
}

function abrirSeguida(encodedId) {
  const id = decodeURIComponent(encodedId);
  const w = watchlist.find(x => x.id === id);
  if (w) abrirDetalle(w.card, false);
}

/* ───────────── Evaluación de alertas ───────────── */

/**
 * Alertas activas con los precios guardados. Cada una: { tipo, card, texto, open }.
 * Tipos: "below"/"above" (objetivo alcanzado) y "up"/"down" (movimiento de 7 días ≥ umbral).
 */
function evaluateAlerts() {
  const out = [];
  const umbral = alertPct();
  const vistas = new Set();
  const openFor = (c, key) => key ? `abrirCartaGuardada('${encKey(key)}')` : `abrirSeguida('${encodeURIComponent(c.id).replace(/'/g, "%27")}')`;

  watchlist.forEach(w => {
    const p = getCardActivePrice(w.card);
    if (p == null) return;
    const m = formatMoney(p, w.card.moneda);
    if (w.below != null && p <= w.below) out.push({ tipo: "below", card: w.card, texto: `bajó a ${m} (objetivo ≤ ${formatMoney(w.below, w.card.moneda)})`, open: openFor(w.card) });
    if (w.above != null && p >= w.above) out.push({ tipo: "above", card: w.card, texto: `subió a ${m} (objetivo ≥ ${formatMoney(w.above, w.card.moneda)})`, open: openFor(w.card) });
  });

  const candidatas = [...collection.map(e => ({ card: e.card, key: e.key })), ...watchlist.map(w => ({ card: w.card, key: null }))];
  candidatas.forEach(({ card, key }) => {
    if (vistas.has(card.id)) return;
    vistas.add(card.id);
    const t = getCardActiveTrend(card);
    const d7 = t && t.d7;
    if (d7 == null || Math.abs(d7) < umbral) return;
    out.push({ tipo: d7 > 0 ? "up" : "down", card, texto: `${d7 > 0 ? "sube" : "baja"} un ${Math.abs(d7).toFixed(0)}% en 7 días`, open: openFor(card, key) });
  });
  return out;
}

const ALERT_LABEL = { below: "Objetivo de bajada", above: "Objetivo de subida", up: "Al alza", down: "A la baja" };

function alertsHtml() {
  const list = evaluateAlerts();
  const umbral = alertPct();
  const ctrl = `<label class="alert-threshold">Avisar de movimientos ≥
      <input type="number" min="1" max="100" step="1" value="${umbral}" onchange="setAlertPct(this.value)" aria-label="Umbral de movimiento en porcentaje"> %</label>`;
  if (!list.length) {
    return `${ctrl}<div class="hpc-empty-state"><p class="hpc-empty-title">Sin alertas ahora</p>
      <p class="hpc-empty-desc">${watchlist.length ? `Siguiendo ${watchlist.length} carta(s). ` : ""}Abre una carta y pulsa «Seguir» para fijar un precio objetivo.</p></div>`;
  }
  return ctrl + list.map(a => `
    <div class="alert-row-item alert-${a.tipo}" onclick="${a.open}" onkeydown="if(event.key==='Enter'){${a.open}}" role="button" tabindex="0">
      <img src="${esc(a.card.imagenThumb || "")}" alt="" class="rc-thumb" loading="lazy">
      <div class="rc-info"><span class="rc-name">${esc(a.card.nombre)}</span>
        <span class="rc-set"><strong>${ALERT_LABEL[a.tipo]}:</strong> ${esc(a.texto)}</span></div>
    </div>`).join("");
}
