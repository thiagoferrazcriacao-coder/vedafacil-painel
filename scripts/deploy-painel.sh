#!/bin/bash
# Deploy do Painel (frontend + backend)
set -e

echo "🚀 Deploying Painel..."
cd "$(dirname "$0")/../painel"

npm run build
DEPLOY_URL=$(npx vercel --prod --yes 2>&1 | grep "Production:" | awk '{print $2}')
echo "✅ Build deployed: $DEPLOY_URL"

npx vercel alias set "$DEPLOY_URL" vedafacil-painel.vercel.app
echo "✅ Alias set: https://vedafacil-painel.vercel.app"
