/**
 * scantray.js — Bandeja del escáner continuo
 * Author: Sangar Studio
 * Version: 1.0.0
 * Cada carta leída se identifica sin salir de la cámara (búsqueda + comparación de diseño y número) y se
 * acumula en una bandeja con cantidad editable. Al final, «Añadir» la guarda en la colección de una vez.
 * La bandeja sobrevive a cerrar el escáner y a recargar la pestaña (sessionStorage) hasta que se añade o se vacía.
 * Depende de: api.js (buscarCartas), cardmatch.js (ordenarPorEscaneo), prices.js, cloud.js (collectionAddBatch,
 *             canEditCollection), scanner.js (setScannerStatus, playSuccessChime, triggerHaptic), stats.js (esc)
 */

const TRAY_KEY = "kardlume_scan_tray";
let bandeja = [];          // [{ uid, card, candidates, qty, revisar }]
let ultimaAlta = { id: null, t: 0 };

function guardarBandeja() {
  try {
    // Solo lo necesario para reconstruirla: las candidatas se limitan a 8
    sessionStorage.setItem(TRAY_KEY, JSON.stringify(bandeja.map(b => ({ ...b, candidates: b.candidates.slice(0, 8) }))));
  } catch { /* sin espacio o bloqueado: la bandeja sigue en memoria */ }
}

function cargarBandeja() {
  try { bandeja = JSON.parse(sessionStorage.getItem(TRAY_KEY)) || []; } catch { bandeja = []; }
}

const trayVariantes = (card) => {
  const v = card.variants || { normal: true };
  const out = [];
  if (v.normal !== false) out.push(["normal", "Normal"]);
  if (v.holo || card.precioFoil > 0) out.push(["holo", "Holo"]);
  if (v.reverse) out.push(["reverse", "Reverse"]);
  if (v.firstEdition) out.push(["firstEdition", "1.ª ed."]);
  return out.length ? out : [["normal", "Normal"]];
};

async function conPrecio(card) {
  if (card.tipo === "pokemon" && card.preciosCargados === false) {
    try { await hidratarPrecioPokemon(card); } catch { card.preciosCargados = true; card.errorPrecio = true; }
  }
  return card;
}

/**
 * Recibe una lectura del escáner (nombre + datos de la carta completa) y la añade a la bandeja.
 * Devuelve true si se añadió algo.
 */
async function bandejaRecibirLectura(nombre, cardCtx) {
  setScannerStatus(`BUSCANDO «${nombre}»…`, "processing");
  let resultados;
  try {
    resultados = await buscarCartas(nombre, juegoActual, (typeof searchFilters !== "undefined" && searchFilters.lang) || "all");
  } catch (e) {
    setScannerStatus(e.code === "notfound" ? `NO ENCONTRADA: ${nombre}` : "SIN CONEXIÓN CON EL SERVICIO DE CARTAS", "motion");
    return false;
  }
  if (!resultados || !resultados.length) { setScannerStatus(`NO ENCONTRADA: ${nombre}`, "motion"); return false; }

  let orden = { cards: resultados, confident: resultados.length === 1 };
  if (cardCtx) { try { orden = await ordenarPorEscaneo(resultados, cardCtx); } catch { /* se queda el orden de la búsqueda */ } }
  const elegida = await conPrecio({ ...orden.cards[0] });

  // Dos lecturas de la misma carta en menos de 2,5 s son la misma copia (la carta sigue en el visor)
  if (ultimaAlta.id === elegida.id && Date.now() - ultimaAlta.t < 2500) return false;
  ultimaAlta = { id: elegida.id, t: Date.now() };

  const existente = bandeja.find(b => b.card.id === elegida.id && (b.card.selectedVariant || "normal") === (elegida.selectedVariant || "normal"));
  if (existente) {
    existente.qty++;
    bandeja = [existente, ...bandeja.filter(b => b !== existente)];
  } else {
    bandeja.unshift({
      uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      card: elegida,
      candidates: orden.cards.slice(0, 8),
      qty: 1,
      revisar: !orden.confident && orden.cards.length > 1
    });
  }
  guardarBandeja();
  renderBandeja();
  playSuccessChime();
  triggerHaptic();
  setScannerStatus(`AÑADIDA: ${elegida.nombre}`, "success");
  return true;
}

function renderBandeja() {
  const list = document.getElementById("scan-tray-list");
  if (!list) return;
  const copias = bandeja.reduce((s, b) => s + b.qty, 0);
  const valor = sumValue(bandeja.map(b => ({ card: b.card, qty: b.qty })));
  document.getElementById("scan-tray-count").textContent = copias
    ? `${copias} carta${copias === 1 ? "" : "s"} · ${formatValue(valor)}`
    : "Apunta a una carta: se irán sumando aquí";
  const add = document.getElementById("scan-tray-add");
  const editable = typeof canEditCollection !== "function" || canEditCollection();
  add.disabled = !copias || !editable;
  add.textContent = !editable ? "Colección en solo lectura" : copias ? `Añadir ${copias} a la colección` : "Añadir a la colección";
  document.getElementById("scan-tray-clear").hidden = !copias;
  document.getElementById("scan-tray").classList.toggle("is-empty", !copias);

  list.innerHTML = bandeja.map(b => {
    const c = b.card;
    const p = getCardActivePrice(c);
    return `<li class="scan-item${b.revisar ? " needs-review" : ""}">
      <button type="button" class="si-main" onclick="abrirItemBandeja('${b.uid}')" aria-label="Cambiar edición o acabado de ${esc(c.nombre)}">
        <img src="${esc(c.imagenThumb || c.imagen || "")}" alt="" loading="lazy">
        <span class="si-info">
          <span class="si-name">${esc(c.nombre)}</span>
          <span class="si-meta">${esc(c.set || "")}${c.localId ? " · #" + esc(c.localId) : ""} · ${esc(formatVariantName(c.selectedVariant))}</span>
          ${b.revisar ? `<span class="si-flag">Revisa la edición</span>` : ""}
        </span>
        <span class="si-price">${p != null ? esc(formatMoney(p, c.moneda)) : "—"}</span>
      </button>
      <span class="si-qty">
        <button type="button" onclick="cambiarCantidadBandeja('${b.uid}', -1)" aria-label="Quitar una">−</button>
        <span aria-live="polite">${b.qty}</span>
        <button type="button" onclick="cambiarCantidadBandeja('${b.uid}', 1)" aria-label="Añadir una">+</button>
      </span>
    </li>`;
  }).join("");
}

function cambiarCantidadBandeja(uid, delta) {
  const b = bandeja.find(x => x.uid === uid);
  if (!b) return;
  b.qty += delta;
  if (b.qty <= 0) bandeja = bandeja.filter(x => x !== b);
  guardarBandeja();
  renderBandeja();
}

function vaciarBandeja() {
  if (!bandeja.length) return;
  if (!confirm(`¿Descartar las ${bandeja.reduce((s, b) => s + b.qty, 0)} cartas de la bandeja?`)) return;
  bandeja = [];
  guardarBandeja();
  renderBandeja();
}

async function añadirBandejaAColeccion() {
  if (!bandeja.length) return;
  const btn = document.getElementById("scan-tray-add");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  const n = await collectionAddBatch(bandeja.map(b => ({ card: b.card, qty: b.qty })));
  if (!n) { renderBandeja(); return; }
  bandeja = [];
  guardarBandeja();
  renderBandeja();
  cerrarEscaner();
  if (typeof switchTab === "function") switchTab("collection");
  showDeckToast(`${n} carta${n === 1 ? "" : "s"} añadida${n === 1 ? "" : "s"} a tu colección`, "success");
}

/* ───────────── Hoja de una carta: edición, acabado, cantidad ───────────── */

function abrirItemBandeja(uid) {
  const b = bandeja.find(x => x.uid === uid);
  const sheet = document.getElementById("scan-item-sheet");
  if (!b || !sheet) return;
  const c = b.card;
  sheet.innerHTML = `
    <div class="sis-panel" role="dialog" aria-modal="true" aria-label="Detalles de ${esc(c.nombre)}">
      <div class="sis-head"><strong>${esc(c.nombre)}</strong>
        <button type="button" class="sis-close" onclick="cerrarItemBandeja()" aria-label="Cerrar">✕</button></div>
      <p class="sis-label">Edición ${b.candidates.length > 1 ? "(toca la que tienes)" : ""}</p>
      <div class="sis-prints">${b.candidates.map((k, i) => `
        <button type="button" class="sis-print${k.id === c.id ? " active" : ""}" onclick="elegirEdicionBandeja('${uid}', ${i})">
          <img src="${esc(k.imagenThumb || k.imagen || "")}" alt="" loading="lazy">
          <span>${esc(k.set || "")}${k.localId ? " · #" + esc(k.localId) : ""}</span></button>`).join("")}</div>
      <p class="sis-label">Acabado</p>
      <div class="sis-variants">${trayVariantes(c).map(([k, l]) => `
        <button type="button" class="filter-pill${(c.selectedVariant || "normal") === k ? " active" : ""}" onclick="elegirAcabadoBandeja('${uid}', '${k}')">${l}</button>`).join("")}</div>
      <div class="sis-actions">
        <button type="button" class="dab-btn" onclick="cerrarItemBandeja(); cerrarEscaner(); abrirDetalle(bandeja.find(x => x.uid === '${uid}').card, false)">Ver ficha completa</button>
        <button type="button" class="dab-btn danger" onclick="cambiarCantidadBandeja('${uid}', -${b.qty}); cerrarItemBandeja()">Quitar</button>
        <button type="button" class="btn-primary" onclick="cerrarItemBandeja()">Listo</button>
      </div>
    </div>`;
  sheet.hidden = false;
}

function cerrarItemBandeja() {
  const sheet = document.getElementById("scan-item-sheet");
  if (sheet) { sheet.hidden = true; sheet.innerHTML = ""; }
}

async function elegirEdicionBandeja(uid, idx) {
  const b = bandeja.find(x => x.uid === uid);
  if (!b || !b.candidates[idx]) return;
  b.card = await conPrecio({ ...b.candidates[idx] });
  b.revisar = false;
  guardarBandeja();
  renderBandeja();
  abrirItemBandeja(uid);
}

function elegirAcabadoBandeja(uid, variante) {
  const b = bandeja.find(x => x.uid === uid);
  if (!b) return;
  b.card.selectedVariant = variante;
  guardarBandeja();
  renderBandeja();
  abrirItemBandeja(uid);
}

cargarBandeja();
