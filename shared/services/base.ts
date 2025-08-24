/**
 * BaseService abstract class
 * Provides common functionality for all microservices
 */

import { Handler, serve } from "@std/http";
import { Hono } from "hono";
import { CloudEventConsumer, CloudEventPublisher } from "@events/mod.ts";
import { TypedCloudEvent } from "@events/base.ts";
import { EventType, EventTypes } from "@events/types.ts";
import { commonMetrics, metricsMiddleware, startMetricsServer } from "@observability/metrics.ts";

// Tracing types and interfaces
export interface TracingSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operation: string;
  startTime: number;
  endTime?: number;
  tags: Record<string, string | number | boolean>;
  status: "ok" | "error" | "timeout";
}

export interface TracingContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  baggage: Record<string, string>;
}

// Simple tracer implementation (OpenTelemetry-compatible interface)
export class SimpleTracer {
  private spans: TracingSpan[] = [];
  private activeSpans: Map<string, TracingSpan> = new Map();

  createSpan(operation: string, context?: TracingContext): TracingSpan {
    const span: TracingSpan = {
      traceId: context?.traceId || this.generateId(),
      spanId: this.generateId(),
      parentSpanId: context?.spanId,
      operation,
      startTime: Date.now(),
      tags: {},
      status: "ok",
    };

    this.spans.push(span);
    this.activeSpans.set(span.spanId, span);
    return span;
  }

  finishSpan(span: TracingSpan, status: "ok" | "error" | "timeout" = "ok"): void {
    span.endTime = Date.now();
    span.status = status;
    this.activeSpans.delete(span.spanId);
  }

  addTag(span: TracingSpan, key: string, value: string | number | boolean): void {
    span.tags[key] = value;
  }

  getContext(span: TracingSpan): TracingContext {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      baggage: {},
    };
  }

  private generateId(): string {
    return crypto.randomUUID().replace(/-/g, "").substring(0, 16);
  }

  getSpans(): TracingSpan[] {
    return [...this.spans];
  }

  reset(): void {
    this.spans.length = 0;
    this.activeSpans.clear();
  }
}

// Global tracer instance
export const globalTracer = new SimpleTracer();

export interface ServiceConfig {
  name: string;
  version: string;
  port: number;
  metricsPort?: number;
  kafkaBrokers?: string[];
  kafkaTopics?: string[];
  healthCheckPath?: string;
  readinessCheckPath?: string;
  gracefulShutdownTimeout?: number;
  environment?: string;
}

export interface HealthCheckResponse {
  status: "healthy" | "unhealthy" | "degraded";
  service: string;
  version: string;
  uptime: number;
  timestamp: string;
  checks: Record<string, {
    status: "ok" | "error";
    message?: string;
    latency?: number;
  }>;
}

export abstract class BaseService {
  protected config: ServiceConfig;
  protected app: Hono;
  protected consumer?: CloudEventConsumer;
  protected publisher?: CloudEventPublisher;
  protected startTime: number;
  protected shutdownHandlers: Array<() => Promise<void>> = [];
  protected isShuttingDown = false;
  protected isRunning = false;
  protected abortController: AbortController;
  protected tracer: SimpleTracer;

  constructor(config: ServiceConfig) {
    this.config = {
      healthCheckPath: "/health",
      readinessCheckPath: "/ready",
      gracefulShutdownTimeout: 30000,
      environment: Deno.env.get("DENO_ENV") || "development",
      ...config,
    };

    this.app = new Hono();
    this.startTime = Date.now();
    this.abortController = new AbortController();
    this.tracer = globalTracer;

    this.setupMiddleware();
    this.setupHealthChecks();
    this.setupSignalHandlers();
  }

  /**
   * Setup common middleware
   */
  protected setupMiddleware(): void {
    // Tracing middleware
    this.app.use("*", async (c, next) => {
      // Extract tracing context from headers
      const traceId = c.req.header("x-trace-id") || c.req.header("traceparent")?.split("-")[1];
      const parentSpanId = c.req.header("x-span-id") || c.req.header("traceparent")?.split("-")[2];
      
      const context: TracingContext = {
        traceId: traceId || this.tracer.createSpan("").traceId,
        spanId: parentSpanId || "",
        parentSpanId,
        baggage: {},
      };

      // Create span for this request
      const span = this.tracer.createSpan(`${c.req.method} ${c.req.path}`, context);
      this.tracer.addTag(span, "http.method", c.req.method);
      this.tracer.addTag(span, "http.url", c.req.path);
      this.tracer.addTag(span, "service.name", this.config.name);

      // Add tracing headers to response
      c.header("x-trace-id", span.traceId);
      c.header("x-span-id", span.spanId);

      // Store span in context for use in handlers
      (c as any).set("span", span);
      (c as any).set("traceId", span.traceId);

      try {
        await next();
        
        this.tracer.addTag(span, "http.status_code", c.res.status);
        this.tracer.finishSpan(span, c.res.status >= 400 ? "error" : "ok");
      } catch (error) {
        this.tracer.addTag(span, "error", true);
        this.tracer.addTag(span, "error.message", error instanceof Error ? error.message : String(error));
        this.tracer.finishSpan(span, "error");
        throw error;
      }
    });

    // CORS
    this.app.use("*", async (c, next) => {
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-trace-id, x-span-id");

      if (c.req.method === "OPTIONS") {
        return new Response(null, { status: 204 });
      }

      return await next();
    });

    // Logging
    if (this.config.environment !== "test") {
      this.app.use("*", async (c, next) => {
        const start = Date.now();
        const traceId = (c as any).get("traceId");
        await next();
        const ms = Date.now() - start;
        console.log(`[${traceId}] ${c.req.method} ${c.req.path} - ${c.res.status} ${ms}ms`);
      });
    }

    // Metrics
    this.app.use("*", metricsMiddleware());

    // Error handling
    this.app.onError((err, c) => {
      console.error(`Error in ${this.config.name}:`, err);

      commonMetrics.httpRequestsTotal.inc({
        method: c.req.method,
        route: c.req.path,
        status: "500",
      });

      return c.json(
        {
          error: "Internal Server Error",
          message: this.config.environment === "development" ? err.message : undefined,
          service: this.config.name,
          timestamp: new Date().toISOString(),
        },
        500,
      );
    });
  }

  /**
   * Setup health check endpoints
   */
  protected setupHealthChecks(): void {
    // Liveness probe
    this.app.get(this.config.healthCheckPath!, async (c) => {
      const health = await this.getHealthStatus();
      const statusCode = health.status === "healthy"
        ? 200
        : health.status === "degraded"
        ? 200
        : 503;

      return c.json(health, statusCode);
    });

    // Readiness probe
    this.app.get(this.config.readinessCheckPath!, async (c) => {
      const ready = await this.isReady();

      if (ready) {
        return c.json({
          status: "ready",
          service: this.config.name,
          version: this.config.version,
        }, 200);
      } else {
        return c.json({
          status: "not_ready",
          service: this.config.name,
          version: this.config.version,
        }, 503);
      }
    });

    // Service info endpoint
    this.app.get("/info", (c) => {
      return c.json({
        service: this.config.name,
        version: this.config.version,
        environment: this.config.environment,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  protected setupSignalHandlers(): void {
    // Skip signal handlers in test environment to prevent leaks
    if (this.config.environment === "test") {
      return;
    }

    const signals = ["SIGTERM", "SIGINT", "SIGUSR2"];

    signals.forEach((signal) => {
      Deno.addSignalListener(signal as Deno.Signal, async () => {
        console.log(`Received ${signal}, starting graceful shutdown...`);
        await this.shutdown();
      });
    });
  }

  /**
   * Initialize Kafka consumer if needed
   */
  protected initializeConsumer(topics: string[]): void {
    const brokers = this.config.kafkaBrokers ||
      (Deno.env.get("KAFKA_BROKERS") || "localhost:9092").split(",");

    this.consumer = new CloudEventConsumer({
      clientId: `${this.config.name}-consumer`,
      groupId: `${this.config.name}-group`,
      brokers,
      topics,
    });

    // Register shutdown handler
    this.shutdownHandlers.push(async () => {
      if (this.consumer?.isRunning()) {
        await this.consumer.stop();
      }
    });
  }

  /**
   * Initialize Kafka publisher if needed
   */
  protected async initializePublisher(defaultTopic?: string): Promise<void> {
    const brokers = this.config.kafkaBrokers ||
      (Deno.env.get("KAFKA_BROKERS") || "localhost:9092").split(",");

    this.publisher = new CloudEventPublisher({
      clientId: `${this.config.name}-producer`,
      brokers,
      defaultTopic,
      compression: "snappy",
      idempotent: true,
    });

    await this.publisher.connect();

    // Register shutdown handler
    this.shutdownHandlers.push(async () => {
      if (this.publisher?.isConnected()) {
        await this.publisher.disconnect();
      }
    });
  }

  /**
   * Start the service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error(`Service ${this.config.name} is already running`);
    }

    try {
      // Initialize service-specific components
      await this.initialize();

      // Start Kafka consumer if configured
      if (this.consumer) {
        await this.consumer.start();
      }

      // Start metrics server
      if (this.config.metricsPort) {
        startMetricsServer(this.config.metricsPort);
      }

      // Start HTTP server
      const handler = this.app.fetch.bind(this.app);

      console.log(
        `🚀 ${this.config.name} v${this.config.version} starting on port ${this.config.port}`,
      );
      console.log(
        `📊 Metrics available at http://localhost:${this.config.metricsPort || 9090}/metrics`,
      );
      console.log(
        `🏥 Health check at http://localhost:${this.config.port}${this.config.healthCheckPath}`,
      );

      await serve(handler as Handler, {
        port: this.config.port,
        signal: this.abortController.signal,
        onListen: ({ hostname, port }) => {
          this.isRunning = true;
          console.log(`✅ ${this.config.name} is running at http://${hostname}:${port}`);

          // Emit service started event
          this.emitServiceEvent(EventTypes.SERVICE_STARTED, {
            service: this.config.name,
            version: this.config.version,
            port,
            environment: this.config.environment,
          });
        },
      });
    } catch (error) {
      console.error(`Failed to start ${this.config.name}:`, error);

      // Emit service error event
      this.emitServiceEvent(EventTypes.SERVICE_ERROR, {
        service: this.config.name,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  }

  /**
   * Stop the service (graceful shutdown without exiting process)
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log(`Stopping ${this.config.name}...`);

    try {
      // Stop accepting new requests
      this.abortController.abort();

      // Run all shutdown handlers
      await Promise.all(this.shutdownHandlers.map((handler) => handler()));

      // Service-specific cleanup
      await this.cleanup();

      this.isRunning = false;
      console.log(`${this.config.name} stopped successfully`);

      // Emit service stopped event
      await this.emitServiceEvent(EventTypes.SERVICE_STOPPED, {
        service: this.config.name,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      });
    } catch (error) {
      console.error("Error during service stop:", error);
      throw error;
    }
  }

  /**
   * Restart the service
   */
  async restart(): Promise<void> {
    console.log(`Restarting ${this.config.name}...`);

    if (this.isRunning) {
      await this.stop();
    }

    // Reset abort controller for new startup
    this.abortController = new AbortController();
    
    // Wait a bit before restarting
    await new Promise(resolve => setTimeout(resolve, 1000));

    await this.start();
  }

  /**
   * Graceful shutdown (with process exit)
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log(`Shutting down ${this.config.name}...`);

    // Set shutdown timeout
    const timeoutId = setTimeout(() => {
      console.error("Graceful shutdown timeout, forcing exit");
      Deno.exit(1);
    }, this.config.gracefulShutdownTimeout!);

    try {
      // Use stop() method for clean shutdown
      await this.stop();

      clearTimeout(timeoutId);
      console.log(`${this.config.name} shutdown complete`);

      Deno.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      clearTimeout(timeoutId);
      Deno.exit(1);
    }
  }

  /**
   * Get health status
   */
  protected async getHealthStatus(): Promise<HealthCheckResponse> {
    const checks: HealthCheckResponse["checks"] = {};

    // Check Kafka consumer
    if (this.consumer) {
      const start = Date.now();
      try {
        const isRunning = this.consumer.isRunning();
        checks.kafka_consumer = {
          status: isRunning ? "ok" : "error",
          message: isRunning ? "Consumer is running" : "Consumer is not running",
          latency: Date.now() - start,
        };
      } catch (error) {
        checks.kafka_consumer = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          latency: Date.now() - start,
        };
      }
    }

    // Check Kafka publisher
    if (this.publisher) {
      const start = Date.now();
      try {
        const isConnected = this.publisher.isConnected();
        checks.kafka_publisher = {
          status: isConnected ? "ok" : "error",
          message: isConnected ? "Publisher is connected" : "Publisher is not connected",
          latency: Date.now() - start,
        };
      } catch (error) {
        checks.kafka_publisher = {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
          latency: Date.now() - start,
        };
      }
    }

    // Add service-specific health checks
    const serviceChecks = await this.performHealthChecks();
    Object.assign(checks, serviceChecks);

    // Determine overall status
    const hasErrors = Object.values(checks).some((check) => check.status === "error");
    const status = this.isShuttingDown ? "unhealthy" : hasErrors ? "degraded" : "healthy";

    return {
      status,
      service: this.config.name,
      version: this.config.version,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /**
   * Emit service event
   */
  protected async emitServiceEvent(type: EventType, data: unknown): Promise<void> {
    if (!this.publisher?.isConnected()) {
      return;
    }

    try {
      const event = TypedCloudEvent.create({
        source: `com.dip.services.${this.config.name}`,
        type,
        data,
        datacontenttype: "application/json",
      });

      await this.publisher.publish(event, {
        topic: "system-events",
      });
    } catch (error) {
      console.error(`Failed to emit event ${type}:`, error);
    }
  }

  /**
   * Register a shutdown handler
   */
  protected registerShutdownHandler(handler: () => Promise<void>): void {
    this.shutdownHandlers.push(handler);
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    isShuttingDown: boolean;
    uptime: number;
    service: string;
    version: string;
  } {
    return {
      isRunning: this.isRunning,
      isShuttingDown: this.isShuttingDown,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      service: this.config.name,
      version: this.config.version,
    };
  }

  /**
   * Get tracing spans for debugging
   */
  getTraces(): TracingSpan[] {
    return this.tracer.getSpans();
  }

  /**
   * Clear tracing spans
   */
  clearTraces(): void {
    this.tracer.reset();
  }

  /**
   * Abstract methods to be implemented by services
   */
  protected abstract initialize(): Promise<void>;
  protected abstract cleanup(): Promise<void>;
  protected abstract isReady(): Promise<boolean>;
  protected abstract performHealthChecks(): Promise<
    Record<string, {
      status: "ok" | "error";
      message?: string;
      latency?: number;
    }>
  >;
}
