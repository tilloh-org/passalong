# Build stage
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++ && corepack enable pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm install --prod --frozen-lockfile

# Runtime stage
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Remove npm CLI: not needed at runtime (started via node build/index.js)
# and eliminates CVEs in bundled npm dependencies (brace-expansion, ip-address, ...)
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx && \
    addgroup -S app && adduser -S app -G app && \
    mkdir -p /data && chown app:app /data

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Persistent app data (SQLite database, uploads) lives under /data.
# Mount a volume here when running with docker compose.
VOLUME /data

USER app
EXPOSE 4242
ENV PORT=4242
CMD ["node", "build/index.js"]
