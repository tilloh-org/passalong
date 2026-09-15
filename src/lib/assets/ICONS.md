# Vendored icon source

Upstream: **Tabler Icons v3.46.0** (`@tabler/icons`), MIT licensed.

`tabler-sprite.svg` is the Tabler icon sprite copied from the Marktbude app
(`homelab/rosi/flohmarkt/app/static/vendor/tabler-sprite.svg`) so passalong uses
the same icon vocabulary. Tabler icons are MIT licensed:

    MIT License

    Copyright (c) 2020-2026 Paweł Kuna

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

`tabler-extra/` holds individual Tabler icons that the vendored sprite does not
carry (filter, key, camera, world, heart-filled, note). Each file is the
unmodified outline/filled SVG from the Tabler icon set.

`scripts/build-icon-sprite.mjs` reads these files plus the registry in
`src/lib/icons.ts` and writes the inline sprite into `src/app.html`. Re-run it
after changing the registry:

    node scripts/build-icon-sprite.mjs

The script emits multi-line path attributes; the committed `src/app.html` is
Prettier-formatted. Run Prettier afterwards, otherwise `pnpm lint` reports a diff:

    node scripts/build-icon-sprite.mjs && pnpm exec prettier --write src/app.html
