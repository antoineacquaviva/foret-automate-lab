#!/usr/bin/env bash
# ==============================================================================
# Synchronise automatiquement les rapports finaux de campagne vers GitHub
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

CAMPAIGN_NAME="${1:-campagne}"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"

if [ ! -d ".git" ]; then
    echo "[GIT] Aucun dépôt Git initialisé dans $PROJECT_ROOT. Synchronisation ignorée."
    exit 0
fi

echo "[GIT] Ajout des bilans finaux de la campagne '$CAMPAIGN_NAME'..."
git add results/*/*.md results/*/*.csv configs/*.json 2>/dev/null || true

if git diff --cached --quiet; then
    echo "[GIT] Aucun nouveau résultat à commiter."
else
    git commit -m "Bilan campagne ${CAMPAIGN_NAME} (${TIMESTAMP})"
    echo "[GIT] Envoi vers origin/main..."
    git push origin main
    echo "[GIT] Résultats publiés avec succès sur GitHub !"
fi
