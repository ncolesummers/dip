/**
 * Prometheus metrics client for Deno
 * Provides a lightweight implementation for exposing metrics in Prometheus format
 */

import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

// Metric types
export enum MetricType {
  COUNTER = "counter",
  GAUGE = "gauge",
  HISTOGRAM = "histogram",
  SUMMARY = "summary",
}

// Metric value types
type MetricValue = number | Map<string, number>;
type Labels = Record<string, string>;

// Base metric class
abstract class Metric {
  protected name: string;
  protected help: string;
  protected type: MetricType;
  protected labelNames: string[];
  protected values: Map<string, MetricValue> = new Map();

  constructor(
    name: string,
    help: string,
    type: MetricType,
    labelNames: string[] = [],
  ) {
    this.name = name;
    this.help = help;
    this.type = type;
    this.labelNames = labelNames;
  }

  protected labelsToString(labels: Labels): string {
    if (Object.keys(labels).length === 0) return "";
    const pairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${value}"`)
      .join(",");
    return `{${pairs}}`;
  }

  abstract collect(): string;

  reset(): void {
    this.values.clear();
  }
}

// Counter metric
export class Counter extends Metric {
  constructor(name: string, help: string, labelNames: string[] = []) {
    super(name, help, MetricType.COUNTER, labelNames);
  }

  inc(labels: Labels = {}, value = 1): void {
    const key = this.labelsToString(labels);
    const current = (this.values.get(key) as number) || 0;
    this.values.set(key, current + value);
  }

  collect(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];

    for (const [labels, value] of this.values) {
      lines.push(`${this.name}${labels} ${value}`);
    }

    return lines.join("\n");
  }
}

// Gauge metric
export class Gauge extends Metric {
  constructor(name: string, help: string, labelNames: string[] = []) {
    super(name, help, MetricType.GAUGE, labelNames);
  }

  set(labels: Labels = {}, value: number): void {
    const key = this.labelsToString(labels);
    this.values.set(key, value);
  }

  inc(labels: Labels = {}, value = 1): void {
    const key = this.labelsToString(labels);
    const current = (this.values.get(key) as number) || 0;
    this.values.set(key, current + value);
  }

  dec(labels: Labels = {}, value = 1): void {
    const key = this.labelsToString(labels);
    const current = (this.values.get(key) as number) || 0;
    this.values.set(key, current - value);
  }

  collect(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];

    for (const [labels, value] of this.values) {
      lines.push(`${this.name}${labels} ${value}`);
    }

    return lines.join("\n");
  }
}

// Histogram metric
export class Histogram extends Metric {
  private buckets: number[];
  private sum: Map<string, number> = new Map();
  private count: Map<string, number> = new Map();
  private bucketValues: Map<string, Map<number, number>> = new Map();

  constructor(
    name: string,
    help: string,
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    labelNames: string[] = [],
  ) {
    super(name, help, MetricType.HISTOGRAM, labelNames);
    this.buckets = [...buckets, Infinity].sort((a, b) => a - b);
  }

  observe(labels: Labels = {}, value: number): void {
    const key = this.labelsToString(labels);

    // Update sum and count
    this.sum.set(key, (this.sum.get(key) || 0) + value);
    this.count.set(key, (this.count.get(key) || 0) + 1);

    // Update buckets
    if (!this.bucketValues.has(key)) {
      this.bucketValues.set(key, new Map());
    }
    const buckets = this.bucketValues.get(key)!;

    for (const bucket of this.buckets) {
      if (value <= bucket) {
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
      }
    }
  }

  collect(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];

    for (const [labels, buckets] of this.bucketValues) {
      for (const [bucket, count] of buckets) {
        const bucketLabel = bucket === Infinity ? "+Inf" : bucket.toString();
        const fullLabels = labels
          ? labels.replace("}", `,le="${bucketLabel}"}`)
          : `{le="${bucketLabel}"}`;
        lines.push(`${this.name}_bucket${fullLabels} ${count}`);
      }

      const sum = this.sum.get(labels) || 0;
      const count = this.count.get(labels) || 0;
      lines.push(`${this.name}_sum${labels} ${sum}`);
      lines.push(`${this.name}_count${labels} ${count}`);
    }

    return lines.join("\n");
  }
}

// Summary metric (simplified percentile calculation)
export class Summary extends Metric {
  private percentiles: number[];
  private values: Map<string, number[]> = new Map();
  private windowSize: number;

  constructor(
    name: string,
    help: string,
    percentiles: number[] = [0.5, 0.9, 0.95, 0.99],
    windowSize = 600, // 10 minutes default
    labelNames: string[] = [],
  ) {
    super(name, help, MetricType.SUMMARY, labelNames);
    this.percentiles = percentiles;
    this.windowSize = windowSize;
  }

  observe(labels: Labels = {}, value: number): void {
    const key = this.labelsToString(labels);

    if (!this.values.has(key)) {
      this.values.set(key, []);
    }

    const values = this.values.get(key)!;
    values.push(value);

    // Keep only recent values within window
    if (values.length > this.windowSize) {
      values.shift();
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  collect(): string {
    const lines: string[] = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} ${this.type}`,
    ];

    for (const [labels, values] of this.values) {
      if (values.length === 0) continue;

      for (const percentile of this.percentiles) {
        const value = this.calculatePercentile(values, percentile);
        const quantileLabel = labels
          ? labels.replace("}", `,quantile="${percentile}"}`)
          : `{quantile="${percentile}"}`;
        lines.push(`${this.name}${quantileLabel} ${value}`);
      }

      const sum = values.reduce((a, b) => a + b, 0);
      lines.push(`${this.name}_sum${labels} ${sum}`);
      lines.push(`${this.name}_count${labels} ${values.length}`);
    }

    return lines.join("\n");
  }
}

// Metrics registry
export class MetricsRegistry {
  private metrics: Map<string, Metric> = new Map();
  private customCollectors: Array<() => string> = [];

  register(metric: Metric): void {
    this.metrics.set(metric["name"], metric);
  }

  registerCollector(collector: () => string): void {
    this.customCollectors.push(collector);
  }

  collect(): string {
    const results: string[] = [];

    // Collect from registered metrics
    for (const metric of this.metrics.values()) {
      results.push(metric.collect());
    }

    // Collect from custom collectors
    for (const collector of this.customCollectors) {
      results.push(collector());
    }

    // Add process metrics
    results.push(this.collectProcessMetrics());

    return results.filter((r) => r).join("\n\n") + "\n";
  }

  private collectProcessMetrics(): string {
    const memoryUsage = Deno.memoryUsage();
    const lines: string[] = [];

    lines.push("# HELP process_resident_memory_bytes Resident memory size in bytes");
    lines.push("# TYPE process_resident_memory_bytes gauge");
    lines.push(`process_resident_memory_bytes ${memoryUsage.rss}`);

    lines.push("# HELP process_heap_bytes Process heap size in bytes");
    lines.push("# TYPE process_heap_bytes gauge");
    lines.push(`process_heap_bytes ${memoryUsage.heapUsed}`);

    return lines.join("\n");
  }

  reset(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }
}

// Global registry instance
export const defaultRegistry = new MetricsRegistry();

// Common metrics for services
export const commonMetrics = {
  // HTTP metrics
  httpRequestsTotal: new Counter(
    "http_requests_total",
    "Total number of HTTP requests",
    ["method", "route", "status"],
  ),

  httpRequestDuration: new Histogram(
    "http_request_duration_seconds",
    "HTTP request latency in seconds",
    [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    ["method", "route", "status"],
  ),

  httpRequestsInFlight: new Gauge(
    "http_requests_in_flight",
    "Number of HTTP requests currently being processed",
    ["method", "route"],
  ),

  // Event processing metrics
  eventsProcessedTotal: new Counter(
    "events_processed_total",
    "Total number of events processed",
    ["type", "status"],
  ),

  eventProcessingDuration: new Histogram(
    "event_processing_duration_seconds",
    "Event processing latency in seconds",
    [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    ["type"],
  ),

  eventsInFlight: new Gauge(
    "events_in_flight",
    "Number of events currently being processed",
    ["type"],
  ),

  // Kafka metrics
  kafkaMessagesPublished: new Counter(
    "kafka_messages_published_total",
    "Total number of messages published to Kafka",
    ["topic", "status"],
  ),

  kafkaMessagesConsumed: new Counter(
    "kafka_messages_consumed_total",
    "Total number of messages consumed from Kafka",
    ["topic", "status"],
  ),

  kafkaConsumerLag: new Gauge(
    "kafka_consumer_lag",
    "Current consumer lag for Kafka topics",
    ["topic", "partition"],
  ),

  // Business metrics
  ticketsCreated: new Counter(
    "tickets_created_total",
    "Total number of tickets created",
    ["priority", "source"],
  ),

  ticketsClassified: new Counter(
    "tickets_classified_total",
    "Total number of tickets classified",
    ["intent", "confidence_level"],
  ),

  ticketsRouted: new Counter(
    "tickets_routed_total",
    "Total number of tickets routed",
    ["queue", "skill"],
  ),

  ticketsResolved: new Counter(
    "tickets_resolved_total",
    "Total number of tickets resolved",
    ["resolution_type", "auto_resolved"],
  ),
};

// Register common metrics
for (const metric of Object.values(commonMetrics)) {
  defaultRegistry.register(metric);
}

// Metrics server
export async function startMetricsServer(port = 9090): Promise<void> {
  const handler = (req: Request): Response => {
    const url = new URL(req.url);

    if (url.pathname === "/metrics") {
      return new Response(defaultRegistry.collect(), {
        headers: { "Content-Type": "text/plain; version=0.0.4" },
      });
    }

    return new Response("Not Found", { status: 404 });
  };

  console.log(`Metrics server listening on http://0.0.0.0:${port}/metrics`);
  await serve(handler, { port });
}

// Middleware for Hono to track HTTP metrics
export function metricsMiddleware() {
  return async (c: any, next: any) => {
    const start = Date.now();
    const method = c.req.method;
    const route = c.req.routePath || c.req.path;

    // Increment in-flight requests
    commonMetrics.httpRequestsInFlight.inc({ method, route });

    try {
      await next();
    } finally {
      // Decrement in-flight requests
      commonMetrics.httpRequestsInFlight.dec({ method, route });

      // Record request metrics
      const duration = (Date.now() - start) / 1000;
      const status = c.res.status.toString();

      commonMetrics.httpRequestsTotal.inc({ method, route, status });
      commonMetrics.httpRequestDuration.observe({ method, route, status }, duration);
    }
  };
}

// Helper to track event processing
export function trackEventProcessing(eventType: string) {
  return {
    start(): () => void {
      const startTime = Date.now();
      commonMetrics.eventsInFlight.inc({ type: eventType });

      return () => {
        const duration = (Date.now() - startTime) / 1000;
        commonMetrics.eventsInFlight.dec({ type: eventType });
        commonMetrics.eventProcessingDuration.observe({ type: eventType }, duration);
      };
    },

    success(): void {
      commonMetrics.eventsProcessedTotal.inc({ type: eventType, status: "success" });
    },

    failure(): void {
      commonMetrics.eventsProcessedTotal.inc({ type: eventType, status: "failure" });
    },
  };
}
