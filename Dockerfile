# ====================== STAGE 1: Builder ======================
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ gcc libc-dev

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build

# ====================== STAGE 2: Production ======================
FROM node:22-alpine AS production

WORKDIR /app

RUN apk add --no-cache bash curl

# Copy hasil build
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Setup user & folder session
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    mkdir -p /app/whatsapp-sessions && \
    chown -R nestjs:nodejs /app

USER nestjs

ENV NODE_ENV=production
ENV PORT=3200

EXPOSE 3200

# ✅ Healthcheck dihapus sementara (Coolify sering bermasalah dengan ini)
# CMD tetap pakai node langsung
CMD ["node", "dist/main.js"]