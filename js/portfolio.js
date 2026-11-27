/**
 * portfolio.js — Análisis del valor, exportar e importar la colección (CSV)
 * Author: Sangar Studio
 * Version: 1.0.0
 * Depende de: cloud.js (collection, entryKey, persistCost, persistAllCollection, canEditCollection),
 *             prices.js (toEur, getCardActivePrice, formatMoney), stats.js (esc, barRow), api.js (obtenerCartaPorId)
 */

/* ───────────── Análisis: dónde está el valor ───────────── */

/** Valor en € de una fila (null si es dólar sin tipo de cambio o no hay precio). */
function entryValueEur(e) {
  const p = toEur(parseFloat(getCardActivePrice(e.card)), e.card.moneda);
  return p > 0 ? p * e.qty : null;
}

function groupValue(rows, keyFn) {
  const m = new Map();
  rows.forEach(r => { const k = keyFn(r.e) || "—"; m.set(k, (m.get(k) || 0) + r.v); });
  return [...m].sort((a, b) => b[1] - a[1]);
}

function analysisHtml() {
  const rows = collection.map(e => ({ e, v: entryValueEur(e) })).filter(r => r.v != null);
  const total = rows.reduce((s, r) => s + r.v, 0);
  if (rows.length < 2 || !(total > 0)) return `<div class="an-muted">Con más cartas con precio verás aquí cómo se reparte tu valor.</div>`;

  const money = v => formatMoney(v, "eur");
  const share = v => `${money(v)} · ${(v / total * 100).toFixed(0)} %`;
  const bars = (list, max) => list.map(([k, v]) => barRow(k, v, max, share(v))).join("");
  const top = (list, n) => {
    const head = list.slice(0, n), rest = list.slice(n).reduce((s, [, v]) => s + v, 0);
    return rest > 0 ? [...head, ["Resto", rest]] : head;
  };

  // Concentración: qué parte del valor está en las 5 cartas más valiosas
  const byCard = [...rows].sort((a, b) => b.v - a.v);
  const top5 = byCard.slice(0, 5).reduce((s, r) => s + r.v, 0);
  const concentracion = `<div class="an-muted">Tus 5 cartas más valiosas suman <strong>${(top5 / total * 100).toFixed(0)} %</strong> del valor.</div>` +
    byCard.slice(0, 5).map(r => barRow(r.e.card.nombre, r.v, byCard[0].v, share(r.v))).join("");

  const porJuego = groupValue(rows, e => (e.card.tipo === "magic" ? "Magic" : "Pokémon"));
  const porEdicion = top(groupValue(rows, e => e.card.set), 6);
  const porIdioma = groupValue(rows, e => formatLanguageName(e.card.lang));
  const porRareza = top(groupValue(rows, e => e.card.rarity || "Sin rareza"), 5);

  // Qué explica el movimiento de 7 días: variación en € de cada fila a partir de su tendencia
  const mov = rows.map(r => {
    const t = getCardActiveTrend(r.e.card), d7 = t && t.d7;
    return d7 == null ? null : { nombre: r.e.card.nombre, delta: r.v - r.v / (1 + d7 / 100) };
  }).filter(Boolean).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 4);
  const movimiento = mov.length
    ? `<div class="an-muted">Lo que más ha movido tu valor en 7 días:</div>` + mov.map(m =>
        barRow(m.nombre, Math.abs(m.delta), Math.abs(mov[0].delta), `${m.delta >= 0 ? "+" : "−"}${money(Math.abs(m.delta))}`, m.delta >= 0 ? "#16a34a" : "#dc2626")).join("")
    : "";

  return `<h4 class="an-sub">Concentración</h4>${concentracion}
    <h4 class="an-sub">Por juego</h4>${bars(porJuego, porJuego[0][1])}
    <h4 class="an-sub">Por edición</h4>${bars(porEdicion, porEdicion[0][1])}
    <h4 class="an-sub">Por rareza</h4>${bars(porRareza, porRareza[0][1])}
    ${porIdioma.length > 1 ? `<h4 class="an-sub">Por idioma</h4>${bars(porIdioma, porIdioma[0][1])}` : ""}
    ${movimiento ? `<h4 class="an-sub">Movimiento</h4>${movimiento}` : ""}`;
}

/* ───────────── CSV ───────────── */

const CSV_COLS = ["juego", "id", "nombre", "edicion", "numero", "idioma", "variante", "estado", "cantidad", "coste_eur", "precio", "moneda", "valor_total", "fecha_precio"];

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csvNum = (n) => n == null || isNaN(n) ? "" : String(Math.round(n * 100) / 100).replace(".", ",");   // coma decimal: abre bien en Excel en español

function collectionToCsv() {
  const lines = [CSV_COLS.join(";")];
  collection.forEach(e => {
    const c = e.card, p = parseFloat(getCardActivePrice(c));
    lines.push([c.tipo, c.id, c.nombre, c.set, c.localId, c.lang || "en", c.selectedVariant || "normal", c.condition || "NM", e.qty,
      csvNum(c.coste), csvNum(p), c.moneda || "eur", csvNum(p > 0 ? p * e.qty : null), priceDate(c) ? String(priceDate(c)).slice(0, 10) : ""]
      .map(csvCell).join(";"));
  });
  return "﻿" + lines.join("\r\n");
}

function exportCollectionCsv() {
  if (!collection.length) { showDeckToast("No hay cartas que exportar", "warn"); return; }
  const url = URL.createObjectURL(new Blob([collectionToCsv()], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `kardlume-coleccion-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showDeckToast(`${collection.length} filas exportadas`, "success");
}

/** Parser CSV con comillas; detecta ; o , por la primera línea. */
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] || "";
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some(c => c !== "")) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c !== "")) rows.push(row);
  return rows;
}

const parseDec = (v) => { const n = parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", ".")); return isNaN(n) ? null : n; };

let importingCsv = false;

/** Importa un CSV exportado por Kard Lume (necesita juego e id de cada fila). */
async function importCollectionCsv(file) {
  if (!file || importingCsv) return;
  if (!canEditCollection()) { showDeckToast("Inicia sesión para importar", "warn"); return; }
  const rows = parseCsv(await file.text());
  const head = (rows.shift() || []).map(h => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  if (col("juego") < 0 || col("id") < 0) { showDeckToast("CSV no válido: faltan las columnas «juego» e «id»", "warn"); return; }
  if (rows.length > 500) { showDeckToast("Máximo 500 filas por importación", "warn"); return; }

  if (!confirm(`Se SUMARÁN ${rows.length} filas a tu colección actual (no reemplazan nada). Si importas un CSV exportado de esta misma colección, las cantidades se duplicarán. ¿Continuar?`)) return;

  importingCsv = true;
  const btn = document.getElementById("btn-import-csv");
  let ok = 0, fail = 0, done = 0;
  const get = (r, n) => (col(n) >= 0 ? (r[col(n)] || "").trim() : "");
  const cache = new Map();
  try {
    await runPool(rows, 4, async (r) => {
      const juego = get(r, "juego") === "magic" ? "magic" : "pokemon", id = get(r, "id"), lang = get(r, "idioma") || "en";
      try {
        const qty = Math.max(1, Math.min(9999, parseInt(get(r, "cantidad"), 10) || 1));
        const ck = `${juego}|${id}|${lang}`;
        if (!cache.has(ck)) cache.set(ck, obtenerCartaPorId(juego, id, lang));
        const base = await cache.get(ck);
        if (!base) { fail++; return; }
        const card = { ...base, lang: lang.toLowerCase(), condition: get(r, "estado") || "NM" };
        const v = get(r, "variante"); if (v) card.selectedVariant = v;
        const coste = parseDec(get(r, "coste_eur"));
        if (coste != null && coste >= 0) card.coste = coste;
        const key = entryKey(card);
        const existente = collection.find(e => e.key === key);
        if (existente) {
          if (coste != null && coste >= 0) {
            const prev = parseFloat(existente.card.coste);
            existente.card.coste = prev >= 0 ? (prev * existente.qty + coste * qty) / (existente.qty + qty) : coste;
          }
          existente.qty += qty;
        } else collection.push({ key, card, qty });
        ok++;
      } catch (e) { console.warn("Fila no importada:", id, e); fail++; }
      done++; if (btn) btn.textContent = `Importando… ${done}/${rows.length}`;
    });
    await persistAllCollection();
    for (const e of collection) await persistCost(e, false);
    showDeckToast(fail ? `Importadas ${ok} filas; ${fail} no se pudieron cargar` : `${ok} filas importadas`, fail ? "warn" : "success");
  } catch (e) {
    console.error(e); showDeckToast("No se pudo importar el CSV", "warn");
  } finally {
    importingCsv = false; renderCollection(); if (typeof renderHome === "function") renderHome();
  }
}
