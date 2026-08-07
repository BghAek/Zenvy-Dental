#!/usr/bin/env bash
# One-time hardening of a fresh Debian/Ubuntu VPS (docs/14-deploy.md §Bootstrap).
# Idempotent — safe to re-run after changing anything below.
#   scp infra/bootstrap.sh root@<vps>: && ssh root@<vps> 'bash bootstrap.sh'
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-zenvy}"
APP_DIR="${APP_DIR:-/srv/zenvy}"

[ "$(id -u)" -eq 0 ] || {
  echo "Run as root." >&2
  exit 1
}

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw certbot unattended-upgrades

# Security updates without a human in the loop.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# The distro package lags badly and ships no compose v2 plugin.
command -v docker > /dev/null || curl -fsSL https://get.docker.com | sh

id "$DEPLOY_USER" > /dev/null 2>&1 || adduser --disabled-password --gecos '' "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"

# Hand the deploy user the key you are logged in with — the SSH lockdown below
# would otherwise lock everyone out of the box.
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -s /root/.ssh/authorized_keys ]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" \
    /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi
[ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ] || {
  echo "No authorized_keys for $DEPLOY_USER — install one before hardening SSH." >&2
  exit 1
}

# Keys only, no root. fail2ban earns nothing once passwords are off: there is
# no credential left to guess.
cat > /etc/ssh/sshd_config.d/10-zenvy.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
EOF
sshd -t
systemctl reload ssh 2> /dev/null || systemctl reload sshd

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# `next build` on a 4 GB box is the one step here that runs out of memory.
if [ -z "$(swapon --show --noheadings)" ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

# Nightly dump at 03:20 (docs/14-deploy.md §Backups). Fails harmlessly until the
# repository is cloned into $APP_DIR.
touch /var/log/zenvy-backup.log
chown "$DEPLOY_USER" /var/log/zenvy-backup.log
cat > /etc/cron.d/zenvy-backup <<EOF
20 3 * * * $DEPLOY_USER $APP_DIR/infra/backup.sh >> /var/log/zenvy-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/zenvy-backup

# The certificate is issued with the web tier stopped (docs/14-deploy.md §TLS),
# so certbot's own renewal timer has to stop and start it the same way. Both
# hooks run only when a certificate is actually due.
install -d /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post
cat > /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh <<EOF
#!/bin/sh
cd $APP_DIR && docker compose -f docker-compose.prod.yml stop nginx
EOF
cat > /etc/letsencrypt/renewal-hooks/post/start-nginx.sh <<EOF
#!/bin/sh
cd $APP_DIR && docker compose -f docker-compose.prod.yml start nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh \
  /etc/letsencrypt/renewal-hooks/post/start-nginx.sh

echo "Bootstrapped. Next: docs/14-deploy.md §First deploy."
