# DIP Ingestion Service Dockerfile
# Multi-stage build for optimized production image

# ============================================================================
# Stage 1: Dependencies and Build
# ============================================================================
FROM denoland/deno:1.46.3 AS builder

LABEL maintainer="DIP Team <team@dip.com>"
LABEL service="ingestion"
LABEL version="1.0.0"

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY deno.json ./
COPY deno.lock* ./

# Copy shared dependencies
COPY ../../shared ./shared

# Copy service source code
COPY . ./services/ingestion

# Change to service directory
WORKDIR /app/services/ingestion

# Cache dependencies
RUN deno cache --lock=../../deno.lock main.ts

# Run linting and type checking
RUN deno lint
RUN deno fmt --check
RUN deno check main.ts

# Run tests
RUN deno test --allow-all tests/

# Compile the application
RUN deno compile \
  --allow-all \
  --target x86_64-unknown-linux-gnu \
  --output ingestion-service \
  main.ts

# ============================================================================
# Stage 2: Production Runtime
# ============================================================================
FROM debian:bookworm-slim AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
  ca-certificates \
  curl \
  tini \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

# Create non-root user for security
RUN groupadd -r dip && useradd -r -g dip -s /bin/false dip

# Create application directory
WORKDIR /app

# Copy compiled binary from builder
COPY --from=builder /app/services/ingestion/ingestion-service ./

# Copy any additional runtime files if needed
COPY --from=builder /app/services/ingestion/deno.json ./

# Change ownership to non-root user
RUN chown -R dip:dip /app

# Switch to non-root user
USER dip

# Expose ports
EXPOSE 3001 9001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default command
CMD ["./ingestion-service"]

# ============================================================================
# Stage 3: Development Image (Optional)
# ============================================================================
FROM denoland/deno:1.46.3 AS development

WORKDIR /app

# Install development tools
RUN apt-get update && apt-get install -y \
  curl \
  vim \
  jq \
  && rm -rf /var/lib/apt/lists/*

# Copy source code
COPY . .

# Install dependencies
RUN deno cache main.ts

# Development server with hot reload
CMD ["deno", "run", "--allow-all", "--watch", "main.ts"]

# ============================================================================
# Build Arguments and Environment Variables
# ============================================================================

# Build arguments
ARG BUILD_DATE
ARG VCS_REF
ARG VERSION=1.0.0

# Labels for metadata
LABEL org.label-schema.build-date=$BUILD_DATE \
      org.label-schema.vcs-ref=$VCS_REF \
      org.label-schema.vcs-url="https://github.com/dip/platform" \
      org.label-schema.version=$VERSION \
      org.label-schema.schema-version="1.0" \
      org.label-schema.name="DIP Ingestion Service" \
      org.label-schema.description="Support ticket ingestion microservice" \
      org.label-schema.vendor="DIP"

# Default environment variables
ENV DENO_ENV=production
ENV PORT=3001
ENV METRICS_PORT=9001
ENV GRACEFUL_SHUTDOWN_TIMEOUT=30000
ENV RATE_LIMIT_MAX_REQUESTS=100
ENV DEDUPLICATION_ENABLED=true
ENV DEDUPLICATION_TTL_MS=300000
ENV ENABLE_ATTACHMENTS=true
ENV ENABLE_CUSTOM_FIELDS=true

# Production optimizations
ENV DENO_NO_UPDATE_CHECK=1
ENV DENO_NO_PACKAGE_JSON=1