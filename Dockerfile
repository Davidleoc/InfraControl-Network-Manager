# Estágio 1: Instalação de dependências
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Estágio 2: Build da aplicação
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Desabilita o envio de telemetria do Next.js durante o build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Estágio 3: Execução
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 --ingroup nodejs nextjs

COPY --from=builder /app/public ./public

# Define permissões corretas para o cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copia o build standalone (necessário output: 'standalone' no next.config.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
