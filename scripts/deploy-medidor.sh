#!/bin/bash
# Deploy do PWA Medidor
set -e

echo "🚀 Deploying Medidor..."
cd "$(dirname "$0")/../medidor-app"

DEPLOY_URL=$(npx vercel --prod --yes 2>&1 | grep "Production:" | awk '{print $2}')
echo "✅ Deployed: $DEPLOY_URL"

npx vercel alias set "$DEPLOY_URL" vedafacil-medidor.vercel.app
echo "✅ Alias set: https://vedafacil-medidor.vercel.app"
