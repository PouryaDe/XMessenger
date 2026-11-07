# Multi-stage Docker build for XMessenger

# --- Stage 1: Build Client Frontend ---
FROM node:22-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci

COPY client/ ./
RUN npm run build

# --- Stage 2: Build Server Backend ---
FROM node:22-alpine AS server-builder
WORKDIR /app/server

# Install build dependencies for better-sqlite3 native bindings
RUN apk add --no-cache python3 make g++

COPY server/package*.json ./
RUN npm ci

COPY server/ ./
RUN npm run build

# --- Stage 3: Production Runtime ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data

RUN apk add --no-cache python3 make g++

# Copy built server
COPY server/package*.json ./
RUN npm ci --only=production

COPY --from=server-builder /app/server/dist ./dist
# Copy static frontend build into server's served client directory
COPY --from=client-builder /app/client/dist ./client-dist

RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "dist/index.js"]
