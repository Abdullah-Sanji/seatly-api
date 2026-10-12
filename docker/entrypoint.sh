#!/bin/sh
set -e
echo "[entrypoint] applying migrations"
./node_modules/.bin/prisma migrate deploy
echo "[entrypoint] seeding (idempotent)"
node dist/seed/run-seed.js
echo "[entrypoint] starting api"
exec node dist/main.js
