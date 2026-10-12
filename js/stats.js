/**
 * stats.js — Estadísticas y probabilidades del mazo
 * Author: Sangar Studio
 * Version: 2.1.0
 * Depende (en tiempo de ejecución) de: currentDeck, juegoActual, totalCards (deckbuilder.js / app.js)
 */

/* ───────────── Matemática: distribución hipergeométrica ───────────── */

const LOG_FACT = [0];
for (let i = 1; i <= 600; i++) LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);

function lnComb(n, k) {
  if (k < 0 || k > n || n < 0) return -Infinity;
  return LOG_FACT[n] - LOG_FACT[k] - LOG_FACT[n - k];
}

/** P(X = k): k éxitos al robar n cartas de un mazo de N con K éxitos. */
function hyperPMF(N, K, n, k) {
  const l = lnComb(K, k) + lnComb(N - K, n - k) - lnComb(N, n);
  return isFinite(l) ? Math.exp(l) : 0;
}

/** P(X >= k) */
function hyperAtLeast(N, K, n, k) {
  let p = 0;
  for (let i = Math.max(0, k); i <= Math.min(K, n); i++) p += hyperPMF(N, K, n, i);
  return Math.min(1, p);
}

/** P(a <= X <= b) */
function hyperBetween(N, K, n, a, b) {
  let p = 0;
  for (let i = Math.max(0, a); i <= Math.min(K, n, b); i++) p += hyperPMF(N, K, n, i);
  return Math.min(1, p);
}

/** P(al menos 1 de cada uno de dos grupos disjuntos (Ka y Kb)) en n cartas. */
function probBothGroups(N, Ka, Kb, n) {
  const none = (K) => hyperPMF(N, K, n, 0);
  const noneBoth = Math.exp(lnComb(N - Ka - Kb, n) - lnComb(N, n));
  return Math.max(0, 1 - none(Ka) - none(Kb) + (isFinite(noneBoth) ? noneBoth : 0));
}

/* ───────────── Clasificación de cartas ───────────── */

function parseManaCost(cost) {
  const tokens = (cost || "").match(/\{[^}]+\}/g) || [];
  let cmc = 0;
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  tokens.forEach(t => {
    const s = t.slice(1, -1).toUpperCase();
    if (/^\d+$/.test(s)) cmc += parseInt(s, 10);
    else if (s === "X" || s === "Y" || s === "Z") cmc += 0;
    else if (/^\d+\//.test(s)) cmc += parseInt(s, 10);
    else cmc += 1;
    ["W", "U", "B", "R", "G"].forEach(c => { if (s.includes(c)) colors[c]++; });
  });
  return { cmc, colors };
}

function magicCategory(card) {
  const t = (card.typeLine || "").split("—")[0].split("//")[0].toLowerCase();
  if (t.includes("land")) return "Tierras";
  if (t.includes("creature")) return "Criaturas";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("artifact")) return "Artefactos";
  if (t.includes("enchantment")) return "Encantamientos";
  if (t.includes("instant")) return "Instantáneos";
  if (t.includes("sorcery")) return "Conjuros";
  return "Otros";
}

function pokemonCategory(card) {
  const s = (card.supertype || "").toLowerCase();
  if (s.includes("pok")) return "Pokémon";
  if (s.includes("trainer")) return "Entrenadores";
  if (s.includes("energy")) return "Energías";
  return "Otros";
}

function hasCardData(card, juego) {
  return juego === "pokemon" ? !!card.supertype : !!card.typeLine;
}

/* ───────────── Análisis del mazo ───────────── */

function analyzeDeck(deck, juego) {
  const total = deck.reduce((s, e) => s + e.qty, 0);
  const res = {
    total, juego, categories: {}, curve: new Array(8).fill(0), colors: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    avgCmc: 0, nonLand: 0, lands: 0, basics: 0, energies: 0, basicEnergies: 0, subtypes: {},
    missingData: 0, valor: { eur: 0, usd: 0, missing: 0 }, precioMasAntiguo: null, top: []
  };
  let cmcSum = 0;

  deck.forEach(({ card, qty }) => {
    if (!hasCardData(card, juego)) { res.missingData += qty; return; }

    if (juego === "magic") {
      const cat = magicCategory(card);
      res.categories[cat] = (res.categories[cat] || 0) + qty;
      if (cat === "Tierras") { res.lands += qty; return; }
      const mc = parseManaCost(card.manaCost);
      const cmc = card.cmc != null ? Math.round(card.cmc) : mc.cmc;
      res.nonLand += qty;
      cmcSum += cmc * qty;
      res.curve[Math.min(7, cmc)] += qty;
      Object.keys(res.colors).forEach(c => { res.colors[c] += mc.colors[c] * qty; });
    } else {
      const cat = pokemonCategory(card);
      res.categories[cat] = (res.categories[cat] || 0) + qty;
      const subs = card.subtypes || [];
      if (cat === "Pokémon" && subs.includes("Basic")) res.basics += qty;
      if (cat === "Energías") {
        res.energies += qty;
        if (subs.includes("Basic")) res.basicEnergies += qty;
      }
      ["Basic", "Stage 1", "Stage 2", "Supporter", "Item", "Stadium", "Pokémon Tool"].forEach(st => {
        if (subs.includes(st) && !(cat === "Energías")) res.subtypes[st] = (res.subtypes[st] || 0) + qty;
      });
    }
  });

  res.avgCmc = res.nonLand ? cmcSum / res.nonLand : 0;
  res.valor = sumValue(deck);
  res.top = deck
    .map(e => ({ nombre: e.card.nombre, precio: parseFloat(e.card.precio) || 0, moneda: e.card.moneda, qty: e.qty }))
    .filter(e => e.precio > 0)
    .sort((a, b) => b.precio - a.precio)
    .slice(0, 3);
  const fechas = deck.map(e => priceDate(e.card)).filter(Boolean).map(f => new Date(f).getTime()).filter(t => !isNaN(t));
  res.precioMasAntiguo = fechas.length ? new Date(Math.min(...fechas)).toISOString() : null;
  return res;
}

/* ───────────── Simulación Monte Carlo (Magic) ───────────── */

/**
 * Simula `runs` partidas y devuelve la probabilidad de tener al menos t tierras
 * en cada turno t = 1..turns (fallar un turno = fallar la "curva de tierras").
 */
function simulateLandDrops(N, lands, runs, turns, onDraw) {
  const deck = new Array(N).fill(false);
  for (let i = 0; i < lands; i++) deck[i] = true;
  const seen = 7 + turns - (onDraw ? 0 : 1);
  let ok = 0;
  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < seen && i < N; i++) {   // barajado parcial (Fisher-Yates)
      const j = i + Math.floor(Math.random() * (N - i));
      const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    let count = 0, drawn = 0, good = true;
    const initial = Math.min(7, N);
    for (; drawn < initial; drawn++) if (deck[drawn]) count++;
    for (let t = 1; t <= turns; t++) {
      if (t > 1 || onDraw) { if (drawn < N && deck[drawn]) count++; drawn++; }
      if (count < t) { good = false; break; }
    }
    if (good) ok++;
  }
  return ok / runs;
}

/* ───────────── Renderizado ───────────── */

let analysisCardId = null;
let analysisSim = null;

const MANA_COLORS = { W: "#f3efc9", U: "#5ea8e0", B: "#7a6a80", R: "#e8573e", G: "#4caf6a" };
const MANA_NAMES  = { W: "Blanco", U: "Azul", B: "Negro", R: "Rojo", G: "Verde" };

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function pct(p) { return (p * 100).toFixed(p >= 0.995 || p === 0 ? 0 : 1) + "%"; }

function barRow(label, value, max, text, color) {
  const w = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  return `<div class="bar-row">
    <span class="bar-label">${esc(label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${w}%;${color ? `background:${color};` : ""}"></div></div>
    <span class="bar-val">${esc(text ?? value)}</span>
  </div>`;
}

function probCell(p, good = true) {
  const cls = good ? (p >= 0.9 ? "p-high" : p >= 0.6 ? "p-mid" : "p-low") : "";
  return `<span class="${cls}">${pct(p)}</span>`;
}

function renderDeckAnalysis() {
  const section = document.getElementById("deck-analysis-section");
  const body = document.getElementById("deck-analysis-body");
  if (!section || !body || section.style.display === "none") return;

  const N = totalCards();
  if (N === 0) {
    body.innerHTML = `<div class="an-empty">Añade cartas al mazo para ver estadísticas y probabilidades.</div>`;
    return;
  }

  const a = analyzeDeck(currentDeck, juegoActual);
  let html = "";

  if (a.missingData > 0) {
    html += `<div class="an-warn">${a.missingData} carta(s) guardadas sin datos de tipo. Vuelve a añadirlas desde el buscador para incluirlas en el análisis.</div>`;
  }

  /* — Composición — */
  const catEntries = Object.entries(a.categories).sort((x, y) => y[1] - x[1]);
  const catMax = Math.max(1, ...catEntries.map(e => e[1]));
  html += `<div class="an-card"><h3>Composición</h3>${catEntries.map(([k, v]) => barRow(k, v, catMax, `${v} · ${pct(v / N)}`)).join("") || '<div class="an-muted">Sin datos</div>'}`;
  if (juegoActual === "pokemon" && Object.keys(a.subtypes).length) {
    html += `<div class="an-sub">Subtipos</div>` + Object.entries(a.subtypes).sort((x, y) => y[1] - x[1]).map(([k, v]) => barRow(k, v, catMax, v)).join("");
  }
  html += `</div>`;

  /* — Curva de maná y colores (Magic) — */
  if (juegoActual === "magic") {
    const cMax = Math.max(1, ...a.curve);
    html += `<div class="an-card"><h3>Curva de maná</h3>
      <div class="curve">${a.curve.map((v, i) => `
        <div class="curve-col"><span class="curve-n">${v || ""}</span>
          <div class="curve-bar" style="height:${(v / cMax) * 100}%"></div>
          <span class="curve-x">${i === 7 ? "7+" : i}</span></div>`).join("")}</div>
      <div class="an-muted">Coste medio (sin tierras): <strong>${a.avgCmc.toFixed(2)}</strong> · Hechizos: ${a.nonLand} · Tierras: ${a.lands}</div></div>`;

    const colorTotal = Object.values(a.colors).reduce((s, v) => s + v, 0);
    if (colorTotal > 0) {
      html += `<div class="an-card"><h3>Símbolos de color</h3>` +
        Object.keys(a.colors).filter(c => a.colors[c] > 0)
          .map(c => barRow(MANA_NAMES[c], a.colors[c], colorTotal, `${a.colors[c]} · ${pct(a.colors[c] / colorTotal)}`, MANA_COLORS[c])).join("") +
        `</div>`;
    }
  }

  /* — Probabilidades clave — */
  html += `<div class="an-card"><h3>Probabilidades clave</h3>`;
  if (N < 8) {
    html += `<div class="an-muted">Añade al menos 8 cartas para calcular probabilidades.</div>`;
  } else if (juegoActual === "magic") {
    const K = a.lands;
    html += `<div class="an-muted">${K} tierras en ${N} cartas (${pct(K / N)})</div><table class="an-table">
      <tr><td>Mano inicial con 2–4 tierras</td><td>${probCell(hyperBetween(N, K, 7, 2, 4))}</td></tr>
      <tr><td>Mano inicial con 0–1 o 6–7 tierras</td><td>${probCell(1 - hyperBetween(N, K, 7, 2, 5), false)}</td></tr>`;
    for (let t = 2; t <= 5; t++) {
      html += `<tr><td>≥ ${t} tierras en el turno ${t} <small>(jugando primero)</small></td><td>${probCell(hyperAtLeast(N, K, 7 + t - 1, t))}</td></tr>`;
    }
    html += `</table>
      <button class="dab-btn" id="btn-simulate" onclick="runDeckSimulation()">${HEROICONS.play} Simular 10.000 partidas</button>
      <div id="sim-result">${analysisSim && analysisSim.key === `${N}-${K}` ? simResultHtml(analysisSim) : ""}</div>`;
  } else {
    const Kb = a.basics, Ke = a.energies;
    html += `<div class="an-muted">${Kb} Pokémon Básicos · ${Ke} energías en ${N} cartas</div><table class="an-table">
      <tr><td>Mano inicial con ≥ 1 Básico</td><td>${probCell(hyperAtLeast(N, Kb, 7, 1))}</td></tr>
      <tr><td>Probabilidad de mulligan (sin Básico)</td><td>${probCell(hyperPMF(N, Kb, 7, 0), false)}</td></tr>
      <tr><td>Mano inicial con ≥ 2 Básicos</td><td>${probCell(hyperAtLeast(N, Kb, 7, 2))}</td></tr>
      <tr><td>Básico y energía en la mano inicial</td><td>${probCell(probBothGroups(N, Kb, Ke, 7))}</td></tr>
      <tr><td>≥ 1 energía en 7 cartas</td><td>${probCell(hyperAtLeast(N, Ke, 7, 1))}</td></tr>
      <tr><td>≥ 2 energías al llegar al turno 3 <small>(9 cartas)</small></td><td>${probCell(hyperAtLeast(N, Ke, 9, 2))}</td></tr>
    </table>`;
    if (Kb === 0) html += `<div class="an-warn">El mazo no tiene Pokémon Básicos: no se puede jugar.</div>`;
  }
  html += `</div>`;

  /* — Calculadora por carta — */
  if (!currentDeck.some(e => e.card.id === analysisCardId)) analysisCardId = currentDeck[0].card.id;
  const sel = currentDeck.find(e => e.card.id === analysisCardId);
  const Kc = sel.qty;
  html += `<div class="an-card"><h3>Probabilidad de robar una carta</h3>
    <select class="gt-btn an-select" onchange="analysisCardId=this.value; renderDeckAnalysis()">
      ${currentDeck.map(e => `<option value="${esc(e.card.id)}" ${e.card.id === analysisCardId ? "selected" : ""}>${esc(e.card.nombre)} (x${e.qty})</option>`).join("")}
    </select>`;
  if (N >= 8) {
    html += `<table class="an-table an-table-3"><tr><th></th><th>≥ 1 copia</th><th>≥ 2 copias</th></tr>
      <tr><td>Mano inicial (7)</td><td>${probCell(hyperAtLeast(N, Kc, 7, 1))}</td><td>${probCell(hyperAtLeast(N, Kc, 7, 2), false)}</td></tr>`;
    [2, 3, 5, 8].forEach(t => {
      const seen = Math.min(N, 7 + t - 1);
      html += `<tr><td>Turno ${t} <small>(${seen} cartas)</small></td><td>${probCell(hyperAtLeast(N, Kc, seen, 1))}</td><td>${probCell(hyperAtLeast(N, Kc, seen, 2), false)}</td></tr>`;
    });
    html += `</table>`;
    if (juegoActual === "pokemon") {
      html += `<div class="an-muted">Riesgo de que las ${Kc} copia(s) estén todas en los 6 premios: <strong>${pct(hyperPMF(N, Kc, 6, Kc))}</strong></div>`;
    }
  }
  html += `</div>`;

  /* — Valor — */
  const antiguo = timeAgo(a.precioMasAntiguo);
  html += `<div class="an-card"><h3>Valor del mazo</h3>
    <div class="an-muted">Total: <strong>${formatValue(a.valor)}</strong>${a.valor.missing ? ` · ${a.valor.missing} carta(s) sin precio` : ""}</div>
    ${a.valor.usd > 0 ? `<div class="an-muted">Hay cartas en dólares (TCGplayer): no se convierten a euros.</div>` : ""}
    ${a.top.map(t => barRow(t.nombre + (t.qty > 1 ? ` x${t.qty}` : ""), t.precio, a.top[0].precio, formatMoney(t.precio, t.moneda))).join("")}
    <div class="an-muted">Precios${antiguo ? ` de ${antiguo}` : " sin fecha"}</div>
    <button class="dab-btn" id="btn-refresh-deck" onclick="refreshDeckPrices()">${typeof HEROICONS !== "undefined" ? HEROICONS.arrowPath : ""} Actualizar precios</button>
  </div>`;

  body.innerHTML = html;
}

function simResultHtml(s) {
  return `<table class="an-table">
    <tr><td>Cumplir la tierra de cada turno hasta T5 <small>(jugando primero)</small></td><td>${probCell(s.play)}</td></tr>
    <tr><td>Cumplir la tierra de cada turno hasta T5 <small>(robando primero)</small></td><td>${probCell(s.draw)}</td></tr>
  </table><div class="an-muted">Simulación de 10.000 partidas con barajado aleatorio.</div>`;
}

function runDeckSimulation() {
  const N = totalCards();
  const a = analyzeDeck(currentDeck, juegoActual);
  analysisSim = {
    key: `${N}-${a.lands}`,
    play: simulateLandDrops(N, a.lands, 10000, 5, false),
    draw: simulateLandDrops(N, a.lands, 10000, 5, true)
  };
  document.getElementById("sim-result").innerHTML = simResultHtml(analysisSim);
}

async function refreshDeckPrices() {
  const btn = document.getElementById("btn-refresh-deck");
  if (btn) { btn.disabled = true; btn.textContent = "Actualizando…"; }
  try {
    const r = await refreshCardPrices(currentDeck.map(e => e.card));
    showDeckToast(r.failed ? `Precios actualizados (${r.failed} sin respuesta)` : "Precios actualizados", r.failed ? "warn" : "success");
  } catch { showDeckToast("No se pudieron actualizar los precios", "warn"); }
  renderDeckStats();
}
