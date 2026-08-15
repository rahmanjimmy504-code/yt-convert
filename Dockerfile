# Next.js production image for the VPS / Compose stack.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Render exposes non-secret service env vars to Docker builds as build args.
# Next inlines this public canonical URL; secrets intentionally stay runtime-only.
ARG NEXT_PUBLIC_SITE_URL
ARG RENDER_EXTERNAL_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    RENDER_EXTERNAL_URL=$RENDER_EXTERNAL_URL
# Bound each Node heap and enable Next's low-memory Webpack mode (configured in
# next.config.ts) to reduce hosted-builder pressure without skipping type checks
# or static generation.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=384
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
# Render overrides this image's PORT=3000 with its injected runtime port.
# Leave native-memory headroom under the free instance's 512 MB limit while
# media bodies stream through Web Streams rather than being buffered.
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=320 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# ffmpeg enables on-the-fly stream-copy remux of YouTube's adaptive >360p
# tracks (docs/hd-muxing-proposal.md). Stream-copy is near-zero CPU; no
# re-encoding happens, and no media file is ever written to disk.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
