#!/bin/sh
set -e

cd "$(dirname "$0")"

git pull origin main
docker compose --env-file .env.docker -f docker-compose.prod.yml pull backend frontend
docker compose --env-file .env.docker -f docker-compose.prod.yml up -d
docker compose --env-file .env.docker -f docker-compose.prod.yml exec backend npx prisma migrate deploy
docker compose --env-file .env.docker -f docker-compose.prod.yml ps
