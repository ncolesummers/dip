/**
 * Enhanced TypedCloudEvent usage examples with observability
 * Demonstrates real-world patterns and best practices
 */

import { z } from "zod";
import { EventMetricsCollector, initializeEventSystem, TypedCloudEvent } from "./enhanced-base.ts";
import {
  createTraceContext,
  EventBatcher,
  EventFilters,
  EventPipeline,
  EventReplayer,
  EventRouter,
  EventStream,
} from "./utilities.ts";
import { EventSources, EventTypes } from "./types.ts";
import { IntentClassifiedEventSchema, TicketReceivedEventSchema } from "./schemas.ts";

// ============================================================================
// EXAMPLE 1: BASIC EVENT CREATION WITH OBSERVABILITY
// ============================================================================

/**
 * Example 1: Creating events with full observability
 */
export async function example1_BasicEventWithObservability() {
  console.log("=== Example 1: Basic Event with Observability ===\n");

  // Initialize the event system with all observability features
  await initializeEventSystem({
    enableDeduplication: true,
    dedupTtlMs: 60000, // 1 minute
    enableMetrics: true,
    enableLogging: true,
    logger: (message, data) => {
      console.log(`[EVENT] ${message}:`, JSON.stringify(data, null, 2));
    },
  });

  // Define event schema
  const orderSchema = z.object({
    orderId: z.string().uuid(),
    customerId: z.string().uuid(),
    amount: z.number().positive(),
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      price: z.number().positive(),
      quantity: z.number().int().positive(),
    })),
  });

  // Create event with trace context
  const traceContext = createTraceContext();
  const event = TypedCloudEvent.create({
    source: EventSources.API_GATEWAY,
    type: "order.placed",
    data: {
      orderId: "550e8400-e29b-41d4-a716-446655440000",
      customerId: "550e8400-e29b-41d4-a716-446655440001",
      amount: 99.99,
      items: [
        { id: "item-1", name: "Widget", price: 49.99, quantity: 1 },
        { id: "item-2", name: "Gadget", price: 50.00, quantity: 1 },
      ],
    },
    subject: "orders/550e8400-e29b-41d4-a716-446655440000",
  }, orderSchema);

  // Add observability metadata
  event.addTraceContext(traceContext);
  event.addTag("environment", "production");
  event.addTag("service", "order-service");
  event.addAnnotation("processing_rules", ["fraud_check", "inventory_check"]);

  // Sign the event for security
  const key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  await event.sign(key);

  console.log("Event created with telemetry:", event.getTelemetry());
  console.log("Event is valid:", event.validate());
  console.log("Event has trace context:", !!event.getTraceContext());

  // Serialize for Kafka
  const serialized = await event.serializeForKafka();
  console.log("Serialized size:", serialized.length, "bytes");

  // Verify signature
  const isValidSignature = await event.verify(key);
  console.log("Signature valid:", isValidSignature);

  console.log("\n");
}

// ============================================================================
// EXAMPLE 2: EVENT ROUTING WITH OBSERVABILITY
// ============================================================================

/**
 * Example 2: Advanced event routing with metrics
 */
export async function example2_EventRouting() {
  console.log("=== Example 2: Event Routing with Metrics ===\n");

  // Create metrics collector
  const metricsCollector = new EventMetricsCollector();
  TypedCloudEvent.addObserver(metricsCollector);

  // Mock handlers that simulate processing
  const ticketHandler = async (event: TypedCloudEvent) => {
    console.log(`Processing ticket event: ${event.getAttribute("id")}`);
    await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate processing
    event.addTag("processed_by", "ticket-service");
  };

  const classificationHandler = async (event: TypedCloudEvent) => {
    console.log(`Processing classification event: ${event.getAttribute("id")}`);
    await new Promise((resolve) => setTimeout(resolve, 30));
    event.addTag("processed_by", "classification-service");
  };

  const auditHandler = async (event: TypedCloudEvent) => {
    console.log(`Auditing event: ${event.getAttribute("id")}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    event.addTag("audited", "true");
  };

  // Create router with different routes
  const router = new EventRouter({
    routes: [
      {
        name: "ticket-events",
        filter: EventFilters.byType([
          EventTypes.TICKET_RECEIVED,
          EventTypes.TICKET_VALIDATED,
          EventTypes.TICKET_UPDATED,
        ]),
        handler: ticketHandler,
        priority: 10,
      },
      {
        name: "classification-events",
        filter: EventFilters.and(
          EventFilters.byType([EventTypes.INTENT_CLASSIFIED]),
          EventFilters.bySource(EventSources.CLASSIFIER_SERVICE),
        ),
        handler: classificationHandler,
        priority: 8,
      },
      {
        name: "audit-all",
        filter: () => true, // Audit all events
        handler: auditHandler,
        priority: 1,
      },
    ],
    concurrency: 5,
    errorHandler: (error, event) => {
      console.error(`Routing error for ${event.getAttribute("id")}:`, error.message);
    },
  });

  // Create test events
  const ticketEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: {
      ticket: {
        id: "ticket-123",
        subject: "Need help with login",
        description: "Cannot access my account",
        status: "new" as const,
        priority: "medium" as const,
        channel: "email" as const,
        customer: {
          email: "user@example.com",
          name: "John Doe",
          tier: "basic" as const,
        },
        created_at: new Date().toISOString(),
      },
      source_system: "web-portal",
      received_at: new Date().toISOString(),
    },
    subject: "tickets/ticket-123",
  }, TicketReceivedEventSchema);

  const classificationEvent = TypedCloudEvent.create({
    source: EventSources.CLASSIFIER_SERVICE,
    type: EventTypes.INTENT_CLASSIFIED,
    data: {
      ticket_id: "ticket-123",
      classification_result: {
        intent: "account_access",
        confidence_score: 0.95,
        confidence_level: "very_high" as const,
        sentiment: {
          polarity: "neutral" as const,
          score: 0.1,
          confidence: 0.8,
        },
      },
      model_version: "v2.1.0",
      processing_time_ms: 150,
      classified_at: new Date().toISOString(),
      classifier_id: "bert-classifier",
    },
    subject: "tickets/ticket-123/classification",
  }, IntentClassifiedEventSchema);

  // Route events
  await router.route(ticketEvent);
  await router.route(classificationEvent);

  // Wait for async processing to complete
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Display metrics
  console.log("Router stats:", router.getStats());
  console.log("Event metrics:", metricsCollector.getMetrics());

  console.log("\n");
}

// ============================================================================
// EXAMPLE 3: EVENT BATCHING AND STREAM PROCESSING
// ============================================================================

/**
 * Example 3: Efficient batching for high-throughput scenarios
 */
export async function example3_BatchProcessing() {
  console.log("=== Example 3: Batch Processing ===\n");

  let batchCount = 0;
  let totalEventsProcessed = 0;

  // Create batcher for efficient processing
  const batcher = new EventBatcher({
    maxSize: 5,
    maxWaitMs: 1000,
    handler: (events) => {
      batchCount++;
      totalEventsProcessed += events.length;

      console.log(`Processing batch ${batchCount} with ${events.length} events`);

      // Simulate batch processing
      const startTime = performance.now();

      // Process events in batch
      for (const event of events) {
        // Simulate validation
        event.validate();

        // Add batch processing metadata
        event.addTag("batch_id", `batch-${batchCount}`);
        event.addTag("batch_size", events.length.toString());
      }

      const processingTime = performance.now() - startTime;
      console.log(`Batch ${batchCount} processed in ${processingTime.toFixed(2)}ms`);
    },
    errorHandler: (error, events) => {
      console.error(`Batch processing failed for ${events.length} events:`, error);
    },
  });

  // Generate events to batch
  console.log("Generating events for batching...");
  for (let i = 0; i < 12; i++) {
    const event = TypedCloudEvent.create({
      source: "batch.producer",
      type: "data.point",
      data: {
        value: Math.random() * 100,
        timestamp: Date.now(),
        index: i,
      },
      subject: `data-point-${i}`,
    });

    batcher.add(event);

    // Add small delay to demonstrate timing
    if (i === 7) {
      console.log("Pausing to demonstrate time-based batching...");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Wait for final batch
  await batcher.flush();
  await new Promise((resolve) => setTimeout(resolve, 50));

  console.log(`Processed ${totalEventsProcessed} events in ${batchCount} batches`);
  console.log("Batch stats:", batcher.getStats());

  batcher.cleanup();
  console.log("\n");
}

// ============================================================================
// EXAMPLE 4: EVENT REPLAY FOR TESTING
// ============================================================================

/**
 * Example 4: Event replay for testing and debugging
 */
export async function example4_EventReplay() {
  console.log("=== Example 4: Event Replay ===\n");

  // Create historical events with different timestamps
  const historicalEvents = [
    TypedCloudEvent.create({
      source: "user.service",
      type: "user.registered",
      data: { userId: "user-1", email: "user1@example.com" },
      time: new Date(Date.now() - 3000).toISOString(),
    }),
    TypedCloudEvent.create({
      source: "user.service",
      type: "user.email.verified",
      data: { userId: "user-1" },
      time: new Date(Date.now() - 2000).toISOString(),
    }),
    TypedCloudEvent.create({
      source: "order.service",
      type: "order.placed",
      data: { orderId: "order-1", userId: "user-1", amount: 29.99 },
      time: new Date(Date.now() - 1000).toISOString(),
    }),
  ];

  const processedEvents: string[] = [];

  console.log("Starting replay at 3x speed with timing preserved...");

  const replayer = new EventReplayer({
    events: historicalEvents,
    speed: 3.0, // 3x speed
    preserveTiming: true,
    handler: async (event) => {
      const eventInfo = `${event.getAttribute("type")} [${event.getAttribute("id")}]`;
      processedEvents.push(eventInfo);
      console.log(`Replayed: ${eventInfo} at ${new Date().toISOString()}`);

      // Simulate processing
      await new Promise((resolve) => setTimeout(resolve, 10));
    },
    filter: (event) => {
      // Only replay user-related events
      return event.getAttribute("source").includes("user") ||
        Object.prototype.hasOwnProperty.call(event.getData(), "userId");
    },
    onComplete: () => {
      console.log("Replay completed!");
    },
    onError: (error, event) => {
      console.error(`Replay error for ${event.getAttribute("id")}:`, error);
    },
  });

  const startTime = Date.now();
  await replayer.start();

  // Wait for completion
  await new Promise((resolve) => {
    const checkComplete = () => {
      const stats = replayer.getStats();
      if (!stats.playing) {
        resolve(undefined);
      } else {
        setTimeout(checkComplete, 50);
      }
    };
    checkComplete();
  });

  const replayDuration = Date.now() - startTime;
  console.log(`Replay completed in ${replayDuration}ms`);
  console.log("Processed events:", processedEvents);

  console.log("\n");
}

// ============================================================================
// EXAMPLE 5: EVENT PIPELINE WITH ERROR HANDLING
// ============================================================================

/**
 * Example 5: Complex event processing pipeline
 */
export async function example5_EventPipeline() {
  console.log("=== Example 5: Event Processing Pipeline ===\n");

  // Create processing pipeline
  const pipeline = new EventPipeline()
    .addStage({
      name: "validate",
      process: (event) => {
        if (!event.validate()) {
          throw new Error("Event validation failed");
        }
        event.addTag("validation", "passed");
        return event;
      },
      onError: (error, event) => {
        console.error(`Validation failed for ${event.getAttribute("id")}: ${error.message}`);
      },
    })
    .addStage({
      name: "enrich",
      process: async (event) => {
        // Add enrichment data
        const data = event.getData() as any;
        if (data?.customerId) {
          event.addAnnotation("customer_tier", "premium"); // Mock enrichment
        }
        event.addTag("enriched", "true");

        // Simulate API call delay
        await new Promise((resolve) => setTimeout(resolve, 25));

        return event;
      },
    })
    .addStage({
      name: "route",
      process: (event) => {
        // Determine routing
        const eventType = event.getAttribute("type");
        let routingQueue = "default";

        if (eventType.includes("order")) {
          routingQueue = "order-processing";
        } else if (eventType.includes("user")) {
          routingQueue = "user-management";
        }

        event.addTag("routing_queue", routingQueue);
        return event;
      },
    })
    .addStage({
      name: "audit",
      process: (event) => {
        // Log for audit
        const auditEntry = {
          eventId: event.getAttribute("id"),
          eventType: event.getAttribute("type"),
          source: event.getAttribute("source"),
          timestamp: new Date().toISOString(),
        };

        // Would normally send to audit service
        console.log("Audit:", JSON.stringify(auditEntry));

        event.addTag("audited", "true");
        return event;
      },
    });

  // Create test events (some valid, some that will fail)
  const testEvents = [
    TypedCloudEvent.create({
      source: "api",
      type: "order.created",
      data: { orderId: "order-1", customerId: "customer-1", amount: 100 },
    }),
    TypedCloudEvent.create({
      source: "api",
      type: "user.updated",
      data: { userId: "user-1", name: "Updated Name" },
    }),
    // This will fail validation (missing required fields)
    TypedCloudEvent.create({
      specversion: "1.0",
      id: "bad-event",
      source: "", // Empty source will fail
      type: "", // Empty type will fail
    } as any),
  ];

  console.log("Processing events through pipeline...");

  const results = await pipeline.processMany(testEvents);

  // Display results
  results.forEach((result, index) => {
    if (result) {
      console.log(`Event ${index}: PROCESSED`);
      const telemetry = result.getTelemetry();
      console.log(`  Tags:`, Array.from(telemetry.tags.entries()));
    } else {
      console.log(`Event ${index}: FAILED/FILTERED`);
    }
  });

  // Show pipeline metrics
  console.log("\nPipeline metrics:");
  const metrics = pipeline.getMetrics();
  Object.entries(metrics).forEach(([stage, stats]) => {
    console.log(`  ${stage}:`, stats);
  });

  console.log("\n");
}

// ============================================================================
// EXAMPLE 6: EVENT STREAMING WITH TRANSFORMATIONS
// ============================================================================

/**
 * Example 6: Real-time event streaming with transformations
 */
export async function example6_EventStreaming() {
  console.log("=== Example 6: Event Streaming ===\n");

  // Create event stream
  const eventStream = new EventStream();

  // Create transformed streams
  const orderStream = eventStream
    .filter((event) => event.getAttribute("type").includes("order"))
    .map((event) => {
      // Transform to order summary
      const data = event.getData() as any;
      return TypedCloudEvent.create({
        source: "stream.transformer",
        type: "order.summary",
        data: {
          orderId: data.orderId,
          totalAmount: data.amount,
          summary: `Order ${data.orderId} for $${data.amount}`,
        },
        subject: `order-summaries/${data.orderId}`,
      });
    });

  const highValueStream = eventStream
    .filter((event) => {
      const data = event.getData() as any;
      return data?.amount && data.amount > 50;
    });

  // Start consumers
  const orderSummaries: string[] = [];
  const highValueOrders: string[] = [];

  // Consume order summaries
  const orderConsumer = (async () => {
    for await (const event of orderStream.take(3)) {
      const data = event.getData() as any;
      orderSummaries.push(data.summary);
      console.log("Order summary:", data.summary);
    }
  })();

  // Consume high-value orders
  const highValueConsumer = (async () => {
    for await (const event of highValueStream.take(2)) {
      const data = event.getData() as any;
      highValueOrders.push(`High-value: Order ${data.orderId} - $${data.amount}`);
      console.log("High-value order detected:", data.orderId);
    }
  })();

  // Produce events
  console.log("Streaming events...");

  const orders = [
    { orderId: "order-1", customerId: "customer-1", amount: 25.99 },
    { orderId: "order-2", customerId: "customer-2", amount: 89.99 },
    { orderId: "order-3", customerId: "customer-3", amount: 15.50 },
    { orderId: "order-4", customerId: "customer-1", amount: 120.00 },
    { orderId: "order-5", customerId: "customer-4", amount: 75.25 },
  ];

  for (const orderData of orders) {
    const event = TypedCloudEvent.create({
      source: "order.service",
      type: "order.placed",
      data: orderData,
    });

    eventStream.push(event);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate real-time
  }

  // Wait for consumers to complete
  await Promise.all([orderConsumer, highValueConsumer]);

  console.log("\nOrder summaries processed:", orderSummaries.length);
  console.log("High-value orders detected:", highValueOrders.length);

  eventStream.close();
  console.log("Stream closed");

  console.log("\n");
}

// ============================================================================
// MAIN EXAMPLE RUNNER
// ============================================================================

/**
 * Run all examples
 */
export async function runAllExamples() {
  console.log("🚀 Enhanced TypedCloudEvent Examples\n");
  console.log("==========================================\n");

  try {
    await example1_BasicEventWithObservability();
    await example2_EventRouting();
    await example3_BatchProcessing();
    await example4_EventReplay();
    await example5_EventPipeline();
    await example6_EventStreaming();

    console.log("✅ All examples completed successfully!");
  } catch (error) {
    console.error("❌ Example failed:", error);
    throw error;
  }
}

// Run examples if this file is executed directly
if (import.meta.main) {
  await runAllExamples();
}
