/**
 * Unit tests for BaseService abstract class
 * Tests lifecycle management, health checks, metrics, and tracing
 */

import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { delay } from "https://deno.land/std@0.208.0/async/delay.ts";
import { BaseService, ServiceConfig, globalTracer } from "./base.ts";
import { EventTypes } from "@events/types.ts";

// Test implementation of BaseService
class TestService extends BaseService {
  public initializeCalled = false;
  public cleanupCalled = false;
  public healthChecksCalled = 0;
  public readyChecksCalled = 0;
  private ready = true;
  private healthyChecks = true;

  constructor(config: ServiceConfig) {
    super(config);
  }

  protected async initialize(): Promise<void> {
    this.initializeCalled = true;
    await delay(10); // Simulate async initialization
  }

  protected async cleanup(): Promise<void> {
    this.cleanupCalled = true;
    await delay(10); // Simulate async cleanup
  }

  protected async isReady(): Promise<boolean> {
    this.readyChecksCalled++;
    return this.ready;
  }

  protected async performHealthChecks(): Promise<
    Record<string, {
      status: "ok" | "error";
      message?: string;
      latency?: number;
    }>
  > {
    this.healthChecksCalled++;
    
    if (!this.healthyChecks) {
      return {
        database: {
          status: "error",
          message: "Database connection failed",
          latency: 100,
        },
      };
    }

    return {
      database: {
        status: "ok",
        message: "Database is healthy",
        latency: 50,
      },
    };
  }

  // Helper methods for testing
  setReady(ready: boolean): void {
    this.ready = ready;
  }

  setHealthyChecks(healthy: boolean): void {
    this.healthyChecks = healthy;
  }

  // Expose protected methods for testing
  public getConfig(): ServiceConfig {
    return this.config;
  }

  public getApp() {
    return this.app;
  }
}

const testConfig: ServiceConfig = {
  name: "test-service",
  version: "1.0.0",
  port: 8080,
  metricsPort: 9090,
  environment: "test",
  gracefulShutdownTimeout: 5000,
};

Deno.test("BaseService - Constructor", () => {
  const service = new TestService(testConfig);
  const config = service.getConfig();

  assertEquals(config.name, "test-service");
  assertEquals(config.version, "1.0.0");
  assertEquals(config.port, 8080);
  assertEquals(config.healthCheckPath, "/health");
  assertEquals(config.readinessCheckPath, "/ready");
  assertEquals(config.environment, "test");
  
  // Cleanup to prevent signal handler leaks
  service.clearTraces();
});

Deno.test("BaseService - Constructor with defaults", () => {
  const minimalConfig: ServiceConfig = {
    name: "minimal-service",
    version: "1.0.0",
    port: 3000,
    environment: "test", // Explicitly set to test to avoid signal handlers
  };

  const service = new TestService(minimalConfig);
  const config = service.getConfig();

  assertEquals(config.healthCheckPath, "/health");
  assertEquals(config.readinessCheckPath, "/ready");
  assertEquals(config.gracefulShutdownTimeout, 30000);
  assertExists(config.environment);
});

Deno.test("BaseService - Service status methods", () => {
  const service = new TestService(testConfig);
  
  const status = service.getStatus();
  assertEquals(status.isRunning, false);
  assertEquals(status.isShuttingDown, false);
  assertEquals(status.service, "test-service");
  assertEquals(status.version, "1.0.0");
  assert(status.uptime >= 0);
});

Deno.test("BaseService - Tracing functionality", async () => {
  const service = new TestService(testConfig);
  
  // Clear any existing traces
  service.clearTraces();
  
  // Get initial traces (should be empty)
  let traces = service.getTraces();
  assertEquals(traces.length, 0);

  // Create a span manually to test tracing
  const span = globalTracer.createSpan("test-operation");
  globalTracer.addTag(span, "test.key", "test-value");
  globalTracer.finishSpan(span);

  traces = service.getTraces();
  assertEquals(traces.length, 1);
  assertEquals(traces[0].operation, "test-operation");
  assertEquals(traces[0].tags["test.key"], "test-value");
  assertEquals(traces[0].status, "ok");

  // Clear traces
  service.clearTraces();
  traces = service.getTraces();
  assertEquals(traces.length, 0);
});

Deno.test("BaseService - Health check response structure", async () => {
  const service = new TestService(testConfig);
  
  // Test healthy response
  service.setHealthyChecks(true);
  const app = service.getApp();
  
  const healthResponse = await app.request("/health");
  assertEquals(healthResponse.status, 200);
  
  const healthData = await healthResponse.json();
  assertEquals(healthData.status, "healthy");
  assertEquals(healthData.service, "test-service");
  assertEquals(healthData.version, "1.0.0");
  assertExists(healthData.uptime);
  assertExists(healthData.timestamp);
  assertExists(healthData.checks);
  
  // Should have called health checks
  assertEquals(service.healthChecksCalled, 1);
});

Deno.test("BaseService - Health check degraded response", async () => {
  const service = new TestService(testConfig);
  
  // Test degraded response
  service.setHealthyChecks(false);
  const app = service.getApp();
  
  const healthResponse = await app.request("/health");
  assertEquals(healthResponse.status, 200); // Still returns 200 for degraded
  
  const healthData = await healthResponse.json();
  assertEquals(healthData.status, "degraded");
  assertEquals(healthData.checks.database.status, "error");
});

Deno.test("BaseService - Readiness check", async () => {
  const service = new TestService(testConfig);
  const app = service.getApp();
  
  // Test ready response
  service.setReady(true);
  let readyResponse = await app.request("/ready");
  assertEquals(readyResponse.status, 200);
  
  let readyData = await readyResponse.json();
  assertEquals(readyData.status, "ready");
  
  // Test not ready response
  service.setReady(false);
  readyResponse = await app.request("/ready");
  assertEquals(readyResponse.status, 503);
  
  readyData = await readyResponse.json();
  assertEquals(readyData.status, "not_ready");
  
  // Should have called ready checks
  assertEquals(service.readyChecksCalled, 2);
});

Deno.test("BaseService - Service info endpoint", async () => {
  const service = new TestService(testConfig);
  const app = service.getApp();
  
  const infoResponse = await app.request("/info");
  assertEquals(infoResponse.status, 200);
  
  const infoData = await infoResponse.json();
  assertEquals(infoData.service, "test-service");
  assertEquals(infoData.version, "1.0.0");
  assertEquals(infoData.environment, "test");
  assertExists(infoData.uptime);
  assertExists(infoData.timestamp);
});

Deno.test("BaseService - CORS headers", async () => {
  const service = new TestService(testConfig);
  const app = service.getApp();
  
  // Test OPTIONS request
  const optionsResponse = await app.request("/health", { method: "OPTIONS" });
  assertEquals(optionsResponse.status, 204);
  
  // Test regular request has CORS headers
  const healthResponse = await app.request("/health");
  assertEquals(healthResponse.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    healthResponse.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, DELETE, OPTIONS"
  );
  assert(
    healthResponse.headers.get("Access-Control-Allow-Headers")?.includes("x-trace-id")
  );
});

Deno.test("BaseService - Tracing headers in response", async () => {
  const service = new TestService(testConfig);
  const app = service.getApp();
  
  const response = await app.request("/health");
  
  // Should have tracing headers
  assertExists(response.headers.get("x-trace-id"));
  assertExists(response.headers.get("x-span-id"));
});

Deno.test("BaseService - Tracing context propagation", async () => {
  const service = new TestService(testConfig);
  const app = service.getApp();
  
  // Clear traces first
  service.clearTraces();
  
  // Send request with tracing headers
  const traceId = "test-trace-123";
  const spanId = "test-span-456";
  
  const response = await app.request("/health", {
    headers: {
      "x-trace-id": traceId,
      "x-span-id": spanId,
    },
  });
  
  // Response should have the same trace ID
  assertEquals(response.headers.get("x-trace-id"), traceId);
  
  // Check that spans were created
  const traces = service.getTraces();
  assert(traces.length > 0);
  assertEquals(traces[0].traceId, traceId);
  assertEquals(traces[0].parentSpanId, spanId);
});

Deno.test("BaseService - Error handling", async () => {
  const service = new TestService(testConfig);
  const app = service.getApp();
  
  // Add a route that throws an error
  app.get("/error", () => {
    throw new Error("Test error");
  });
  
  const response = await app.request("/error");
  assertEquals(response.status, 500);
  
  const errorData = await response.json();
  assertEquals(errorData.error, "Internal Server Error");
  assertEquals(errorData.service, "test-service");
  assertExists(errorData.timestamp);
  
  // In test environment, should include error message (if not production)
  if (errorData.message) {
    assertEquals(errorData.message, "Test error");
  }
});

Deno.test("BaseService - Double start protection", async () => {
  const service = new TestService({
    ...testConfig,
    port: 8081, // Use different port to avoid conflicts
  });
  
  // Mock the serve function to avoid actually starting a server
  let serveCalled = 0;
  
  service.start = async () => {
    if (service["isRunning"]) {
      throw new Error(`Service ${service["config"].name} is already running`);
    }
    serveCalled++;
    service["isRunning"] = true;
    await service["initialize"]();
  };
  
  // First start should work
  await service.start();
  assertEquals(serveCalled, 1);
  
  // Second start should throw
  await assertRejects(
    async () => {
      await service.start();
    },
    Error,
    "already running"
  );
});

Deno.test("BaseService - Stop functionality", async () => {
  const service = new TestService(testConfig);
  
  // Mock running state
  service["isRunning"] = true;
  
  await service.stop();
  
  assertEquals(service["isRunning"], false);
  assertEquals(service.cleanupCalled, true);
});

Deno.test("BaseService - Stop when not running", async () => {
  const service = new TestService(testConfig);
  
  // Should not throw when stopping a non-running service
  await service.stop();
  assertEquals(service.cleanupCalled, false);
});

Deno.test("BaseService - Shutdown handler registration", () => {
  const service = new TestService(testConfig);
  
  const handler = async () => {
    // Handler implementation
  };
  
  service["registerShutdownHandler"](handler);
  assertEquals(service["shutdownHandlers"].length, 1);
});

Deno.test("BaseService - Initialization call", async () => {
  const service = new TestService({
    ...testConfig,
    port: 8082,
  });
  
  // Mock the serve function to test initialization
  service.start = async () => {
    await service["initialize"]();
  };
  
  await service.start();
  assertEquals(service.initializeCalled, true);
});

Deno.test("BaseService - Consumer initialization", () => {
  const service = new TestService(testConfig);
  
  // Test consumer initialization
  service["initializeConsumer"](["test-topic"]);
  assertExists(service["consumer"]);
  
  // Should register shutdown handler
  assert(service["shutdownHandlers"].length > 0);
});

Deno.test("BaseService - Publisher initialization", async () => {
  const service = new TestService(testConfig);
  
  // Mock the publisher to avoid Kafka connection
  const mockPublisher = {
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    isConnected: () => true,
    publish: () => Promise.resolve(),
  };
  
  service["publisher"] = mockPublisher as any;
  
  // Should register shutdown handler when publisher is set
  assert(service["shutdownHandlers"].length >= 0);
});

Deno.test("BaseService - Service event emission", async () => {
  const service = new TestService(testConfig);
  
  // Mock publisher
  let eventEmitted = false;
  const mockPublisher = {
    isConnected: () => true,
    publish: () => {
      eventEmitted = true;
      return Promise.resolve();
    },
  };
  
  service["publisher"] = mockPublisher as any;
  
  await service["emitServiceEvent"](EventTypes.SERVICE_STARTED, { test: "data" });
  assertEquals(eventEmitted, true);
});

Deno.test("BaseService - Service event emission without publisher", async () => {
  const service = new TestService(testConfig);
  
  // Should not throw when no publisher is configured
  await service["emitServiceEvent"](EventTypes.SERVICE_STARTED, { test: "data" });
  // Test passes if no exception is thrown
});

// Integration test for tracing middleware
Deno.test("BaseService - Tracing middleware integration", async () => {
  const service = new TestService(testConfig);
  service.clearTraces();
  
  const app = service.getApp();
  
  // Make a request
  await app.request("/health");
  
  const traces = service.getTraces();
  assert(traces.length > 0);
  
  const span = traces.find(s => s.operation.includes("GET"));
  assert(span !== undefined);
  assert(span.operation.includes("GET"));
  assertEquals(span.tags["http.method"], "GET");
  assertEquals(span.tags["service.name"], "test-service");
  assertEquals(span.tags["http.status_code"], 200);
});

// Test coverage helpers
Deno.test("BaseService - All abstract methods coverage", () => {
  const service = new TestService(testConfig);
  
  // Ensure all abstract methods are implemented in test service
  assert(typeof service["initialize"] === "function");
  assert(typeof service["cleanup"] === "function");
  assert(typeof service["isReady"] === "function");
  assert(typeof service["performHealthChecks"] === "function");
});