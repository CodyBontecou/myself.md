FROM node:24-bookworm-slim AS dashboard-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY jsconfig.json ./
COPY core ./core
COPY dashboard ./dashboard
COPY scripts/build-dashboard.js ./scripts/build-dashboard.js
RUN npm run dashboard:build

FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && mkdir /data && chown node:node /data
COPY core ./core
COPY server ./server
COPY --from=dashboard-build /app/dashboard/dist ./dashboard/dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/start.js"]
