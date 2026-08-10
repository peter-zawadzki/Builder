# Production Deployment (AWS)

Builder runs in production on a single EC2 instance — Postgres, the Node
API, and nginx all on one box. No load balancer, no managed DB, no CI/CD
yet. This doc is the map back to everything that was provisioned, so a
future session (or person) doesn't have to reverse-engineer it from the
AWS Console.

## Current status

- **Live at:** `https://build.yullr.com` (plain `http://` redirects to
  `https://`; the bare IP `http://52.86.78.62` still works too but has no
  TLS cert of its own)
- **Auth:** reusing the existing Clerk **development** instance/keys
  (not a separate production Clerk instance). Fine for the current scale
  (~20 internal users); revisit if that changes.
- **Database:** Postgres with all migrations in `db/migrations/` applied
  (12 as of this writing, through `0012_site_assessments.sql`); the running
  app itself reads/writes almost entirely through the `legacy_records` JSONB
  layer (`0010_legacy_records.sql`), not the normalized tables — see
  `db/README.md`, "Current runtime data model." `peter@yullr.com` is
  auto-provisioned as `super_admin` on first login (see `server/auth.ts` —
  email match is hardcoded there, no manual seeding was done or is needed).
- **Last deployed:** 2026-08-07 — ODIN auto-generated video tutorials
  (`server/odin/video/*`), migration `0020_odin_video.sql` applied. This
  deploy needed one-time setup beyond the usual rsync/build/restart — see
  "One-time setup for the video-tutorial feature" below — since it's the
  first thing on this box to need a real browser (Playwright/Chromium) and
  audio/video encoding (ffmpeg). Also added two new env vars:
  `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`.

## AWS resources

| Resource | Value |
|---|---|
| Account | `905418304965` |
| Region | `us-east-1` |
| IAM user (CLI access) | `peteradmin` — in the `Admin` group (`AdministratorAccess`) |
| VPC | `vpc-03d3abb501a2449b2` (default VPC) |
| Subnet | `subnet-089493afbf2d245af` (`us-east-1a`) |
| EC2 instance | `i-04172aadff2b10700` — `t4g.small`, arm64, Amazon Linux 2023 |
| AMI | `ami-00b18f89b5bdfb338` (`al2023-ami-kernel-default-arm64`, resolved via SSM at launch time — will drift as Amazon publishes newer AMIs) |
| Public IP | `52.86.78.62` — **Elastic IP** (`eipalloc-0e6c03fbcee9da259`), so it now survives stop/start, not just reboot |
| Security group | `sg-0e99a420292eb325e` (`builder-prod-sg`) — port 22 restricted to one IP (whoever set this up; **update the rule if that IP changes** or SSH will start failing), ports 80/443 open to `0.0.0.0/0` |
| SSH key pair | `builder-prod` — private key lives at `~/.ssh/builder-prod.pem` (local machine only, not in the repo) |
| IAM role (instance profile) | `builder-prod-ec2-role` / `builder-prod-ec2-profile` — inline policy `builder-prod-s3-access` scoped to the S3 bucket below (Get/Put/Delete/List) |
| S3 bucket | `yullr-builder-prod` — private (all public access blocked), AES256 default encryption, versioning on. **Not yet wired into the app** — created for future file-upload use (logos/signatures currently live as base64 in Postgres JSONB) |

The instance originally ran on its auto-assigned public IP (no EIP) —
the account was at its default 5-EIP-per-region quota, already fully
used by unrelated projects (other EC2 instances plus load balancer/RDS
network interfaces for YULLR-PROD/YULLR-STAGE). Rather than release
someone else's IP, we filed an EC2-VPC Elastic IPs quota increase
(5 → 15) via Service Quotas, which auto-approved within ~15 minutes;
`52.86.78.62` was then allocated and associated once it cleared.
Note for future SSH: since AWS recycles IPs, this address may carry a
stale `known_hosts` entry from whoever had it before — if you see "Host
key verification failed", run `ssh-keygen -R 52.86.78.62` and reconnect
with `-o StrictHostKeyChecking=accept-new`.

## What's installed on the instance

- **Node 24** (`dnf install nodejs24`, symlinked to `/usr/bin/node` /
  `/usr/bin/npm`) — matches `@zxing/library`'s `engines` requirement
  (`>=24`), which Node 22 triggered a warning on.
- **PostgreSQL 15** (`postgresql15-server`), initialized at
  `/var/lib/pgsql/data`. `pg_hba.conf` was changed from the default
  `ident` to `scram-sha-256` for the `127.0.0.1/32` and `::1/128` host
  entries, so the app can connect over TCP with a username/password.
  - Database: `yullr_builder`
  - Role: `builder` (password is in the server's `.env.local` —
    see below, not recorded here)
- **nginx 1.30** — see config below.

## App layout on the server

- Code lives at `/home/ec2-user/builder`, deployed by **`rsync` from a
  local machine's working copy** — **not `git clone`**. There is no
  `.git` directory on the server at all right now. This means:
  - GitHub pushes do **not** automatically reach the server.
  - Shipping a change means manually repeating the deploy steps below
    from a machine that has the repo checked out.
  - Switching this to a git-based `clone`/`pull` deploy (needs a GitHub
    deploy key or token, since the repo is private) is planned — see
    "Known gaps."
- `chmod 711 /home/ec2-user` was required so nginx (running as its own
  `nginx` user) can traverse into the home directory to serve
  `builder/dist` — the directory itself stays non-listable.

### Environment (`/home/ec2-user/builder/.env.local`)

Same shape as local dev's `.env.local`, with two values patched for
production (everything else — Clerk keys, Slack webhook, Postmark keys —
was copied as-is from local dev, since we're intentionally reusing the
dev Clerk instance):

- `DATABASE_URL` → `postgresql://builder:<password>@127.0.0.1:5432/yullr_builder`
- `APP_BASE_URL` → `https://build.yullr.com` (used to build "View in
  Builder" links in Slack messages)
- `API_PORT` → `8787` (unchanged from dev default, matches the nginx
  proxy target)

### API server — systemd unit

`/etc/systemd/system/builder-api.service`:

```ini
[Unit]
Description=Builder API server
After=network.target postgresql.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/builder
ExecStart=/home/ec2-user/builder/node_modules/.bin/tsx server/index.ts
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Runs the TypeScript server directly via `tsx` (no separate compile
step) — enabled and started, auto-restarts on crash and on instance
boot. Check it with `sudo systemctl status builder-api`.

### nginx — reverse proxy + static files + TLS

`/etc/nginx/conf.d/builder.conf` (the HTTPS server block was added
automatically by `certbot --nginx`, not written by hand):

```nginx
server {
    server_name build.yullr.com;

    root /home/ec2-user/builder/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri /index.html;
    }

    listen [::]:443 ssl ipv6only=on; # managed by Certbot
    listen 443 ssl; # managed by Certbot
    ssl_certificate /etc/letsencrypt/live/build.yullr.com/fullchain.pem; # managed by Certbot
    ssl_certificate_key /etc/letsencrypt/live/build.yullr.com/privkey.pem; # managed by Certbot
    include /etc/letsencrypt/options-ssl-nginx.conf; # managed by Certbot
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem; # managed by Certbot
}
server {
    if ($host = build.yullr.com) {
        return 301 https://$host$request_uri;
    } # managed by Certbot

    listen 80;
    listen [::]:80;
    server_name build.yullr.com;
    return 404; # managed by Certbot
}
```

Note: the distro-default `server { listen 80; server_name _; ... }`
block that ships in `/etc/nginx/nginx.conf` was **removed** (it
conflicted with the one above, before certbot ran) — a backup of the
original file was left at `/etc/nginx/nginx.conf.orig` on the instance.

**Certificate:** issued by Let's Encrypt via `certbot --nginx -d
build.yullr.com`, expires 2026-10-22. Auto-renewal is handled by the
`certbot-renew.timer` systemd timer (runs twice daily, only actually
renews within ~30 days of expiry) — this had to be manually enabled
after install (`sudo systemctl enable --now certbot-renew.timer`; the
package doesn't enable it by default on AL2023). Verified working with
`sudo certbot renew --dry-run`.

## Deploying a code change (current manual process)

From a machine with the repo checked out and `~/.ssh/builder-prod.pem`:

```bash
rsync -az --delete \
  --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '.env.local' --exclude '.DS_Store' \
  -e "ssh -i ~/.ssh/builder-prod.pem" \
  /path/to/Builder/ ec2-user@52.86.78.62:/home/ec2-user/builder/

ssh -i ~/.ssh/builder-prod.pem ec2-user@52.86.78.62 '
  cd /home/ec2-user/builder &&
  npm install &&
  npm run build &&
  sudo systemctl restart builder-api
'
```

If `server/routes/legacy.ts` or another server file changed but the DB
schema didn't, that's all that's needed. If a new file was added under
`db/migrations/`, also run:

```bash
ssh -i ~/.ssh/builder-prod.pem ec2-user@52.86.78.62 '
  cd /home/ec2-user/builder &&
  DATABASE_URL=$(grep "^DATABASE_URL=" .env.local | cut -d= -f2-) ./db/migrate.sh
'
```
(`migrate.sh` reads `DATABASE_URL` from the shell environment, not from
`.env.local` directly — it has its own fallback to a local dev default,
so it needs to be passed in explicitly like this.)

**Last step of every real deploy** (anything a staff member would notice —
new features, meaningful fixes; skip for pure docs/refactor/typo changes):
log it so the daily digest's company summary (`server/digest/
companySummary.ts`) can mention it. Production has no git history (`.git`
is excluded from the rsync above), so this manual log is the only record
of what shipped.

```bash
ssh -i ~/.ssh/builder-prod.pem ec2-user@52.86.78.62 '
  cd /home/ec2-user/builder &&
  npx tsx server/digest/logDeployment.ts "Short human-readable summary of what shipped."
'
```

## One-time setup for the video-tutorial feature (already done, documented for reference)

The ODIN video pipeline (`server/odin/video/*`) needs a real Chromium browser
and ffmpeg on the server — nothing before it did. This box is Amazon Linux
2023, which Playwright doesn't officially support: `npx playwright install
--with-deps` fails outright (`apt-get: command not found` — it assumes
Ubuntu/Debian). Done instead:

```bash
# Chromium's shared-library dependencies, translated from Playwright's
# Debian package list to their AL2023/RHEL equivalents:
sudo dnf install -y atk at-spi2-atk cups-libs libxcb libxkbcommon alsa-lib \
  mesa-libgbm libX11 libXext cairo pango libXcomposite libXdamage libXfixes \
  libXrandr at-spi2-core

# Then just the browser binary itself (no --with-deps, since that's what fails):
cd /home/ec2-user/builder && npx playwright install chromium
```
Verify with a quick `chromium.launch()` smoke test if anything changes here —
"BEWARE: your OS is not officially supported" in the output is expected and
harmless (it falls back to an Ubuntu-built binary that runs fine once the
libraries above are present).

**ffmpeg version gotcha:** `@ffmpeg-installer/linux-arm64` bundles a much
older static ffmpeg build than what's on a typical dev machine — old enough
that `adelay`'s `all=1` shorthand and `amix`'s `normalize` option don't
exist (`ffmpeg -h filter=adelay` / `-h filter=amix` on the box confirms
exactly which options a given build actually has). `server/odin/video/
assemble.ts`'s filter graph is written to avoid both — explicit per-channel
delays instead of `all=1`, and a manual `volume` boost instead of
`normalize=0` to counter amix's unconditional divide-by-input-count. If that
file's filter graph changes again, re-verify against this box's actual
ffmpeg (`node_modules/@ffmpeg-installer/linux-arm64/ffmpeg -h filter=...`),
not just local dev's.

## One-time setup for the daily digest email (already done, documented for reference)

`server/digest/run.ts` sends every staff member a Mon-Fri morning email
(outstanding action items, new assigned notes, stale projects/proposals, and
a shared company-activity paragraph). There's no in-process scheduler in
this app, so it's driven by a systemd timer — the same mechanism this box
already uses for `certbot-renew.timer`/`logrotate.timer`.

```ini
# /etc/systemd/system/builder-digest.service
[Unit]
Description=Builder daily staff digest

[Service]
Type=oneshot
User=ec2-user
WorkingDirectory=/home/ec2-user/builder
ExecStart=/usr/bin/npx tsx server/digest/run.ts
EnvironmentFile=/home/ec2-user/builder/.env.local
```

```ini
# /etc/systemd/system/builder-digest.timer
[Unit]
Description=Run the Builder daily digest Mon-Fri mornings

[Timer]
OnCalendar=Mon..Fri 09:15 America/New_York
Persistent=true

[Install]
WantedBy=timers.target
```

`Persistent=true` means a run missed while the box was down still fires once
it's back up, instead of silently skipping that day. Enabled with:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now builder-digest.timer
```

Live and confirmed firing on schedule since 2026-08-10 (first real automated
run: 09:15 ET, `sent=3 skipped=6 failed=0`).

Verify with `systemctl list-timers | grep builder-digest` and, after it
fires, `journalctl -u builder-digest`. To test by hand without waiting for
the schedule: `cd /home/ec2-user/builder && npx tsx server/digest/run.ts
--dry-run` (prints the emails it would send without actually sending), or
drop `--dry-run` to send for real. The job is idempotent per calendar day
(`digest_runs` table, unique on `(run_date, user_id)`), so re-running it
after a real send that day is safe — already-sent recipients are skipped.

## Known gaps / deliberately deferred

1. **Git-based deploy.** Deploys are still manual `rsync` from a local
   checkout (see above) — replace with a real `git clone`/`git pull` on
   the server (needs a deploy key/token since the repo is private).
2. **Clerk production instance.** A production Clerk instance *was*
   created during setup, tied to `build.yullr.com` (`pk_live_...` /
   `sk_live_...` keys) but never activated — DNS verification records
   were never added, and we deliberately kept using the dev instance
   instead given the small user count. If those `sk_live_...` credentials
   were ever pasted anywhere outside a password manager, rotate them in
   the Clerk dashboard before use.
3. **No DB backups.** Postgres lives on the same instance as the app,
   with no snapshotting or `pg_dump` schedule. Since this box is a
   single point of failure for both app and data, at minimum a cron'd
   `pg_dump` to the `yullr-builder-prod` S3 bucket is worth setting up
   before this holds real customer data.
4. **No CI/CD.** Deploys are manual (see above). Fine at current
   frequency; revisit if deploys become routine.
5. **S3 bucket unused.** `yullr-builder-prod` was created with an IAM
   instance role already attached, anticipating a move away from
   base64-in-Postgres for file uploads (logos, signatures), but no code
   currently writes to it.
6. **SSH access is IP-restricted.** The security group only allows port
   22 from the IP address of whoever set this up. If that person's IP
   changes (new network, VPN, etc.), SSH will stop working until the
   security group rule is updated in the AWS Console (EC2 → Security
   Groups → `builder-prod-sg` → edit the port 22 inbound rule).
