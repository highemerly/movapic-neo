FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# libheif with HEVC decoder (libde265) for HEIC support in sharp
# libheif-hevc is REQUIRED for HEVC-compressed HEIC files (most iPhone photos)
# python3, make, g++ are needed for node-gyp to build sharp (only in build stage)
RUN apk add --no-cache libc6-compat vips-dev libheif-dev libde265-dev python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
# Rebuild sharp from source with system libvips (HEIC support)
RUN --mount=type=cache,target=/root/.npm \
    npm ci && npm rebuild sharp

# Prisma client generation (separate stage for caching)
FROM deps AS prisma
WORKDIR /app

COPY prisma ./prisma

RUN npx prisma generate

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

# ビルド時にダミーの環境変数を設定（ISRページのプリレンダリングをスキップするため）
# 実際のDB接続は必要なく、Prismaクライアントの初期化だけ行われる
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV ALLOWED_SERVERS="handon.club"

RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Runtime libraries for sharp with HEIC support
# libheif alone is NOT enough - need libheif-libde265 plugin for HEVC decoding (used by most HEIC files)
# Note: "libheif-libde265" is the plugin that connects libheif to libde265 decoder
RUN apk add --no-cache vips libheif libheif-libde265

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/fonts ./fonts

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

# ============================================
# Migration image (built only when needed)
# ============================================
FROM base AS migration
WORKDIR /app

# Prisma CLI and generated client
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

CMD ["npx", "prisma", "migrate", "deploy"]
