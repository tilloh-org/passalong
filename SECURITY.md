# Security Policy

We take security seriously. passalong is self-hosted software, so most
instances are run by their owners — but that makes it even more important
that vulnerabilities are reported and fixed responsibly.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Instead, report vulnerabilities privately:

- **Preferred:** GitHub's private security advisory
  → Repository → *Security* tab → *Report a vulnerability*
- **Alternative:** email the maintainer (address in the repository metadata)

You will receive a response within **5 business days**. We will keep you
informed about the progress of the fix and coordinate a disclosure date
with you.

## Scope

In scope:

- The passalong application itself (SvelteKit app, API routes)
- Docker image / deployment defaults in the official docker-compose

Out of scope:

- Dependencies with known CVEs that are not exploitable in the default
  configuration (still interesting — report them anyway)
- Your own hosting environment (wrong reverse proxy settings, etc.)

## Security hardening notes for self-hosters

- Run the container as a non-root user (the official image does this by
  default)
- Put passalong behind a reverse proxy with HTTPS (e.g. Caddy, Traefik,
  nginx)
- Keep `PASSALONG_PUBLIC_URL` aligned with your actual public URL
- Protect the data volume — it contains the SQLite database and uploads
