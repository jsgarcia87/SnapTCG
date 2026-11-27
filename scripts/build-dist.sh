#!/usr/bin/env bash
# Genera dist/: solo los archivos públicos de Kard Lume, listos para subir al servidor (FTP, rsync…).
# Deja fuera documentación, scripts, esquema SQL, skills y configuración del repositorio.
# Uso: bash scripts/build-dist.sh
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
mkdir -p dist/.well-known
cp index.html privacidad.html borrar-cuenta.html manifest.webmanifest sw.js dist/
cp -R css js img dist/
cp deploy/htaccess dist/.htaccess

# Digital Asset Links: solo si ya tiene las huellas reales (si no, Android rechazaría la verificación)
if grep -q "HUELLA_SHA256" deploy/assetlinks.json; then
  echo "AVISO: deploy/assetlinks.json aún tiene huellas de ejemplo; no se copia a dist/.well-known/." >&2
else
  cp deploy/assetlinks.json dist/.well-known/assetlinks.json
fi

# Comprobaciones que bloquean una publicación incompleta
if grep -q "\[EMAIL DE CONTACTO\]" dist/privacidad.html dist/borrar-cuenta.html; then
  echo "AVISO: falta tu email de contacto en privacidad.html y borrar-cuenta.html ([EMAIL DE CONTACTO])." >&2
fi
version=$(grep -o 'kardlume-v[0-9.]*' sw.js | head -1)
echo "dist/ listo ($(find dist -type f | wc -l | tr -d ' ') archivos, caché del service worker: ${version})."
