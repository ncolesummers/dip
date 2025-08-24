# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

```bash
# Start infrastructure (Kafka, PostgreSQL, Redis, etc.)
cd docker && docker-compose -f docker-compose.kraft.yml up -d

# Run individual services with hot reload
deno task dev:ingestion    # Port 8001
deno task dev:classifier   # Port 8002
deno task dev:routing       # Port 8003
deno task dev:response      # Port 8004

# Run all services
deno task dev

# Monitor events in real-time
deno task monitor:events
```

### Testing

```bash
# Run all tests
deno test --allow-all --parallel

# Run specific test suites
deno task test:unit         # Unit tests only
deno task test:integration  # Integration tests
deno task test:evals        # Evaluation tests

# Run a single test file
deno test --allow-all tests/unit/services/base.test.ts

# Run benchmarks
deno bench --allow-all
```

### Code Quality

```bash
# Type checking
deno check **/*.ts

# Formatting
deno fmt                    # Format all files
deno fmt --check           # Check formatting without changes

# Linting
deno lint

# Verify Kafka is working (KRaft mode)
cd docker && ./scripts/test-kafka-kraft.sh
```

### Build & Deploy

```bash
# Compile services to standalone executables
deno task compile:ingestion

# Generate new service from template
deno run --allow-all scripts/generate-service.ts --name my-service
```

## Architecture

### Core Pattern: Event-Driven Microservices

All services follow this pattern:

1. **Extend BaseService** (shared/services/base.ts) for common functionality
2. **Subscribe to CloudEvents** via Kafka topics
3. **Process events** according to domain logic
4. **Publish new events** for downstream services
5. **Expose HTTP endpoints** via Hono framework

### Service Communication Flow

```
Client → Ingestion Service → Kafka → Classifier → Kafka → Router → Kafka → Response Service
```

### Key Architectural Decisions (ADRs)

- **ADR-002**: Deno runtime for TypeScript-first development
- **ADR-007**: Event-driven architecture using publish-subscribe
- **ADR-008**: CloudEvents v1.0 specification for event format
- **ADR-010**: Zod for runtime validation with TypeScript inference
- **ADR-011**: Hono web framework for HTTP APIs
- **ADR-013**: BaseService abstraction for common service functionality
- **ADR-015**: Kafka KRaft mode (no ZooKeeper dependency)

### Service Implementation Pattern

Every service must:

1. Implement these abstract methods from BaseService:
   - `initialize()` - Setup service-specific resources
   - `cleanup()` - Graceful shutdown logic
   - `isReady()` - Readiness check
   - `performHealthChecks()` - Service-specific health checks

2. Handle CloudEvents using TypedCloudEvent:
   ```typescript
   const event = TypedCloudEvent.parse(rawEvent);
   // Process with type safety
   ```

3. Validate data with Zod schemas:
   ```typescript
   const validated = MySchema.parse(data);
   // Automatic TypeScript type inference
   ```

### Event Types & Topics

Events follow CloudEvents spec with these patterns:

- **Source**: `com.dip.[domain].[service]`
- **Type**: Defined in `shared/events/types.ts`
- **Topics**: `dip.[domain].[event-type]` (e.g., `dip.documents.ingested`)

### Infrastructure Services

- **Kafka**: Message bus (KRaft mode, no ZooKeeper)
- **PostgreSQL**: Persistent storage
- **Redis**: Caching and session management
- **Prometheus**: Metrics collection
- **Grafana**: Metrics visualization
- **Ollama**: Local LLM for development

## Important Context

### Deno-Specific Considerations

- No `node_modules` - dependencies cached globally
- Explicit permissions required (--allow-net, --allow-env, etc.)
- Import maps in deno.json for path aliases (@shared/, @events/, etc.)
- Native TypeScript - no build step required
- Built-in tools (fmt, lint, test, bench) - no external tooling needed

### Development Environment

- DevContainer available for consistent environment
- Docker Compose for local infrastructure
- Hot reload enabled with --watch flag
- Structured JSON logging for observability

### Testing Strategy

- Unit tests for individual components
- Integration tests for service interactions
- Evaluation framework for comparing implementations
- Benchmarks for performance tracking

### When Creating New Services

1. Use service generator script for boilerplate
2. Extend BaseService for consistency
3. Define Zod schemas for all data structures
4. Implement health checks and readiness probes
5. Add metrics using commonMetrics from observability module
6. Follow CloudEvents specification for events
7. Use structured logging with correlation IDs

### Monitoring & Observability

- Health endpoints: `/health` (liveness) and `/ready` (readiness)
- Metrics endpoint: Port 9090/metrics (Prometheus format)
- Structured JSON logs with correlation tracking
- Kafka UI available at http://localhost:8080
- Grafana dashboards at http://localhost:3000

### Subagent Usage Opportunities

- Use **docs-architect** for creating comprehensive documentation or ADRs
- Use **deno-observability-expert** for implementing observability patterns or troubleshooting Deno-specific issues
- Use **backend-architect** when designing new services or API endpoints
- Use **architect-reviewer** after structural changes to ensure consistency
- Use **test-automator** for creating comprehensive test suites
- Use **github-actions-devops** for CI/CD workflow implementation
- Use **sre-observability-expert** for defining SLOs/SLIs and monitoring strategies
