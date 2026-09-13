# passalong

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/tilloh-org/passalong/actions/workflows/ci.yml/badge.svg)](https://github.com/tilloh-org/passalong/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tilloh-org/passalong)](https://github.com/tilloh-org/passalong/releases)

> Manage the things you no longer need — and give them a second home.

passalong is a self-hosted, open-source app for families and private sellers.
Keep a single collection of second-hand items, prepare a market day, share a
reduced public stand page, and record what sold.

## What you can do

- **Manage a collection** — items with photos, cover images, prices, categories,
  conditions, reservations, and private notes
- **Prepare a market day** — create and close market days, track stand fees and
  expenses, print A4 QR-code price labels, and use the seller scan shortcut
- **Share a public stand** — offer a login-free, reduced buyer view with search,
  filters, item details, photos, favourites, and a stand location
- **Track sales** — record sales by channel, view sale history, settlements, and
  statistics for proceeds, categories, market days, and expenses
- **Manage an instance safely** — first-run account creation, tenant- and
  owner-scoped data, profiles, password recovery, backups, and additive data
  export/import
- **Use your language** — German and English UI from day one

## Quick start with Docker

```bash
git clone https://github.com/tilloh-org/passalong.git
cd passalong
cp .env.example .env
docker compose up -d --build
```

Open [http://localhost:4242](http://localhost:4242). On an empty database,
create the first account in the browser; it becomes the instance administrator.

All `.env` values are optional. The defaults are suitable for a local install:

```dotenv
# Host port; default: 4242
PASSALONG_PORT=4242

# Set this when the app is served through HTTPS and a reverse proxy.
# Use the public origin without a trailing slash.
# PASSALONG_ORIGIN=https://passalong.example.com
```

### Unattended first setup

Instead of browser registration, an optional one-line bootstrap manifest can
provision accounts during startup:

```dotenv
PASSALONG_BOOTSTRAP={"accounts":[{"tenantName":"Example household","username":"admin","displayName":"Example admin","password":"replace-with-a-unique-password","instanceAdmin":true}]}
```

On an empty database, a non-empty manifest must create exactly one instance
administrator; an empty `accounts` list makes no changes. On an existing
database, it remains create-only: it can add only non-administrator accounts,
while configured existing accounts must match their stored tenant, display name,
role, and password exactly. Later starts never update or delete records.
**Never commit `.env` or bootstrap credentials.** Keep the manifest private and
remove it after first setup when it is no longer needed.

## Deploy behind a reverse proxy

Run passalong behind HTTPS with Caddy, Traefik, nginx, or a tunnel. Set
`PASSALONG_ORIGIN` to the externally visible URL so SvelteKit can retain its
same-origin form protection:

```dotenv
PASSALONG_ORIGIN=https://passalong.example.com
```

The Docker volume `passalong-data` stores the SQLite database and uploaded
media below `/data`. Protect and back up that volume as application data.

## Administration and recovery

The instance administrator can create a single-use, one-hour password-reset
secret in **Instance administration**. If no instance administrator can sign
in, use the container helper:

```bash
docker compose exec passalong node build/scripts/create-password-reset.js <username>
```

The command prints a secret only once. Do not write it to persistent shell
history or logs.

## Development

```bash
pnpm install
pnpm dev
```

Before contributing, run the local checks:

```bash
pnpm lint
pnpm check
pnpm test
pnpm build
CI=1 pnpm test:e2e
pnpm audit
python3 .github/scripts/tests/test_release_flow.py
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance,
[SECURITY.md](SECURITY.md) for hardening and vulnerability reporting, and
[CHANGELOG.md](CHANGELOG.md) for released changes.

## License

[MIT](LICENSE)
