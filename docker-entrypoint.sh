#!/bin/sh
set -e

echo "🐳 PetfoodTN backend — démarrage…"

if echo "$DATABASE_URL" | grep -q "^postgresql"; then
  echo "📦 Base PostgreSQL détectée — adaptation Prisma"
  sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma
fi

if echo "$DATABASE_URL" | grep -q "@db:"; then
  echo "⏳ Attente PostgreSQL…"
  until nc -z db 5432; do
    sleep 1
  done
  echo "✅ PostgreSQL prêt"
fi

npx prisma generate
npx prisma db push --accept-data-loss

if [ "$RUN_SEED" = "true" ]; then
  echo "🌱 Seed données démo…"
  node scripts/seed-missing.js || echo "⚠️ Seed ignoré (non bloquant)"
fi

exec "$@"
