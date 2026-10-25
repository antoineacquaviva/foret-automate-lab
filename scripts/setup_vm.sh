#!/usr/bin/env bash
# ==============================================================================
# Initialisation de l'environnement sur la VM Oracle (Ubuntu / Debian)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "[VM-SETUP] 1/4 Vérification des paquets système (python3-venv, git, htop, tmux)..."
if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq
    sudo apt-get install -y -qq python3-venv python3-pip python3-dev build-essential git htop tmux
fi

echo "[VM-SETUP] 2/4 Configuration des permissions d'exécution..."
chmod +x scripts/*.sh

echo "[VM-SETUP] 3/4 Création de l'environnement virtuel (.venv) et installation de Numba/NumPy..."
if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q

echo "[VM-SETUP] 4/4 Exécution de la suite de tests unitaires et pré-chauffage JIT..."
python3 -m unittest discover -s tests -v

echo "=============================================================================="
echo " [OK] La VM est prête ! Pour lancer une campagne : ./scripts/run_oci_campaign.sh full 14"
echo "=============================================================================="
