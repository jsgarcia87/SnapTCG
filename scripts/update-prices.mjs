/**
 * update-prices.mjs — Trabajo diario: guarda el histórico de precios en Supabase.
 *
 * Lee las cartas de las tablas `collection` y `decks`, consulta sus precios (TCGdex / Scryfall),
 * guarda la foto de hoy en `price_history`, recalcula la tendencia de Magic, refresca los precios
 * de la colección y guarda el valor total en `collection_value_history`.
 *
 * Requiere Node 20+ y las variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (¡solo en secretos de CI!).
 * Reutiliza js/prices.js (misma lógica que la app) cargándolo como script global.
 */
import fs from "node:fs";
import vm from "node:vm";

const SUPABASE_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !KEY) { console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

// ───── Reutiliza prices.js (script clásico del navegador) ─────
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
vm.runInThisContext(fs.readFileSync(new URL("../js/prices.js", import.meta.url), "utf8"), { filename: "js/prices.js" });
const { fetchJSON, applyPokemonPricing, applyScryfallPricing, scryfallPricesDate, runPool, trendFromHistory } = globalThis;

// ───── Cliente REST de Supabase ─────
const REST = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1";
// Las claves nuevas (sb_secret_...) no son JWT: solo van en `apikey`.
const AUTH = KEY.startsWith("sb_") ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function sb(path, { method = "GET", body, prefer, headers = {} } = {}) {
  const res = await fetch(REST + path, {
    method,
    headers: { ...AUTH, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path.split("?")[0]} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function sbAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await sb(path, { headers: { Range: `${from}-${from + 999}`, "Range-Unit": "items" } });
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
const today = new Date().toISOString().slice(0, 10);

async function main() {
  // 1. Cartas a seguir: colección (con cantidad y dueño) + cartas de los mazos
  const rows = await sbAll("/collection?select=owner,card_id,game,qty,card");
  const decks = await sbAll("/decks?select=cards");
  const tracked = new Map();
  rows.forEach(r => tracked.set(r.card_id, { id: r.card_id, tipo: r.game }));
  decks.forEach(d => (d.cards || []).forEach(e => { if (e.card?.id && !tracked.has(e.card.id)) tracked.set(e.card.id, { id: e.card.id, tipo: e.card.tipo }); }));
  console.log(`Cartas a seguir: ${tracked.size} (colección: ${rows.length} filas, mazos: ${decks.length})`);
  if (tracked.size === 0) { console.log("Nada que hacer."); return; }

  // 2. Precios de hoy
  const priced = new Map();           // id → carta con precio aplicado
  let failed = 0;
  const magic = [...tracked.values()].filter(c => c.tipo === "magic");
  const pokemon = [...tracked.values()].filter(c => c.tipo === "pokemon");

  if (magic.length) {
    const bulk = await scryfallPricesDate();
    for (const group of chunk(magic, 75)) {
      try {
        const data = await fetchJSON("https://api.scryfall.com/cards/collection", {
          method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "SnapTCG-price-job/1.0" },
          body: JSON.stringify({ identifiers: group.map(c => ({ id: c.id })) })
        });
        const byId = new Map((data.data || []).map(c => [c.id, c]));
        group.forEach(card => {
          const fresh = byId.get(card.id);
          if (fresh) priced.set(card.id, applyScryfallPricing({ ...card }, fresh, bulk)); else failed++;
        });
      } catch (e) { console.warn("Scryfall:", e.message); failed += group.length; }
      await new Promise(r => setTimeout(r, 120));   // cortesía con la API
    }
  }
  await runPool(pokemon, 5, async (card) => {
    try { priced.set(card.id, await hidratarPrecioPokemon({ ...card, preciosCargados: false }, true)); }
    catch (e) { failed++; console.warn(`TCGdex ${card.id}: ${e.message}`); }
  });
  console.log(`Precios obtenidos: ${priced.size}; fallidos: ${failed}`);
  if (priced.size === 0) throw new Error("No se obtuvo ningún precio; no se escribe nada.");

  // 3. Foto de hoy en price_history
  const history = [...priced.values()].filter(c => c.precio != null).map(c => ({
    card_id: c.id, game: c.tipo, day: today,
    eur: c.moneda === "eur" ? c.precio : null, usd: c.moneda === "usd" ? c.precio : null,
    eur_foil: c.moneda === "eur" ? c.precioFoil : null, usd_foil: c.moneda === "usd" ? c.precioFoil : null,
    source: c.fuente
  }));
  for (const group of chunk(history, 500)) {
    await sb("/price_history?on_conflict=card_id,day", { method: "POST", body: group, prefer: "resolution=merge-duplicates,return=minimal" });
  }
  console.log(`price_history: ${history.length} filas para ${today}`);

  // 4. Tendencia de Magic a partir del histórico propio (últimos 40 días)
  const since = new Date(Date.now() - 40 * 86400e3).toISOString().slice(0, 10);
  const magicTrend = new Map();
  for (const group of chunk(magic.filter(c => priced.has(c.id)), 40)) {
    const ids = group.map(c => c.id).join(",");
    const hist = await sbAll(`/price_history?select=card_id,day,eur,usd&card_id=in.(${ids})&day=gte.${since}&order=day`);
    const byCard = new Map();
    hist.forEach(h => { (byCard.get(h.card_id) || byCard.set(h.card_id, []).get(h.card_id)).push(h); });
    group.forEach(c => {
      const key = priced.get(c.id).moneda === "usd" ? "usd" : "eur";
      const pts = (byCard.get(c.id) || []).filter(h => h[key] != null).map(h => ({ day: h.day, v: Number(h[key]) }));
      const t = trendFromHistory(pts);
      if (t && (t.d7 != null || t.d30 != null)) magicTrend.set(c.id, t);
    });
  }

  // 5. Refresca los precios guardados en la colección y calcula el valor por dueño
  const totals = new Map();
  let patched = 0;
  await runPool(rows, 5, async (r) => {
    const p = priced.get(r.card_id);
    if (!p) return;
    const card = {
      ...r.card, precio: p.precio, precioFoil: p.precioFoil, moneda: p.moneda, fuente: p.fuente,
      actualizado: p.actualizado, consultado: p.consultado, preciosCargados: true,
      tendencia: r.card.tipo === "magic" ? (magicTrend.get(r.card_id) ?? null) : p.tendencia
    };
    await sb(`/collection?owner=eq.${r.owner}&card_id=eq.${encodeURIComponent(r.card_id)}`,
      { method: "PATCH", body: { card, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
    patched++;
  });
  rows.forEach(r => {
    const p = priced.get(r.card_id);
    const t = totals.get(r.owner) || totals.set(r.owner, { eur: 0, usd: 0, cards: 0 }).get(r.owner);
    t.cards += r.qty;
    if (p?.precio > 0) t[p.moneda === "usd" ? "usd" : "eur"] += p.precio * r.qty;
  });
  const values = [...totals].map(([owner, t]) => ({ owner, day: today, eur: +t.eur.toFixed(2), usd: +t.usd.toFixed(2), cards: t.cards }));
  if (values.length) await sb("/collection_value_history?on_conflict=owner,day", { method: "POST", body: values, prefer: "resolution=merge-duplicates,return=minimal" });
  console.log(`Colección: ${patched} filas actualizadas; valor guardado para ${values.length} dueño(s).`);
}

main().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
