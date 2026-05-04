#!/bin/bash
# Instala os git hooks de proteção no repositório local
# Rodar UMA VEZ após clonar: bash scripts/install-hooks.sh

set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SRC_DIR="$REPO_ROOT/scripts/git-hooks"

echo "🔧 Instalando git hooks de proteção..."

for hook in pre-push pre-commit; do
  if [ -f "$SRC_DIR/$hook" ]; then
    cp "$SRC_DIR/$hook" "$HOOKS_DIR/$hook"
    chmod +x "$HOOKS_DIR/$hook"
    echo "  ✅ $hook instalado"
  fi
done

echo ""
echo "✅ Hooks instalados! Proteções ativas:"
echo "   • pre-commit: bloqueia .env, tokens e credenciais hardcoded"
echo "   • pre-push:   bloqueia force push em main/master"
