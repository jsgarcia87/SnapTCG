/**
 * charts.js — Gráficas de línea en SVG (sin librerías)
 * Author: Sangar Studio
 * Version: 2.3.0
 * Depende de: prices.js (formatMoney), stats.js (esc)
 */

const CHART_W = 320, CHART_H = 132;
const CHART_PAD = { l: 8, r: 8, t: 14, b: 22 };

function shortDate(day) {
  const d = new Date(day + "T00:00:00Z");
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Gráfica de línea con área, mínimo/máximo y fechas extremas.
 * @param {{day:string, v:number}[]} points ordenados por día (≥ 2)
 * @param {{moneda?:string, label?:string}} opts
 */
function lineChart(points, { moneda = "eur", label = "Evolución" } = {}) {
  const vals = points.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min *= 0.95; max = max * 1.05 || 1; }
  const t0 = Date.parse(points[0].day), t1 = Date.parse(points[points.length - 1].day);
  const iw = CHART_W - CHART_PAD.l - CHART_PAD.r, ih = CHART_H - CHART_PAD.t - CHART_PAD.b;
  const x = p => CHART_PAD.l + (t1 === t0 ? iw : ((Date.parse(p.day) - t0) / (t1 - t0)) * iw);
  const y = v => CHART_PAD.t + ih - ((v - min) / (max - min)) * ih;

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const base = CHART_PAD.t + ih;
  const area = `${line} L${x(points[points.length - 1]).toFixed(1)},${base} L${x(points[0]).toFixed(1)},${base} Z`;
  const last = points[points.length - 1], first = points[0];
  const delta = first.v > 0 ? ((last.v - first.v) / first.v) * 100 : null;
  const aria = `${label}: de ${formatMoney(first.v, moneda)} (${shortDate(first.day)}) a ${formatMoney(last.v, moneda)} (${shortDate(last.day)})` +
    (delta != null ? `, ${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%` : "");

  const dots = points.length <= 120 ? points.map(p =>
    `<circle class="chart-hit" cx="${x(p).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="7"><title>${esc(shortDate(p.day))}: ${esc(formatMoney(p.v, moneda))}</title></circle>`).join("") : "";

  return `<svg class="chart" viewBox="0 0 ${CHART_W} ${CHART_H}" role="img" aria-label="${esc(aria)}">
    <line class="chart-grid" x1="${CHART_PAD.l}" x2="${CHART_W - CHART_PAD.r}" y1="${y(max).toFixed(1)}" y2="${y(max).toFixed(1)}"/>
    <line class="chart-grid" x1="${CHART_PAD.l}" x2="${CHART_W - CHART_PAD.r}" y1="${y(min).toFixed(1)}" y2="${y(min).toFixed(1)}"/>
    <path class="chart-area" d="${area}"/>
    <path class="chart-line" d="${line}"/>
    <circle class="chart-end" cx="${x(last).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3.5"/>
    ${dots}
    <text class="chart-label" x="${CHART_PAD.l}" y="${y(max) - 4}">${esc(formatMoney(max, moneda))}</text>
    <text class="chart-label" x="${CHART_PAD.l}" y="${y(min) - 4}">${esc(formatMoney(min, moneda))}</text>
    <text class="chart-label" x="${CHART_PAD.l}" y="${CHART_H - 6}">${esc(shortDate(first.day))}</text>
    <text class="chart-label" x="${CHART_W - CHART_PAD.r}" y="${CHART_H - 6}" text-anchor="end">${esc(shortDate(last.day))}</text>
  </svg>`;
}

/** Selector de rango: `fn` es el nombre de la función global que recibe el nº de días. */
function rangePills(current, options, fn) {
  return `<div class="range-pills" role="group" aria-label="Rango de fechas">${options.map(d =>
    `<button class="range-pill ${d === current ? "active" : ""}" aria-pressed="${d === current}" onclick="${fn}(${d})">${d === 365 ? "1 año" : d + " d"}</button>`).join("")}</div>`;
}
