# The Kept server. deploy/compose.yaml runs it behind Caddy; it applies migrations on start.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json vite.config.ts ./
COPY src src
COPY web web
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
USER node
EXPOSE 3000
CMD ["sh", "-c", "node dist/cli/migrate.js && exec node dist/server.js"]
