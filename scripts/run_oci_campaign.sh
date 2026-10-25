#!/usr/bin/env bash
# ==============================================================================
# Script de lancement sur Oracle Cloud Infrastructure (OCI)
# Cible : vm-campagne-tests (VM.Standard.E5.Flex — 8 OCPU / 16 vCPUs, 16 Go RAM)
# Usage : ./scripts/run_oci_campaign.sh [quick|full] [workers=14] [auto_push=true|false]
# ==============================================================================
set -euo pipefail

MODE="${1:-full}"          # "quick" (pilote rapide) ou "full" (campagne exhaustive 2916 variantes)
WORKERS="${2:-14}"         # 14 workers sur 16 vCPUs -> laisse 1 OCPU complet (2 threads) libre pour l'OS/SSH
AUTO_PUSH="${3:-true}"     # Pousse automatiquement le rapport final sur GitHub à la fin du calcul

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [ ! -d ".venv" ]; then
    echo "[INIT] Création de l'environnement virtuel Python (.venv)..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

if [ "$MODE" == "quick" ]; then
    CONFIG_FILE="configs/quick_campaign.json"
else
    CONFIG_FILE="configs/default_campaign.json"
fi

mkdir -p logs results
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
LOG_FILE="logs/campaign_${MODE}_${TIMESTAMP}.log"

echo "=============================================================================="
echo " Lancement de la campagne ($MODE) avec $WORKERS workers (priorité nice +15)"
echo " Fichier de configuration : $CONFIG_FILE"
echo " Push Git auto en fin     : $AUTO_PUSH"
echo " Journal d'exécution      : $LOG_FILE"
echo "=============================================================================="

# Pré-compilation du cache Numba sur 1 processus avant le fork multiprocessus
python3 -c "from src.variants import generate_variants; from src.runner import _evaluate_single_variant; v=generate_variants()[0]; _evaluate_single_variant((v, [4], [0.5], 5, 42, None)); print('[JIT] Cache Numba initialisé avec succès.')"

# Exécution détachée avec nice +15 et synchronisation Git en fin de calcul
nohup bash -c "nice -n 15 python3 -m src.runner --config '$CONFIG_FILE' --workers '$WORKERS' && if [ '$AUTO_PUSH' == 'true' ]; then ./scripts/sync_results_to_github.sh '$MODE'; fi" > "$LOG_FILE" 2>&1 &
PID=$!

echo " [OK] Campagne lancée en arrière-plan (PID: $PID)"
echo " • Suivre la progression en direct : tail -f $LOG_FILE"
echo " • Vérifier la charge de la VM     : htop"
