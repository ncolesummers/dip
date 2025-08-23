# Deno Event-Driven Microservices Project Launch Plan

## 📋 Project Overview: DIP (Deno Intelligence Platform)

A complete reimplementation of TIP using Deno, Hono, Zod, and CloudEvents, maintaining the event-driven architecture while leveraging modern TypeScript tooling.

---

## 🏗️ Technical Architecture

### Core Technology Stack
- **Runtime**: Deno 2.x (native TypeScript, secure by default)
- **Web Framework**: Hono (portable, ultrafast, works everywhere)
- **Validation**: Zod (runtime validation with TypeScript inference)
- **Events**: CloudEvents SDK for JavaScript
- **Message Queue**: KafkaJS (Deno compatible)
- **Type-Safe APIs**: tRPC (optional, for internal service communication)
- **Testing**: Deno's built-in test framework + Deno Bench for evaluations
- **Database**: PostgreSQL with Deno Postgres driver
- **Caching**: Redis with Deno Redis driver
- **LLM**: Ollama (local) or OpenAI SDK

### Project Structure
```
deno-tip/
├── .devcontainer/
│   └── devcontainer.json      # Dev container with Deno & Claude CLI
├── deno.json                  # Workspace configuration
├── import_map.json           # Centralized dependency management
├── shared/
│   ├── events/
│   │   ├── base.ts           # TypedCloudEvent<T> with Zod
│   │   ├── types.ts          # Event type constants
│   │   ├── consumer.ts       # Kafka consumer abstraction
│   │   └── publisher.ts      # Kafka publisher abstraction
│   ├── schemas/
│   │   ├── ticket.ts         # Zod schemas for ticket data
│   │   └── common.ts         # Shared validation schemas
│   ├── services/
│   │   ├── base.ts           # BaseService abstract class
│   │   └── health.ts         # Health check utilities
│   └── trpc/
│       └── router.ts         # Optional tRPC router setup
├── services/
│   ├── ingestion/
│   │   ├── deno.json         # Service-specific config
│   │   ├── main.ts           # Service entry point
│   │   ├── service.ts        # Service implementation
│   │   ├── routes.ts         # Hono HTTP routes
│   │   └── schemas.ts        # Service-specific schemas
│   └── [other services...]
├── tests/
│   ├── unit/
│   ├── integration/
│   └── evals/                # Evaluation suites
├── scripts/
│   ├── generate-service.ts   # Service scaffolding
│   └── event-monitor.ts      # Event debugging tool
└── docker/
    ├── docker-compose.yml     # Local infrastructure
    └── Dockerfile.deno        # Deno service container
```

---

## 📦 Devcontainer Configuration

```json
{
  "name": "DIP Dev Container",
  "image": "mcr.microsoft.com/devcontainers/base:jammy",
  "features": {
    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": {},
    "ghcr.io/devcontainers/features/node:1": {
      "version": "lts"
    }
  },
  "remoteUser": "vscode",
  "containerEnv": {
    "DENO_DIR": "/workspace/.deno"
  },
  "mounts": [
    "source=/var/run/docker.sock,target=/var/run/docker.sock,type=bind"
  ],
  "postCreateCommand": "curl -fsSL https://deno.land/install.sh | sh && echo 'export DENO_INSTALL=\"/home/vscode/.deno\"' >> ~/.bashrc && echo 'export PATH=\"$DENO_INSTALL/bin:$PATH\"' >> ~/.bashrc && npm install -g @anthropic/claude-cli",
  "customizations": {
    "vscode": {
      "extensions": [
        "denoland.vscode-deno",
        "ms-azuretools.vscode-docker"
      ],
      "settings": {
        "deno.enable": true,
        "deno.lint": true,
        "deno.unstable": true
      }
    }
  }
}
```

---

## 📝 Epic & User Stories

### EPIC-001: Core Infrastructure Setup
**Business Value**: High  
**Target Release**: v0.1.0

#### User Stories:

**STORY-001: TypedCloudEvent Implementation**
- As a developer, I want type-safe CloudEvents with Zod validation
- **Acceptance Criteria**:
  - Given a Zod schema, when creating an event, then TypeScript infers the data type
  - Given invalid data, when creating an event, then Zod throws validation error
  - Given a CloudEvent, when deserializing, then data is validated against schema
- **Story Points**: 5

**STORY-002: BaseService Abstract Class**
- As a developer, I want a common service base class with health checks and graceful shutdown
- **Acceptance Criteria**:
  - Given a service extends BaseService, when started, then it handles signals properly
  - Given a health check request, when service is running, then returns status metrics
  - Given a shutdown signal, when received, then service stops gracefully within timeout
- **Story Points**: 8

**STORY-003: Kafka Integration Layer**
- As a developer, I want abstracted Kafka consumer/publisher with CloudEvents
- **Acceptance Criteria**:
  - Given a service subscribes to topics, when events arrive, then they're validated
  - Given a service publishes events, when sent, then they include correlation IDs
  - Given a consumer error, when occurs, then proper retry logic executes
- **Story Points**: 8

**STORY-004: Devcontainer Setup**
- As a developer, I want a complete dev environment with one command
- **Acceptance Criteria**:
  - Given devcontainer starts, when complete, then Deno and Claude CLI are installed
  - Given docker-compose runs, when started, then Kafka and PostgreSQL are available
  - Given VS Code opens, when in container, then Deno extensions work properly
- **Story Points**: 3

### EPIC-002: Service Migration
**Business Value**: High  
**Target Release**: v0.2.0

#### User Stories:

**STORY-005: Ingestion Service with Hono**
- As the system, I want to receive tickets via HTTP API and publish CloudEvents
- **Acceptance Criteria**:
  - Given POST to /api/tickets, when valid data, then returns ticket ID
  - Given ticket received, when processed, then publishes ticket.received event
  - Given invalid data, when submitted, then returns Zod validation errors
- **Story Points**: 5

**STORY-006: Classifier Service**
- As the system, I want to classify ticket intent using LLM
- **Acceptance Criteria**:
  - Given ticket.received event, when consumed, then classifies intent
  - Given classification complete, when successful, then publishes intent.classified
  - Given LLM timeout, when occurs, then retries with exponential backoff
- **Story Points**: 8

### EPIC-003: Evaluation Framework
**Business Value**: High  
**Target Release**: v0.3.0

#### User Stories:

**STORY-007: Evaluation Test Framework**
- As a developer, I want comprehensive evaluation suites using Deno.test
- **Acceptance Criteria**:
  - Given eval suite runs, when complete, then reports schema validation results
  - Given performance eval, when runs, then measures throughput and latency
  - Given error scenarios, when tested, then validates error handling
- **Story Points**: 8

**STORY-008: Benchmark Suite**
- As a developer, I want performance benchmarks using Deno.bench
- **Acceptance Criteria**:
  - Given benchmark runs, when complete, then reports ops/sec for each service
  - Given memory benchmark, when runs, then tracks heap usage over time
  - Given comparison mode, when enabled, then shows Python vs Deno metrics
- **Story Points**: 5

---

## 🧪 Evaluation Strategy

### Schema Validation Evals
```typescript
// tests/evals/schema.eval.ts
Deno.test("CloudEvent Schema Compliance", async (t) => {
  await t.step("validates required fields", () => {
    // Test CloudEvents spec compliance
  });
  
  await t.step("validates Zod schema inference", () => {
    // Test TypeScript type inference
  });
  
  await t.step("handles malformed events", () => {
    // Test error handling
  });
});
```

### Performance Evals
```typescript
// tests/evals/performance.eval.ts
Deno.bench("Event Processing Throughput", () => {
  // Measure events/second
});

Deno.bench("Zod Validation Performance", () => {
  // Compare with Pydantic baseline
});
```

### Integration Evals
- End-to-end event flow testing
- Service communication validation
- Error propagation testing
- Timeout and retry behavior

---

## 🚀 Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Set up repository with Deno workspace
- [ ] Create devcontainer configuration
- [ ] Implement TypedCloudEvent with Zod
- [ ] Create BaseService abstract class
- [ ] Set up Kafka integration layer
- [ ] Create service generation script

### Phase 2: Core Services (Week 2)
- [ ] Migrate Ingestion service with Hono
- [ ] Migrate Classifier service
- [ ] Implement health check endpoints
- [ ] Add structured logging
- [ ] Create event monitoring tool

### Phase 3: Evaluation Framework (Week 3)
- [ ] Create schema validation evals
- [ ] Implement performance benchmarks
- [ ] Add integration test suite
- [ ] Create comparison metrics (Python vs Deno)
- [ ] Document evaluation patterns

### Phase 4: Advanced Services (Week 4)
- [ ] Migrate routing service
- [ ] Implement KB search with vector DB
- [ ] Add auto-response service
- [ ] Implement tRPC for internal APIs
- [ ] Add distributed tracing

---

## 🎯 Success Metrics

### Performance Targets
- **Startup Time**: <500ms per service (vs Python's 2-3s)
- **Memory Usage**: <50MB per service at idle
- **Event Throughput**: >1000 events/second per service
- **Validation Speed**: <1ms per event with Zod
- **Type Safety**: 100% type coverage, zero `any` types

### Quality Metrics
- **Test Coverage**: >80% for all services
- **Eval Pass Rate**: 100% for schema validation
- **Documentation**: Every service has README with examples
- **Error Recovery**: All services handle failures gracefully

---

## 📚 Key Deliverables

1. **Working Deno microservices** with CloudEvents
2. **Comprehensive evaluation suite** with benchmarks
3. **Developer documentation** with patterns and examples
4. **Performance comparison** report (Python vs Deno)
5. **Migration guide** for remaining services
6. **Devcontainer** with complete toolchain

---

## 🔧 Development Commands

```bash
# Start development environment
deno task dev

# Run all tests
deno test --allow-all

# Run evaluations
deno test tests/evals/ --allow-all

# Run benchmarks
deno bench --allow-all

# Type check
deno check **/*.ts

# Format code
deno fmt

# Lint code
deno lint

# Bundle for production
deno compile --allow-all --output=ingestion services/ingestion/main.ts

# Generate new service
deno run --allow-all scripts/generate-service.ts --name routing
```

---

## 🏃 Quick Start Guide

1. **Clone repository and open in VS Code**
2. **Start devcontainer** (will install Deno, Claude CLI, Docker)
3. **Run infrastructure**: `docker compose up -d`
4. **Install dependencies**: `deno cache --reload import_map.json`
5. **Run first service**: `deno task dev:ingestion`
6. **Run tests**: `deno test --allow-all`

---

## 📊 Architecture Decisions

### Why Deno?
- **Native TypeScript**: No compilation step, direct execution
- **Built-in tooling**: Testing, formatting, linting, benchmarking included
- **Security**: Explicit permissions model
- **Modern**: ES modules, top-level await, Web APIs
- **Performance**: V8 engine with Rust-based runtime

### Why Hono?
- **Portability**: Works on Deno, Node.js, Bun, Cloudflare Workers
- **Performance**: One of the fastest web frameworks
- **TypeScript-first**: Excellent type inference
- **Middleware**: Rich ecosystem of middleware
- **Simple**: Express-like API with modern features

### Why Zod?
- **Type inference**: Schemas generate TypeScript types automatically
- **Composability**: Build complex schemas from simple ones
- **Transformations**: Parse and transform data in one step
- **Error messages**: Excellent error reporting
- **Performance**: Faster than alternatives for most use cases

### Why CloudEvents?
- **Standardization**: Industry-standard event format
- **Interoperability**: Works across different systems
- **Metadata**: Built-in correlation, causation, and tracing
- **Tooling**: Existing SDKs and debugging tools
- **Future-proof**: Widely adopted specification

---

## 🔄 Migration Strategy from Python/Pydantic

### Phase 1: Core Patterns
1. **TypedCloudEvent[T]** → **TypedCloudEvent<T>** with Zod
2. **Pydantic BaseModel** → **Zod schemas** with inference
3. **BaseService** → **Abstract class** with similar interface
4. **structlog** → **Deno's console** with structured output

### Phase 2: Service-by-Service
1. Start with stateless services (Ingestion, Classifier)
2. Maintain same event contracts
3. Run Python and Deno services side-by-side
4. Gradually migrate consumers
5. Deprecate Python services

### Phase 3: Advanced Features
1. Add tRPC for internal APIs
2. Implement distributed tracing
3. Add performance monitoring
4. Optimize with Deno Deploy

---

## 🧑‍💻 Developer Guidelines

### Code Style
```typescript
// Use explicit types for function parameters
function processTicket(ticket: TicketSchema): Promise<void> {
  // Implementation
}

// Use Zod for runtime validation
const TicketSchema = z.object({
  id: z.string().regex(/^TKT-\d{6}$/),
  text: z.string().min(1).max(5000),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

// Use type inference from Zod
type Ticket = z.infer<typeof TicketSchema>;
```

### Service Structure
```typescript
// services/ingestion/service.ts
export class IngestionService extends BaseService {
  async processEvent(event: CloudEvent): Promise<void> {
    const data = TicketReceivedSchema.parse(event.data);
    // Process ticket
  }
}
```

### Testing Patterns
```typescript
// Unit test
Deno.test("validates ticket data", () => {
  const result = TicketSchema.safeParse(invalidData);
  assertEquals(result.success, false);
});

// Integration test
Deno.test("publishes event to Kafka", async () => {
  const service = new IngestionService();
  await service.start();
  // Test event publishing
});

// Evaluation test
Deno.test("Ingestion Service Eval", async (t) => {
  await t.step("handles 1000 concurrent requests", async () => {
    // Performance evaluation
  });
});
```

---

## 📈 Monitoring & Observability

### Metrics to Track
- **Service Health**: Uptime, restart count
- **Event Metrics**: Events processed, failed, retried
- **Performance**: Latency p50/p95/p99, throughput
- **Resources**: Memory usage, CPU usage
- **Business Metrics**: Tickets processed, classification accuracy

### Logging Strategy
```typescript
// Structured logging
console.log(JSON.stringify({
  level: "info",
  service: "ingestion",
  event: "ticket.received",
  correlationId: "123",
  timestamp: new Date().toISOString(),
  data: { ticketId: "TKT-123456" }
}));
```

### Health Checks
```typescript
// GET /health
{
  "status": "healthy",
  "service": "ingestion",
  "version": "0.1.0",
  "uptime": 3600,
  "checks": {
    "kafka": "connected",
    "database": "connected"
  }
}
```

---

## 🔐 Security Considerations

### Deno Permissions
```bash
# Minimal permissions per service
--allow-net=kafka:9092,postgres:5432
--allow-env=KAFKA_*,DB_*
--allow-read=./config
```

### Input Validation
- All external input validated with Zod
- CloudEvents signature verification
- Rate limiting on HTTP endpoints
- SQL injection prevention with parameterized queries

### Secrets Management
- Environment variables for local development
- Docker secrets for container deployment
- Consider HashiCorp Vault for production

---

## 📖 Documentation Requirements

### Per Service
- README with purpose and API
- OpenAPI spec for HTTP endpoints
- Event contracts (subscriptions/publications)
- Configuration options
- Deployment instructions

### Project Level
- Architecture overview
- Event flow diagrams
- Development guide
- Troubleshooting guide
- Performance tuning guide

---

## 🎓 Learning Resources

### Deno
- [Deno Manual](https://deno.land/manual)
- [Deno by Example](https://examples.deno.land)
- [Deno Deploy Documentation](https://deno.com/deploy/docs)

### Libraries
- [Hono Documentation](https://hono.dev)
- [Zod Documentation](https://zod.dev)
- [CloudEvents Spec](https://cloudevents.io)
- [tRPC Documentation](https://trpc.io)

### Patterns
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Domain-Driven Design](https://martinfowler.com/tags/domain%20driven%20design.html)
- [Microservices Patterns](https://microservices.io/patterns/)

---

## 🚦 Go/No-Go Criteria for Production

### Must Have
- [ ] All services migrated and tested
- [ ] 100% eval suite passing
- [ ] Performance meets or exceeds Python baseline
- [ ] Zero critical security vulnerabilities
- [ ] Comprehensive documentation

### Should Have
- [ ] Distributed tracing implemented
- [ ] Prometheus metrics exported
- [ ] Grafana dashboards created
- [ ] Automated deployment pipeline
- [ ] Load testing completed

### Nice to Have
- [ ] Deno Deploy compatibility
- [ ] WebAssembly modules for hot paths
- [ ] GraphQL API gateway
- [ ] Multi-region deployment

---

## 📞 Support & Resources

### Team Contacts
- **Technical Lead**: [Your Name]
- **DevOps**: [DevOps Contact]
- **Product Owner**: [PO Contact]

### Communication Channels
- **Slack**: #deno-migration
- **GitHub**: [Repository URL]
- **Documentation**: [Wiki URL]

### Regular Meetings
- **Daily Standup**: 9:00 AM
- **Sprint Planning**: Mondays 10:00 AM
- **Retrospective**: Fridays 3:00 PM

---

*This document is a living artifact and will be updated as the project evolves.*