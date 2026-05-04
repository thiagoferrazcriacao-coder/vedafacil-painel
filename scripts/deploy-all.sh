#!/bin/bash
# Deploy completo — todos os 3 apps
set -e
SCRIPTS="$(dirname "$0")"

echo "══════════════════════════════════════"
echo "  VEDAFÁCIL — Deploy Completo"
echo "══════════════════════════════════════"

bash "$SCRIPTS/deploy-painel.sh"
echo ""
bash "$SCRIPTS/deploy-medidor.sh"
echo ""
bash "$SCRIPTS/deploy-aplicador.sh"
echo ""

echo "══════════════════════════════════════"
echo "  ✅ Todos os apps atualizados!"
echo "  Painel:    https://vedafacil-painel.vercel.app"
echo "  Medidor:   https://vedafacil-medidor.vercel.app"
echo "  Aplicador: https://vedafacil-aplicador.vercel.app"
echo "══════════════════════════════════════"
