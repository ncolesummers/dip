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
  protected abortController: AbortController;

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

    this.setupMiddleware();
    this.setupHealthChecks();
    this.setupSignalHandlers();
  }

  /**
   * Setup common middleware
   */
  protected setupMiddleware(): void {
    // CORS
    this.app.use("*", async (c, next) => {
      c.header("Access-Control-Allow-Origin", "*");
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (c.req.method === "OPTIONS") {
        return c.text("", 204);
      }

      return await next();
    });

    // Logging
    if (this.config.environment !== "test") {
      this.app.use("*", async (c, next) => {
        const start = Date.now();
        await next();
        const ms = Date.now() - start;
        console.log(`${c.req.method} ${c.req.path} - ${c.res.status} ${ms}ms`);
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
   * Graceful shutdown
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
      // Emit service stopping event
      await this.emitServiceEvent(EventTypes.SERVICE_STOPPED, {
        service: this.config.name,
        uptime: Math.floor((Date.now() - this.startTime) / 1000),
      });

      // Stop accepting new requests
      this.abortController.abort();

      // Run all shutdown handlers
      await Promise.all(this.shutdownHandlers.map((handler) => handler()));

      // Service-specific cleanup
      await this.cleanup();

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
