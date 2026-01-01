# Multi-stage Dockerfile for production builds
FROM oven/bun:1.3.3-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Build stage
FROM base AS builder
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install all dependencies (including dev dependencies)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application (if you have a build step)
# RUN bun run build

# Production stage
FROM base AS runner
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 webhook && \
    adduser --system --uid 1001 webhook

# Copy production dependencies
COPY --from=deps --chown=webhook:webhook /app/node_modules ./node_modules

# Copy application code
COPY --from=builder --chown=webhook:webhook /app/src ./src
COPY --from=builder --chown=webhook:webhook /app/package.json ./
COPY --from=builder --chown=webhook:webhook /app/tsconfig.json ./

# Create directories for runtime
RUN mkdir -p /app/debug && chown webhook:webhook /app/debug

# Switch to non-root user
USER webhook

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["bun", "run", "src/main.ts"]
