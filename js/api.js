/**
 * api.js — Capa de llamadas a APIs externas
 * Author: Sangar Studio
 * Version: 2.2.0
 * TCGdex (Pokémon, con respaldo en Pokémon TCG API v2)  |  Scryfall API (Magic)
 */

const POKEMON_API_KEY = ""; // Opcional

const TCGDEX = "https://api.tcgdex.net/v2";
const TCGDEX_LIMIT = 60;
const STAGES = { Basic: "Basic", Stage1: "Stage 1", Stage2: "Stage 2" };
const TRAINERS = { Supporter: "Supporter", Item: "Item", Stadium: "Stadium", Tool: "Pokémon Tool" };
const NO_IMAGE = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"><rect width="245" height="342" rx="14" fill="#1a1e2a"/>' +
  '<text x="122" y="176" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#6b7280">Sin imagen</text></svg>');

/** Carta de TCGdex (lista GraphQL o ficha REST) → CardResult sin precio. */
function tcgdexToCard(c) {
  const subtypes = [];
  if (c.stage && STAGES[c.stage]) subtypes.push(STAGES[c.stage]);
  if (c.trainerType && TRAINERS[c.trainerType]) subtypes.push(TRAINERS[c.trainerType]);
  if (c.energyType) subtypes.push(c.energyType === "Normal" ? "Basic" : c.energyType);
  return {
    id:          c.id,
    imagenThumb: c.image ? `${c.image}/low.webp`  : NO_IMAGE,
    imagen:      c.image ? `${c.image}/high.webp` : NO_IMAGE,
    nombre:      c.name,
    set:         c.set?.name ?? "Desconocido",
    setCode:     c.set?.id   ?? "",
    precio:      null,
    precioFoil:  null,
    moneda:      "eur",
    tipo:        "pokemon",
    supertype:   c.category === "Pokemon" ? "Pokémon" : (c.category || ""),
    subtypes,
    rarity:      c.rarity ?? "",
    preciosCargados: false
  };
}

/** Coincidencias exactas primero; el resto en el orden de la API. */
function ordenarPorRelevancia(cards, nombre) {
  const n = nombre.trim().toLowerCase();
  const rank = c => (c.nombre.toLowerCase() === n ? 0 : 2) + (c.imagen === NO_IMAGE ? 1 : 0);
  return cards.map((c, i) => [rank(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}

/** Inglés: lista completa en una sola llamada GraphQL (precios después, por ficha). */
async function pokemonTCGdexEn(nombre) {
  const query = `query($n:String){ cards(filters:{name:$n}, pagination:{page:1,itemsPerPage:100}){
    id name image category rarity stage trainerType energyType set{ id name } } }`;
  const data = await fetchJSON(`${TCGDEX}/graphql`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { n: nombre } })
  });
  if (data.errors) { const e = new Error("TCGdex rechazó la consulta."); e.code = "http"; throw e; }
  return (data.data?.cards || []).map(tcgdexToCard);
}

/** Otros idiomas (p. ej. español): lista breve + fichas completas (incluyen precio). */
async function pokemonTCGdexLang(nombre, lang) {
  const brief = await fetchJSON(`${TCGDEX}/${lang}/cards?name=${encodeURIComponent(nombre)}`, { okStatuses: [404] });
  if (!Array.isArray(brief)) return [];
  const cards = [];
  await runPool(brief.slice(0, 24), 6, async (b) => {
    try {
      const d = await fetchJSON(`${TCGDEX}/${lang}/cards/${encodeURIComponent(b.id)}`, { retries: 1 });
      const card = tcgdexToCard(d);
      applyPokemonPricing(card, d.pricing);
      cards.push(card);
    } catch { /* se omite la carta que falle */ }
  });
  return cards;
}

/** Respaldo: Pokémon TCG API (pokemontcg.io), menos estable. */
async function pokemonLegacy(nombre) {
  const headers = POKEMON_API_KEY ? { "X-Api-Key": POKEMON_API_KEY } : {};
  const url = `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(`name:"${nombre}"`)}&orderBy=-set.releaseDate`;
  const data = await fetchJSON(url, { headers, retries: 1, timeout: 12000 });
  return (data.data || []).map(c => {
    const cm = c.cardmarket?.prices;
    const card = {
      id: c.id, imagenThumb: c.images.small, imagen: c.images.large, nombre: c.name,
      set: c.set?.name ?? "Desconocido", setCode: c.set?.id ?? "", moneda: "eur", tipo: "pokemon",
      supertype: c.supertype ?? "", subtypes: c.subtypes ?? [], rarity: c.rarity ?? ""
    };
    return applyPokemonPricing(card, {
      cardmarket: cm && { trend: cm.trendPrice, avg: cm.averageSellPrice, avg1: cm.avg1, avg7: cm.avg7, avg30: cm.avg30,
        "avg-holo": cm.reverseHoloSell, "trend-holo": cm.reverseHoloTrend, updated: c.cardmarket.updatedAt?.replace(/\//g, "-") },
      tcgplayer: c.tcgplayer && { updated: c.tcgplayer.updatedAt?.replace(/\//g, "-"), ...c.tcgplayer.prices }
    });
  });
}

/**
 * Busca cartas Pokémon por nombre: TCGdex (inglés → español) y, si cae, Pokémon TCG API.
 * @param {string} nombre
 * @returns {Promise<CardResult[]>}
 */
async function buscarPokemon(nombre) {
  let cards;
  try {
    cards = await pokemonTCGdexEn(nombre);
    if (cards.length === 0) cards = await pokemonTCGdexLang(nombre, "es");
  } catch (err) {
    console.warn("TCGdex no disponible, usando respaldo:", err.message);
    cards = await pokemonLegacy(nombre);
  }
  if (cards.length === 0) { const e = new Error("No se encontró ninguna carta."); e.code = "notfound"; throw e; }
  return ordenarPorRelevancia(cards, nombre).slice(0, TCGDEX_LIMIT);
}

/**
 * Busca cartas Magic por nombre (fuzzy + todas las ediciones).
 * @param {string} nombre
 * @returns {Promise<CardResult[]>}
 */
async function buscarMagic(nombre) {
  // 1. Fuzzy para resolver el nombre oficial
  const fuzzyData = await fetchJSON(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(nombre)}`,
    { okStatuses: [404], headers: { Accept: "application/json" } });
  if (fuzzyData.object === "error") { const e = new Error("Carta no encontrada en Magic."); e.code = "notfound"; throw e; }

  // 2. Todas las ediciones del nombre oficial
  const query = encodeURIComponent(`!"${fuzzyData.name}"`);
  const [data, bulk] = await Promise.all([
    fetchJSON(`https://api.scryfall.com/cards/search?q=${query}&unique=prints`, { okStatuses: [404], headers: { Accept: "application/json" } }),
    scryfallPricesDate()
  ]);
  if (data.object === "error") throw new Error("No se pudieron cargar las versiones.");

  return data.data.map(c => {
    const faces = c.card_faces?.[0]?.image_uris;
    const uris  = c.image_uris ?? faces ?? null;
    const card = {
      id:          c.id,
      imagenThumb: uris?.small  ?? NO_IMAGE,
      imagen:      uris?.large  ?? uris?.normal ?? NO_IMAGE,
      nombre:      c.name,
      set:         c.set_name,
      setCode:     c.set,
      tipo:        "magic",
      manaCost:    c.mana_cost || c.card_faces?.[0]?.mana_cost || "",
      typeLine:    c.type_line ?? "",
      cmc:         c.cmc ?? null
    };
    return applyScryfallPricing(card, c, bulk);
  });
}

/**
 * Dispatcher: decide qué API usar según el juego activo.
 * @param {string} nombre
 * @param {"pokemon"|"magic"} juego
 * @returns {Promise<CardResult[]>}
 */
async function buscarCartas(nombre, juego) {
  const key = `search:${juego}:${nombre.trim().toLowerCase()}`;
  const fresh = cacheGet(key, TTL_SEARCH);
  if (fresh) return fresh.data;
  try {
    const cards = await (juego === "magic" ? buscarMagic(nombre) : buscarPokemon(nombre));
    cacheSet(key, cards);   // en Pokémon los precios se completan después, por ficha (caché propia)
    return cards;
  } catch (err) {
    const stale = cacheGet(key);
    if (stale && err.code === "network") { stale.data.forEach(c => { c.enCache = true; }); return stale.data; }
    throw err;
  }
}
