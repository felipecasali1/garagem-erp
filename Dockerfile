FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/check-node-version.mjs ./scripts/check-node-version.mjs
RUN npm ci

COPY . .

# The browser receives its real public Supabase config from the runtime server.
# These non-secret placeholders only let Vite produce the production bundle.
RUN VITE_SUPABASE_URL=https://runtime-config.invalid \
    VITE_SUPABASE_ANON_KEY=runtime-config-required \
    npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/scripts/check-node-version.mjs ./scripts/check-node-version.mjs
COPY --from=build --chown=node:node /app/scripts/start.mjs ./scripts/start.mjs
COPY --from=build --chown=node:node /app/scripts/production-server.mjs ./scripts/production-server.mjs

USER node

EXPOSE 3000

CMD ["npm", "start"]
