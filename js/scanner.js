/**
 * scanner.js — Premium Auto-Scanner Logic
 * Author: Sangar Studio
 * Version: 2.0.0
 * Continuous scanning with visual feedback
 */

let videoStream   = null;
let scanInterval  = null;
let ocrWorker     = null;
let isScanning    = false;
let lastRead      = '';
let scanPaused    = false;

const SCAN_INTERVAL_MS = 1500; // Slightly faster for premium feel
const MIN_CONF         = 65;

async function initOcrWorker() {
  if (ocrWorker) return;
  ocrWorker = await Tesseract.createWorker('eng', 1, {
    logger: () => {}
  });
  await ocrWorker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz '-",
  });
}

async function iniciarEscaner() {
  resetUI();
  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('scanner-wrap').style.display = 'block';

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });
    
    const video = document.getElementById('live-video');
    video.srcObject = videoStream;
    
    // UI Feedback
    setScannerStatus("BUSCANDO CARTA...", "active");
    
    await initOcrWorker();
    
    scanPaused = false;
    lastRead   = '';
    startContinuousScan();
  } catch (err) {
    console.error(err);
    alert('Permiso de cámara denegado o no disponible.');
    detenerEscaner();
  }
}

function detenerEscaner() {
  stopContinuousScan();
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
  }
  document.getElementById('scanner-wrap').style.display = 'none';
  document.getElementById('placeholder').style.display = 'flex';
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

async function autoScan() {
  if (isScanning || scanPaused || !videoStream) return;

  const video = document.getElementById('live-video');
  if (video.readyState < 2) return;

  isScanning = true;
  setScannerStatus("PROCESANDO...", "processing");

  const text = await captureAndOcr(video);
  isScanning = false;

  if (!text || text === lastRead) {
    setScannerStatus("AUTO SCAN ACTIVO", "active");
    return;
  }

  const cleaned = cleanOcrText(text);
  if (!cleaned || cleaned.length < 3) {
    setScannerStatus("AUTO SCAN ACTIVO", "active");
    return;
  }

  lastRead = cleaned;
  scanPaused = true;

  // Visual success feedback
  setScannerStatus(`¡CARTA LEÍDA: ${cleaned}!`, "success");
  
  const scannerContainer = document.querySelector('.scanner-container');
  if (scannerContainer) {
    scannerContainer.classList.add('scan-success-glow');
    setTimeout(() => scannerContainer.classList.remove('scan-success-glow'), 1000);
  }
  
  setTimeout(() => {
    document.getElementById('search-input').value = cleaned;
    detenerEscaner();
    ejecutarBusqueda();
  }, 500);
}

async function captureAndOcr(video) {
  try {
    const canvas = document.createElement('canvas');
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cropH = Math.round(vh * 0.25); // Top 25% of the frame

    canvas.width  = vw;
    canvas.height = cropH;

    const ctx = canvas.getContext('2d');
    ctx.filter = 'grayscale(100%) contrast(200%) brightness(120%)';
    ctx.drawImage(video, 0, 0, vw, cropH, 0, 0, vw, cropH);

    const { data } = await ocrWorker.recognize(canvas);

    const best = data.lines
      .filter(l => l.confidence > MIN_CONF)
      .sort((a, b) => b.confidence - a.confidence)[0];

    return best ? best.text.trim() : null;
  } catch (e) {
    console.warn('OCR error:', e);
    return null;
  }
}

function cleanOcrText(raw) {
  return raw
    .replace(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ '\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function capturarYProcesar() {
  if (isScanning) return;
  autoScan(); // Force one cycle
}

function setScannerStatus(msg, state) {
  const statusEl = document.getElementById('scanner-status');
  if (!statusEl) return;
  
  statusEl.textContent = msg.toUpperCase();
  
  // Dynamic color feedback if needed, currently uses accent
  if (state === 'success') {
    statusEl.style.color = "#4ade80";
  } else if (state === 'processing') {
    statusEl.style.color = "var(--accent-color)";
    statusEl.style.opacity = "0.7";
  } else {
    statusEl.style.color = "var(--accent-color)";
    statusEl.style.opacity = "1";
  }
}
