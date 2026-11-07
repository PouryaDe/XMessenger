# Multi-stage Docker build for XMessenger

# --- Stage 1: Build Client Frontend ---
FROM node:22-alpine AS client-builder
WORKDIR /app/client

ENV NPM_CONFIG_UPDATE_NOTIFIER=false

COPY client/package*.json ./
RUN npm ci --no-audit --no-fund

COPY client/ ./
RUN npm run build

# --- Stage 2: Build Server Backend ---
FROM node:22-alpine AS server-builder
WORKDIR /app/server

ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Install build dependencies for better-sqlite3 native bindings
RUN apk add --no-cache python3 make g++

COPY server/package*.json ./
RUN npm ci --no-audit --no-fund

COPY server/ ./
RUN npm run build
RUN npm prune --production

# --- Stage 3: Production Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

# Copy pre-compiled production node_modules and built server code
COPY --from=server-builder /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/dist ./dist
# Copy static frontend build into server's served client directory
COPY --from=client-builder /app/client/dist ./client-dist

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/index.js"]
