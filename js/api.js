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

const SUPPORTED_LANGUAGES = [
  { code: "all",   label: "Todos",  name: "Todos los idiomas" },
  { code: "en",    label: "EN",     name: "Inglés" },
  { code: "es",    label: "ES",     name: "Español" },
  { code: "ja",    label: "JA",     name: "Japonés" },
  { code: "zh",    label: "ZH",     name: "Chino (Simpl. y Trad.)" },
  { code: "zh-cn", label: "ZH-CN",  name: "Chino Simplificado" },
  { code: "zh-tw", label: "ZH-TW",  name: "Chino Tradicional" },
  { code: "ko",    label: "KO",     name: "Coreano" },
  { code: "fr",    label: "FR",     name: "Francés" },
  { code: "de",    label: "DE",     name: "Alemán" },
  { code: "it",    label: "IT",     name: "Italiano" },
  { code: "pt",    label: "PT",     name: "Portugués" }
];

function formatLanguageBadge(code) {
  if (!code) return "EN";
  const c = code.toLowerCase();
  if (c === "zh-cn" || c === "zhs" || c === "zh-hans") return "ZH-CN";
  if (c === "zh-tw" || c === "zht" || c === "zh-hant") return "ZH-TW";
  if (c === "zh") return "ZH";
  return c.toUpperCase();
}

function formatLanguageName(code) {
  if (!code) return "Inglés";
  const c = code.toLowerCase();
  switch (c) {
    case "en": return "Inglés";
    case "es": return "Español";
    case "ja": return "Japonés";
    case "zh": return "Chino";
    case "zh-cn":
    case "zhs":
    case "zh-hans": return "Chino Simplificado";
    case "zh-tw":
    case "zht":
    case "zh-hant": return "Chino Tradicional";
    case "ko": return "Coreano";
    case "fr": return "Francés";
    case "de": return "Alemán";
    case "it": return "Italiano";
    case "pt":
    case "pt-br":
    case "pt-pt": return "Portugués";
    case "ru": return "Ruso";
    default: return c.toUpperCase();
  }
}

function matchCardLang(cardLang, filterLang) {
  if (!filterLang || filterLang === "all") return true;
  const c = (cardLang || "en").toLowerCase();
  const f = filterLang.toLowerCase();
  if (f === "zh") {
    return c === "zh" || c.startsWith("zh-") || c === "zhs" || c === "zht";
  }
  if (f === "zh-cn" || f === "zhs") {
    return c === "zh-cn" || c === "zhs" || c === "zh-hans";
  }
  if (f === "zh-tw" || f === "zht") {
    return c === "zh-tw" || c === "zht" || c === "zh-hant";
  }
  return c === f;
}

/** Carta de TCGdex (lista GraphQL o ficha REST) → CardResult sin precio. */
function tcgdexToCard(c, lang = "en") {
  const subtypes = [];
  if (c.stage && STAGES[c.stage]) subtypes.push(STAGES[c.stage]);
  if (c.trainerType && TRAINERS[c.trainerType]) subtypes.push(TRAINERS[c.trainerType]);
  if (c.energyType) subtypes.push(c.energyType === "Normal" ? "Basic" : c.energyType);

  const variants = c.variants || { normal: true };
  const selectedVariant = variants.normal ? "normal" : (variants.holo ? "holo" : (variants.reverse ? "reverse" : "normal"));

  return {
    id:          c.id,
    localId:     c.localId ?? "",
    imagenThumb: c.image ? `${c.image}/low.webp`  : NO_IMAGE,
    imagen:      c.image ? `${c.image}/high.webp` : NO_IMAGE,
    nombre:      c.name,
    set:         c.set?.name ?? "Desconocido",
    setCode:     c.set?.id   ?? "",
    precio:      null,
    precioFoil:  null,
    moneda:      "eur",
    tipo:        "pokemon",
    lang:        lang,
    supertype:   c.category === "Pokemon" ? "Pokémon" : (c.category || ""),
    subtypes,
    rarity:      c.rarity ?? "",
    variants,
    selectedVariant,
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
    id localId name image category rarity stage trainerType energyType variants{ normal reverse holo firstEdition } set{ id name } } }`;
  const data = await fetchJSON(`${TCGDEX}/graphql`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { n: nombre } })
  });
  if (data.errors) { const e = new Error("TCGdex rechazó la consulta."); e.code = "http"; throw e; }
  return (data.data?.cards || []).map(c => tcgdexToCard(c, "en"));
}

/** Otros idiomas (p. ej. español o japonés): lista breve + fichas completas (incluyen precio). */
async function pokemonTCGdexLang(nombre, lang = "es") {
  const brief = await fetchJSON(`${TCGDEX}/${lang}/cards?name=${encodeURIComponent(nombre)}`, { okStatuses: [404] });
  if (!Array.isArray(brief)) return [];
  const cards = [];
  await runPool(brief.slice(0, 24), 6, async (b) => {
    try {
      const d = await fetchJSON(`${TCGDEX}/${lang}/cards/${encodeURIComponent(b.id)}`, { retries: 1 });
      const card = tcgdexToCard(d, lang);
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
      id: c.id, localId: c.number || "", imagenThumb: c.images.small, imagen: c.images.large, nombre: c.name,
      set: c.set?.name ?? "Desconocido", setCode: c.set?.id ?? "", moneda: "eur", tipo: "pokemon",
      lang: "en", supertype: c.supertype ?? "", subtypes: c.subtypes ?? [], rarity: c.rarity ?? "",
      variants: { normal: true, holo: !!c.tcgplayer?.prices?.holofoil, reverse: !!cm?.reverseHoloSell }
    };
    return applyPokemonPricing(card, {
      cardmarket: cm && { trend: cm.trendPrice, avg: cm.averageSellPrice, avg1: cm.avg1, avg7: cm.avg7, avg30: cm.avg30,
        "avg-holo": cm.reverseHoloSell, "trend-holo": cm.reverseHoloTrend, updated: c.cardmarket.updatedAt?.replace(/\//g, "-") },
      tcgplayer: c.tcgplayer && { updated: c.tcgplayer.updatedAt?.replace(/\//g, "-"), ...c.tcgplayer.prices }
    });
  });
}

/**
 * Busca cartas Pokémon por nombre con soporte de filtro de idioma.
 * @param {string} nombre
 * @param {string} lang "all" | "en" | "es" | "ja" | "zh" | "zh-cn" | "zh-tw" | "ko" | "fr" | "de" | "it" | "pt"
 * @returns {Promise<CardResult[]>}
 */
async function buscarPokemon(nombre, lang = "all") {
  let cards = [];
  const l = (lang || "all").toLowerCase();
  try {
    if (l === "en") {
      cards = await pokemonTCGdexEn(nombre);
    } else if (l === "zh") {
      // Chino: buscar en paralelo Simplificado (zh-cn) y Tradicional (zh-tw)
      const [cnCards, twCards] = await Promise.all([
        pokemonTCGdexLang(nombre, "zh-cn").catch(() => []),
        pokemonTCGdexLang(nombre, "zh-tw").catch(() => [])
      ]);
      const map = new Map();
      [...cnCards, ...twCards].forEach(c => map.set(c.id, c));
      cards = Array.from(map.values());
    } else if (l === "zh-cn" || l === "zhs") {
      cards = await pokemonTCGdexLang(nombre, "zh-cn");
    } else if (l === "zh-tw" || l === "zht") {
      cards = await pokemonTCGdexLang(nombre, "zh-tw");
    } else if (["es", "ja", "ko", "fr", "de", "it", "pt"].includes(l)) {
      cards = await pokemonTCGdexLang(nombre, l);
    } else {
      // "all": primero en inglés por rapidez y exhaustividad
      cards = await pokemonTCGdexEn(nombre);
      if (cards.length === 0) cards = await pokemonTCGdexLang(nombre, "es");
    }
  } catch (err) {
    console.warn("TCGdex no disponible, usando respaldo:", err.message);
    cards = await pokemonLegacy(nombre);
  }
  if (cards.length === 0) {
    const e = new Error(l !== "all" 
      ? `No se encontró ninguna carta en ${formatLanguageName(l)}.` 
      : "No se encontró ninguna carta.");
    e.code = "notfound";
    throw e;
  }
  return ordenarPorRelevancia(cards, nombre).slice(0, TCGDEX_LIMIT);
}

/** Obtiene la sintaxis Scryfall para filtrar por idioma. */
function getScryfallLangFilter(lang) {
  if (!lang || lang === "all") return "";
  const l = lang.toLowerCase();
  if (l === "zh") return " (lang:zhs or lang:zht)";
  if (l === "zh-cn" || l === "zhs") return " lang:zhs";
  if (l === "zh-tw" || l === "zht") return " lang:zht";
  return ` lang:${l}`;
}

/**
 * Busca cartas Magic por nombre (fuzzy + todas las ediciones, con soporte de idioma).
 * @param {string} nombre
 * @param {string} lang "all" | "en" | "es" | "ja" | "zh" | "zh-cn" | "zh-tw" | "ko" | "fr" | "de" | "it" | "pt"
 * @returns {Promise<CardResult[]>}
 */
async function buscarMagic(nombre, lang = "all") {
  // 1. Fuzzy para resolver el nombre oficial
  const fuzzyData = await fetchJSON(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(nombre)}`,
    { okStatuses: [404], headers: { Accept: "application/json" } });
  if (fuzzyData.object === "error") { const e = new Error("Carta no encontrada en Magic."); e.code = "notfound"; throw e; }

  // 2. Ediciones del nombre oficial (filtradas por idioma si se especifica)
  const langFilter = getScryfallLangFilter(lang);
  let query = encodeURIComponent(`!"${fuzzyData.name}"${langFilter}`);
  let [data, bulk] = await Promise.all([
    fetchJSON(`https://api.scryfall.com/cards/search?q=${query}&unique=prints`, { okStatuses: [404], headers: { Accept: "application/json" } }),
    scryfallPricesDate()
  ]);

  // Si no hay impresiones en el idioma exacto, cargar todas las impresiones
  let fallbackSinIdioma = false;
  if (data.object === "error" && langFilter) {
    query = encodeURIComponent(`!"${fuzzyData.name}"`);
    data = await fetchJSON(`https://api.scryfall.com/cards/search?q=${query}&unique=prints`, { okStatuses: [404], headers: { Accept: "application/json" } });
    fallbackSinIdioma = true;
  }

  if (data.object === "error") throw new Error("No se pudieron cargar las versiones.");

  if (fallbackSinIdioma && typeof showDeckToast === "function") {
    showDeckToast(`No hay impresiones en ${formatLanguageName(lang)}, mostrando todas`, "warn");
  }

  return data.data.map(c => {
    const faces = c.card_faces?.[0]?.image_uris;
    const uris  = c.image_uris ?? faces ?? null;
    let cardLang = (c.lang || "en").toLowerCase();
    if (cardLang === "zhs") cardLang = "zh-cn";
    if (cardLang === "zht") cardLang = "zh-tw";

    const card = {
      id:          c.id,
      localId:     c.collector_number || "",
      imagenThumb: uris?.small  ?? NO_IMAGE,
      imagen:      uris?.large  ?? uris?.normal ?? NO_IMAGE,
      nombre:      c.name,
      printedName: c.printed_name || null,
      set:         c.set_name,
      setCode:     c.set,
      tipo:        "magic",
      lang:        cardLang,
      rarity:      c.rarity || "",
      manaCost:    c.mana_cost || c.card_faces?.[0]?.mana_cost || "",
      typeLine:    c.type_line ?? "",
      cmc:         c.cmc ?? null
    };
    return applyScryfallPricing(card, c, bulk);
  });
}

/**
 * Dispatcher: decide qué API usar según el juego activo y el idioma.
 * @param {string} nombre
 * @param {"pokemon"|"magic"} juego
 * @param {string} lang "all" | "en" | "es" | "ja"
 * @returns {Promise<CardResult[]>}
 */
async function buscarCartas(nombre, juego, lang = "all") {
  const key = `search:${juego}:${lang}:${nombre.trim().toLowerCase()}`;
  const fresh = cacheGet(key, TTL_SEARCH);
  if (fresh) return fresh.data;
  try {
    const cards = await (juego === "magic" ? buscarMagic(nombre, lang) : buscarPokemon(nombre, lang));
    cacheSet(key, cards);   // en Pokémon los precios se completan después, por ficha (caché propia)
    return cards;
  } catch (err) {
    const stale = cacheGet(key);
    if (stale && err.code === "network") { stale.data.forEach(c => { c.enCache = true; }); return stale.data; }
    throw err;
  }
}
