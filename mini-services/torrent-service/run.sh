#!/bin/bash
cd "$(dirname "$0")"
while true; do
  echo "[$(date)] Starting torrent service..."
  node --import tsx index.ts 2>&1
  echo "[$(date)] Torrent service exited, restarting in 3s..."
  sleep 3
done
