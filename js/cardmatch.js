/**
 * cardmatch.js — Reconocimiento de la carta completa (diseño + número de coleccionista)
 * Author: Sangar Studio
 * Version: 1.0.0
 * El OCR del título solo da el nombre; muchas cartas comparten nombre en decenas de ediciones.
 * Aquí se compara la foto de la carta entera con las imágenes oficiales de los candidatos
 * (correlación cruzada normalizada sobre una miniatura en grises) y se usa el número impreso.
 * Si la imagen del candidato no se puede leer (CORS), ese candidato se ordena solo por número.
 */

const SIG_W = 32, SIG_H = 44;
const SIG_MARGIN = 0.06;          // se descarta el borde de la carta (fondo, marco)
const MATCH_MIN_SCORE = 0.55;     // puntuación mínima para abrir la carta sin preguntar
const MATCH_MIN_MARGIN = 0.1;     // ventaja mínima sobre la segunda candidata

/** Miniatura en grises, con media 0 y norma 1, de una imagen/canvas (null si el canvas está "manchado" por CORS). */
function cardSignature(src, sw, sh) {
  try {
    const c = document.createElement("canvas");
    c.width = SIG_W; c.height = SIG_H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const mx = sw * SIG_MARGIN, my = sh * SIG_MARGIN;
    ctx.drawImage(src, mx, my, sw - 2 * mx, sh - 2 * my, 0, 0, SIG_W, SIG_H);
    const d = ctx.getImageData(0, 0, SIG_W, SIG_H).data;
    const n = SIG_W * SIG_H, v = new Float32Array(n);
    let mean = 0;
    for (let i = 0; i < n; i++) { v[i] = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) / 256; mean += v[i]; }
    mean /= n;
    let norm = 0;
    for (let i = 0; i < n; i++) { v[i] -= mean; norm += v[i] * v[i]; }
    norm = Math.sqrt(norm);
    if (!(norm > 1e-3)) return null;      // imagen plana: no aporta información
    for (let i = 0; i < n; i++) v[i] /= norm;
    return v;
  } catch { return null; }
}

/** Correlación entre dos firmas (−1…1). */
function sigCorrelation(a, b) {
  if (!a || !b) return null;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function sigFromUrl(url, timeoutMs = 5000) {
  return new Promise(resolve => {
    if (!url || url.startsWith("data:")) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    const t = setTimeout(() => { img.onload = img.onerror = null; resolve(null); }, timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(cardSignature(img, img.naturalWidth, img.naturalHeight)); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = url;
  });
}

/** Número de coleccionista impreso ("025/165" → {number:25, total:165}). */
function parseCollectorNumber(text) {
  const m = String(text || "").match(/(\d{1,4})\s*[\/|]\s*(\d{2,4})/);
  return m ? { number: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
}

function sameNumber(localId, number) {
  const n = parseInt(String(localId).replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n === number;
}

/**
 * Reordena candidatas por parecido con la carta escaneada.
 * @param {object[]} cards candidatas (CardResult)
 * @param {{sig?:Float32Array, number?:number, auto?:boolean}} ctx datos de la carta escaneada
 * @returns {Promise<{cards:object[], confident:boolean}>}
 */
async function ordenarPorEscaneo(cards, ctx, { maxCandidates = 24, deadlineMs = 6000 } = {}) {
  if (!ctx || cards.length < 2 || (!ctx.sig && !ctx.number)) return { cards, confident: false };
  const start = Date.now();
  const scored = cards.map((card, i) => ({ card, i, corr: null, byNumber: ctx.number != null && sameNumber(card.localId, ctx.number) }));

  if (ctx.sig) {
    const pool = scored.slice(0, maxCandidates);
    let next = 0;
    const workers = Array.from({ length: Math.min(6, pool.length) }, async () => {
      while (next < pool.length && Date.now() - start < deadlineMs) {
        const s = pool[next++];
        s.corr = sigCorrelation(ctx.sig, await sigFromUrl(s.card.imagenThumb || s.card.imagen));
      }
    });
    await Promise.all(workers);
  }

  scored.forEach(s => { s.score = (s.corr ?? 0) + (s.byNumber ? 0.35 : 0); });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);

  const [first, second] = scored;
  const seen = scored.some(s => s.corr != null);
  const uniqueNumber = scored.filter(s => s.byNumber).length === 1;
  const margin = first.score - (second ? second.score : 0);
  const confident = ctx.auto !== false &&
    ((seen && first.score >= MATCH_MIN_SCORE && margin >= MATCH_MIN_MARGIN) ||
     (!seen && uniqueNumber && first.byNumber));
  return { cards: scored.map(s => s.card), confident };
}
