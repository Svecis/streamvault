#!/usr/bin/env bash
#
#  StreamVault Management CLI
#  Usage: ./manage.sh <command>
#
set -euo pipefail

APP_DIR="/opt/streamvault"
APP_USER="streamvault"
BUN="/home/${APP_USER}/.bun/bin/bun"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ok()  { echo -e "${GREEN}[OK]${NC} $*"; }
warn(){ echo -e "${YELLOW}[!!]${NC} $*"; }
info(){ echo -e "${CYAN}[i]${NC} $*"; }

usage() {
  cat << 'EOF'
StreamVault Management CLI
==========================
Commands:
  status          Show status of all services
  restart         Restart all services
  restart app     Restart Next.js app only
  restart torrent Restart torrent service only
  logs            Tail all logs
  logs app        Tail app logs
  logs torrent    Tail torrent logs
  logs caddy      Tail caddy logs
  invite          Generate a new invite code
  update          Pull latest code and redeploy
  build           Rebuild the Next.js app
  db-reset        Reset the database (DESTRUCTIVE)
  backup          Backup the database and uploads
  help            Show this help
EOF
}

do_status() {
  echo ""
  echo -e "${CYAN}StreamVault Services${NC}"
  echo "────────────────────"
  for svc in streamvault streamvault-torrent caddy; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
      ok "$svc: RUNNING"
    else
      warn "$svc: STOPPED"
    fi
  done
  echo ""

  # Show invite codes
  info "Active invite codes:"
  su - ${APP_USER} -c "cd ${APP_DIR} && ${BUN} -e \"
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    db.inviteCode.findMany({ where: { used: false } }).then(codes => {
      if (codes.length === 0) console.log('  (none available)');
      codes.forEach(c => console.log('  ' + c.code));
      db.\\$disconnect();
    });
  \"" 2>/dev/null || warn "Could not fetch invite codes"
  echo ""
}

do_restart() {
  local target="${1:-all}"
  case "$target" in
    all)
      systemctl restart streamvault streamvault-torrent
      ok "All services restarted"
      ;;
    app)
      systemctl restart streamvault
      ok "App restarted"
      ;;
    torrent)
      systemctl restart streamvault-torrent
      ok "Torrent service restarted"
      ;;
    *)
      warn "Unknown service: $target (use: app, torrent, or all)"
      ;;
  esac
}

do_logs() {
  local target="${1:-all}"
  case "$target" in
    all)     journalctl -u streamvault -u streamvault-torrent -f ;;
    app)     journalctl -u streamvault -f ;;
    torrent) journalctl -u streamvault-torrent -f ;;
    caddy)   journalctl -u caddy -f ;;
    *)       warn "Unknown service: $target" ;;
  esac
}

do_invite() {
  local CODE
  CODE=$(openssl rand -base64 8 | tr -d '/+=' | head -c 8)

  su - ${APP_USER} -c "cd ${APP_DIR} && ${BUN} -e \"
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();
    db.inviteCode.create({ data: { code: '${CODE}' } }).then(() => {
      console.log('${CODE}');
      db.\\$disconnect();
    }).catch(e => { console.error(e); db.\\$disconnect(); });
  \"" 2>/dev/null && ok "Invite code: ${CODE}" || warn "Failed to generate invite code"
}

do_update() {
  info "Pulling latest changes..."
  cd "${APP_DIR}"
  su - ${APP_USER} -c "cd ${APP_DIR} && git pull origin main"

  info "Installing dependencies..."
  su - ${APP_USER} -c "cd ${APP_DIR} && ${BUN} install"
  su - ${APP_USER} -c "cd ${APP_DIR}/mini-services/torrent-service && ${BUN} install"

  info "Rebuilding..."
  su - ${APP_USER} -c "cd ${APP_DIR} && ${BUN} run build"

  info "Restarting services..."
  systemctl restart streamvault streamvault-torrent

  ok "Update complete!"
}

do_build() {
  info "Building Next.js..."
  su - ${APP_USER} -c "cd ${APP_DIR} && ${BUN} run build"
  systemctl restart streamvault
  ok "Build complete and app restarted."
}

do_db_reset() {
  warn "This will DELETE all data. Type 'yes' to confirm:"
  read -r CONFIRM
  if [[ "$CONFIRM" != "yes" ]]; then
    info "Aborted."
    return
  fi

  systemctl stop streamvault
  rm -f "${APP_DIR}/db/production.db" "${APP_DIR}/db/production.db-journal"
  su - ${APP_USER} -c "cd ${APP_DIR} && ${BUN} run db:push"
  systemctl start streamvault
  ok "Database reset."
  do_invite
}

do_backup() {
  local BACKUP_DIR="/opt/streamvault-backups"
  local TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  local BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"

  mkdir -p "${BACKUP_PATH}"
  cp "${APP_DIR}/db/production.db" "${BACKUP_PATH}/" 2>/dev/null || warn "No database file found"
  cp -r "${APP_DIR}/uploads" "${BACKUP_PATH}/" 2>/dev/null || warn "No uploads directory"

  # Compress
  tar -czf "${BACKUP_DIR}/streamvault-${TIMESTAMP}.tar.gz" -C "${BACKUP_DIR}" "${TIMESTAMP}"
  rm -rf "${BACKUP_PATH}"

  # Keep only last 5 backups
  ls -t "${BACKUP_DIR}"/streamvault-*.tar.gz | tail -n +6 | xargs -r rm

  ok "Backup saved: ${BACKUP_DIR}/streamvault-${TIMESTAMP}.tar.gz"
}

# ── Main ─────────────────────────────────────────────────────────────────────
COMMAND="${1:-help}"
shift 2>/dev/null || true

case "$COMMAND" in
  status)   do_status ;;
  restart)  do_restart "${1:-all}" ;;
  logs)     do_logs "${1:-all}" ;;
  invite)   do_invite ;;
  update)   do_update ;;
  build)    do_build ;;
  db-reset) do_db_reset ;;
  backup)   do_backup ;;
  help|*)   usage ;;
esac
