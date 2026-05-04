#!/bin/bash
# Deploy do PWA Aplicador
set -e

echo "🚀 Deploying Aplicador..."
cd "$(dirname "$0")/../aplicador-app"

DEPLOY_URL=$(npx vercel --prod --yes 2>&1 | grep "Production:" | awk '{print $2}')
echo "✅ Deployed: $DEPLOY_URL"

npx vercel alias set "$DEPLOY_URL" vedafacil-aplicador.vercel.app
echo "✅ Alias set: https://vedafacil-aplicador.vercel.app"
