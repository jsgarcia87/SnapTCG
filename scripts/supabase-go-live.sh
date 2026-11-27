#!/usr/bin/env bash
# Kard Lume · configura Supabase para el lanzamiento en el servidor propio.
# Aplica en un solo paso (Management API de Supabase):
#   - URL del sitio y redirecciones permitidas del enlace mágico → tu dominio
#   - servidor de correo propio (SMTP) y límite de correos por hora
#   - asunto y plantilla en español de «Magic Link» y «Confirm signup» (supabase/templates/)
#   - abre los registros (cualquiera puede crear cuenta)
#
# Variables (expórtalas antes; nunca las guardes en el repositorio):
#   SUPABASE_ACCESS_TOKEN  token personal de Supabase (Account → Access Tokens)
#   APP_URL                URL pública de la app, p. ej. https://kardlume.example.com/  (con / final)
#   SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM   datos del proveedor de correo
#   SMTP_SENDER_NAME       opcional (por defecto «Kard Lume»)
#   EMAIL_RATE_LIMIT       opcional, correos por hora (por defecto 100)
#
# Uso: bash scripts/supabase-go-live.sh          → muestra lo que va a cambiar y pide confirmación
#      DRY_RUN=1 bash scripts/supabase-go-live.sh → solo lo muestra
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${PROJECT_REF:-rgyoatclhoblugdjekwl}"
for v in SUPABASE_ACCESS_TOKEN APP_URL SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS SMTP_FROM; do
  [ -n "${!v:-}" ] || { echo "Falta la variable $v (mira la cabecera del script)." >&2; exit 1; }
done
case "$APP_URL" in https://*/) ;; *) echo "APP_URL debe empezar por https:// y acabar en /" >&2; exit 1;; esac

body=$(APP_URL="$APP_URL" python3 - <<'PY'
import json, os
e = os.environ
print(json.dumps({
  "site_url": e["APP_URL"],
  "uri_allow_list": e["APP_URL"] + "**",
  "disable_signup": False,
  "smtp_host": e["SMTP_HOST"], "smtp_port": str(e["SMTP_PORT"]),
  "smtp_user": e["SMTP_USER"], "smtp_pass": e["SMTP_PASS"],
  "smtp_admin_email": e["SMTP_FROM"], "smtp_sender_name": e.get("SMTP_SENDER_NAME", "Kard Lume"),
  "rate_limit_email_sent": int(e.get("EMAIL_RATE_LIMIT", "100")),
  "mailer_subjects_magic_link": "Tu enlace para entrar en Kard Lume",
  "mailer_templates_magic_link_content": open("supabase/templates/magic_link.html", encoding="utf-8").read(),
  "mailer_subjects_confirmation": "Confirma tu cuenta de Kard Lume",
  "mailer_templates_confirmation_content": open("supabase/templates/confirmation.html", encoding="utf-8").read(),
}))
PY
)

echo "Proyecto: $PROJECT_REF"
echo "Sitio y redirecciones: $APP_URL  (${APP_URL}**)"
echo "SMTP: $SMTP_HOST:$SMTP_PORT como «${SMTP_SENDER_NAME:-Kard Lume}» <$SMTP_FROM>, límite ${EMAIL_RATE_LIMIT:-100} correos/hora"
echo "Plantillas en español y registros ABIERTOS."
[ "${DRY_RUN:-0}" = "1" ] && { echo "(DRY_RUN: no se ha cambiado nada)"; exit 0; }
read -r -p "¿Aplicar? [s/N] " ok; [ "$ok" = "s" ] || [ "$ok" = "S" ] || { echo "Cancelado."; exit 0; }

code=$(curl -sS -o /tmp/kardlume-go-live.json -w "%{http_code}" -X PATCH \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" -H "Content-Type: application/json" --data "$body")
if [ "$code" = "200" ]; then
  echo "Hecho. Prueba a crear una cuenta desde ${APP_URL}#cuenta."
else
  echo "Supabase respondió $code:" >&2; head -c 600 /tmp/kardlume-go-live.json >&2; echo >&2; exit 1
fi
rm -f /tmp/kardlume-go-live.json
