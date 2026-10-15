/**
 * api.js — Capa de llamadas a APIs externas
 * Author: Sangar Studio
 * Version: 3.7.0
 * TCGdex (Pokémon, SDK oficial @tcgdex/sdk@2 + GraphQL/REST resiliente) | Scryfall API (Magic)
 */

const POKEMON_API_KEY = ""; // Opcional

const TCGDEX = "https://api.tcgdex.net/v2";
const TCGDEX_LIMIT = 60;
const STAGES = { Basic: "Basic", Stage1: "Stage 1", Stage2: "Stage 2" };
const TRAINERS = { Supporter: "Supporter", Item: "Item", Stadium: "Stadium", Tool: "Pokémon Tool" };
const NO_IMAGE = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="245" height="342" viewBox="0 0 245 342"><rect width="245" height="342" rx="14" fill="#1a1e2a"/>' +
  '<text x="122" y="176" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#6b7280">Sin imagen</text></svg>');

/* ───────────── Inicialización del SDK oficial TCGdex ───────────── */

/**
 * Instancia global del SDK oficial de TCGdex (@tcgdex/sdk@2).
 * Coexiste con la capa directa REST y GraphQL para máxima resiliencia y tipado.
 */
let tcgdexClient = null;
try {
  if (typeof TCGdex !== "undefined") {
    tcgdexClient = new TCGdex("es");
    if (typeof tcgdexClient.setCacheTTL === "function") {
      tcgdexClient.setCacheTTL(3600); // 1 hora de caché en memoria/almacenamiento
    }
  }
} catch (err) {
  console.warn("No se pudo instanciar TCGdex SDK, usando capa REST directa:", err);
}
if (typeof window !== "undefined") {
  window.tcgdexClient = tcgdexClient;
}

/**
 * Normaliza el código de idioma para el SDK de TCGdex.
 * Idiomas soportados por TCGdex SDK: en, fr, es, it, pt, de, nl, pl, ru, ja, ko, zh-cn, zh-tw.
 */
function normalizeTCGdexSDKLang(lang) {
  if (!lang || lang === "all") return "en";
  const l = lang.toLowerCase();
  if (l === "zh" || l === "zh-cn" || l === "zhs" || l === "zh-hans") return "zh-cn";
  if (l === "zh-tw" || l === "zht" || l === "zh-hant") return "zh-tw";
  if (l === "pt-br" || l === "pt-pt") return "pt";
  return l;
}

/**
 * Sincroniza el idioma activo en el SDK oficial de TCGdex.
 */
function sincIdiomaTCGdexSDK(lang) {
  if (!window.tcgdexClient || typeof window.tcgdexClient.setLang !== "function") return;
  try {
    window.tcgdexClient.setLang(normalizeTCGdexSDKLang(lang));
  } catch (err) {
    console.warn("Error al sincronizar idioma en TCGdex SDK:", err);
  }
}

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

/** Carta de TCGdex (lista GraphQL, ficha REST o instancia de SDK) → CardResult sin precio. */
function tcgdexToCard(c, lang = "en") {
  const subtypes = [];
  if (c.stage && STAGES[c.stage]) subtypes.push(STAGES[c.stage]);
  if (c.trainerType && TRAINERS[c.trainerType]) subtypes.push(TRAINERS[c.trainerType]);
  if (c.energyType) subtypes.push(c.energyType === "Normal" ? "Basic" : c.energyType);

  const variants = c.variants || { normal: true };
  const selectedVariant = variants.normal ? "normal" : (variants.holo ? "holo" : (variants.reverse ? "reverse" : "normal"));

  const imgBase = typeof c.image === "function" ? c.image() : c.image;
  const imagenThumb = imgBase ? (imgBase.endsWith(".webp") || imgBase.endsWith(".png") ? imgBase : `${imgBase}/low.webp`) : NO_IMAGE;
  const imagen      = imgBase ? (imgBase.endsWith(".webp") || imgBase.endsWith(".png") ? imgBase : `${imgBase}/high.webp`) : NO_IMAGE;

  return {
    id:          c.id,
    localId:     c.localId ?? "",
    imagenThumb,
    imagen,
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
function ordenarPorRelevancia(cards, nombre, collectorNum = null) {
  const n = nombre.trim().toLowerCase();
  const rank = c => {
    let score = (c.nombre.toLowerCase() === n ? 0 : 2) + (c.imagen === NO_IMAGE ? 1 : 0);
    if (collectorNum && String(c.localId).toLowerCase() === String(collectorNum).toLowerCase()) {
      score -= 2;
    }
    return score;
  };
  return cards.map((c, i) => [rank(c), i, c]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}

/** Extrae el número local de coleccionista si está presente en formato 025/165 o 25/102. */
function extraerNumeroColeccionista(nombre) {
  if (!nombre) return null;
  const m = nombre.match(/(?:^|\s)(\d{1,3})\s*\/\s*\d{2,3}(?:\s|$)/);
  if (m) {
    return m[1].replace(/^0+/, "") || m[1];
  }
  return null;
}

/** Elimina sufijos de mecánicas (VSTAR, ex, etc.), tokens de salud (HP, PS, PV, KP) y números para búsqueda por nombre base. */
function normalizarNombrePokemon(nombre) {
  if (!nombre) return "";
  return nombre
    .replace(/(?:^|\s)\d{1,3}\s*\/\s*\d{2,3}(?:\s|$)/g, " ")
    .replace(/\b(\d{2,4}\s*(HP|PS|PV|KP)|(HP|PS|PV|KP)\s*\d{2,4})\b/gi, " ")
    .replace(/\b(HP|PS|PV|KP)\b/gi, " ")
    .replace(/\s+(VSTAR|V-ASTRO|VMAX|V-MAX|V|ex|EX|GX|BREAK|Prime|LV\.X|Tag Team|TAG TEAM)\b/gi, "")
    .replace(/(VSTAR|V-ASTRO|VMAX|ex|EX|GX)\b/gi, "")
    .replace(/^\d{1,4}\s+/, " ")
    .replace(/\s+\d{1,4}$/, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca cartas Pokémon por número local de coleccionista (localId) en TCGdex.
 * Híbrido: intenta primero con el SDK oficial (@tcgdex/sdk@2) y recurre a REST con reintentos si no está disponible.
 */
async function pokemonTCGdexLocalId(localId, lang = "en") {
  const targetLang = (lang === "all" || !lang) ? "en" : lang;
  const sdkLang = normalizeTCGdexSDKLang(targetLang);
  let brief = null;

  // Intento 1: SDK oficial
  if (typeof window !== "undefined" && window.tcgdexClient && typeof window.tcgdexClient.card?.list === "function") {
    try {
      if (typeof window.tcgdexClient.setLang === "function") {
        window.tcgdexClient.setLang(sdkLang);
      }
      brief = await window.tcgdexClient.card.list({ localId: String(localId) });
    } catch {
      brief = null;
    }
  }

  // Intento 2: Fallback REST directo
  if (!Array.isArray(brief) || brief.length === 0) {
    brief = await fetchJSON(`${TCGDEX}/${targetLang}/cards?localId=${encodeURIComponent(localId)}`, { okStatuses: [404] });
  }

  if (!Array.isArray(brief) || brief.length === 0) return [];
  const cards = [];
  await runPool(brief.slice(0, 30), 6, async (b) => {
    try {
      let d = null;
      if (typeof window !== "undefined" && window.tcgdexClient && typeof window.tcgdexClient.card?.get === "function") {
        try { d = await window.tcgdexClient.card.get(b.id); } catch {}
      }
      if (!d) {
        d = await fetchJSON(`${TCGDEX}/${targetLang}/cards/${encodeURIComponent(b.id)}`, { retries: 1 });
      }
      const card = tcgdexToCard(d, targetLang);
      applyPokemonPricing(card, d.pricing);
      cards.push(card);
    } catch { /* se omite la carta que falle */ }
  });
  return cards;
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

/**
 * Otros idiomas (p. ej. español, japonés o chino): lista breve + fichas completas (incluyen precio).
 * Híbrido: intenta listar y obtener con el SDK oficial de TCGdex y recurre a REST como fallback.
 */
async function pokemonTCGdexLang(nombre, lang = "es") {
  const sdkLang = normalizeTCGdexSDKLang(lang);
  let brief = null;

  // Intento 1: SDK oficial
  if (typeof window !== "undefined" && window.tcgdexClient && typeof window.tcgdexClient.card?.list === "function") {
    try {
      if (typeof window.tcgdexClient.setLang === "function") {
        window.tcgdexClient.setLang(sdkLang);
      }
      brief = await window.tcgdexClient.card.list({ name: nombre });
    } catch {
      brief = null;
    }
  }

  // Intento 2: Fallback REST directo
  if (!Array.isArray(brief) || brief.length === 0) {
    brief = await fetchJSON(`${TCGDEX}/${lang}/cards?name=${encodeURIComponent(nombre)}`, { okStatuses: [404] });
  }

  if (!Array.isArray(brief)) return [];
  const cards = [];
  await runPool(brief.slice(0, 24), 6, async (b) => {
    try {
      let d = null;
      if (typeof window !== "undefined" && window.tcgdexClient && typeof window.tcgdexClient.card?.get === "function") {
        try { d = await window.tcgdexClient.card.get(b.id); } catch {}
      }
      if (!d) {
        d = await fetchJSON(`${TCGDEX}/${lang}/cards/${encodeURIComponent(b.id)}`, { retries: 1 });
      }
      const card = tcgdexToCard(d, lang);
      applyPokemonPricing(card, d.pricing);
      cards.push(card);
    } catch { /* se omite la carta que falle */ }
  });
  return cards;
}

/* ───────────── Métodos de conveniencia del SDK oficial TCGdex ───────────── */

/**
 * Obtiene los detalles completos de una carta mediante el SDK oficial de TCGdex (con fallback REST).
 * @param {string} cardId
 * @param {string} [lang="en"]
 * @returns {Promise<CardResult|null>}
 */
async function obtenerCartaTCGdexSDK(cardId, lang = "en") {
  const targetLang = normalizeTCGdexSDKLang(lang);
  let rawCard = null;

  if (typeof window !== "undefined" && window.tcgdexClient && typeof window.tcgdexClient.card?.get === "function") {
    try {
      if (typeof window.tcgdexClient.setLang === "function") {
        window.tcgdexClient.setLang(targetLang);
      }
      rawCard = await window.tcgdexClient.card.get(cardId);
    } catch (err) {
      console.warn("Fallo en tcgdexClient.card.get, usando fallback REST:", err.message);
    }
  }

  if (!rawCard) {
    try {
      rawCard = await fetchJSON(`${TCGDEX}/${targetLang}/cards/${encodeURIComponent(cardId)}`, { retries: 1, okStatuses: [404] });
    } catch {
      rawCard = null;
    }
  }

  if (!rawCard || !rawCard.id) return null;

  const card = tcgdexToCard(rawCard, targetLang);
  if (rawCard.pricing) {
    applyPokemonPricing(card, rawCard.pricing);
  }
  return card;
}

/**
 * Obtiene una carta aleatoria mediante el SDK oficial de TCGdex (endpoint /random/card).
 * @param {string} [lang="es"]
 * @returns {Promise<CardResult|null>}
 */
async function obtenerCartaAleatoriaSDK(lang = "es") {
  const targetLang = normalizeTCGdexSDKLang(lang);
  let rawCard = null;

  if (typeof window !== "undefined" && window.tcgdexClient && typeof window.tcgdexClient.random?.card === "function") {
    try {
      if (typeof window.tcgdexClient.setLang === "function") {
        window.tcgdexClient.setLang(targetLang);
      }
      rawCard = await window.tcgdexClient.random.card();
    } catch (err) {
      console.warn("Fallo en tcgdexClient.random.card, usando fallback REST:", err.message);
    }
  }

  if (!rawCard) {
    try {
      rawCard = await fetchJSON(`${TCGDEX}/${targetLang}/random/card`, { retries: 1 });
    } catch {
      rawCard = null;
    }
  }

  if (!rawCard || !rawCard.id) return null;

  const card = tcgdexToCard(rawCard, targetLang);
  if (rawCard.pricing) {
    applyPokemonPricing(card, rawCard.pricing);
  }
  return card;
}

/**
 * Obtiene la información completa de una colección o expansión (Set) usando el SDK oficial de TCGdex.
 * @param {string} setId
 * @param {string} [lang="es"]
 * @returns {Promise<Object|null>}
 */
async function obtenerSetTCGdexSDK(setId, lang = "es") {
  const targetLang = normalizeTCGdexSDKLang(lang);
  if (typeof window !== "undefined" && window.tcgdexClient && typeof window.tcgdexClient.set?.get === "function") {
    try {
      if (typeof window.tcgdexClient.setLang === "function") {
        window.tcgdexClient.setLang(targetLang);
      }
      return await window.tcgdexClient.set.get(setId);
    } catch (err) {
      console.warn("Fallo en tcgdexClient.set.get, usando fallback REST:", err.message);
    }
  }
  try {
    return await fetchJSON(`${TCGDEX}/${targetLang}/sets/${encodeURIComponent(setId)}`, { retries: 1, okStatuses: [404] });
  } catch {
    return null;
  }
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
 * Busca cartas Pokémon por nombre con soporte de filtro de idioma y tolerancia a fallos.
 * @param {string} nombre
 * @param {string} lang "all" | "en" | "es" | "ja" | "zh" | "zh-cn" | "zh-tw" | "ko" | "fr" | "de" | "it" | "pt"
 * @returns {Promise<CardResult[]>}
 */
async function buscarPokemon(nombre, lang = "all") {
  const cleanQuery = nombre.trim();
  const collectorNum = extraerNumeroColeccionista(cleanQuery);
  const baseName = normalizarNombrePokemon(cleanQuery);
  const l = (lang || "all").toLowerCase();

  // Función interna para consultar un término en un idioma específico
  async function consultarTermino(termino, idioma) {
    if (!termino || termino.length < 2) return [];
    if (idioma === "en") {
      return await pokemonTCGdexEn(termino);
    }
    if (idioma === "zh") {
      const [cnCards, twCards] = await Promise.all([
        pokemonTCGdexLang(termino, "zh-cn").catch(() => []),
        pokemonTCGdexLang(termino, "zh-tw").catch(() => [])
      ]);
      const map = new Map();
      [...cnCards, ...twCards].forEach(c => map.set(c.id, c));
      return Array.from(map.values());
    }
    if (idioma === "zh-cn" || idioma === "zhs") {
      return await pokemonTCGdexLang(termino, "zh-cn");
    }
    if (idioma === "zh-tw" || idioma === "zht") {
      return await pokemonTCGdexLang(termino, "zh-tw");
    }
    if (["es", "ja", "ko", "fr", "de", "it", "pt"].includes(idioma)) {
      return await pokemonTCGdexLang(termino, idioma);
    }
    // Modo "all": detección inteligente por familia de caracteres
    if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(termino)) {
      const [cnCards, twCards] = await Promise.all([
        pokemonTCGdexLang(termino, "zh-cn").catch(() => []),
        pokemonTCGdexLang(termino, "zh-tw").catch(() => [])
      ]);
      const map = new Map();
      [...cnCards, ...twCards].forEach(c => map.set(c.id, c));
      let results = Array.from(map.values());
      if (results.length === 0) {
        results = await pokemonTCGdexLang(termino, "ja").catch(() => []);
      }
      return results;
    }
    if (/[\u3040-\u309F\u30A0-\u30FF]/.test(termino)) {
      return await pokemonTCGdexLang(termino, "ja").catch(() => []);
    }
    if (/[\uAC00-\uD7AF]/.test(termino)) {
      return await pokemonTCGdexLang(termino, "ko").catch(() => []);
    }
    // Alfabeto latino: primero en inglés, luego en español
    let res = await pokemonTCGdexEn(termino).catch(() => []);
    if (res.length === 0) {
      res = await pokemonTCGdexLang(termino, "es").catch(() => []);
    }
    return res;
  }

  let cards = [];
  try {
    // 1. Búsqueda directa del término tal cual
    cards = await consultarTermino(cleanQuery, l);

    // 2. Si no hay resultados y el nombre tenía sufijos (p. ej. "Charizard VSTAR" -> "Charizard")
    if (cards.length === 0 && baseName && baseName.toLowerCase() !== cleanQuery.toLowerCase()) {
      cards = await consultarTermino(baseName, l);
    }

    // 3. Si se detectó número de coleccionista (p. ej. "025/165") y aún no hay cartas
    const isExplicitCollectorQuery = /^\d{1,4}\s*\/\s*\d{1,4}$/.test(cleanQuery);
    if (cards.length === 0 && collectorNum && (baseName.length >= 2 || isExplicitCollectorQuery)) {
      cards = await pokemonTCGdexLocalId(collectorNum, l !== "all" ? l : "en").catch(() => []);
      if (cards.length === 0 && l !== "en") {
        cards = await pokemonTCGdexLocalId(collectorNum, "en").catch(() => []);
      }
    }

    // 4. Fallback internacional a inglés si se buscaba en un idioma específico sin resultados
    if (cards.length === 0 && l !== "en" && l !== "all") {
      cards = await consultarTermino(cleanQuery, "en").catch(() => []);
      if (cards.length === 0 && baseName && baseName.toLowerCase() !== cleanQuery.toLowerCase()) {
        cards = await consultarTermino(baseName, "en").catch(() => []);
      }
    }
  } catch (err) {
    console.warn("TCGdex no disponible, usando respaldo:", err.message);
  }

  // 5. Respaldo final con pokemontcg.io si TCGdex no arrojó resultados
  if (cards.length === 0) {
    try {
      cards = await pokemonLegacy(cleanQuery).catch(() => []);
      if (cards.length === 0 && baseName && baseName.toLowerCase() !== cleanQuery.toLowerCase()) {
        cards = await pokemonLegacy(baseName).catch(() => []);
      }
    } catch { /* omite error de respaldo */ }
  }

  if (cards.length === 0) {
    const e = new Error(l !== "all" 
      ? `No se encontró ninguna carta en ${formatLanguageName(l)}.` 
      : "No se encontró ninguna carta.");
    e.code = "notfound";
    throw e;
  }

  return ordenarPorRelevancia(cards, cleanQuery, collectorNum).slice(0, TCGDEX_LIMIT);
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
  let fuzzyData = await fetchJSON(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(nombre)}`,
    { okStatuses: [404], headers: { Accept: "application/json" } });

  // Si fuzzy falla, intentar limpiando palabras de tipo o mecánicas
  const cleanMtg = nombre.replace(/\b(Creature|Instant|Sorcery|Enchantment|Artifact|Planeswalker|Land|Legendary|Tribal|Battle)\b/gi, '').trim();
  if (fuzzyData.object === "error" && cleanMtg && cleanMtg !== nombre) {
    fuzzyData = await fetchJSON(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleanMtg)}`,
      { okStatuses: [404], headers: { Accept: "application/json" } });
  }

  // Si fuzzy aún falla (p. ej. nombre impreso en chino o japonés), buscar por texto impreso o nombre traducido
  if (fuzzyData.object === "error") {
    const term = cleanMtg || nombre;
    const searchData = await fetchJSON(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`(printed:"${term}" or name:"${term}")`)}`,
      { okStatuses: [404], headers: { Accept: "application/json" } });
    if (searchData.object !== "error" && Array.isArray(searchData.data) && searchData.data.length > 0) {
      fuzzyData = searchData.data[0];
    }
  }

  // Búsqueda general como último recurso antes de lanzar error
  if (fuzzyData.object === "error") {
    const term = cleanMtg || nombre;
    const searchData = await fetchJSON(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(term)}`,
      { okStatuses: [404], headers: { Accept: "application/json" } });
    if (searchData.object !== "error" && Array.isArray(searchData.data) && searchData.data.length > 0) {
      fuzzyData = searchData.data[0];
    }
  }

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
