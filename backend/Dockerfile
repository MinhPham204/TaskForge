FROM node:24-alpine AS dependencies

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

FROM dependencies AS build

COPY . .
RUN npm run build

FROM build AS production-dependencies

RUN npm prune --omit=dev

FROM node:24-alpine AS production

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY package*.json ./
COPY --from=production-dependencies --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=build --chown=node:node /usr/src/app/dist ./dist

# Ensure persistent uploads directory exists with non-root ownership
RUN mkdir -p uploads && chown -R node:node /usr/src/app/uploads

USER node
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8001/api/health || exit 1

CMD ["node", "dist/main.js"]
