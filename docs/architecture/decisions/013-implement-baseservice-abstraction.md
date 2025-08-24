# ADR-013: Implement BaseService Abstraction

## Status

Accepted

## Context

With multiple microservices in our architecture (ADR-012), we face common requirements across all services:

- **Health checks**: Kubernetes liveness/readiness probes
- **Metrics exposure**: Prometheus metrics endpoint
- **Graceful shutdown**: Clean resource cleanup
- **Event publishing**: Kafka event emission
- **Configuration management**: Environment variables and config files
- **Logging standards**: Structured JSON logging
- **Error handling**: Consistent error responses

Without standardization, we risk:

- Code duplication across services
- Inconsistent implementations
- Missing critical features
- Maintenance overhead
- Difficult debugging

## Decision

We will implement a BaseService abstract class that all services extend, providing common functionality.

The BaseService will include:

1. **Lifecycle management**: Start, stop, health checks
2. **HTTP server setup**: Using Hono with standard middleware
3. **Metrics collection**: Prometheus metrics registry
4. **Event publishing**: Kafka producer setup
5. **Configuration loading**: Environment and file-based config
6. **Logging setup**: Structured JSON logging
7. **Graceful shutdown**: Signal handling and cleanup

## Consequences

### Positive

- **Consistency**: All services behave predictably
- **Rapid Development**: New services get features automatically
- **Maintainability**: Fix once, apply everywhere
- **Best Practices**: Enforces patterns across services
- **Reduced Bugs**: Common functionality well-tested
- **Developer Experience**: Less boilerplate to write
- **Operational Excellence**: Standard monitoring and health checks

### Negative

- **Abstraction Overhead**: May hide important details
- **Flexibility Constraints**: Services must fit the pattern
- **Learning Curve**: Developers must understand base class
- **Coupling**: Changes affect all services

### Neutral

- **Evolution Strategy**: Base class needs versioning strategy
- **Testing Approach**: Need to test base functionality
- **Documentation Needs**: Must document extension points

## Alternatives Considered

### Copy-Paste Template

Provide a template service to copy.

**Pros:**

- Simple to understand
- Full flexibility
- No hidden behavior
- Easy to customize

**Cons:**

- Code duplication
- Divergence over time
- Manual updates needed
- Inconsistency risk

**Why not chosen:** Maintenance overhead and inconsistency risks too high.

### Composition with Libraries

Provide functionality as composable libraries.

**Pros:**

- More flexible
- Pick and choose features
- Explicit dependencies
- Easier testing

**Cons:**

- More boilerplate
- Easy to forget features
- Less consistency
- More complex setup

**Why not chosen:** Want to ensure all services have critical features.

### Code Generation

Generate service boilerplate.

**Pros:**

- No runtime overhead
- Full visibility
- Customizable templates
- Type-safe

**Cons:**

- Complex tooling
- Regeneration issues
- Version management
- Learning curve

**Why not chosen:** Runtime abstraction simpler for our needs.

## Implementation Notes

### BaseService Implementation

```typescript
// shared/services/base.ts
import { Hono } from "hono";
import { KafkaProducer } from "@shared/events";
import { MetricsRegistry } from "@shared/observability";

export interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  kafkaBrokers?: string[];
}

export abstract class BaseService {
  protected app: Hono;
  protected producer?: KafkaProducer;
  protected metrics: MetricsRegistry;
  private server?: Deno.HttpServer;

  constructor(protected config: ServiceConfig) {
    this.app = new Hono();
    this.metrics = new MetricsRegistry();
    this.setupBaseRoutes();
    this.setupMetrics();
    this.setupShutdown();
  }

  private setupBaseRoutes() {
    // Health checks
    this.app.get("/health", (c) => {
      const health = this.getHealth();
      const status = health.status === "healthy" ? 200 : 503;
      return c.json(health, status);
    });

    this.app.get("/ready", (c) => {
      const ready = this.isReady();
      return c.json({ ready }, ready ? 200 : 503);
    });

    // Metrics endpoint
    this.app.get("/metrics", async (c) => {
      const metrics = await this.metrics.getMetrics();
      return c.text(metrics);
    });
  }

  private setupMetrics() {
    // Standard metrics
    this.metrics.registerGauge(
      "service_info",
      "Service information",
      { name: this.config.name, version: this.config.version },
    );

    this.metrics.registerCounter(
      "service_requests_total",
      "Total requests",
    );

    this.metrics.registerHistogram(
      "service_request_duration_seconds",
      "Request duration",
    );
  }

  private setupShutdown() {
    const signals = ["SIGTERM", "SIGINT"];
    signals.forEach((signal) => {
      Deno.addSignalListener(signal as Deno.Signal, async () => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        await this.stop();
        Deno.exit(0);
      });
    });
  }

  async start() {
    // Initialize Kafka if configured
    if (this.config.kafkaBrokers) {
      this.producer = new KafkaProducer(this.config.kafkaBrokers);
      await this.producer.connect();
    }

    // Start HTTP server
    this.server = Deno.serve(
      { port: this.config.port },
      this.app.fetch,
    );

    console.log(`${this.config.name} v${this.config.version} started on port ${this.config.port}`);
  }

  async stop() {
    // Cleanup resources
    if (this.producer) {
      await this.producer.disconnect();
    }

    if (this.server) {
      await this.server.shutdown();
    }

    console.log(`${this.config.name} stopped`);
  }

  protected async publishEvent(event: CloudEvent) {
    if (!this.producer) {
      throw new Error("Kafka producer not initialized");
    }
    await this.producer.send(event);
  }

  // Abstract methods for services to implement
  protected abstract getHealth(): HealthStatus;
  protected abstract isReady(): boolean;
}
```

### Service Implementation Example

```typescript
// services/ingestion/main.ts
import { BaseService } from "@shared/services";

export class IngestionService extends BaseService {
  private ready = false;

  constructor() {
    super({
      name: "ingestion-service",
      version: "1.0.0",
      port: 8080,
      kafkaBrokers: ["kafka:9092"],
    });

    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.post("/ingest", async (c) => {
      // Service-specific logic
      const document = await c.req.json();

      // Process document
      const processed = await this.processDocument(document);

      // Publish event using base class method
      await this.publishEvent({
        type: "document.ingested",
        source: "/services/ingestion",
        data: processed,
      });

      return c.json({ id: processed.id });
    });
  }

  protected getHealth(): HealthStatus {
    return {
      status: "healthy",
      checks: {
        kafka: this.producer?.isConnected() ?? false,
      },
    };
  }

  protected isReady(): boolean {
    return this.ready && (this.producer?.isConnected() ?? true);
  }

  async start() {
    await super.start();
    // Service-specific initialization
    this.ready = true;
  }
}

// Start the service
const service = new IngestionService();
await service.start();
```

### Testing BaseService

```typescript
// shared/services/base.test.ts
import { assertEquals } from "@std/assert";
import { BaseService } from "./base.ts";

class TestService extends BaseService {
  protected getHealth() {
    return { status: "healthy" };
  }

  protected isReady() {
    return true;
  }
}

Deno.test("BaseService provides health endpoint", async () => {
  const service = new TestService({
    name: "test",
    version: "1.0.0",
    port: 0,
  });

  const response = await service.app.request("/health");
  assertEquals(response.status, 200);

  const health = await response.json();
  assertEquals(health.status, "healthy");
});
```

## References

- [Template Method Pattern](https://refactoring.guru/design-patterns/template-method)
- [Dependency Inversion Principle](https://en.wikipedia.org/wiki/Dependency_inversion_principle)
- [The Pragmatic Programmer](https://pragprog.com/titles/tpp20/) - DRY Principle
- [Microservice Chassis Pattern](https://microservices.io/patterns/microservice-chassis.html)
