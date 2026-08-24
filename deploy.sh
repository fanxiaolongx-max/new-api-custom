#!/usr/bin/env bash
set -e

# ==============================================================================
# Dragon API - Automated Build, Deploy & Disk Hygiene Script
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "===> [1/4] Building web frontend bundle with Bun..."
docker run --rm \
  -v "$SCRIPT_DIR/web:/app" \
  -w /app \
  oven/bun:1 bun run build

echo "===> [2/4] Building new-api Docker container..."
docker compose build new-api

echo "===> [3/4] Recreating & restarting service containers..."
docker compose up -d --remove-orphans new-api gateway chat2api

echo "===> [4/4] Auto-cleaning Docker build cache & dangling images..."
# Reclaim dangling images and limit build cache to 2GB to prevent disk full
docker image prune -f
docker builder prune --reserved-space 2GB -f || true

echo "===> Deployment completed successfully!"
df -h /
