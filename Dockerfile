# syntax=docker/dockerfile:1.6
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# create tdm dirs with correct perms for user 'node' (uid 1000)
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/examples ./examples
COPY --from=builder /app/resources ./resources
RUN npm ci --omit=dev && npm cache clean --force \
  && mkdir -p /home/node/.config/tdm /home/node/.local/state/tdm \
  && chown -R node:node /app /home/node
USER node
VOLUME ["/home/node/.config/tdm", "/home/node/.local/state/tdm"]
LABEL org.opencontainers.image.source="https://github.com/vocino/TwitchDropsMiner-CLI"
LABEL org.opencontainers.image.title="TwitchDropsMiner-CLI"
ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["run"]
HEALTHCHECK --interval=5m --timeout=10s --start-period=30s --retries=2 \
  CMD node dist/cli/index.js healthcheck || exit 1
