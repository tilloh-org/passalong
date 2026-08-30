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
# Upgrade Alpine packages before adding the application runtime. This picks up
# security fixes that may not yet be present in the mutable Node base-image tag.
# Remove npm CLI: it is not needed at runtime (started via node build/index.js).
RUN apk upgrade --no-cache && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx && \
    addgroup -S app && adduser -S app -G app && \
    mkdir -p /data && chown app:app /data

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/scripts ./scripts

# Persistent app data (SQLite database, uploads) lives under /data.
# Mount a volume here when running with docker compose.
VOLUME /data

USER app
EXPOSE 4242
ENV PORT=4242
CMD ["node", "build/index.js"]
