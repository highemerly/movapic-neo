FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# システム libvips（>=8.17.3, vips-dev）+ HEVC デコーダ（libheif-dev/libde265-dev）。
# prebuilt の @img/sharp-* は HEVC を内蔵せず HEIC を読めないため、これらに対して
# sharp をソースビルドする（.npmrc の omit=optional で prebuilt を排除）。
# pkgconf: ビルド時に vips-cpp を pkg-config で検出するため。
# python3/make/g++: node-gyp による sharp のネイティブビルドに必要（ビルドステージのみ）。
RUN apk add --no-cache libc6-compat vips-dev libheif-dev libde265-dev pkgconf python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
# postinstall(scripts/use-system-libvips.mjs)が prebuilt の @img/sharp を除去し、
# system libvips(libheif/libde265)へ sharp をソースビルドする（HEIC対応）。先に配置。
COPY scripts/use-system-libvips.mjs ./scripts/use-system-libvips.mjs
RUN --mount=type=cache,target=/root/.npm \
    npm ci --foreground-scripts

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
# vips: libvips.so 本体 / vips-cpp: libvips-cpp.so.42（ソースビルドした sharp が dlopen する C++ バインディング）
# vips-heif provides HEIC support through libheif
# libde265 is the HEVC decoder needed for iPhone HEIC files（HEIC入力デコード用）
# libheif-aom is the AV1 ENCODER plugin for libheif — REQUIRED for AVIF output
#   （無いと heifsave: Unsupported compression で AVIF 出力が全て失敗→500。
#    prebuilt sharp は libaom 内蔵だったが、system libheif はデコーダのみで encoder は別パッケージ）
# jemalloc: libvips/sharpのネイティブメモリをOSへ確実に返却させる (rss肥大化対策)
RUN apk add --no-cache vips vips-cpp vips-heif libheif libde265 libheif-aom jemalloc

ENV LD_PRELOAD=/usr/lib/libjemalloc.so.2

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

# --- ゴールデン画像テスト（skia 実描画の見た目回帰）専用ステージ ---
# 本番 runner はテスト道具を含まないため実行できない。代わりに、その runner を作った依存と
# 同一の prisma ステージ（deps ＝ skia/sharp ネイティブ・devDeps(vitest/pixelmatch)・libc6-compat 入り
# ＋ prisma generate 済み）を土台に、ソース・フォント・コミット済み正解 PNG を載せて比較する。
# → 本番と同じランタイムで描画を検証できる。docker-build.yml がこのステージを build し docker run する。
#
# 比較:   docker run --rm <img>
# 差分:   docker run --rm -e GOLDEN_DIFF_DIR=/out -v "$PWD/golden-out:/out" <img>
# 更新:   docker run --rm -e GOLDEN_UPDATE=1 -v "$PWD/src/lib/image/__golden__:/app/src/lib/image/__golden__" <img>
FROM prisma AS golden-test
WORKDIR /app
COPY . .
CMD ["npm", "run", "test:golden"]
