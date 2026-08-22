FROM node:22-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY config ./config
COPY token ./token
COPY assets ./assets
COPY docs ./docs

RUN pnpm install --frozen-lockfile
RUN pnpm check

FROM node:22-alpine AS runtime

RUN apk add --no-cache su-exec \
  && mkdir -p /data \
  && chown node:node /data

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/bot ./apps/bot
COPY --from=build --chown=node:node /app/apps/server ./apps/server
COPY --from=build --chown=node:node /app/package.json ./package.json

RUN chmod +x /app/apps/server/docker-entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/app/apps/server/docker-entrypoint.sh"]
CMD ["node", "apps/server/src/index.mjs"]
