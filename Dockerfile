# ====================== STAGE 1: Builder ======================
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies sistem yang dibutuhkan Baileys & sharp (jika ada)
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    libc-dev \
    bash

# Copy package files dulu untuk caching layer
COPY package*.json ./

# Install semua dependencies (termasuk devDependencies untuk build)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build NestJS
RUN npm run build

# ====================== STAGE 2: Production ======================
FROM node:22-alpine AS production

WORKDIR /app

# Install dependencies runtime yang ringan
RUN apk add --no-cache \
    bash \
    curl \
    && rm -rf /var/cache/apk/*

# Copy hanya yang dibutuhkan dari builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Buat user non-root untuk keamanan
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    chown -R nestjs:nodejs /app

# Buat folder session (akan di-mount via volume)
RUN mkdir -p /app/whatsapp-sessions && \
    chown -R nestjs:nodejs /app/whatsapp-sessions

USER nestjs

# Environment
ENV NODE_ENV=production
ENV PORT=3200

EXPOSE 3200

# Healthcheck (opsional tapi bagus)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#     CMD curl -f http://localhost:3200 || exit 1

# Jalankan aplikasi
CMD ["node", "dist/main.js"]