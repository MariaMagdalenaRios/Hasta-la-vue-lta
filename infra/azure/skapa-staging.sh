#!/usr/bin/env bash
set -euo pipefail

: "${REPO:?Sätt REPO=<ägare>/<repo> (t.ex. jonatanhallenberg/utpost-cloud-labb)}"
: "${SHA:?Sätt SHA=<hela git-sha:n på main som Image har publicerat>}"
: "${IMAGE_FUNCTION_URL:?Sätt IMAGE_FUNCTION_URL till Azure Function-adressen}"
: "${IMAGE_FUNCTION_KEY:?Sätt IMAGE_FUNCTION_KEY till Azure Function-nyckeln}"
RG="${RG:-utpost-maria-rios-rg}"
LOC="${LOC:-swedencentral}"
ENV_NAME="${ENV_NAME:-utpost-env}"
APP="${APP:-hasta-la-vue-lta-staging}"
FN_APP="${FN_APP:-$(echo "${REPO#*/}" | tr '[:upper:]' '[:lower:]')-fn}"
OWNER_LC="$(echo "${REPO}" | tr '[:upper:]' '[:lower:]')"
IMAGE_API="ghcr.io/${OWNER_LC}-api:sha-${SHA:0:7}"
IMAGE_CLIENT="ghcr.io/${OWNER_LC}-client:sha-${SHA:0:7}"

# Hemligheterna skapas här och hamnar BARA i Azure (secrets). Skriv aldrig in dem i en fil.
JWT_SECRET="$(openssl rand -hex 32)"
DB_PASSWORD="$(openssl rand -hex 16)"

echo "→ containerapp-tillägget och leverantören Microsoft.App"
az extension add --name containerapp --upgrade --only-show-errors
az provider register --namespace Microsoft.App --wait

echo "→ resursgrupp ${RG} i ${LOC}"
az group create --name "${RG}" --location "${LOC}" --output none

echo "→ miljö ${ENV_NAME} (tar ~2 min; --logs-destination none = ingen Log Analytics, loggar strömmas med az containerapp logs show)"
az containerapp env create --name "${ENV_NAME}" --resource-group "${RG}" --location "${LOC}" --logs-destination none --output none
ENV_ID="$(az containerapp env show --name "${ENV_NAME}" --resource-group "${RG}" --query id --output tsv)"

echo "→ appen ${APP} ur infra/azure/staging.yaml (api ${IMAGE_API}, client ${IMAGE_CLIENT})"
TMP="$(mktemp)"
sed -e "s|__LOCATION__|${LOC}|g" -e "s|__APP__|${APP}|g" -e "s|__RG__|${RG}|g" -e "s|__ENV_ID__|${ENV_ID}|g" \
    -e "s|__IMAGE_API__|${IMAGE_API}|g" -e "s|__IMAGE_CLIENT__|${IMAGE_CLIENT}|g" \
    -e "s|__JWT_SECRET__|${JWT_SECRET}|g" -e "s|__DB_PASSWORD__|${DB_PASSWORD}|g" \
    -e "s|__IMAGE_FUNCTION_URL__|${IMAGE_FUNCTION_URL}|g" \
    -e "s|__IMAGE_FUNCTION_KEY__|${IMAGE_FUNCTION_KEY}|g" \
    "$(dirname "$0")/staging.yaml" > "${TMP}"
az containerapp create --resource-group "${RG}" --name "${APP}" --yaml "${TMP}" --output none
rm -f "${TMP}"
unset JWT_SECRET DB_PASSWORD

# Bildfunktionen (M7): URL som variabel, nyckeln som secret. Nyckeln läses ur Azure här och skrivs aldrig i en fil.
# Funktionen skapas av infra/azure/skapa-funktion.sh – finns den inte hoppar vi över kopplingen.
echo "→ funktionen ${FN_APP}: IMAGE_FUNCTION_URL och secret image-function-key"
if az functionapp show --name "${FN_APP}" --resource-group "${RG}" --output none 2>/dev/null; then
  FN_KEY="$(az functionapp keys list --name "${FN_APP}" --resource-group "${RG}" --query functionKeys.default --output tsv)"
  FN_HOST="$(az functionapp show --name "${FN_APP}" --resource-group "${RG}" --query "defaultHostName || properties.defaultHostName" --output tsv)"
  az containerapp secret set --name "${APP}" --resource-group "${RG}" --secrets "image-function-key=${FN_KEY}" --output none
  # Secrets ger ingen ny revision – variabeländringen gör det, och den nya revisionen läser secreten.
  az containerapp update --name "${APP}" --resource-group "${RG}" --container-name api \
    --set-env-vars "IMAGE_FUNCTION_URL=https://${FN_HOST}/api/process-image" "IMAGE_FUNCTION_KEY=secretref:image-function-key" \
    --revision-suffix "fn-$(date +%m%d%H%M%S)" --output none
  unset FN_KEY
else
  echo "  function app ${FN_APP} finns inte i ${RG} – kör infra/azure/skapa-funktion.sh först"
fi

FQDN="$(az containerapp show --name "${APP}" --resource-group "${RG}" --query properties.configuration.ingress.fqdn --output tsv)"
echo
echo "Klart. Appen: https://${FQDN}"
echo "Första anropet väcker appen från noll (fyra containrar + seed) – räkna med en minut."
echo "Kontroll: curl -s https://${FQDN}/api/health"
