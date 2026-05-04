#!/bin/bash
# Backup completo do MongoDB Atlas → arquivo local comprimido
# Uso: bash scripts/backup-mongodb.sh
# Requer: mongodump instalado (https://www.mongodb.com/docs/database-tools/)
# A MONGODB_URI deve estar em painel/.env ou exportada no shell

set -e

BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUTPUT="$BACKUP_DIR/vedafacil_$TIMESTAMP"

# Lê MONGODB_URI do .env do painel se não estiver no ambiente
if [ -z "$MONGODB_URI" ]; then
  ENV_FILE="$(dirname "$0")/../painel/.env"
  if [ -f "$ENV_FILE" ]; then
    export $(grep -E "^MONGODB_URI=" "$ENV_FILE" | xargs)
  fi
fi

if [ -z "$MONGODB_URI" ]; then
  echo "❌ MONGODB_URI não encontrada."
  echo "   Exporte-a antes de rodar: export MONGODB_URI='mongodb+srv://...'"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "📦 Iniciando backup Vedafácil — $TIMESTAMP"
echo "   Destino: $OUTPUT.gz"

mongodump \
  --uri="$MONGODB_URI" \
  --out="$OUTPUT" \
  --quiet

tar -czf "$OUTPUT.tar.gz" -C "$BACKUP_DIR" "vedafacil_$TIMESTAMP"
rm -rf "$OUTPUT"

SIZE=$(du -sh "$OUTPUT.tar.gz" | cut -f1)
echo "✅ Backup concluído: $OUTPUT.tar.gz ($SIZE)"

# Mantém apenas os 10 backups mais recentes
cd "$BACKUP_DIR"
ls -t vedafacil_*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm --
TOTAL=$(ls vedafacil_*.tar.gz 2>/dev/null | wc -l)
echo "   Backups retidos: $TOTAL (máximo 10)"
