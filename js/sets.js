/**
 * sets.js — Completar colecciones por set
 * Author: Sangar Studio
 * Version: 1.0.0
 * Agrupa la colección por edición, consulta cuántas cartas tiene cada set (TCGdex / Scryfall) y muestra el
 * progreso. Al abrir un set se ven todas sus cartas: las que tienes y, atenuadas, las que te faltan.
 * Las cartas se cuentan por número de coleccionista, así una misma carta en otro idioma o acabado cuenta una vez.
 * Depende de: cloud.js (collection, renderCollection, colTab), prices.js (fetchJSON, cacheGet, cacheSet, runPool),
 *             api.js (TCGDEX, NO_IMAGE, normalizeTCGdexSDKLang, obtenerCartaPorId), app.js (abrirDetalle), stats.js (esc)
 */

const SET_TTL = 7 * 24 * 3600e3;
const setMeta = {};            // "tipo:code" → { name, official, total, cards: [{id, localId, name, image}] | null, error }
const setLoading = new Set();
let setOpen = null;            // clave del set abierto
let setFilter = "all";         // all | missing | owned

const numKey = (n) => String(n ?? "").trim().toLowerCase().replace(/^0+(?=\w)/, "");
const setKey = (tipo, code) => `${tipo}:${code}`;

/** Sets presentes en la colección: { key, tipo, code, name, lang, owned:Set(localId), copias } */
function setsDeLaColeccion() {
  const map = new Map();
  collection.forEach(e => {
    const c = e.card;
    if (!c.setCode || c.localId == null || c.localId === "") return;
    const key = setKey(c.tipo, c.setCode);
    let s = map.get(key);
    if (!s) { s = { key, tipo: c.tipo, code: c.setCode, name: c.set || c.setCode, langs: {}, owned: new Set(), copias: 0 }; map.set(key, s); }
    s.owned.add(numKey(c.localId));
    s.copias += e.qty;
    const l = (c.lang || "en").toLowerCase();
    s.langs[l] = (s.langs[l] || 0) + e.qty;
  });
  map.forEach(s => { s.lang = Object.entries(s.langs).sort((a, b) => b[1] - a[1])[0][0]; });
  return [...map.values()];
}

const imgPokemon = (img) => !img ? NO_IMAGE : (/\.(webp|png|jpg)$/.test(img) ? img : `${img}/low.webp`);

async function cargarSet(s, conCartas = false) {
  const prev = setMeta[s.key];
  if (prev && !prev.error && (!conCartas || prev.cards)) return prev;
  const ck = `set:${s.key}:${s.tipo === "pokemon" ? s.lang : "en"}`;
  const hit = cacheGet(ck, SET_TTL);
  if (hit && (!conCartas || hit.data.cards)) return (setMeta[s.key] = hit.data);

  let meta;
  if (s.tipo === "pokemon") {
    const lang = normalizeTCGdexSDKLang(s.lang);
    let d = await fetchJSON(`${TCGDEX}/${lang}/sets/${encodeURIComponent(s.code)}`, { retries: 1, okStatuses: [404] });
    if ((!d || !d.id) && lang !== "en") d = await fetchJSON(`${TCGDEX}/en/sets/${encodeURIComponent(s.code)}`, { retries: 1, okStatuses: [404] });
    if (!d || !d.id) throw new Error("Set no encontrado");
    meta = {
      name: d.name || s.name,
      official: d.cardCount?.official || d.cardCount?.total || (d.cards || []).length,
      total: d.cardCount?.total || (d.cards || []).length,
      cards: (d.cards || []).map(c => ({ id: c.id, localId: c.localId, name: c.name, image: imgPokemon(c.image) }))
    };
  } else {
    const d = await fetchJSON(`https://api.scryfall.com/sets/${encodeURIComponent(s.code)}`, { okStatuses: [404], headers: { Accept: "application/json" } });
    if (!d || d.object === "error") throw new Error("Set no encontrado");
    meta = { name: d.name || s.name, official: d.card_count, total: d.card_count, cards: prev?.cards || null };
    if (conCartas) {
      const cards = [];
      let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`e:${s.code}`)}&unique=prints&order=set`;
      for (let page = 0; url && page < 8; page++) {
        const r = await fetchJSON(url, { okStatuses: [404], headers: { Accept: "application/json" } });
        if (!r || r.object === "error") break;
        r.data.forEach(c => cards.push({ id: c.id, localId: c.collector_number, name: c.name,
          image: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small || NO_IMAGE }));
        url = r.has_more ? r.next_page : null;
        if (url) await new Promise(res => setTimeout(res, 100));   // cortesía con Scryfall
      }
      meta.cards = cards;
    }
  }
  cacheSet(ck, meta);
  return (setMeta[s.key] = meta);
}

/** Carga en segundo plano el total de cada set y repinta la pestaña cuando termina. */
function cargarTotalesSets(sets) {
  const pendientes = sets.filter(s => !setMeta[s.key] && !setLoading.has(s.key));
  if (!pendientes.length) return;
  pendientes.forEach(s => setLoading.add(s.key));
  runPool(pendientes, 3, async (s) => {
    try { await cargarSet(s, s.tipo === "pokemon"); }
    catch { setMeta[s.key] = { name: s.name, error: true }; }
    setLoading.delete(s.key);
  }).then(() => { if (colTab === "sets") renderCollection(); });
}

function progreso(s) {
  const m = setMeta[s.key];
  if (!m || m.error || !m.official) return null;
  const dentro = m.cards ? [...s.owned].filter(n => m.cards.some(c => numKey(c.localId) === n)).length : s.owned.size;
  const oficiales = m.cards ? m.cards.filter(c => { const v = parseInt(c.localId, 10); return Number.isFinite(v) && v <= m.official; }) : null;
  const tengoOficiales = oficiales ? oficiales.filter(c => s.owned.has(numKey(c.localId))).length : Math.min(s.owned.size, m.official);
  return { tengo: tengoOficiales, de: m.official, pct: Math.min(100, (tengoOficiales / m.official) * 100), extra: Math.max(0, dentro - tengoOficiales) };
}

/** «<1 %» si tienes algo pero no llega al 1 %; nunca redondea a 100 % sin estar completo. */
const pctTexto = (pct) => pct > 0 && pct < 1 ? "<1 %" : `${pct < 100 ? Math.min(99, Math.floor(pct)) : 100} %`;

function setsHtml() {
  const sets = setsDeLaColeccion();
  if (!sets.length) return `<div class="an-empty">Cuando añadas cartas verás aquí cuánto te falta para completar cada set.</div>`;
  if (setOpen) {
    const s = sets.find(x => x.key === setOpen);
    if (s) return setDetalleHtml(s);
    setOpen = null;
  }
  cargarTotalesSets(sets);
  const filas = sets.map(s => ({ s, p: progreso(s) }))
    .sort((a, b) => (b.p ? b.p.pct : -1) - (a.p ? a.p.pct : -1) || b.s.copias - a.s.copias);
  return `<p class="an-muted sets-intro">Toca un set para ver qué cartas te faltan.</p>
    <ul class="sets-list">${filas.map(({ s, p }) => {
      const m = setMeta[s.key];
      const estado = p ? `${p.tengo} / ${p.de}${p.extra ? ` · +${p.extra} secreta${p.extra === 1 ? "" : "s"}` : ""}`
        : m?.error ? "No se pudo cargar el total" : "Cargando total…";
      return `<li><button type="button" class="set-row" onclick="abrirSet('${esc(s.key)}')">
        <span class="set-row-head"><span class="set-row-name">${esc(m?.name || s.name)}</span>
          <span class="set-row-pct">${p ? pctTexto(p.pct) : ""}</span></span>
        <span class="set-row-bar"><span style="width:${p ? p.pct.toFixed(1) : 0}%"></span></span>
        <span class="set-row-meta">${s.tipo === "magic" ? "Magic" : "Pokémon"} · ${esc(estado)}</span>
      </button></li>`;
    }).join("")}</ul>`;
}

function setDetalleHtml(s) {
  const m = setMeta[s.key];
  if (!m || !m.cards) {
    if (!setLoading.has(s.key + ":cards")) {
      setLoading.add(s.key + ":cards");
      cargarSet(s, true).catch(() => { setMeta[s.key] = { ...(setMeta[s.key] || {}), name: s.name, error: true, cards: [] }; })
        .finally(() => { setLoading.delete(s.key + ":cards"); if (colTab === "sets" && setOpen === s.key) renderCollection(); });
    }
    return `${setCabeceraHtml(s)}<div class="an-muted">Cargando las cartas del set…</div>`;
  }
  if (m.error && !m.cards.length) return `${setCabeceraHtml(s)}<div class="an-empty">No se pudo cargar este set. Revisa tu conexión.</div>`;
  const cards = m.cards.filter(c => {
    const tengo = s.owned.has(numKey(c.localId));
    return setFilter === "all" || (setFilter === "owned" ? tengo : !tengo);
  });
  const pills = [["all", "Todas"], ["missing", "Me faltan"], ["owned", "Tengo"]]
    .map(([k, l]) => `<button type="button" class="filter-pill ${setFilter === k ? "active" : ""}" onclick="setSetFilter('${k}')">${l}</button>`).join("");
  return `${setCabeceraHtml(s)}
    <div class="set-filters">${pills}</div>
    ${cards.length ? "" : `<div class="an-empty">${setFilter === "missing" ? "¡No te falta ninguna! Set completo." : "Ninguna carta con este filtro."}</div>`}
    <div class="set-grid">${cards.map(c => {
      const tengo = s.owned.has(numKey(c.localId));
      return `<button type="button" class="set-card ${tengo ? "owned" : "missing"}" onclick="abrirCartaDeSet('${esc(s.tipo)}', '${encodeURIComponent(c.id).replace(/'/g, "%27")}', '${esc(s.lang)}')"
          aria-label="${esc(c.name)} #${esc(c.localId)}${tengo ? ", la tienes" : ", te falta"}">
        <img src="${esc(c.image)}" alt="" loading="lazy">
        <span class="set-card-num">#${esc(c.localId)}</span>
        ${tengo ? "" : `<span class="set-card-flag">Falta</span>`}
      </button>`;
    }).join("")}</div>`;
}

function setCabeceraHtml(s) {
  const m = setMeta[s.key], p = progreso(s);
  return `<div class="set-head">
      <button type="button" class="link-btn" onclick="cerrarSet()">← Sets</button>
      <h3>${esc(m?.name || s.name)}</h3>
      ${p ? `<p class="an-muted">Tienes ${p.tengo} de ${p.de} (${pctTexto(p.pct)})${p.extra ? ` y ${p.extra} secreta${p.extra === 1 ? "" : "s"}` : ""}.</p>
        <span class="set-row-bar"><span style="width:${p.pct.toFixed(1)}%"></span></span>` : ""}
    </div>`;
}

function abrirSet(key) { setOpen = key; setFilter = "all"; renderCollection(); window.scrollTo({ top: 0 }); }
function cerrarSet() { setOpen = null; renderCollection(); }
function setSetFilter(f) { setFilter = f; renderCollection(); }

async function abrirCartaDeSet(tipo, encodedId, lang) {
  const id = decodeURIComponent(encodedId);
  // Si ya la tienes, se abre tu copia (con tu acabado, estado y coste)
  const mia = collection.find(e => e.card.id === id);
  if (mia) { abrirDetalle(mia.card, false); return; }
  try {
    const card = await obtenerCartaPorId(tipo, id, lang);
    if (card) abrirDetalle(card, false); else showDeckToast("No se pudo cargar la carta", "warn");
  } catch { showDeckToast("No se pudo cargar la carta", "warn"); }
}
