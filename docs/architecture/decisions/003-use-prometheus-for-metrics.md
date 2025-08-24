# ADR-003: Use Prometheus for Metrics Collection

## Status

Accepted

## Context

The Deno Intelligence Platform requires comprehensive observability to ensure reliability, performance, and operational excellence. Metrics are a critical pillar of observability, providing quantitative data about system behavior. We need a metrics solution that:

- **Handles high cardinality data** from multiple microservices
- **Supports dimensional metrics** for flexible querying and aggregation
- **Scales horizontally** with our microservices architecture
- **Integrates with modern tooling** for alerting and visualization
- **Provides a pull-based model** to reduce coupling between services and monitoring
- **Offers a powerful query language** for complex analysis

Our microservices architecture presents specific challenges:

- Multiple services generating metrics independently
- Need for both business metrics (events processed) and technical metrics (latency, errors)
- Requirement for SLI/SLO tracking as defined in our monitoring strategy
- Must support distributed tracing correlation
- Should enable both real-time monitoring and historical analysis

## Decision

We will use Prometheus as our primary metrics collection and storage system.

Specifically, we will:

1. **Implement Prometheus exposition format** in all services using the `/metrics` endpoint
2. **Deploy Prometheus server** to scrape metrics from all services
3. **Use Pushgateway** for batch jobs and short-lived processes
4. **Standardize metric naming** following Prometheus conventions
5. **Define recording rules** for commonly computed metrics
6. **Implement metric types** appropriate for each use case (counters, gauges, histograms, summaries)

All services will expose metrics including:

- RED metrics (Rate, Errors, Duration)
- USE metrics (Utilization, Saturation, Errors) where applicable
- Business-specific metrics (events processed, classification accuracy, etc.)

## Consequences

### Positive

- **Industry Standard**: Widely adopted with extensive community support and documentation
- **Powerful Query Language**: PromQL enables complex analysis and aggregation
- **Pull-Based Model**: Services don't need to know about monitoring infrastructure
- **Native Kubernetes Support**: Excellent service discovery in containerized environments
- **Efficient Storage**: Time-series optimized storage with compression
- **Ecosystem Integration**: Works seamlessly with Grafana, AlertManager, and other tools
- **Multi-Dimensional Data**: Labels enable flexible slicing and dicing of metrics
- **Built-in Alerting**: AlertManager provides sophisticated alert routing and grouping

### Negative

- **Limited Long-term Storage**: Requires additional solution for long-term retention (> few weeks)
- **Cardinality Limits**: High cardinality labels can cause performance issues
- **Pull Model Limitations**: Requires service discovery or static configuration
- **No Built-in Authentication**: Requires additional security layers in production
- **Learning Curve**: PromQL requires learning for effective use

### Neutral

- **Resource Requirements**: Needs dedicated resources for Prometheus server
- **Operational Overhead**: Requires configuration management and capacity planning
- **No Distributed Storage**: Single-node storage model (though federation is possible)
- **Text-Based Format**: Human-readable but requires parsing

## Alternatives Considered

### OpenTelemetry Metrics

The emerging standard for observability data collection.

**Pros:**

- Vendor-neutral standard
- Unified approach for traces, metrics, and logs
- Growing ecosystem support
- Automatic instrumentation capabilities

**Cons:**

- Less mature than Prometheus
- Requires separate backend for storage
- More complex setup
- Smaller community currently

**Why not chosen:** While OpenTelemetry is the future, Prometheus has better tooling and maturity today. We can migrate to OpenTelemetry later while still using Prometheus as the backend.

### StatsD

A simple, text-based protocol for metrics.

**Pros:**

- Very simple protocol
- Wide language support
- Low overhead
- Push-based model

**Cons:**

- Limited metric types
- No labels/dimensions
- Requires aggregation server
- Less powerful querying

**Why not chosen:** Lacks the dimensional data model and querying capabilities we need for complex analysis.

### Datadog

A commercial SaaS monitoring platform.

**Pros:**

- Fully managed service
- Excellent UI and alerting
- Integrated APM and logging
- No operational overhead

**Cons:**

- Significant cost at scale
- Vendor lock-in
- Data leaves our infrastructure
- Less flexibility in data retention

**Why not chosen:** Cost and data sovereignty concerns outweigh the convenience of a managed service.

### InfluxDB

A time-series database with monitoring capabilities.

**Pros:**

- Purpose-built for time-series data
- SQL-like query language
- Good performance
- Supports both push and pull

**Cons:**

- Less ecosystem support
- Smaller community
- More complex setup than Prometheus
- InfluxQL less powerful than PromQL for monitoring

**Why not chosen:** Prometheus has better ecosystem integration and is more focused on monitoring use cases.

## Implementation Notes

### Service Implementation

Each service exposes metrics using our base service implementation:

```typescript
// In shared/services/base.ts
export abstract class BaseService {
  private metricsRegistry: MetricsRegistry;

  protected setupMetrics() {
    // Request duration histogram
    this.requestDuration = this.metricsRegistry.histogram(
      "service_request_duration_seconds",
      "Request duration in seconds",
      ["method", "status"],
    );

    // Total requests counter
    this.requestTotal = this.metricsRegistry.counter(
      "service_requests_total",
      "Total number of requests",
      ["method", "status"],
    );

    // Active connections gauge
    this.activeConnections = this.metricsRegistry.gauge(
      "service_active_connections",
      "Number of active connections",
    );
  }
}
```

### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "dip-services"
    static_configs:
      - targets:
          - "ingestion-service:8080"
          - "classification-service:8080"
          - "routing-service:8080"
          - "response-service:8080"
    metrics_path: "/metrics"
```

### Metric Naming Conventions

Following Prometheus best practices:

- Use snake_case for metric names
- Include unit in the name (e.g., `_seconds`, `_bytes`)
- Use standard prefixes:
  - `service_` for application metrics
  - `process_` for runtime metrics
  - `http_` for HTTP-specific metrics

### Example Metrics

```typescript
// Business metrics
const eventsProcessed = counter(
  "dip_events_processed_total",
  "Total number of events processed",
  ["service", "event_type", "status"],
);

// SLI metrics for SLO tracking
const requestLatency = histogram(
  "dip_request_duration_seconds",
  "Request latency in seconds",
  ["service", "operation"],
  [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

// Error tracking
const errorRate = counter(
  "dip_errors_total",
  "Total number of errors",
  ["service", "error_type", "severity"],
);
```

### Recording Rules

Define commonly used queries as recording rules:

```yaml
groups:
  - name: dip_aggregations
    interval: 30s
    rules:
      - record: service:request_rate
        expr: rate(service_requests_total[5m])

      - record: service:error_rate
        expr: rate(service_requests_total{status=~"5.."}[5m])

      - record: service:p95_latency
        expr: histogram_quantile(0.95, rate(service_request_duration_seconds_bucket[5m]))
```

### Dashboard Integration

Metrics are visualized in Grafana (see ADR-004) with pre-built dashboards for:

- Service overview (RED metrics)
- Business metrics
- SLO compliance
- Infrastructure metrics

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Google SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [The RED Method](https://www.weave.works/blog/the-red-method-key-metrics-for-microservices-architecture/)
- [Prometheus: Up & Running](https://www.oreilly.com/library/view/prometheus-up/9781492034131/) - O'Reilly Book
