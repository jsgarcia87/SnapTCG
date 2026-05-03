/**
 * api.js — Capa de llamadas a APIs externas
 * Pokémon TCG API v2  |  Scryfall API (Magic)
 */

const POKEMON_API_KEY = ""; // Opcional

/**
 * Busca cartas Pokémon por nombre.
 * @param {string} nombre
 * @returns {Promise<CardResult[]>}
 */
async function buscarPokemon(nombre) {
  const headers = POKEMON_API_KEY ? { "X-Api-Key": POKEMON_API_KEY } : {};
  const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(nombre)}"&orderBy=-set.releaseDate`;
  const res  = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Error HTTP ${res.status}`);
  const data = await res.json();
  if (!data.data || data.data.length === 0) throw new Error("No se encontró ninguna carta.");

  return data.data.map(c => ({
    id:          c.id,
    imagenThumb: c.images.small,
    imagen:      c.images.large,
    nombre:      c.name,
    set:         c.set?.name ?? "Desconocido",
    setCode:     c.set?.id   ?? "",
    precio:      c.cardmarket?.prices?.averageSellPrice ?? c.tcgplayer?.prices?.normal?.market ?? null,
    precioFoil:  c.tcgplayer?.prices?.holofoil?.market ?? null,
    moneda:      "eur",
    tipo:        "pokemon"
  }));
}

/**
 * Busca cartas Magic por nombre (fuzzy + todas las ediciones).
 * @param {string} nombre
 * @returns {Promise<CardResult[]>}
 */
async function buscarMagic(nombre) {
  // 1. Fuzzy para resolver el nombre oficial
  const fuzzyRes  = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(nombre)}`);
  const fuzzyData = await fuzzyRes.json();
  if (fuzzyData.object === "error") throw new Error("Carta no encontrada en Magic.");

  // 2. Todas las ediciones del nombre oficial
  const query = encodeURIComponent(`!"${fuzzyData.name}"`);
  const res   = await fetch(`https://api.scryfall.com/cards/search?q=${query}&unique=prints`);
  const data  = await res.json();
  if (data.object === "error") throw new Error("No se pudieron cargar las versiones.");

  return data.data.map(c => {
    const faces = c.card_faces?.[0]?.image_uris;
    const uris  = c.image_uris ?? faces ?? null;
    return {
      id:          c.id,
      imagenThumb: uris?.small  ?? "https://via.placeholder.com/146x204/1a1e2a/e8e6e0?text=Sin+Foto",
      imagen:      uris?.large  ?? uris?.normal ?? "https://via.placeholder.com/488x680/1a1e2a/e8e6e0?text=Sin+Foto",
      nombre:      c.name,
      set:         c.set_name,
      setCode:     c.set,
      precio:      c.prices?.eur    ?? c.prices?.usd    ?? null,
      precioFoil:  c.prices?.eur_foil ?? null,
      moneda:      c.prices?.eur ? "eur" : "usd",
      tipo:        "magic",
      manaCost:    c.mana_cost ?? "",
      typeLine:    c.type_line ?? ""
    };
  });
}

/**
 * Dispatcher: decide qué API usar según el juego activo.
 * @param {string} nombre
 * @param {"pokemon"|"magic"} juego
 * @returns {Promise<CardResult[]>}
 */
async function buscarCartas(nombre, juego) {
  return juego === "magic" ? buscarMagic(nombre) : buscarPokemon(nombre);
}
