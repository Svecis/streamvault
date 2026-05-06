#!/usr/bin/env bash
#
#  StreamVault - VPS Installation Script
#  ======================================
#  Target: Ubuntu 22.04/24.04 LTS (4 cores, 8GB RAM, 100Mbps)
#  Domain: sveckys.top
#
#  Usage:
#    curl -fsSL https://raw.githubusercontent.com/Svecis/streamvault/main/install.sh | sudo bash
#
#  Or after cloning:
#    sudo bash install.sh
#
set -euo pipefail

# ── Configuration ──────────────────────────────────────────────────────────────
APP_NAME="streamvault"
APP_USER="streamvault"
APP_DIR="/opt/streamvault"
REPO_URL="https://github.com/Svecis/streamvault.git"
DOMAIN="sveckys.top"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[StreamVault]${NC} $*"; }
warn() { echo -e "${YELLOW}[StreamVault]${NC} $*"; }
err()  { echo -e "${RED}[StreamVault]${NC} $*" >&2; }

# ── Preflight Checks ──────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  err "This script must be run as root. Use: sudo bash install.sh"
  exit 1
fi

log "Starting StreamVault installation on ${DOMAIN}..."
log "Target directory: ${APP_DIR}"

# ── 1. System Packages ────────────────────────────────────────────────────────
log "Updating system packages..."
apt-get update -qq

log "Installing core dependencies..."
apt-get install -y -qq \
  curl wget git unzip build-essential python3 \
  ca-certificates gnupg lsb-release \
  ufw fail2ban \
  > /dev/null 2>&1

# ── 2. Firewall Setup ────────────────────────────────────────────────────────
log "Configuring firewall (UFW)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw --force enable
log "Firewall configured: SSH(22), HTTP(80), HTTPS(443) open"

# ── 3. Fail2ban ──────────────────────────────────────────────────────────────
log "Configuring fail2ban..."
cat > /etc/fail2ban/jail.local << 'F2B'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
F2B
systemctl enable fail2ban && systemctl restart fail2ban

# ── 4. Create App User ───────────────────────────────────────────────────────
if id "${APP_USER}" &>/dev/null; then
  log "User '${APP_USER}' already exists, skipping."
else
  log "Creating system user '${APP_USER}'..."
  useradd -r -m -d /home/${APP_USER} -s /bin/bash ${APP_USER}
  log "User '${APP_USER}' created."
fi

# ── 5. Install Bun ───────────────────────────────────────────────────────────
if su - ${APP_USER} -c "command -v bun" &>/dev/null; then
  log "Bun already installed, skipping."
else
  log "Installing Bun..."
  su - ${APP_USER} -c 'curl -fsSL https://bun.sh/install | bash'
  log "Bun installed."
fi

# ── 6. Clone / Update Repository ─────────────────────────────────────────────
if [[ -d "${APP_DIR}/.git" ]]; then
  log "Repository exists, pulling latest changes..."
  cd "${APP_DIR}"
  git fetch origin
  git reset --hard origin/main
else
  log "Cloning StreamVault repository..."
  git clone "${REPO_URL}" "${APP_DIR}"
  cd "${APP_DIR}"
fi

chown -R ${APP_USER}:${APP_USER} "${APP_DIR}"

# ── 7. Create Required Directories ──────────────────────────────────────────
log "Creating data directories..."
mkdir -p "${APP_DIR}/uploads"
mkdir -p "${APP_DIR}/torrents"
mkdir -p "${APP_DIR}/db"
mkdir -p /var/log/caddy

chown -R ${APP_USER}:${APP_USER} "${APP_DIR}/uploads"
chown -R ${APP_USER}:${APP_USER} "${APP_DIR}/torrents"
chown -R ${APP_USER}:${APP_USER} "${APP_DIR}/db"
chown -R caddy:caddy /var/log/caddy

# ── 8. Environment Configuration ─────────────────────────────────────────────
# Generate a random secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)

# Always write the .env file that Prisma and Next.js will read
log "Creating .env with production values..."
cat > "${APP_DIR}/.env" << ENV
# StreamVault Production Environment
DATABASE_URL="file:${APP_DIR}/db/production.db"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"
NEXTAUTH_URL="https://${DOMAIN}"
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
TORRENT_DIR="${APP_DIR}/torrents"
UPLOAD_DIR="${APP_DIR}/uploads"
TORRENT_SERVICE_URL="http://127.0.0.1:3001"
ENV
chown ${APP_USER}:${APP_USER} "${APP_DIR}/.env"
log ".env created with generated secrets."

# ── 9. Install Dependencies ──────────────────────────────────────────────────
log "Installing Node.js dependencies..."
su - ${APP_USER} -c "cd ${APP_DIR} && /home/${APP_USER}/.bun/bin/bun install --frozen-lockfile 2>/dev/null || /home/${APP_USER}/.bun/bin/bun install"

log "Installing torrent service dependencies..."
su - ${APP_USER} -c "cd ${APP_DIR}/mini-services/torrent-service && /home/${APP_USER}/.bun/bin/bun install"

# ── 10. Database Setup ───────────────────────────────────────────────────────
log "Setting up SQLite database..."
# Prisma reads DATABASE_URL from .env — which we just created with the correct path
su - ${APP_USER} -c "cd ${APP_DIR} && DATABASE_URL='file:${APP_DIR}/db/production.db' /home/${APP_USER}/.bun/bin/bun run db:push"

# ── 11. Build Next.js ───────────────────────────────────────────────────────
log "Building Next.js application (this may take a minute)..."
su - ${APP_USER} -c "cd ${APP_DIR} && DATABASE_URL='file:${APP_DIR}/db/production.db' /home/${APP_USER}/.bun/bin/bun run build"
log "Build complete."

# ── 12. Install Caddy ───────────────────────────────────────────────────────
if command -v caddy &>/dev/null; then
  log "Caddy already installed, skipping."
else
  log "Installing Caddy web server..."
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl > /dev/null 2>&1
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
  log "Caddy installed."
fi

# ── 13. Configure Caddy ─────────────────────────────────────────────────────
log "Configuring Caddy for ${DOMAIN}..."

cat > /etc/caddy/Caddyfile << CADDY
${DOMAIN} {
    reverse_proxy localhost:3000

    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        Referrer-Policy strict-origin-when-cross-origin
    }

    # Static assets caching (handle preserves path, handle_path strips it)
    handle /_next/static/* {
        reverse_proxy localhost:3000
        header Cache-Control "public, max-age=31536000, immutable"
    }
}

www.${DOMAIN} {
    redir https://${DOMAIN}{uri} permanent
}
CADDY

chown caddy:caddy /etc/caddy/Caddyfile
log "Caddy configured."

# ── 14. Systemd Services ─────────────────────────────────────────────────────
log "Installing systemd services..."

# Main Next.js app service
cat > /etc/systemd/system/streamvault.service << SVC
[Unit]
Description=StreamVault - Next.js Web App
After=network.target streamvault-torrent.service
Wants=streamvault-torrent.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/home/${APP_USER}/.bun/bin/bun ${APP_DIR}/.next/standalone/server.js
Restart=on-failure
RestartSec=10
StartLimitBurst=5
StartLimitIntervalSec=60
EnvironmentFile=${APP_DIR}/.env
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3000
LimitNOFILE=65536
MemoryMax=4G
CPUQuota=200%
StandardOutput=journal
StandardError=journal
SyslogIdentifier=streamvault

[Install]
WantedBy=multi-user.target
SVC

# Torrent service
cat > /etc/systemd/system/streamvault-torrent.service << SVC
[Unit]
Description=StreamVault - WebTorrent Service
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}/mini-services/torrent-service
ExecStart=/home/${APP_USER}/.bun/bin/bun run index.ts
Restart=on-failure
RestartSec=5
StartLimitBurst=10
StartLimitIntervalSec=60
Environment=PORT=3001
Environment=TORRENT_DIR=${APP_DIR}/torrents
Environment=NODE_ENV=production
LimitNOFILE=65536
MemoryMax=3G
CPUQuota=150%
StandardOutput=journal
StandardError=journal
SyslogIdentifier=streamvault-torrent

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
log "Systemd services installed."

# ── 15. Start Everything ─────────────────────────────────────────────────────
log "Starting StreamVault services..."

# Start torrent service first (Next.js depends on it)
systemctl enable streamvault-torrent caddy
systemctl restart streamvault-torrent
log "Waiting for torrent service to be ready..."
sleep 5

# Verify torrent service is up
for i in $(seq 1 10); do
  if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    log "Torrent service is ready!"
    break
  fi
  if [[ $i -eq 10 ]]; then
    warn "Torrent service not responding yet, continuing anyway..."
  fi
  sleep 2
done

# Start the Next.js app
systemctl enable streamvault
systemctl restart streamvault
sleep 3

# Start Caddy
systemctl restart caddy

# ── 16. Verify ───────────────────────────────────────────────────────────────
log "Verifying services..."
sleep 3

if systemctl is-active --quiet streamvault; then
  log "${GREEN}Next.js app: RUNNING${NC} (port 3000)"
else
  warn "Next.js app: NOT RUNNING — check: journalctl -u streamvault -n 50"
fi

if systemctl is-active --quiet streamvault-torrent; then
  log "${GREEN}Torrent service: RUNNING${NC} (port 3001)"
else
  warn "Torrent service: NOT RUNNING — check: journalctl -u streamvault-torrent -n 50"
fi

if systemctl is-active --quiet caddy; then
  log "${GREEN}Caddy: RUNNING${NC} (reverse proxy + HTTPS)"
else
  warn "Caddy: NOT RUNNING — check: journalctl -u caddy -n 50"
fi

# ── 17. Generate First Invite Code ───────────────────────────────────────────
log "Generating first invite code..."

# Wait for the app to be ready
for i in $(seq 1 15); do
  if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    break
  fi
  sleep 2
done

# Create invite code directly in the database using Prisma
INVITE_CODE=$(openssl rand -base64 8 | tr -d '/+=' | head -c 8)

su - ${APP_USER} -c "cd ${APP_DIR} && DATABASE_URL='file:${APP_DIR}/db/production.db' /home/${APP_USER}/.bun/bin/bun -e \"
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
db.inviteCode.create({ data: { code: '${INVITE_CODE}' } }).then(() => {
  console.log('Invite code created');
  db.\\$disconnect();
}).catch(e => { console.error(e); db.\\$disconnect(); });
\"" 2>/dev/null || warn "Could not auto-generate invite code (you can create one from the admin panel)"

# ── 18. Summary ──────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                 StreamVault Installation Complete           ║${NC}"
echo -e "${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║${NC}                                                            ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}Site:${NC}     https://${DOMAIN}                        ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}App dir:${NC}  ${APP_DIR}                            ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${GREEN}Invite:${NC}   ${INVITE_CODE}                                  ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                            ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${YELLOW}Important:${NC}                                                ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  1. Point DNS for ${DOMAIN} to this server's IP     ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  2. Caddy will auto-provision HTTPS via Let's Encrypt       ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  3. Use invite code above to create your first account      ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                            ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  ${YELLOW}Useful commands:${NC}                                          ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  sudo ${APP_DIR}/manage.sh status                           ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  sudo ${APP_DIR}/manage.sh invite                           ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  sudo ${APP_DIR}/manage.sh logs app                         ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  sudo ${APP_DIR}/manage.sh update                           ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}                                                            ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
