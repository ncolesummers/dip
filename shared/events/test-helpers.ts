/**
 * Test helpers and utilities for TypedCloudEvent testing with Deno
 * Provides comprehensive testing utilities for event-driven systems
 */

import { assertEquals, assertExists, assertThrows } from "@std/assert";
import { z } from "zod";
import { EventLogger, EventMetricsCollector, EventPool, TypedCloudEvent } from "./enhanced-base.ts";
import {
  EventBatcher,
  EventPipeline,
  EventReplayer,
  EventRouter,
  EventStream,
} from "./utilities.ts";
import { CloudEventV1 } from "cloudevents";

// ============================================================================
// TEST EVENT FACTORIES
// ============================================================================

/**
 * Test event factory for creating mock events
 */
export class TestEventFactory {
  private eventCount = 0;
  private defaultSource = "test.factory";

  /**
   * Create a basic test event
   */
  createTestEvent<T = unknown>(
    data?: T,
    schema?: z.ZodSchema<T>,
    overrides?: Partial<CloudEventV1<T>>,
  ): TypedCloudEvent<T> {
    this.eventCount++;

    return TypedCloudEvent.create({
      source: this.defaultSource,
      type: "test.event",
      data,
      subject: `test-${this.eventCount}`,
      ...overrides,
    }, schema);
  }

  /**
   * Create multiple test events
   */
  createTestEvents<T = unknown>(
    count: number,
    dataGenerator?: (index: number) => T,
    schema?: z.ZodSchema<T>,
  ): TypedCloudEvent<T>[] {
    const events: TypedCloudEvent<T>[] = [];

    for (let i = 0; i < count; i++) {
      const data = dataGenerator ? dataGenerator(i) : undefined;
      events.push(this.createTestEvent(data, schema));
    }

    return events;
  }

  /**
   * Create a sequence of correlated events
   */
  createCorrelatedEvents<T = unknown>(
    count: number,
    dataGenerator?: (index: number) => T,
  ): TypedCloudEvent<T>[] {
    const events: TypedCloudEvent<T>[] = [];
    const correlationId = crypto.randomUUID();
    let previousId: string | undefined;

    for (let i = 0; i < count; i++) {
      const data = dataGenerator ? dataGenerator(i) : undefined;
      const event = this.createTestEvent(data);

      event.setCorrelationId(correlationId);
      if (previousId) {
        event.setCausationId(previousId);
      }

      events.push(event);
      previousId = event.getAttribute("id");
    }

    return events;
  }

  /**
   * Create events with specific timing
   */
  createTimedEvents<T = unknown>(
    timestamps: string[],
    dataGenerator?: (index: number) => T,
  ): TypedCloudEvent<T>[] {
    return timestamps.map((time, index) => {
      const data = dataGenerator ? dataGenerator(index) : undefined;
      return this.createTestEvent(data, undefined, { time });
    });
  }

  /**
   * Create events of different types
   */
  createMixedTypeEvents(
    types: string[],
    dataGenerator?: (type: string) => unknown,
  ): TypedCloudEvent[] {
    return types.map((type) => {
      const data = dataGenerator ? dataGenerator(type) : undefined;
      return this.createTestEvent(data, undefined, { type });
    });
  }

  /**
   * Reset factory state
   */
  reset(): void {
    this.eventCount = 0;
  }

  /**
   * Get factory statistics
   */
  getStats() {
    return {
      eventsCreated: this.eventCount,
      defaultSource: this.defaultSource,
    };
  }
}

// ============================================================================
// EVENT ASSERTION HELPERS
// ============================================================================

/**
 * Event assertion utilities for Deno tests
 */
export class EventAssertions {
  /**
   * Assert event has required CloudEvents attributes
   */
  static assertValidCloudEvent(event: TypedCloudEvent): void {
    const attrs = event.getAttributes();

    assertExists(attrs.id, "Event must have an id");
    assertExists(attrs.source, "Event must have a source");
    assertExists(attrs.type, "Event must have a type");
    assertExists(attrs.specversion, "Event must have a specversion");
    assertEquals(attrs.specversion, "1.0", "Event must use CloudEvents v1.0");

    if (attrs.time) {
      // Validate ISO 8601 format
      const date = new Date(attrs.time);
      assertEquals(date.toISOString(), attrs.time, "Time must be valid ISO 8601");
    }
  }

  /**
   * Assert event data matches schema
   */
  static assertDataMatchesSchema<T>(
    event: TypedCloudEvent<T>,
    schema: z.ZodSchema<T>,
  ): void {
    const data = event.getData();
    if (data !== undefined) {
      const result = schema.safeParse(data);
      assertEquals(result.success, true, `Data validation failed: ${JSON.stringify(result)}`);
    }
  }

  /**
   * Assert events are correlated
   */
  static assertCorrelated(event1: TypedCloudEvent, event2: TypedCloudEvent): void {
    const correlationId1 = event1.getCorrelationId();
    const correlationId2 = event2.getCorrelationId();

    assertExists(correlationId1, "First event must have correlation ID");
    assertExists(correlationId2, "Second event must have correlation ID");
    assertEquals(correlationId1, correlationId2, "Events must share correlation ID");
  }

  /**
   * Assert event causation chain
   */
  static assertCausationChain(events: TypedCloudEvent[]): void {
    for (let i = 1; i < events.length; i++) {
      const causationId = events[i].getCausationId();
      const previousId = events[i - 1].getAttribute("id");

      assertEquals(
        causationId,
        previousId,
        `Event ${i} must be caused by event ${i - 1}`,
      );
    }
  }

  /**
   * Assert event has trace context
   */
  static assertHasTraceContext(event: TypedCloudEvent): void {
    const traceContext = event.getTraceContext();
    assertExists(traceContext, "Event must have trace context");
    assertExists(traceContext.traceId, "Trace context must have traceId");
    assertExists(traceContext.spanId, "Trace context must have spanId");
  }

  /**
   * Assert event telemetry
   */
  static assertTelemetryRecorded(event: TypedCloudEvent): void {
    const telemetry = event.getTelemetry();

    assertExists(telemetry.metrics.eventId, "Telemetry must have event ID");
    assertExists(telemetry.metrics.eventType, "Telemetry must have event type");
    assertExists(telemetry.metrics.emittedAt, "Telemetry must have emission time");
    assertEquals(telemetry.metrics.size > 0, true, "Telemetry must record event size");
  }

  /**
   * Assert event signature
   */
  static async assertSigned(event: TypedCloudEvent, key: CryptoKey): Promise<void> {
    const isValid = await event.verify(key);
    assertEquals(isValid, true, "Event signature must be valid");
  }
}

// ============================================================================
// MOCK EVENT HANDLERS
// ============================================================================

/**
 * Mock event handler for testing
 */
export class MockEventHandler {
  private receivedEvents: TypedCloudEvent[] = [];
  private processingDelay = 0;
  private shouldFail = false;
  private failureError?: Error;
  private processCount = 0;

  /**
   * Handle an event
   */
  async handle(event: TypedCloudEvent): Promise<void> {
    this.processCount++;

    if (this.shouldFail) {
      throw this.failureError || new Error("Mock handler failure");
    }

    if (this.processingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.processingDelay));
    }

    this.receivedEvents.push(event);
  }

  /**
   * Set processing delay
   */
  setDelay(ms: number): void {
    this.processingDelay = ms;
  }

  /**
   * Configure to fail
   */
  setFailure(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail;
    this.failureError = error;
  }

  /**
   * Get received events
   */
  getReceivedEvents(): TypedCloudEvent[] {
    return [...this.receivedEvents];
  }

  /**
   * Clear received events
   */
  clear(): void {
    this.receivedEvents = [];
    this.processCount = 0;
  }

  /**
   * Get handler statistics
   */
  getStats() {
    return {
      receivedCount: this.receivedEvents.length,
      processCount: this.processCount,
      processingDelay: this.processingDelay,
      shouldFail: this.shouldFail,
    };
  }

  /**
   * Assert event was received
   */
  assertReceived(eventId: string): void {
    const received = this.receivedEvents.some((e) => e.getAttribute("id") === eventId);
    assertEquals(received, true, `Event ${eventId} was not received`);
  }

  /**
   * Assert event count
   */
  assertReceivedCount(expected: number): void {
    assertEquals(
      this.receivedEvents.length,
      expected,
      `Expected ${expected} events, got ${this.receivedEvents.length}`,
    );
  }
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

/**
 * Common test scenarios for event processing
 */
export class EventTestScenarios {
  /**
   * Test event validation scenario
   */
  static testValidation(): void {
    const schema = z.object({
      message: z.string(),
      count: z.number(),
    });

    // Valid event
    const validEvent = TypedCloudEvent.create({
      source: "test",
      type: "test.validation",
      data: { message: "hello", count: 42 },
    }, schema);

    assertEquals(validEvent.validate(), true);

    // Invalid event
    assertThrows(() => {
      TypedCloudEvent.create({
        source: "test",
        type: "test.validation",
        data: { message: "hello", count: "not a number" as any },
      }, schema);
    });
  }

  /**
   * Test event routing scenario
   */
  static async testRouting(): Promise<void> {
    const handler1 = new MockEventHandler();
    const handler2 = new MockEventHandler();
    const factory = new TestEventFactory();

    const router = new EventRouter({
      routes: [
        {
          filter: (e) => e.getAttribute("type") === "type1",
          handler: (e) => handler1.handle(e),
          name: "route1",
        },
        {
          filter: (e) => e.getAttribute("type") === "type2",
          handler: (e) => handler2.handle(e),
          name: "route2",
        },
      ],
    });

    const event1 = factory.createTestEvent(null, undefined, { type: "type1" });
    const event2 = factory.createTestEvent(null, undefined, { type: "type2" });

    await router.route(event1);
    await router.route(event2);

    handler1.assertReceivedCount(1);
    handler2.assertReceivedCount(1);
  }

  /**
   * Test event batching scenario
   */
  static async testBatching(): Promise<void> {
    const factory = new TestEventFactory();
    const processedBatches: TypedCloudEvent[][] = [];

    const batcher = new EventBatcher({
      maxSize: 3,
      maxWaitMs: 100,
      handler: (events) => {
        processedBatches.push(events);
      },
    });

    // Add events
    const events = factory.createTestEvents(5);
    events.forEach((e) => batcher.add(e));

    // First batch should process immediately (size = 3)
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(processedBatches.length, 1);
    assertEquals(processedBatches[0].length, 3);

    // Wait for timeout to process remaining
    await new Promise((resolve) => setTimeout(resolve, 150));
    assertEquals(processedBatches.length, 2);
    assertEquals(processedBatches[1].length, 2);
  }

  /**
   * Test event replay scenario
   */
  static async testReplay(): Promise<void> {
    const factory = new TestEventFactory();
    const handler = new MockEventHandler();

    const timestamps = [
      new Date(Date.now() - 300).toISOString(),
      new Date(Date.now() - 200).toISOString(),
      new Date(Date.now() - 100).toISOString(),
    ];

    const events = factory.createTimedEvents(timestamps);

    const replayer = new EventReplayer({
      events,
      handler: (e) => handler.handle(e),
      speed: 10, // 10x speed
      preserveTiming: true,
      onComplete: () => {
        handler.assertReceivedCount(3);
      },
    });

    await replayer.start();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  /**
   * Test event pipeline scenario
   */
  static async testPipeline(): Promise<void> {
    const factory = new TestEventFactory();

    const pipeline = new EventPipeline()
      .addStage({
        name: "validate",
        process: (event) => {
          if (!event.validate()) {
            throw new Error("Validation failed");
          }
          return event;
        },
      })
      .addStage({
        name: "enrich",
        process: (event) => {
          event.addTag("processed", "true");
          return event;
        },
      })
      .addStage({
        name: "filter",
        process: (event) => {
          const data = event.getData() as any;
          if (data?.skip) {
            return null;
          }
          return event;
        },
      });

    const events = [
      factory.createTestEvent({ message: "process me" }),
      factory.createTestEvent({ skip: true }),
      factory.createTestEvent({ message: "also process me" }),
    ];

    const results = await pipeline.processMany(events);

    assertEquals(results[0] !== null, true);
    assertEquals(results[1], null);
    assertEquals(results[2] !== null, true);

    const metrics = pipeline.getMetrics();
    assertEquals(metrics.validate.processed, 3);
    assertEquals(metrics.filter.processed, 3);
  }

  /**
   * Test event stream scenario
   */
  static async testStream(): Promise<void> {
    const factory = new TestEventFactory();
    const stream = new EventStream();

    const collected: TypedCloudEvent[] = [];

    // Start consumer
    const consumer = (async () => {
      for await (const event of stream.take(3)) {
        collected.push(event);
      }
    })();

    // Produce events
    const events = factory.createTestEvents(5);
    events.forEach((e) => stream.push(e));

    await consumer;

    assertEquals(collected.length, 3);
    stream.close();
  }
}

// ============================================================================
// PERFORMANCE BENCHMARKING
// ============================================================================

/**
 * Event performance benchmarking utilities
 */
export class EventBenchmark {
  /**
   * Benchmark event creation
   */
  static benchmarkCreation(iterations: number): number {
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      TypedCloudEvent.create({
        source: "benchmark",
        type: "test",
        data: { index: i },
      });
    }

    const duration = performance.now() - start;
    return duration / iterations;
  }

  /**
   * Benchmark event validation
   */
  static benchmarkValidation(iterations: number): number {
    const schema = z.object({
      message: z.string(),
      count: z.number(),
    });

    const events = [];
    for (let i = 0; i < iterations; i++) {
      events.push(TypedCloudEvent.create({
        source: "benchmark",
        type: "test",
        data: { message: `msg-${i}`, count: i },
      }));
    }

    const start = performance.now();

    for (const event of events) {
      TypedCloudEvent.create({
        source: event.getAttribute("source"),
        type: event.getAttribute("type"),
        data: event.getData(),
      }, schema);
    }

    const duration = performance.now() - start;
    return duration / iterations;
  }

  /**
   * Benchmark event serialization
   */
  static async benchmarkSerialization(iterations: number): Promise<number> {
    const events = [];
    for (let i = 0; i < iterations; i++) {
      events.push(TypedCloudEvent.create({
        source: "benchmark",
        type: "test",
        data: { message: `msg-${i}`, count: i },
      }));
    }

    const start = performance.now();

    for (const event of events) {
      await event.serializeForKafka();
    }

    const duration = performance.now() - start;
    return duration / iterations;
  }

  /**
   * Benchmark event pool
   */
  static benchmarkPool(
    iterations: number,
  ): { withPool: number; withoutPool: number } {
    const pool = new EventPool(100);

    // Without pool
    const start1 = performance.now();
    for (let i = 0; i < iterations; i++) {
      new TypedCloudEvent({
        specversion: "1.0",
        id: `${i}`,
        source: "benchmark",
        type: "test",
      });
    }
    const withoutPool = (performance.now() - start1) / iterations;

    // With pool
    const start2 = performance.now();
    for (let i = 0; i < iterations; i++) {
      const event = pool.acquire({
        specversion: "1.0",
        id: `${i}`,
        source: "benchmark",
        type: "test",
      });
      pool.release(event);
    }
    const withPool = (performance.now() - start2) / iterations;

    return { withPool, withoutPool };
  }

  /**
   * Run all benchmarks
   */
  static async runAll(iterations = 1000): Promise<Record<string, number>> {
    const results: Record<string, number> = {};

    results.creation = await this.benchmarkCreation(iterations);
    results.validation = await this.benchmarkValidation(iterations);
    results.serialization = await this.benchmarkSerialization(iterations);

    const poolResults = await this.benchmarkPool(iterations);
    results.withPool = poolResults.withPool;
    results.withoutPool = poolResults.withoutPool;
    results.poolImprovement =
      ((poolResults.withoutPool - poolResults.withPool) / poolResults.withoutPool) * 100;

    return results;
  }
}

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Wait for condition with timeout
 */
export async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 5000,
  checkInterval = 100,
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error("Condition timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }
}

/**
 * Create a test crypto key for signing
 */
export async function createTestKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey(
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

/**
 * Mock metrics collector for testing
 */
export class MockMetricsCollector extends EventMetricsCollector {
  private captured: Record<string, any> = {};

  getMetrics(): Record<string, number> {
    this.captured = super.getMetrics();
    return this.captured;
  }

  getCaptured(): Record<string, any> {
    return this.captured;
  }

  assertMetricExists(metric: string): void {
    assertExists(this.captured[metric], `Metric ${metric} not found`);
  }

  assertMetricValue(metric: string, expected: number): void {
    assertEquals(this.captured[metric], expected, `Metric ${metric} mismatch`);
  }
}

/**
 * Mock logger for testing
 */
export class MockLogger extends EventLogger {
  private logs: Array<{ message: string; data: Record<string, unknown> }> = [];

  constructor() {
    super((message, data) => {
      this.logs.push({ message, data });
    });
  }

  getLogs() {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
  }

  assertLogExists(message: string): void {
    const exists = this.logs.some((log) => log.message === message);
    assertEquals(exists, true, `Log message "${message}" not found`);
  }

  assertLogCount(expected: number): void {
    assertEquals(this.logs.length, expected, `Expected ${expected} logs, got ${this.logs.length}`);
  }
}
