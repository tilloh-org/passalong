# Build stage
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable pnpm

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
    addgroup -S app && adduser -S app -G app

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

USER app
EXPOSE 3000
ENV PORT=3000
CMD ["node", "build/index.js"]
