# ADR-012: Adopt Microservices Pattern

## Status

Accepted

## Context

The Deno Intelligence Platform needs to handle diverse workloads with varying computational requirements:

- **Ingestion**: High I/O, variable load
- **Classification**: CPU-intensive, ML models
- **Routing**: Business logic, low latency
- **Response Generation**: Template processing, caching

A monolithic architecture would face challenges:
- Single scaling unit for diverse workloads
- Technology lock-in for all components
- Large blast radius for failures
- Slow deployment cycles
- Team coupling and coordination overhead

We need an architecture that allows:
- Independent scaling of components
- Technology diversity where beneficial
- Fault isolation
- Rapid deployment and iteration
- Team autonomy

## Decision

We will adopt a microservices architecture with clearly defined service boundaries.

Service decomposition:
1. **Ingestion Service**: Document intake and preprocessing
2. **Classification Service**: ML-based document classification
3. **Routing Service**: Business rules and routing logic
4. **Response Service**: Response generation and delivery

Principles:
- Services own their data and state
- Communication via events (async) and APIs (sync)
- Independent deployment and scaling
- Shared libraries for cross-cutting concerns

## Consequences

### Positive

- **Independent Scaling**: Scale services based on their specific load
- **Technology Freedom**: Choose best tech for each service
- **Fault Isolation**: Failures contained to single service
- **Team Autonomy**: Teams can work independently
- **Deployment Flexibility**: Deploy services independently
- **Maintainability**: Smaller, focused codebases
- **Replaceability**: Services can be rewritten if needed

### Negative

- **Operational Complexity**: More services to monitor and manage
- **Network Overhead**: Inter-service communication latency
- **Data Consistency**: Distributed transactions are complex
- **Debugging Difficulty**: Tracing issues across services
- **Infrastructure Cost**: More resources needed
- **Development Overhead**: Service boundaries and contracts

### Neutral

- **Team Structure**: Conway's Law considerations
- **Testing Strategy**: Need integration and contract testing
- **Security Model**: Service-to-service authentication
- **Deployment Pipeline**: More complex CI/CD

## Alternatives Considered

### Monolithic Architecture

Single deployable application.

**Pros:**
- Simple deployment
- Easy debugging
- No network overhead
- Consistent data model
- Simple transactions

**Cons:**
- Scaling limitations
- Technology lock-in
- Large blast radius
- Slow deployments
- Team coupling

**Why not chosen:** Doesn't meet our scaling and autonomy requirements.

### Modular Monolith

Monolith with clear module boundaries.

**Pros:**
- Simpler than microservices
- Clear boundaries
- No network overhead
- Easier refactoring
- Single deployment

**Cons:**
- Still single scaling unit
- Technology constraints
- Shared failure domain
- Module coupling risk

**Why not chosen:** A good starting point, but we need independent scaling now.

### Serverless Functions

Function-as-a-Service architecture.

**Pros:**
- Infinite scaling
- Pay per use
- No server management
- Automatic scaling

**Cons:**
- Vendor lock-in
- Cold starts
- Limited execution time
- Complex orchestration
- Higher costs at scale

**Why not chosen:** Cold starts and vendor lock-in are concerns for our use case.

## Implementation Notes

### Service Boundaries

```yaml
# Service Responsibilities

Ingestion Service:
  - Accept documents via HTTP/gRPC
  - Validate input format
  - Extract metadata
  - Store in temporary storage
  - Emit ingestion events

Classification Service:
  - Listen for ingestion events
  - Load and apply ML models
  - Classify documents
  - Calculate confidence scores
  - Emit classification events

Routing Service:
  - Listen for classification events
  - Apply business rules
  - Determine routing destination
  - Handle prioritization
  - Emit routing events

Response Service:
  - Listen for routing events
  - Generate responses
  - Apply templates
  - Handle delivery
  - Track delivery status
```

### Communication Patterns

```typescript
// Async: Event-driven via Kafka
service.on("document.ingested", async (event) => {
  const result = await classify(event.data);
  await publish("document.classified", result);
});

// Sync: HTTP API for queries
app.get("/documents/:id", async (c) => {
  const doc = await getDocument(c.req.param("id"));
  return c.json(doc);
});
```

### Shared Libraries

```
shared/
  events/       # Event definitions and publishing
  schemas/      # Zod schemas
  observability/ # Metrics and logging
  services/     # BaseService class
  types/        # Shared TypeScript types
```

### Service Template

```typescript
// services/[service-name]/main.ts
import { BaseService } from "@shared/services";

export class ServiceName extends BaseService {
  constructor() {
    super({
      name: "service-name",
      version: "1.0.0",
      port: 8080
    });
  }
  
  async start() {
    await super.start();
    // Service-specific initialization
  }
  
  async stop() {
    // Service-specific cleanup
    await super.stop();
  }
}

const service = new ServiceName();
await service.start();
```

### Deployment Structure

```yaml
# docker-compose.yml
services:
  ingestion:
    build: ./services/ingestion
    ports:
      - "8081:8080"
    environment:
      - KAFKA_BROKERS=kafka:9092
    depends_on:
      - kafka
  
  classification:
    build: ./services/classification
    ports:
      - "8082:8080"
    environment:
      - KAFKA_BROKERS=kafka:9092
      - MODEL_PATH=/models
    volumes:
      - ./models:/models
    depends_on:
      - kafka
```

## References

- [Building Microservices](https://www.oreilly.com/library/view/building-microservices-2nd/9781492034018/) - Sam Newman
- [Microservices Patterns](https://microservices.io/patterns/) - Chris Richardson
- [Domain-Driven Design](https://www.domainlanguage.com/ddd/) - Eric Evans
- [The Twelve-Factor App](https://12factor.net/)