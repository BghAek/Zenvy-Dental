#!/usr/bin/env bash
# Nightly pg_dump of the Neon database onto the VPS. Installed as a cron job by
# infra/bootstrap.sh; restore procedure in docs/14-deploy.md §Backups.
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-/srv/zenvy/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
# pg_dump refuses to dump a newer server: keep this at or above Neon's version
# (`select version()`).
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

# A dump is every patient record in one file: owner-only, dir and file.
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077
out="$BACKUP_DIR/zenvy-$(date +%F).sql.gz"

# --env-file, not `source .env`: a Neon URL is full of & and ?, which a shell
# would gladly interpret. Docker passes the line through verbatim.
docker run --rm --env-file .env "$PG_IMAGE" \
  sh -c 'pg_dump --no-owner --no-privileges "$DATABASE_URL"' | gzip -9 > "$out.part"

# Named only once it is whole — pipefail above means a failed dump never gets here.
mv "$out.part" "$out"
find "$BACKUP_DIR" -name 'zenvy-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

# ponytail: one copy, on the same disk as nothing else that matters. Push it
# off-box (S3/rclone) before the first real clinic's data lands (docs/12 R1).

# Optional heartbeat: an UptimeRobot "expected every 24h" monitor alerts when
# this stops arriving — a backup nobody watches is not a backup.
# Tolerates `export ` prefixes, CRLF endings, and quoted values — this line IS
# the alerting for a silent backup failure, so its own parse must not be the
# silent failure.
heartbeat=$(sed -n 's/^\(export \)\{0,1\}BACKUP_HEARTBEAT_URL=//p' .env | tail -n1 | tr -d '\r' | sed -e 's/^["'\'']//' -e 's/["'\'']$//' || true)
if [ -n "$heartbeat" ]; then
  curl -fsS --max-time 10 "$heartbeat" > /dev/null
fi

echo "$(date -Is) backed up to $out ($(du -h "$out" | cut -f1))"
