FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir /data && chown node:node /data
USER node
ENV NODE_ENV=production FORMA_DATA_DIR=/data FORMA_BIND_HOST=0.0.0.0 FORMA_PORT=4242
EXPOSE 4242
ENTRYPOINT ["node", "packages/cli/bin.mjs"]
CMD ["host"]
