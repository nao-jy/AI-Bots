FROM node:24-alpine AS development-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci

FROM node:24-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:24-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM cloudflare/cloudflared:latest AS cloudflared

FROM node:24-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
COPY --from=cloudflared /usr/local/bin/cloudflared /usr/local/bin/cloudflared
COPY ./scripts/start-production.mjs /app/scripts/start-production.mjs
COPY ./scripts/production-server.mjs /app/scripts/production-server.mjs
WORKDIR /app
ENV NODE_ENV=production HOST=127.0.0.1 PORT=3001 \
    LOG_DIR=/app/data/logs MEMORY_DIR=/app/data/memory \
    TEMP_FILE_DIR=/app/data/temporary-files
VOLUME ["/app/data"]
CMD ["node", "scripts/start-production.mjs"]
