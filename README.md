# passalong

> Manage the things you no longer need — and give them a second home.

passalong is a self-hosted, open-source app for **families and private sellers**
to manage a collection of second-hand items they want to sell or give away.
Catalog your stuff once (photos, price, condition, category), track where each
item is listed and whether it has been sold — across flea markets, online
marketplaces, or a simple hand-over to friends.

**One collection. Many ways to pass it along.**

## Features

- **Item collection** — photos (gallery + cover image), price, category,
  condition, internal notes
- **Sale channels** — track per item where it is listed (market day, online
  marketplace, shop, …) and its sale status
- **Market day mode** — QR-code price tags, scan-to-sell, daily settlement,
  stand fees (net calculation), expense tracking
- **Public stand page** — a shareable, login-free page for buyers, with item
  filter, wishlist and a map pin so buyers can find the booth
- **Statistics & history** — earnings, per-category charts, filterable sales
  history
- **Multi-user** — profiles, avatars, per-family-member collections (multi-tenant:
  one instance can serve family & friends)
- **i18n** — German and English from day one

## Technology

- [SvelteKit](https://kit.svelte.dev) (TypeScript) — one project for UI, server
  routes and API
- SQLite — a single file database, no external service
- Docker & docker-compose — one command to run it
- Built to stay **lightweight and close to web standards**

## Quick start (Docker)

```bash
git clone https://github.com/timlohse1104/passalong.git
cd passalong
cp .env.example .env        # adjust values
docker compose up -d
# open http://localhost:3000
```

## Development

```bash
pnpm install
pnpm dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## Screenshots

*(coming soon)*

## Documentation

- [SECURITY.md](SECURITY.md) — reporting vulnerabilities & hardening
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute

## Roadmap

- [ ] v0.1 — core collection: items, photos, categories, users
- [ ] v0.2 — channel & sale status, public stand view
- [ ] v0.3 — market day mode (price tags, scan, settlement)
- [ ] Backups, statistics, advanced i18n
- See [CHANGELOG.md](CHANGELOG.md)

## License

[MIT](LICENSE)
