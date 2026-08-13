# PO-token sidecar for yt-convert.
#
# The generator uses jsdom (no browser/system Chromium needed), so a slim
# Node image is enough. Build for any arch; ARM works on Oracle Cloud A1,
# Raspberry Pi, etc.
FROM node:22-slim

ENV NODE_ENV=production \
    PORT=4416 \
    HOST=0.0.0.0

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy the server source.
COPY server.js mint.js contract.js ./
COPY scripts/ ./scripts/

# Drop privileges: the server doesn't need root after binding to a high port.
USER node

EXPOSE 4416

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node scripts/healthcheck.js

CMD ["node", "server.js"]
