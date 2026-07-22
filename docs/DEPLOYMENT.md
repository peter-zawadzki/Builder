# Production Deployment (AWS)

Builder runs in production on a single EC2 instance — Postgres, the Node
API, and nginx all on one box. No load balancer, no managed DB, no CI/CD
yet. This doc is the map back to everything that was provisioned, so a
future session (or person) doesn't have to reverse-engineer it from the
AWS Console.

## Current status

- **Live at:** `http://100.57.174.60` (no domain pointed at it yet — see
  "Known gaps" below)
- **Auth:** reusing the existing Clerk **development** instance/keys
  (not a separate production Clerk instance). Fine for the current scale
  (~20 internal users); revisit if that changes.
- **Database:** fresh Postgres, all 11 migrations applied, completely
  empty except one row: `peter@yullr.com` auto-provisioned as
  `super_admin` on first login (see `server/auth.ts` — email match is
  hardcoded there, no manual seeding was done or is needed).

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
| Public IP | `100.57.174.60` — **not an Elastic IP**, will change if the instance is stopped/started (rebooting is fine, it only changes on stop→start) |
| Security group | `sg-0e99a420292eb325e` (`builder-prod-sg`) — port 22 restricted to one IP (whoever set this up; **update the rule if that IP changes** or SSH will start failing), ports 80/443 open to `0.0.0.0/0` |
| SSH key pair | `builder-prod` — private key lives at `~/.ssh/builder-prod.pem` (local machine only, not in the repo) |
| IAM role (instance profile) | `builder-prod-ec2-role` / `builder-prod-ec2-profile` — inline policy `builder-prod-s3-access` scoped to the S3 bucket below (Get/Put/Delete/List) |
| S3 bucket | `yullr-builder-prod` — private (all public access blocked), AES256 default encryption, versioning on. **Not yet wired into the app** — created for future file-upload use (logos/signatures currently live as base64 in Postgres JSONB) |

Why an EIP wasn't allocated: the AWS account already had 10 Elastic IPs
in use for unrelated projects, hitting the default per-region limit of 5
active + reserved. Rather than release someone else's IP or request a
quota bump, we used the instance's auto-assigned public IP instead.

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
- `APP_BASE_URL` → `http://100.57.174.60` (used to build "View in
  Builder" links in Slack messages — **must be updated** once a real
  domain is pointed at this instance, see below)
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

### nginx — reverse proxy + static files

`/etc/nginx/conf.d/builder.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name _;

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
}
```

Note: the distro-default `server { listen 80; server_name _; ... }`
block that ships in `/etc/nginx/nginx.conf` was **removed** (it
conflicted with the one above) — a backup of the original file was left
at `/etc/nginx/nginx.conf.orig` on the instance.

## Deploying a code change (current manual process)

From a machine with the repo checked out and `~/.ssh/builder-prod.pem`:

```bash
rsync -az --delete \
  --exclude 'node_modules' --exclude '.git' --exclude 'dist' --exclude '.env.local' --exclude '.DS_Store' \
  -e "ssh -i ~/.ssh/builder-prod.pem" \
  /path/to/Builder/ ec2-user@100.57.174.60:/home/ec2-user/builder/

ssh -i ~/.ssh/builder-prod.pem ec2-user@100.57.174.60 '
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
ssh -i ~/.ssh/builder-prod.pem ec2-user@100.57.174.60 '
  cd /home/ec2-user/builder &&
  DATABASE_URL=$(grep "^DATABASE_URL=" .env.local | cut -d= -f2-) ./db/migrate.sh
'
```
(`migrate.sh` reads `DATABASE_URL` from the shell environment, not from
`.env.local` directly — it has its own fallback to a local dev default,
so it needs to be passed in explicitly like this.)

## Known gaps / deliberately deferred

1. **No domain / no HTTPS.** `build.yullr.com` currently still points at
   `sites.figma.net` (an existing Figma Sites page) — deliberately left
   alone until data migration from the old system is finished. Tracked
   as a follow-up to: repoint the Route 53 A record at this instance,
   install certbot, get a Let's Encrypt cert, update nginx for TLS, and
   update `APP_BASE_URL` accordingly.
2. **Git-based deploy.** Planned for the same follow-up work as the
   domain switch — replace the manual rsync process above with a real
   `git clone`/`git pull` on the server (needs a deploy key/token since
   the repo is private).
3. **Clerk production instance.** A production Clerk instance *was*
   created during setup, tied to `build.yullr.com` (`pk_live_...` /
   `sk_live_...` keys) but never activated — DNS verification records
   were never added, and we deliberately kept using the dev instance
   instead given the small user count. If those `sk_live_...` credentials
   were ever pasted anywhere outside a password manager, rotate them in
   the Clerk dashboard before use.
4. **No DB backups.** Postgres lives on the same instance as the app,
   with no snapshotting or `pg_dump` schedule. Since this box is a
   single point of failure for both app and data, at minimum a cron'd
   `pg_dump` to the `yullr-builder-prod` S3 bucket is worth setting up
   before this holds real customer data.
5. **No CI/CD.** Deploys are manual (see above). Fine at current
   frequency; revisit if deploys become routine.
6. **S3 bucket unused.** `yullr-builder-prod` was created with an IAM
   instance role already attached, anticipating a move away from
   base64-in-Postgres for file uploads (logos, signatures), but no code
   currently writes to it.
7. **SSH access is IP-restricted.** The security group only allows port
   22 from the IP address of whoever set this up. If that person's IP
   changes (new network, VPN, etc.), SSH will stop working until the
   security group rule is updated in the AWS Console (EC2 → Security
   Groups → `builder-prod-sg` → edit the port 22 inbound rule).
