# Ultra-lightweight pre-built production Dockerfile for XMessenger
# Frontend & Backend are pre-compiled to avoid downloading ~800MB on throttled VPS connections.
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/app/data
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# 1. Install native build tools, compile production dependencies, and clean up compilers immediately
COPY server/package*.json ./
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev --no-audit --no-fund && \
    apk del .build-deps

# 2. Copy pre-compiled server dist, client web assets, and VERSION
COPY server/dist ./dist
COPY client/dist ./client-dist
COPY VERSION ./VERSION

RUN mkdir -p /app/data

EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http'); http.get('http://127.0.0.1:3001/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

CMD ["node", "dist/index.js"]
