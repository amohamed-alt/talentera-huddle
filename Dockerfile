FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
ARG ACQUISITION_BUILD_REF=local
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_ACQUISITION_BUILD_REF=$ACQUISITION_BUILD_REF
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN printf '%s' "$ACQUISITION_BUILD_REF" > /tmp/acquisition-build-ref \
  && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ARG ACQUISITION_BUILD_REF=local
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV ACQUISITION_BUILD_REF=$ACQUISITION_BUILD_REF
ENV LEAD_WORKSPACE_CACHE_DIR=/app/data
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /app/data \
  && chown -R nextjs:nodejs /app/data
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
