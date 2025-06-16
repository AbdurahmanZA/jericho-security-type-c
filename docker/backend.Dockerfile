# JERICHO Security Type C - Backend Dockerfile
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install system dependencies for video processing
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-dev \
    python3 \
    make \
    g++ \
    sqlite \
    curl

# Copy package files
COPY package.json ./
COPY backend/package.json ./backend/

# Install dependencies
RUN npm ci --only=production && \
    cd backend && npm ci --only=production

# Copy source code
COPY backend/ ./backend/
COPY scripts/ ./scripts/

# Create production image
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    ffmpeg \
    curl \
    dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S jericho -u 1001

# Set working directory
WORKDIR /app

# Copy from builder
COPY --from=builder --chown=jericho:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=jericho:nodejs /app/backend ./backend
COPY --from=builder --chown=jericho:nodejs /app/scripts ./scripts

# Create directories for media files
RUN mkdir -p /app/hls /app/snapshots /app/logs && \
    chown -R jericho:nodejs /app

# Switch to app user
USER jericho

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/api/health || exit 1

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/server.js"]