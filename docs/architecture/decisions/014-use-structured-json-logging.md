# ADR-014: Use Structured JSON Logging

## Status

Accepted

## Context

In our microservices architecture, effective logging is critical for:

- **Debugging**: Understanding what happened during an incident
- **Monitoring**: Tracking application behavior and performance
- **Alerting**: Detecting anomalies and errors
- **Auditing**: Maintaining compliance and security trails
- **Correlation**: Tracing requests across multiple services

Traditional text-based logging presents challenges:
- Difficult to parse and query
- Inconsistent format across services
- Hard to correlate across services
- Limited filtering capabilities
- Poor integration with log aggregation tools

We need logging that is:
- Machine-readable for automated processing
- Consistent across all services
- Enriched with contextual metadata
- Efficiently searchable and filterable
- Suitable for high-volume production environments

## Decision

We will use structured JSON logging for all services, with plans to aggregate logs using Loki.

Implementation approach:
1. **Log everything as JSON** to stdout/stderr
2. **Include standard fields** in every log entry
3. **Use correlation IDs** for request tracing
4. **Implement log levels** (debug, info, warn, error)
5. **Enrich with metadata** (service name, version, environment)
6. **Plan for Loki integration** for centralized log aggregation

## Consequences

### Positive

- **Machine Readable**: Easy to parse and process programmatically
- **Queryable**: Can search and filter on specific fields
- **Consistent**: Same format across all services
- **Rich Context**: Include arbitrary metadata in logs
- **Tool Integration**: Works with modern log aggregation tools
- **Correlation**: Easy to trace requests across services
- **Performance Analysis**: Can analyze patterns and trends
- **Automation Friendly**: Enables automated alerting and analysis

### Negative

- **Verbosity**: JSON logs are larger than text logs
- **Human Readability**: Harder to read without tooling
- **Storage Cost**: Increased log storage requirements
- **Processing Overhead**: JSON serialization has a cost

### Neutral

- **Tooling Required**: Need log viewers for development
- **Schema Evolution**: Log field changes need management
- **Privacy Concerns**: Must be careful with sensitive data
- **Retention Policy**: Need to define log retention rules

## Alternatives Considered

### Plain Text Logging

Traditional line-based text logs.

**Pros:**
- Human readable
- Simple to implement
- Smaller size
- No parsing overhead

**Cons:**
- Hard to parse
- Inconsistent format
- Limited querying
- Poor tool integration

**Why not chosen:** Doesn't meet our automation and analysis needs.

### Binary Logging (Protocol Buffers)

Binary format for efficient storage.

**Pros:**
- Very compact
- Fast serialization
- Schema evolution
- Type safety

**Cons:**
- Not human readable
- Complex tooling
- Debugging difficulty
- Limited tool support

**Why not chosen:** Complexity outweighs benefits for our use case.

### OpenTelemetry Logging

Part of OpenTelemetry observability framework.

**Pros:**
- Unified with traces and metrics
- Vendor neutral
- Rich context
- Growing ecosystem

**Cons:**
- More complex setup
- Heavier dependency
- Still maturing
- Learning curve

**Why not chosen:** Will consider for future when more mature.

### Syslog Format

Traditional syslog protocol.

**Pros:**
- Well established
- Wide tool support
- Standard format
- Network capable

**Cons:**
- Limited structure
- Fixed fields
- Less flexible
- Older standard

**Why not chosen:** JSON provides more flexibility and modern tool support.

## Implementation Notes

### Log Structure

```typescript
// Standard log entry structure
interface LogEntry {
  timestamp: string;      // ISO 8601 format
  level: "debug" | "info" | "warn" | "error";
  service: string;        // Service name
  version: string;        // Service version
  environment: string;    // dev, staging, prod
  message: string;        // Log message
  correlation_id?: string; // Request correlation ID
  trace_id?: string;      // Distributed trace ID
  span_id?: string;       // Span ID for tracing
  error?: {              // Error details if applicable
    type: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>; // Additional context
}
```

### Logger Implementation

```typescript
// shared/observability/logger.ts
export class Logger {
  constructor(
    private service: string,
    private version: string
  ) {}
  
  private log(level: LogLevel, message: string, metadata?: any) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.service,
      version: this.version,
      environment: Deno.env.get("DENO_ENV") || "development",
      message,
      correlation_id: getCorrelationId(),
      ...metadata
    };
    
    console.log(JSON.stringify(entry));
  }
  
  debug(message: string, metadata?: any) {
    this.log("debug", message, metadata);
  }
  
  info(message: string, metadata?: any) {
    this.log("info", message, metadata);
  }
  
  warn(message: string, metadata?: any) {
    this.log("warn", message, metadata);
  }
  
  error(message: string, error?: Error, metadata?: any) {
    this.log("error", message, {
      ...metadata,
      error: error ? {
        type: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
}
```

### Usage in Services

```typescript
// services/ingestion/main.ts
const logger = new Logger("ingestion-service", "1.0.0");

app.post("/ingest", async (c) => {
  const correlationId = c.req.header("X-Correlation-ID") || crypto.randomUUID();
  setCorrelationId(correlationId);
  
  logger.info("Document ingestion started", {
    method: c.req.method,
    path: c.req.path,
    correlation_id: correlationId
  });
  
  try {
    const document = await c.req.json();
    logger.debug("Document received", {
      document_id: document.id,
      size: document.size
    });
    
    const result = await processDocument(document);
    
    logger.info("Document processed successfully", {
      document_id: result.id,
      processing_time: result.processingTime
    });
    
    return c.json(result);
  } catch (error) {
    logger.error("Document processing failed", error, {
      correlation_id: correlationId
    });
    throw error;
  }
});
```

### Log Output Example

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "info",
  "service": "ingestion-service",
  "version": "1.0.0",
  "environment": "production",
  "message": "Document processed successfully",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "document_id": "doc-123",
  "processing_time": 1234
}
```

### Development Log Viewing

```bash
# Pretty print logs during development
deno task dev | jq '.'

# Filter by level
deno task dev | jq 'select(.level == "error")'

# Follow specific correlation ID
deno task dev | jq 'select(.correlation_id == "xyz")'
```

### Future Loki Integration

```yaml
# loki-config.yaml
positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: dip-services
    static_configs:
      - targets:
          - localhost
        labels:
          job: dip
          __path__: /var/log/dip/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            service: service
            correlation_id: correlation_id
      - labels:
          level:
          service:
      - timestamp:
          source: timestamp
          format: RFC3339
```

### Log Level Guidelines

- **DEBUG**: Detailed information for debugging
- **INFO**: General informational messages
- **WARN**: Warning messages for potential issues
- **ERROR**: Error messages for failures

```typescript
// Examples
logger.debug("Cache miss for key", { key: "user:123" });
logger.info("Request completed", { duration: 100 });
logger.warn("Rate limit approaching", { current: 950, limit: 1000 });
logger.error("Database connection failed", error);
```

## References

- [The Log: What every software engineer should know](https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know-about-real-time-datas-unifying)
- [Structured Logging](https://www.sumologic.com/glossary/structured-logging/)
- [12 Factor App - Logs](https://12factor.net/logs)
- [Grafana Loki Documentation](https://grafana.com/docs/loki/)