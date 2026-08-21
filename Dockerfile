# Build stage
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# Runtime stage
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable pnpm && addgroup -S app && adduser -S app -G app

COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-lock.yaml ./
COPY --from=build /app/.npmrc ./
RUN pnpm install --prod --frozen-lockfile

USER app
EXPOSE 3000
ENV PORT=3000
CMD ["node", "build/index.js"]
