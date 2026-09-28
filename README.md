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

# Docker container name; default: passalong.
# Give a second stack on the same Docker host a distinct name.
# PASSALONG_CONTAINER_NAME=passalong-staging

# Set this when the app is served through HTTPS and a reverse proxy.
# Use the public origin without a trailing slash.
# PASSALONG_ORIGIN=https://passalong.example.com
```

### Accounts

Accounts are created in the application, never through environment variables.

On an empty database the registration form is open: the first account you
create becomes the **instance administrator**. Once that account exists the
registration closes, and the instance administrator adds every further account.

Keep `.env` out of version control. It holds deployment values only — no
credentials for creating accounts exist there.

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

## Taking over an existing instance

A fresh instance can take over a complete data set from an archive in the
[exchange format](docs/EXCHANGE-FORMAT.md). The takeover runs **on the first-run
screen, before any account exists**: the dialog appears next to the first-run
registration form, and you pick one of the imported users as the instance
administrator, who receives a password you set there.

## Stored media and thumbnails

Uploaded images are stored **exactly as received** under the media root, so a
storage key always names the bytes that are on disk and an import or restore
stays byte-true. Rotation for display (the EXIF orientation a camera records)
is applied once, when a viewer requests the file, together with the removal of
the metadata block — a photo published on a stand page therefore carries no GPS
position.

Grids and tiles request a small derivative instead of the original:

```
/media/<key>          the original, served to detail views and downloads
/thumb/<key>-<edge>w  a thumbnail of at most <edge> pixels on its longest edge
```

Thumbnails live in `<media root>/.thumbs/`. They are **derived data**, never
referenced from the database:

- they are generated on the first request and reused afterwards;
- the instance backup covers them, because its media walk is recursive, so
  originals **and** thumbnails survive a restart;
- an instance restored without them simply rebuilds them on the next request;
- deleting the `.thumbs` directory is always safe.

The compressed stack ships with `BODY_SIZE_LIMIT: 256M` so an archive that
contains images fits. If you set that variable yourself, keep it at or above the
largest archive you intend to import — a smaller value fails the upload with a
bare "413 Payload Too Large" before the application can show a message. Archives
up to 256 MB are accepted; the dialog refuses a larger file before uploading it.

**Operator warning — act immediately.** While an instance has no accounts, it is
uninitialised: whoever reaches it first can either register the first account or
run a takeover. Start a new instance only on a network you trust, and complete
either registration or the takeover right away. Provisioning through environment
variables happens before the HTTP server starts and is not affected by this.

A takeover is a one-time, complete move:

- It is refused once any account exists — start from a fresh instance.
- It replaces nothing: an empty instance has nothing to preserve, and an
  uninitialised instance never assigns pre-existing orphaned rows to imported
  users automatically.
- There is no delta import and no ongoing synchronisation afterwards.

Check the validation report before activating: it lists every imported user with
item, image and password status, the media and checksum result, and any warnings.
Accounts whose stored password cannot be carried over are imported as
reset-required, and the selected administrator can sign in immediately with the
newly set password.

Before switching a public hostname over, verify the imported data (portfolio,
images, stand pages, sales, expenses, statistics, scans) and produce a backup
from the new instance.

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
