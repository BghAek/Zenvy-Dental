# 14 — Production Deploy

How `zenvydental.fr` runs, and how to rebuild it from a blank VPS. Everything
here is a command the founder types; nothing deploys itself (S4-6, docs/01
§Infrastructure). Local development is docs/13-local-dev.md.

## What runs where

One Contabo VPS, Docker Compose, four vhosts behind one nginx and one
certificate. Postgres is Neon, outside the box.

| Host | Serves | Source |
|---|---|---|
| `zenvydental.fr` | landing (Next static export) | image `/srv/landing` |
| `www.zenvydental.fr` | 301 → apex | — |
| `app.zenvydental.fr` | dentist dashboard SPA + `/api` proxy | image `/srv/app` |
| `ops.zenvydental.fr` | owner portal SPA + `/api` proxy | image `/srv/ops` |
| `api.zenvydental.fr` | the API only: webhooks + `/health` | container `api:3001` |

The SPAs proxy `/api` on their **own** origin, so session cookies and Better
Auth's links are same-origin and `CORS_ORIGINS` stays empty (docs/04 §Platform
hardening). `api.` exists for the callers that have no browser — Meta, Stripe,
the uptime monitor.

The three frontends are **baked into the nginx image** (`infra/nginx/Dockerfile`),
so a deploy is a `docker compose build` and the server needs nothing but Docker
and git. `docker-compose.prod.yml` is standalone, not an overlay of the local
file — read the comment at its top before merging the two.

## Requirements

- Contabo VPS, Debian 12 or Ubuntu 24.04, **≥ 4 GB RAM** (the frontends build on
  the box; `bootstrap.sh` adds 2 GB of swap for the same reason).
- The domain at a registrar you control, and a Neon **production** branch.
- A read-only GitHub deploy key for `BghAek/Zenvy-Dental` on the VPS, or clone
  over HTTPS with a token.

## Bootstrap (once, as root)

```bash
scp infra/bootstrap.sh root@<vps>:
ssh root@<vps> 'bash bootstrap.sh'
```

It is idempotent, and it does: apt upgrade + unattended-upgrades · Docker (official
script) · a `zenvy` user in the `docker` group, holding root's authorized key ·
**key-only SSH, no root login** · ufw (22/80/443 only) · 2 GB swap · `/srv/zenvy`
· the nightly backup cron · certbot's renewal hooks.

It refuses to lock SSH down if `zenvy` has no authorized key — check
`ssh zenvy@<vps>` in a second terminal **before** closing the root session.

### Firewall

Docker publishes ports by writing its own iptables rules, which ufw never sees:
a published port is open to the internet whatever `ufw status` says. So nothing
publishes except nginx (80/443) — the API and Redis are reachable only over the
compose network, and locally only on `127.0.0.1` (both compose files).

## DNS

At the registrar, five records to the VPS IPv4 (plus `AAAA` if it has IPv6):

```
zenvydental.fr        A  <vps-ip>
www.zenvydental.fr    A  <vps-ip>
app.zenvydental.fr    A  <vps-ip>
ops.zenvydental.fr    A  <vps-ip>
api.zenvydental.fr    A  <vps-ip>
```

Wait for propagation (`dig +short app.zenvydental.fr`) before asking certbot for
a certificate — Let's Encrypt rate-limits failures.

## TLS

One certificate with all five names, issued while port 80 is free:

```bash
ssh zenvy@<vps>
sudo certbot certonly --standalone --agree-tos -m <founder-email> \
  -d zenvydental.fr -d www.zenvydental.fr \
  -d app.zenvydental.fr -d ops.zenvydental.fr -d api.zenvydental.fr
```

Renewal is certbot's own systemd timer; the hooks `bootstrap.sh` installed stop
and start the nginx container around it, so a renewal costs a few seconds of
downtime every ~60 days. <!-- ponytail: standalone + stop/start beats a webroot mount and an ACME location block; switch if those seconds ever matter -->

If nginx is already running: `cd /srv/zenvy && docker compose -f
docker-compose.prod.yml stop nginx`, issue, then `start nginx`.

## First deploy

```bash
ssh zenvy@<vps>
git clone https://github.com/BghAek/Zenvy-Dental.git /srv/zenvy
cd /srv/zenvy
cp .env.example .env && vi .env      # §Production .env below
./infra/deploy.sh
```

Then, in the provider dashboards:

- **Meta** → webhook callback `https://api.zenvydental.fr/api/v1/webhooks/whatsapp`
  with `META_VERIFY_TOKEN` (docs/api/meta-setup.md).
- **Stripe** (test mode, D5) → endpoint `https://api.zenvydental.fr/api/v1/webhooks/stripe`;
  its signing secret becomes `STRIPE_WEBHOOK_SECRET`.

### Production .env

Everything in `.env.example`, with these values:

| Variable | Production value |
|---|---|
| `DATABASE_URL` | the Neon **production** branch |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32`, once, never rotated casually — rotating it signs every clinic out |
| `BETTER_AUTH_URL` | `https://app.zenvydental.fr` (the dashboard is the public origin) |
| `APP_WEB_URL` | `https://app.zenvydental.fr` |
| `AUTH_TRUSTED_ORIGINS` | `https://ops.zenvydental.fr` — without it the founder's sign-in to the owner portal is refused (403) |
| `CORS_ORIGINS` | leave **unset**: same-origin deploy |
| `REDIS_URL` | leave as is, compose overrides it |
| `BACKUP_HEARTBEAT_URL` | optional, see §Backups |

## Every deploy after

```bash
ssh zenvy@<vps> /srv/zenvy/infra/deploy.sh
```

Pull → build → `prisma migrate deploy` → `up -d --wait`. The `--wait` blocks on
the API's healthcheck, so a deploy that leaves the API unable to reach Postgres
or Redis **exits non-zero**; the previous containers keep serving until the new
ones are healthy.

Roll back to any commit with `infra/deploy.sh <sha>` (it checks the ref out
detached and redeploys). A migration is not rolled back by this — write the
inverse migration instead.

## Backups

`infra/backup.sh` runs nightly at 03:20 from `/etc/cron.d/zenvy-backup`: a
`pg_dump` of the Neon database, gzipped into `/srv/zenvy/backups`, 14 days kept,
logged to `/var/log/zenvy-backup.log`. It writes `zenvy-<date>.sql.gz.part` and
renames it only on success, so a half dump never wears a valid name.

Restore into an empty database:

```bash
cd /srv/zenvy
gunzip -c backups/zenvy-2026-08-07.sql.gz \
  | docker run --rm -i --env-file .env postgres:17-alpine sh -c 'psql "$DATABASE_URL"'
```

Set `BACKUP_HEARTBEAT_URL` in `.env` to an UptimeRobot heartbeat monitor
("expected every 24 hours") and the script pings it after each success — a
backup nobody watches is not a backup. The copy lives on the same VPS: push it
off-box before the first real clinic's data lands (docs/12 R1).

## Uptime monitoring

Free UptimeRobot account, one monitor:

- Type **HTTPS keyword**, URL `https://api.zenvydental.fr/health`,
  keyword `"status":"ok"`, interval 5 min, alert → founder's email.

`/health` answers **200 with `"status":"degraded"`** when Postgres or Redis is
unreachable (docs/06 §Health & uptime), which is why the monitor matches a
keyword and not a status code. The same body carries `queueDepth` — a number
that keeps climbing means the sender is stuck.

## Known gaps at launch

- **Email is not configured.** `sendMail` deliberately throws under
  `NODE_ENV=production` (`apps/api/src/mail/mailer.ts`), so sign-up, email
  verification, password reset and staff invites **fail on the deployed site**
  until a provider is plugged into that one function. Demos run on seeded
  logins; a real clinic cannot self-serve yet. Founder decision needed (docs/12 R10).
- **The demo seed refuses to run in production** (D37), so `zenvydental.fr` has
  no demo clinic — demo from a local or staging stack.
- **Stripe stays in test mode** until the LLC exists (D5).
- One API process, in-memory rate-limit counters (D20), one Redis, no APM.

## Troubleshooting

- `deploy.sh` fails at `--wait` → `docker compose -f docker-compose.prod.yml logs api`;
  usually `DATABASE_URL` or a Neon branch that is asleep. `curl -s https://api.zenvydental.fr/health`
  names the failing dependency.
- 502 on `app.`/`ops.` → the API container is down or unhealthy; the static
  files still serve, so only `/api` is affected.
- Certificate expired → `sudo certbot renew --force-renewal` (it stops and
  starts nginx itself), then `systemctl list-timers | grep certbot` to see why
  the timer had not fired.
- Build killed on the VPS → out of memory; confirm the swapfile is on
  (`swapon --show`) and that nothing else big is running.
- `git pull` refuses because the working tree is detached (after a rollback) →
  `git checkout main` before the next normal deploy.
