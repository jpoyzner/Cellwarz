# Cyberstation: the game server (Node + TypeScript via tsx) serving the built React client.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Where the HOME transporter on the login screen leads.
ARG PUBLIC_HOME_URL=https://djrecognize.com
ENV PUBLIC_HOME_URL=$PUBLIC_HOME_URL
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8080 \
    CELLWARZ_DATA_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.ts tsconfig.json tsconfig.server.json ./
COPY server ./server
COPY public ./public
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:8080/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node_modules/.bin/tsx", "server.ts"]
