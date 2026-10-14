/**
 * scanner.js — Motor de Escaneo Multilingüe Profesional para Cartas TCG
 * Arquitectura: Vanilla JS Zero-Build con Tesseract.js OCR
 * Soporte internacional:
 *  - Chino Simplificado y Tradicional (chi_sim + chi_tra + eng)
 *  - Japonés (jpn + eng)
 *  - Coreano (kor + eng)
 *  - Español e Inglés (spa + eng)
 *  - Preprocesamiento de imagen: Binarización adaptativa Otsu y normalización de contraste
 *  - Detección de desenfoque por movimiento (Varianza Laplaciana en tiempo real)
 *  - Proyección geométrica exacta de la región de interés (ROI)
 *  - Control de hardware: Linterna (Torch) y cambio de cámara
 *  - Síntesis de audio Web Audio API + Retroalimentación háptica
 *  - Carga y análisis de fotos desde galería de imágenes
 */

let videoStream       = null;
let scanInterval      = null;
let ocrWorker         = null;
let ocrWorkerLang     = null;
let isWorkerLoading   = false;
let isScanning        = false;
let lastRead          = '';
let scanPaused        = false;
let facingMode        = 'environment';
let torchActive       = false;
let hasTorch          = false;
let scannerLanguage   = 'auto'; // 'auto' | 'zh' | 'ja' | 'ko' | 'es' | 'en'

const SCAN_INTERVAL_MS = 1100; // Intervalo entre fotogramas estables
const MIN_CONF_PASS1   = 38;   // Confianza mínima para pase binarizado Otsu (latino)
const MIN_CONF_PASS2   = 30;   // Confianza mínima para pase de contraste (latino)
const MIN_CONF_CJK     = 30;   // Confianza mínima para ideogramas CJK (Chino/Japonés/Coreano)
const MOTION_THRESHOLD = 130;  // Umbral de varianza Laplaciana (por debajo es movimiento/borroso)

const LANG_MODEL_MAP = {
  auto:    'eng+spa',
  zh:      'chi_sim+chi_tra+eng',
  'zh-cn': 'chi_sim+eng',
  'zh-tw': 'chi_tra+eng',
  ja:      'jpn+eng',
  ko:      'kor+eng',
  es:      'spa+eng',
  en:      'eng',
  fr:      'fra+eng',
  de:      'deu+eng',
  it:      'ita+eng',
  pt:      'por+eng'
};

/**
 * Obtiene el idioma de escáner actualmente efectivo
 */
function getActiveScannerLang() {
  if (scannerLanguage && scannerLanguage !== 'auto') {
    return scannerLanguage;
  }
  if (typeof searchFilters !== 'undefined' && searchFilters.lang && searchFilters.lang !== 'all') {
    return searchFilters.lang;
  }
  return 'auto';
}

/**
 * Inicializa el worker de Tesseract con el modelo lingüístico correspondiente
 */
async function initOcrWorker(forceLang = null) {
  const langKey = forceLang || getActiveScannerLang();
  const tessLang = LANG_MODEL_MAP[langKey] || LANG_MODEL_MAP['auto'];

  if (ocrWorker && ocrWorkerLang === tessLang) return;

  if (isWorkerLoading) return;
  isWorkerLoading = true;

  try {
    if (ocrWorker) {
      try { await ocrWorker.terminate(); } catch (e) {}
      ocrWorker = null;
    }

    setScannerStatus("CARGANDO MOTOR OCR...", "processing");

    ocrWorker = await Tesseract.createWorker(tessLang, 1, {
      logger: (m) => {
        if (m.status === 'loading language traineddata' && typeof m.progress === 'number') {
          const pct = Math.round(m.progress * 100);
          setScannerStatus(`DESCARGANDO MODELO (${pct}%)...`, "processing");
        }
      }
    });

    ocrWorkerLang = tessLang;

    // Configuración según familia lingüística
    const isCJK = tessLang.includes('chi') || tessLang.includes('jpn') || tessLang.includes('kor');
    if (isCJK) {
      // Para ideogramas y caracteres asiáticos: modo automático sin whitelist restrictiva
      await ocrWorker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      });
    } else {
      // Para alfabetos latinos: modo línea única y whitelist optimizada
      await ocrWorker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789áéíóúñüÁÉÍÓÚÑÜ '-",
      });
    }

    setScannerStatus("BUSCANDO CARTA...", "active");
  } catch (err) {
    console.error('Error inicializando worker de Tesseract:', err);
    showScannerToast('Error al descargar el modelo de idioma para el escáner.', 'error');
  } finally {
    isWorkerLoading = false;
  }
}

/**
 * Cambia el idioma del motor OCR desde la barra de selección rápida del escáner
 */
async function setScannerLanguage(lang) {
  scannerLanguage = lang;

  // Actualizar píldoras visuales en la interfaz del escáner
  document.querySelectorAll('.scanner-lang-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === lang);
  });

  const langNames = {
    auto:    'Auto (EN/ES)',
    zh:      'Chino (ZH)',
    'zh-cn': 'Chino Simplificado',
    'zh-tw': 'Chino Tradicional',
    ja:      'Japonés (JA)',
    ko:      'Coreano (KO)',
    es:      'Español (ES)',
    en:      'Inglés (EN)'
  };
  showScannerToast(`Modo OCR: ${langNames[lang] || lang.toUpperCase()}`, 'info');

  // Si se selecciona chino y el filtro global está en 'all', sincronizar el filtro de búsqueda
  if (lang === 'zh' && typeof searchFilters !== 'undefined' && searchFilters.lang === 'all') {
    if (typeof setSearchFilter === 'function') setSearchFilter('lang', 'zh');
  } else if (typeof sincIdiomaTCGdexSDK === 'function') {
    sincIdiomaTCGdexSDK(lang);
  }

  // Reinicializar el worker OCR con el nuevo modelo lingüístico
  await initOcrWorker(lang);
}

/**
 * Sincroniza el idioma del escáner cuando el usuario cambia el filtro en la barra principal
 */
function syncScannerLanguage(filterLang) {
  let target = 'auto';
  if (filterLang === 'zh' || filterLang === 'zh-cn' || filterLang === 'zh-tw') {
    target = 'zh';
  } else if (filterLang === 'ja') {
    target = 'ja';
  } else if (filterLang === 'ko') {
    target = 'ko';
  } else if (filterLang === 'es') {
    target = 'es';
  } else if (filterLang === 'en') {
    target = 'en';
  }

  scannerLanguage = target;
  document.querySelectorAll('.scanner-lang-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === target);
  });

  // Si el escáner está activo en pantalla, actualizar el worker inmediatamente
  const wrap = document.getElementById('scanner-wrap');
  if (wrap && wrap.style.display !== 'none') {
    initOcrWorker(target);
  }
}

/**
 * Inicia la cámara y el bucle de auto-escaneo
 */
async function iniciarEscaner() {
  resetUI();
  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('scanner-wrap').style.display = 'block';

  // Sincronizar píldoras con el idioma activo
  const activeLang = getActiveScannerLang();
  document.querySelectorAll('.scanner-lang-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.lang === activeLang || (activeLang === 'all' && btn.dataset.lang === 'auto'));
  });

  try {
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }

    torchActive = false;
    actualizarBotonLinterna(false, false);

    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720 }
      },
      audio: false
    });

    const video = document.getElementById('live-video');
    video.srcObject = videoStream;

    // Detectar soporte para linterna (torch)
    const track = videoStream.getVideoTracks()[0];
    const caps = (track && track.getCapabilities) ? track.getCapabilities() : {};
    hasTorch = Boolean(caps.torch);
    actualizarBotonLinterna(hasTorch, false);

    setScannerStatus("BUSCANDO CARTA...", "active");

    await initOcrWorker();

    scanPaused = false;
    lastRead   = '';
    startContinuousScan();
  } catch (err) {
    console.error('Error accediendo a la cámara:', err);
    showScannerToast('Permiso de cámara denegado o no disponible en este dispositivo.', 'error');
    detenerEscaner();
  }
}

/**
 * Detiene la cámara y limpia recursos
 */
function detenerEscaner() {
  stopContinuousScan();

  if (videoStream) {
    const track = videoStream.getVideoTracks()[0];
    if (track && torchActive) {
      try {
        track.applyConstraints({ advanced: [{ torch: false }] });
      } catch (e) {}
    }
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }

  torchActive = false;
  actualizarBotonLinterna(false, false);

  const wrap = document.getElementById('scanner-wrap');
  if (wrap) wrap.style.display = 'none';

  const results = document.getElementById('results-grid');
  const spinner = document.getElementById('spinner-wrap');
  const hasResults = results && results.children.length > 0;
  const isSpinning = spinner && spinner.classList.contains('visible');

  if (!hasResults && !isSpinning) {
    const ph = document.getElementById('placeholder');
    if (ph) ph.style.display = 'flex';
  }
}

/**
 * Alterna entre cámara trasera y delantera
 */
async function cambiarCamara() {
  facingMode = facingMode === 'environment' ? 'user' : 'environment';
  await iniciarEscaner();
}

/**
 * Alterna la linterna del dispositivo móvil si está disponible
 */
async function toggleLinterna() {
  if (!videoStream || !hasTorch) {
    showScannerToast('Linterna no disponible en este dispositivo', 'info');
    return;
  }
  const track = videoStream.getVideoTracks()[0];
  if (!track) return;

  try {
    torchActive = !torchActive;
    await track.applyConstraints({
      advanced: [{ torch: torchActive }]
    });
    actualizarBotonLinterna(true, torchActive);
  } catch (err) {
    console.warn('Error alternando linterna:', err);
    torchActive = false;
    actualizarBotonLinterna(true, false);
  }
}

function actualizarBotonLinterna(disponible, activo) {
  const btn = document.getElementById('btn-scanner-torch');
  if (!btn) return;
  btn.style.opacity = disponible ? '1' : '0.4';
  btn.classList.toggle('active', Boolean(activo));
}

function startContinuousScan() {
  stopContinuousScan();
  scanInterval = setInterval(autoScan, SCAN_INTERVAL_MS);
}

function stopContinuousScan() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
  }
}

/**
 * Comprueba si una cadena contiene caracteres asiáticos (Chino, Japonés o Coreano)
 */
function hasCJK(text) {
  return /[\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(text);
}

/**
 * Comprueba si una cadena contiene caracteres chinos (Hanzi)
 */
function hasChinese(text) {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text);
}

/**
 * Ciclo periódico de análisis de fotograma
 */
async function autoScan() {
  if (isScanning || scanPaused || !videoStream || isWorkerLoading) return;

  const video = document.getElementById('live-video');
  if (!video || video.readyState < 2) return;

  // Extraer la región de interés (ROI del título de la carta)
  const roiCanvas = extractHeaderRoi(video);
  if (!roiCanvas) return;

  // Evaluar nitidez de fotograma (Filtro Laplaciano de movimiento)
  const grayPixels = getGrayscaleBuffer(roiCanvas);
  const sharpness = calculateSharpness(grayPixels, roiCanvas.width, roiCanvas.height);

  if (sharpness < MOTION_THRESHOLD) {
    setScannerStatus("MANTÉN LA CARTA QUIETA", "motion");
    return; // Fotograma en movimiento; omitir OCR para ahorrar batería y CPU
  }

  isScanning = true;
  setScannerStatus("ESCANEANDO CARTA...", "processing");

  try {
    const text = await recognizeRoiText(roiCanvas);
    isScanning = false;

    if (!text || text === lastRead) {
      setScannerStatus("AUTO SCAN ACTIVO", "active");
      return;
    }

    const cleaned = cleanOcrText(text);
    const minLen = hasCJK(cleaned) ? 2 : 3;

    if (!cleaned || cleaned.length < minLen) {
      setScannerStatus("AUTO SCAN ACTIVO", "active");
      return;
    }

    // ¡Lectura exitosa confirmada!
    lastRead   = cleaned;
    scanPaused = true;

    dispararExitoEscaneo(cleaned);
  } catch (err) {
    isScanning = false;
    console.warn('Error en ciclo autoScan:', err);
    setScannerStatus("AUTO SCAN ACTIVO", "active");
  }
}

/**
 * Disparador manual para capturar el fotograma actual
 */
async function capturarYProcesar() {
  const video = document.getElementById('live-video');
  if (!video || video.readyState < 2) return;

  setScannerStatus("PROCESANDO FOTOGRAMA...", "processing");
  const roiCanvas = extractHeaderRoi(video);
  if (!roiCanvas) return;

  try {
    let text = await recognizeRoiText(roiCanvas);
    let cleaned = cleanOcrText(text);
    let minLen = hasCJK(cleaned) ? 2 : 3;

    // Si la ROI estrecha no detecta texto, probar con la franja superior amplia (35% superior del cuadro)
    if (!cleaned || cleaned.length < minLen) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        const broadCanvas = document.createElement('canvas');
        const broadH = Math.round(vh * 0.35);
        broadCanvas.width  = vw;
        broadCanvas.height = broadH;
        const bCtx = broadCanvas.getContext('2d');
        bCtx.drawImage(video, 0, 0, vw, broadH, 0, 0, vw, broadH);
        text = await recognizeRoiText(broadCanvas);
        cleaned = cleanOcrText(text);
        minLen = hasCJK(cleaned) ? 2 : 3;
      }
    }

    if (cleaned && cleaned.length >= minLen) {
      dispararExitoEscaneo(cleaned);
    } else {
      setScannerStatus("AUTO SCAN ACTIVO", "active");
      showScannerToast("No se detectó el título de la carta. Alinea bien el borde superior.", "error");
    }
  } catch (err) {
    console.error('Error al capturar:', err);
    showScannerToast("Error al procesar la captura.", "error");
    setScannerStatus("AUTO SCAN ACTIVO", "active");
  }
}

/**
 * Procesa una imagen subida desde la galería fotográfica del usuario
 */
async function procesarImagenArchivo(file) {
  if (!file) return;

  setScannerStatus("PROCESANDO FOTO...", "processing");
  showScannerToast("Analizando foto de la carta...", "info");

  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  img.src = objectUrl;

  img.onload = async () => {
    URL.revokeObjectURL(objectUrl);
    try {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;

      // Intentar primero con la franja superior (30% superior = título en TCGs)
      const roiH = Math.round(h * 0.3);
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = roiH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, roiH, 0, 0, w, roiH);

      let text = await recognizeRoiText(canvas);
      let cleaned = cleanOcrText(text);
      let minLen = hasCJK(cleaned) ? 2 : 3;

      // Si falla, probar con la imagen completa reescalada
      if (!cleaned || cleaned.length < minLen) {
        const fullCanvas = document.createElement('canvas');
        const maxDim = 1200;
        const scale = Math.min(1, maxDim / Math.max(w, h));
        fullCanvas.width  = Math.round(w * scale);
        fullCanvas.height = Math.round(h * scale);
        const fullCtx = fullCanvas.getContext('2d');
        fullCtx.drawImage(img, 0, 0, fullCanvas.width, fullCanvas.height);

        text = await recognizeRoiText(fullCanvas);
        cleaned = cleanOcrText(text);
        minLen = hasCJK(cleaned) ? 2 : 3;
      }

      if (cleaned && cleaned.length >= minLen) {
        dispararExitoEscaneo(cleaned);
      } else {
        setScannerStatus("NO DETECTADO", "active");
        showScannerToast("No se reconoció el nombre. Prueba con una foto más nítida o escribe el nombre.", "error");
      }
    } catch (err) {
      console.error('Error procesando imagen de archivo:', err);
      showScannerToast("No se pudo procesar la imagen.", "error");
      setScannerStatus("AUTO SCAN ACTIVO", "active");
    }
  };

  img.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    showScannerToast("No se pudo cargar el archivo de imagen.", "error");
  };
}

/**
 * Acciones ejecutadas al reconocer una carta con éxito
 */
function dispararExitoEscaneo(nombreCarta) {
  playSuccessChime();
  triggerHaptic();

  setScannerStatus(`¡CARTA LEÍDA: ${nombreCarta}!`, "success");

  // Si se detectan caracteres chinos y el filtro estaba en 'all', sincronizar filtro 'zh'
  if (hasChinese(nombreCarta) && typeof searchFilters !== 'undefined' && searchFilters.lang === 'all') {
    if (typeof setSearchFilter === 'function') setSearchFilter('lang', 'zh');
  }

  const scannerContainer = document.querySelector('.scanner-container');
  if (scannerContainer) {
    scannerContainer.classList.add('scan-success-glow');
    setTimeout(() => scannerContainer.classList.remove('scan-success-glow'), 1200);
  }

  setTimeout(() => {
    const input = document.getElementById('search-input');
    if (input) input.value = nombreCarta;
    detenerEscaner();
    ejecutarBusqueda();
  }, 450);
}

/**
 * Proyecta la caja visual del encabezado (ROI) sobre las coordenadas nativas del video
 */
function extractHeaderRoi(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const vRect = video.getBoundingClientRect();
  const roiEl = document.getElementById('scanner-header-roi');
  const rRect = roiEl ? roiEl.getBoundingClientRect() : null;

  let sx = 0, sy = 0, sWidth = vw, sHeight = Math.round(vh * 0.25);

  if (rRect && vRect.width > 0 && vRect.height > 0) {
    // Escala del video renderizado con object-fit: cover
    const scale = Math.max(vRect.width / vw, vRect.height / vh);
    const displayedWidth = vw * scale;
    const displayedHeight = vh * scale;
    const offsetX = (displayedWidth - vRect.width) / 2;
    const offsetY = (displayedHeight - vRect.height) / 2;

    const relLeft = (rRect.left - vRect.left) + offsetX;
    const relTop  = (rRect.top - vRect.top) + offsetY;

    let rawSx = Math.round(relLeft / scale);
    let rawSy = Math.round(relTop / scale);
    let rawSw = Math.round(rRect.width / scale);
    let rawSh = Math.round(rRect.height / scale);

    // Margen de seguridad (+12% horizontal, +20% vertical) para evitar cortes si la carta está ladeada
    const padX = Math.round(rawSw * 0.12);
    const padY = Math.round(rawSh * 0.20);

    sx = Math.max(0, rawSx - padX);
    sy = Math.max(0, rawSy - padY);
    sWidth  = Math.min(vw - sx, rawSw + (padX * 2));
    sHeight = Math.min(vh - sy, rawSh + (padY * 2));
  }

  if (sWidth <= 20 || sHeight <= 20) {
    sx = Math.round(vw * 0.08);
    sy = Math.round(vh * 0.04);
    sWidth = Math.round(vw * 0.84);
    sHeight = Math.round(vh * 0.26);
  }

  const canvas = document.createElement('canvas');
  canvas.width  = sWidth;
  canvas.height = sHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
  return canvas;
}

/**
 * Obtiene el buffer en escala de grises de un canvas
 */
function getGrayscaleBuffer(canvas) {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;
  const gray = new Uint8Array(len / 4);

  for (let i = 0, g = 0; i < len; i += 4, g++) {
    gray[g] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }
  return gray;
}

/**
 * Calcula la varianza del operador Laplaciano para detectar desenfoque o movimiento
 */
function calculateSharpness(gray, w, h) {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  const step = 2; // Muestreo cada 2 píxeles para velocidad ultrarrápida (<0.4ms)

  for (let y = 1; y < h - 1; y += step) {
    const row = y * w;
    for (let x = 1; x < w - 1; x += step) {
      const c = gray[row + x];
      const t = gray[row - w + x];
      const b = gray[row + w + x];
      const l = gray[row + x - 1];
      const r = gray[row + x + 1];

      const lap = t + b + l + r - (c * 4);
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return (sumSq / count) - (mean * mean);
}

/**
 * Calcula el umbral de binarización óptimo de Otsu
 */
function computeOtsuThreshold(gray) {
  const hist = new Int32Array(256);
  const total = gray.length;
  for (let i = 0; i < total; i++) {
    hist[gray[i]]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) {
    sum += t * hist[t];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let bestThreshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > maxVariance) {
      maxVariance = varBetween;
      bestThreshold = t;
    }
  }
  return bestThreshold;
}

/**
 * Aplica transformaciones de imagen según el modo especificado
 */
function preprocessCanvas(canvas, mode = 'otsu') {
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const len = data.length;
  const gray = new Uint8Array(len / 4);

  for (let i = 0, g = 0; i < len; i += 4, g++) {
    gray[g] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  if (mode === 'otsu') {
    const thresh = computeOtsuThreshold(gray);
    for (let i = 0, g = 0; i < len; i += 4, g++) {
      const val = gray[g] >= thresh ? 255 : 0;
      data[i]     = val;
      data[i + 1] = val;
      data[i + 2] = val;
    }
  } else {
    // Normalización de contraste estirado
    let min = 255;
    let max = 0;
    for (let g = 0; g < gray.length; g++) {
      const v = gray[g];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = (max - min) || 1;
    for (let i = 0, g = 0; i < len; i += 4, g++) {
      const stretched = Math.min(255, Math.max(0, Math.round(((gray[g] - min) / range) * 255)));
      data[i]     = stretched;
      data[i + 1] = stretched;
      data[i + 2] = stretched;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * Reconoce el texto en la región de interés con estrategia multi-pase
 */
async function recognizeRoiText(rawCanvas) {
  if (!ocrWorker) await initOcrWorker();
  if (!ocrWorker) return null;

  const isCJK = ocrWorkerLang && (ocrWorkerLang.includes('chi') || ocrWorkerLang.includes('jpn') || ocrWorkerLang.includes('kor'));

  // Pase 1: Binarización Otsu (elimina brillos holográficos y reflejos)
  const pass1 = document.createElement('canvas');
  pass1.width  = rawCanvas.width;
  pass1.height = rawCanvas.height;
  pass1.getContext('2d').drawImage(rawCanvas, 0, 0);
  preprocessCanvas(pass1, 'otsu');

  let result = await ocrWorker.recognize(pass1);
  let best = getBestLine(result.data, isCJK);
  const minConf1 = isCJK ? MIN_CONF_CJK : MIN_CONF_PASS1;

  if (best && best.confidence >= minConf1) {
    return best.text;
  }

  // Pase 2: Alto contraste normalizado (para fuentes con gradiente o fondos oscuros)
  const pass2 = document.createElement('canvas');
  pass2.width  = rawCanvas.width;
  pass2.height = rawCanvas.height;
  pass2.getContext('2d').drawImage(rawCanvas, 0, 0);
  preprocessCanvas(pass2, 'contrast');

  result = await ocrWorker.recognize(pass2);
  best = getBestLine(result.data, isCJK);
  const minConf2 = isCJK ? Math.max(22, MIN_CONF_CJK - 6) : MIN_CONF_PASS2;

  if (best && best.confidence >= minConf2) {
    return best.text;
  }

  // Si se encontró un candidato con confianza moderada (>= 25%), pasarlo al buscador para verificar en la API
  if (best && best.confidence >= 25) {
    return best.text;
  }

  return best ? best.text : null;
}

function getBestLine(data, isCJK = false) {
  if (!data || !data.lines || data.lines.length === 0) return null;
  const minLen = isCJK ? 2 : 3;

  const candidates = [];
  for (const l of data.lines) {
    if (!l || !l.text) continue;
    const cleaned = cleanOcrText(l.text);
    if (cleaned.length >= minLen) {
      // Puntuación: confianza base ponderada por longitud útil de texto
      // Cartas reales suelen tener nombres de 4 a 25 caracteres.
      // Símbolos parásitos o iniciales cortas no deben superar al nombre completo.
      const lenBonus = Math.min(25, cleaned.length * 3);
      const score = (l.confidence || 0) + lenBonus;
      candidates.push({
        rawText: l.text,
        text: cleaned,
        confidence: l.confidence || 0,
        score
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0];
}

/**
 * Limpieza inteligente de OCR: descarta HP, fases evolutivas y símbolos parásitos,
 * preservando completamente ideogramas chinos (Hanzi), kana japoneses, hangul, caracteres latinos y números de coleccionista.
 */
function cleanOcrText(raw) {
  if (!raw) return '';
  return raw
    // Descartar tokens de HP (Pokémon en inglés, español, chino, japonés)
    .replace(/\b(\d{2,4}\s*HP|HP\s*\d{2,4})\b/gi, '')
    .replace(/(血量|生命值|HP)\s*\d{2,4}/gi, '')
    .replace(/\d{2,4}\s*(血量|生命值|HP)/gi, '')
    // Descartar fases evolutivas, entrenadores y tipos (multilingüe)
    .replace(/\b(Basic|Fase\s*[12]|Stage\s*[12]|Creature|Trainer|Item|Supporter|Entrenador|Energía|Energy)\b/gi, '')
    .replace(/(基础|基礎|1阶|2阶|1階|2階|宝可梦|寶可夢|训练家|訓練家|物品|支援者|能量)/g, '')
    .replace(/(たね|1進化|2進化|トレーナーズ|グッズ|サポート|エネルギー)/g, '')
    .replace(/[{}[\]()<>@#$%^&*+=~|\\_]/g, ' ')
    // Permitir letras latinas, dígitos, acentos, barra inclinada (coleccionista) y todos los caracteres CJK
    .replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ\u4E00-\u9FFF\u3400-\u4DBF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF '\-\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+\d+$/, '') // descarta números aislados finales como costes de maná
    .trim();
}

/**
 * Actualiza el indicador visual de estado del escáner
 */
function setScannerStatus(msg, state) {
  const statusEl = document.getElementById('scanner-status');
  const dotEl    = document.getElementById('scanner-status-dot');
  if (!statusEl) return;

  statusEl.textContent = msg.toUpperCase();

  if (dotEl) {
    dotEl.className = 'status-dot ' + (state || 'active');
  }

  if (state === 'success') {
    statusEl.style.color = 'var(--primary)';
  } else if (state === 'motion') {
    statusEl.style.color = '#f57733';
  } else if (state === 'processing') {
    statusEl.style.color = '#ff9821';
  } else {
    statusEl.style.color = 'var(--primary)';
  }
}

/**
 * Síntesis de sonido de éxito con Web Audio API (cero dependencias de archivos de audio)
 */
function playSuccessChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.start();
    osc.stop(ctx.currentTime + 0.22);
  } catch (e) {
    // Ignorar si el navegador bloquea la reproducción automática de audio
  }
}

/**
 * Vibración háptica en dispositivos móviles
 */
function triggerHaptic() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([45, 30, 45]);
    }
  } catch (e) {}
}

/**
 * Notificación toast flotante para el escáner
 */
function showScannerToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  const bg = type === 'error' ? 'var(--destructive)' : (type === 'success' ? 'var(--primary)' : 'var(--secondary)');
  const color = type === 'success' ? '#000' : 'var(--foreground)';

  toast.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${bg};
    color: ${color};
    padding: 10px 20px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    font-weight: 700;
    font-size: 13px;
    z-index: 2000;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    animation: toastIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s forwards';
    setTimeout(() => toast.remove(), 250);
  }, 2400);
}
