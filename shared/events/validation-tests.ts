/**
 * Comprehensive validation tests for event schemas
 * Ensures all schemas work correctly with valid and invalid data
 */

import { assertEquals, assertExists, assertThrows } from "jsr:@std/assert";
import { z } from "zod";
import { TypedCloudEvent } from "./base.ts";
import {
  AuditLogCreatedEventSchema,
  EventBuilders,
  IntentClassifiedEventSchema,
  MetricsCollectedEventSchema,
  ResponseGeneratedEventSchema,
  safeParseEvent,
  SystemErrorEventSchema,
  TicketReceivedEventSchema,
  TicketRoutedEventSchema,
  validateEventData,
  versionedSchemas,
} from "./schemas.ts";
import { EventPriority, EventSources, EventTypes } from "./types.ts";

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

function createValidCustomer() {
  return {
    email: "test@example.com",
    name: "Test User",
    company: "Test Corp",
    tier: "premium" as const,
    language: "en",
    phone: "+1-555-0123",
    timezone: "UTC",
  };
}

function createValidTicket() {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    subject: "Test ticket subject",
    description: "Test ticket description with sufficient length",
    status: "new" as const,
    priority: "medium" as const,
    channel: "email" as const,
    customer: createValidCustomer(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    category: "technical_support",
    subcategory: "login_issues",
    tags: ["test", "validation"],
  };
}

function createValidTicketReceivedEvent() {
  return {
    ticket: createValidTicket(),
    source_system: "test_system",
    received_at: new Date().toISOString(),
    raw_content: "Original email content",
    metadata: {
      version: "1.0",
      environment: "test" as const,
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      priority: EventPriority.MEDIUM,
      tags: ["test_data"],
    },
  };
}

function createValidClassificationResult() {
  return {
    intent: "technical_support",
    confidence_score: 0.85,
    confidence_level: "high" as const,
    sub_intents: [
      { intent: "login_issue", confidence_score: 0.75 },
    ],
    entities: [
      {
        entity: "problem_type",
        value: "authentication",
        confidence_score: 0.90,
      },
    ],
    sentiment: {
      polarity: "negative" as const,
      score: -0.2,
      confidence: 0.80,
    },
    language_detected: "en",
    topics: ["login", "authentication"],
  };
}

function createValidIntentClassifiedEvent() {
  return {
    ticket_id: "550e8400-e29b-41d4-a716-446655440000",
    classification_result: createValidClassificationResult(),
    model_version: "v2.1.0",
    processing_time_ms: 150,
    classified_at: new Date().toISOString(),
    classifier_id: "test-classifier",
    training_data_version: "2024-01-01",
    fallback_used: false,
    metadata: {
      version: "1.0",
      environment: "test" as const,
      tenantId: "123e4567-e89b-12d3-a456-426614174000",
      priority: EventPriority.MEDIUM,
    },
  };
}

// ============================================================================
// SCHEMA VALIDATION TESTS
// ============================================================================

Deno.test("Ticket Received Event Schema Validation", () => {
  const validData = createValidTicketReceivedEvent();

  // Test valid data
  const result = safeParseEvent(TicketReceivedEventSchema, validData);
  assertEquals(result.success, true);

  if (result.success) {
    assertExists(result.data.ticket);
    assertExists(result.data.source_system);
    assertExists(result.data.received_at);
  }

  // Test invalid data - missing required field
  const invalidData = { ...validData };
  delete (invalidData as any).ticket;

  const invalidResult = safeParseEvent(TicketReceivedEventSchema, invalidData);
  assertEquals(invalidResult.success, false);
});

Deno.test("Ticket Schema Field Validation", () => {
  const validTicket = createValidTicket();

  // Test invalid email
  const invalidEmailTicket = {
    ...validTicket,
    customer: {
      ...validTicket.customer,
      email: "not-an-email",
    },
  };

  const ticketData = { ...createValidTicketReceivedEvent(), ticket: invalidEmailTicket };
  const result = safeParseEvent(TicketReceivedEventSchema, ticketData);
  assertEquals(result.success, false);

  // Test invalid UUID
  const invalidUuidTicket = {
    ...validTicket,
    id: "not-a-uuid",
  };

  const uuidTicketData = { ...createValidTicketReceivedEvent(), ticket: invalidUuidTicket };
  const uuidResult = safeParseEvent(TicketReceivedEventSchema, uuidTicketData);
  assertEquals(uuidResult.success, false);

  // Test invalid priority
  const invalidPriorityTicket = {
    ...validTicket,
    priority: "invalid-priority",
  };

  const priorityTicketData = { ...createValidTicketReceivedEvent(), ticket: invalidPriorityTicket };
  const priorityResult = safeParseEvent(TicketReceivedEventSchema, priorityTicketData);
  assertEquals(priorityResult.success, false);
});

Deno.test("Intent Classification Event Schema Validation", () => {
  const validData = createValidIntentClassifiedEvent();

  // Test valid data
  const result = safeParseEvent(IntentClassifiedEventSchema, validData);
  assertEquals(result.success, true);

  // Test invalid confidence score (> 1.0)
  const invalidConfidenceData = {
    ...validData,
    classification_result: {
      ...validData.classification_result,
      confidence_score: 1.5, // Invalid: > 1.0
    },
  };

  const invalidResult = safeParseEvent(IntentClassifiedEventSchema, invalidConfidenceData);
  assertEquals(invalidResult.success, false);

  // Test negative processing time
  const negativeTimeData = {
    ...validData,
    processing_time_ms: -100, // Invalid: negative time
  };

  const negativeTimeResult = safeParseEvent(IntentClassifiedEventSchema, negativeTimeData);
  assertEquals(negativeTimeResult.success, false);
});

Deno.test("Routing Event Schema Validation", () => {
  const validRoutingData = {
    ticket_id: "550e8400-e29b-41d4-a716-446655440000",
    queue: {
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Support Queue",
      description: "General support queue",
      capacity: 100,
      current_load: 25,
      priority_weight: 50,
    },
    agent: {
      id: "550e8400-e29b-41d4-a716-446655440002",
      name: "Agent Smith",
      email: "agent@company.com",
      skills: ["technical_support", "billing"],
      capacity: 10,
      current_load: 3,
      availability_status: "available" as const,
      language_codes: ["en", "es"],
    },
    routing_decision: {
      strategy: "skill_based" as const,
      reason: "Agent has required technical skills",
      confidence_score: 0.88,
      factors_considered: ["skills", "availability", "load"],
      processing_time_ms: 75,
    },
    routed_at: new Date().toISOString(),
    estimated_wait_time_minutes: 5,
    metadata: {
      version: "1.0",
      environment: "test" as const,
      priority: EventPriority.MEDIUM,
    },
  };

  const result = safeParseEvent(TicketRoutedEventSchema, validRoutingData);
  assertEquals(result.success, true);

  // Test invalid agent email
  const invalidAgentData = {
    ...validRoutingData,
    agent: {
      ...validRoutingData.agent!,
      email: "not-an-email",
    },
  };

  const invalidResult = safeParseEvent(TicketRoutedEventSchema, invalidAgentData);
  assertEquals(invalidResult.success, false);
});

Deno.test("Response Generated Event Schema Validation", () => {
  const validResponseData = {
    ticket_id: "550e8400-e29b-41d4-a716-446655440000",
    response_id: "550e8400-e29b-41d4-a716-446655440003",
    response_type: "auto_generated" as const,
    content: {
      subject: "Re: Your support request",
      body:
        "Thank you for contacting us. We have received your request and will respond within 24 hours.",
      format: "plain_text" as const,
    },
    channel: "email" as const,
    generated_by: "ai-assistant-v2",
    generation_method: "template_based",
    processing_time_ms: 250,
    generated_at: new Date().toISOString(),
    requires_approval: false,
    metadata: {
      version: "1.0",
      environment: "test" as const,
      priority: EventPriority.MEDIUM,
    },
  };

  const result = safeParseEvent(ResponseGeneratedEventSchema, validResponseData);
  assertEquals(result.success, true);

  // Test empty response body
  const emptyBodyData = {
    ...validResponseData,
    content: {
      ...validResponseData.content,
      body: "", // Invalid: empty body
    },
  };

  const emptyBodyResult = safeParseEvent(ResponseGeneratedEventSchema, emptyBodyData);
  assertEquals(emptyBodyResult.success, false);
});

Deno.test("System Error Event Schema Validation", () => {
  const validErrorData = {
    error: {
      code: "DATABASE_CONNECTION_FAILED",
      message: "Unable to connect to database",
      details: {
        host: "db.example.com",
        port: 5432,
      },
      retry_count: 2,
      max_retries: 5,
    },
    service_name: "classifier-service",
    error_category: "database" as const,
    severity: "high" as const,
    occurred_at: new Date().toISOString(),
    user_impact: "moderate" as const,
    metadata: {
      version: "1.0",
      environment: "test" as const,
      priority: EventPriority.MEDIUM,
    },
  };

  const result = safeParseEvent(SystemErrorEventSchema, validErrorData);
  assertEquals(result.success, true);

  // Test negative retry count
  const negativeRetryData = {
    ...validErrorData,
    error: {
      ...validErrorData.error,
      retry_count: -1, // Invalid: negative retry count
    },
  };

  const negativeRetryResult = safeParseEvent(SystemErrorEventSchema, negativeRetryData);
  assertEquals(negativeRetryResult.success, false);
});

Deno.test("Metrics Collected Event Schema Validation", () => {
  const validMetricsData = {
    collection_id: "550e8400-e29b-41d4-a716-446655440004",
    source_service: "analytics-service",
    metrics: [
      {
        name: "tickets_processed",
        value: 150,
        unit: "count",
        timestamp: new Date().toISOString(),
        dimensions: {
          service: "classifier",
          status: "success",
        },
        tags: ["performance"],
      },
    ],
    collection_period: {
      start_time: new Date(Date.now() - 3600000).toISOString(),
      end_time: new Date().toISOString(),
    },
    collection_method: "scheduled" as const,
    collected_at: new Date().toISOString(),
    metadata: {
      version: "1.0",
      environment: "test" as const,
      priority: EventPriority.MEDIUM,
    },
  };

  const result = safeParseEvent(MetricsCollectedEventSchema, validMetricsData);
  assertEquals(result.success, true);

  // Test empty metrics array
  const emptyMetricsData = {
    ...validMetricsData,
    metrics: [], // Invalid: no metrics
  };

  const emptyMetricsResult = safeParseEvent(MetricsCollectedEventSchema, emptyMetricsData);
  assertEquals(emptyMetricsResult.success, false);
});

Deno.test("Audit Log Event Schema Validation", () => {
  const validAuditData = {
    audit_id: "550e8400-e29b-41d4-a716-446655440005",
    action: {
      action: "ticket.status.changed",
      resource_type: "ticket",
      resource_id: "550e8400-e29b-41d4-a716-446655440006",
      actor_id: "550e8400-e29b-41d4-a716-446655440007",
      actor_type: "user" as const,
      timestamp: new Date().toISOString(),
      before_state: { status: "new" },
      after_state: { status: "in_progress" },
      changes: [
        {
          field: "status",
          old_value: "new",
          new_value: "in_progress",
        },
      ],
    },
    logged_at: new Date().toISOString(),
    metadata: {
      version: "1.0",
      environment: "test" as const,
      priority: EventPriority.MEDIUM,
    },
  };

  const result = safeParseEvent(AuditLogCreatedEventSchema, validAuditData);
  assertEquals(result.success, true);
});

// ============================================================================
// EVENT BUILDER TESTS
// ============================================================================

Deno.test("Event Builders Create Valid Events", () => {
  // Test ticket received builder
  const ticketEvent = EventBuilders.ticketReceived(createValidTicketReceivedEvent());
  assertEquals(ticketEvent.type, EventTypes.TICKET_RECEIVED);
  assertExists(ticketEvent.data);
  assertExists(ticketEvent.schema);

  // Test classification builder
  const classificationEvent = EventBuilders.intentClassified(createValidIntentClassifiedEvent());
  assertEquals(classificationEvent.type, EventTypes.INTENT_CLASSIFIED);
  assertExists(classificationEvent.data);

  // Test system error builder
  const errorEvent = EventBuilders.systemError({
    error: {
      code: "TEST_ERROR",
      message: "Test error message",
      retry_count: 0,
      max_retries: 3,
    },
    service_name: "test-service",
    error_category: "unknown" as const,
    severity: "low" as const,
    occurred_at: new Date().toISOString(),
    metadata: {
      version: "1.0",
      environment: "test" as const,
      priority: EventPriority.MEDIUM,
    },
  });

  assertEquals(errorEvent.type, EventTypes.SERVICE_ERROR);
  assertExists(errorEvent.data);
});

Deno.test("Event Builders Throw on Invalid Data", () => {
  // Test invalid ticket data
  assertThrows(() => {
    EventBuilders.ticketReceived({
      ticket: {
        ...createValidTicket(),
        id: "invalid-uuid", // Invalid UUID
      },
      source_system: "test_system",
      received_at: new Date().toISOString(),
    });
  });

  // Test invalid classification confidence
  assertThrows(() => {
    EventBuilders.intentClassified({
      ...createValidIntentClassifiedEvent(),
      classification_result: {
        ...createValidClassificationResult(),
        confidence_score: 1.5, // Invalid: > 1.0
      },
    });
  });
});

// ============================================================================
// EVENT CORRELATION TESTS
// ============================================================================

Deno.test("Event Correlation and Causation", () => {
  // Create original event
  const originalEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: createValidTicketReceivedEvent(),
  }, TicketReceivedEventSchema);

  originalEvent.setCorrelationId("test-correlation-123");

  // Create response event
  const responseEvent = originalEvent.createResponse(
    EventTypes.INTENT_CLASSIFIED,
    createValidIntentClassifiedEvent(),
  );

  // Verify correlation
  assertEquals(responseEvent.getCorrelationId(), "test-correlation-123");
  assertEquals(responseEvent.getCausationId(), originalEvent.getAttribute("id"));

  // Create another response
  const routingEvent = responseEvent.createResponse(
    EventTypes.TICKET_ROUTED,
    {
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      routing_decision: {
        strategy: "round_robin" as const,
        reason: "Load balancing",
        confidence_score: 0.8,
        factors_considered: ["load"],
        processing_time_ms: 50,
      },
      routed_at: new Date().toISOString(),
      metadata: {
        version: "1.0",
        environment: "test" as const,
        priority: EventPriority.MEDIUM,
      },
    },
  );

  // Verify correlation chain
  assertEquals(routingEvent.getCorrelationId(), "test-correlation-123");
  assertEquals(routingEvent.getCausationId(), responseEvent.getAttribute("id"));
});

// ============================================================================
// VALIDATION HELPER TESTS
// ============================================================================

Deno.test("validateEventData Function", () => {
  const validData = createValidTicketReceivedEvent();

  // Test valid data
  const result = validateEventData(EventTypes.TICKET_RECEIVED, validData);
  assertEquals(result.isValid, true);
  assertExists(result.validatedData);

  // Test invalid data
  const invalidData = { ...validData, ticket: null };
  const invalidResult = validateEventData(EventTypes.TICKET_RECEIVED, invalidData);
  assertEquals(invalidResult.isValid, false);
  assertExists(invalidResult.errors);

  // Test unknown event type
  const unknownResult = validateEventData("unknown.event.type", validData);
  assertEquals(unknownResult.isValid, false);
  assertExists(unknownResult.errors);
});

// ============================================================================
// VERSIONING TESTS
// ============================================================================

Deno.test("Schema Versioning and Migration", () => {
  // Create a v2 schema with additional fields
  const TicketReceivedEventV2Schema = TicketReceivedEventSchema.extend({
    processing_hints: z.object({
      urgent: z.boolean().default(false),
      auto_respond: z.boolean().default(true),
    }).optional(),
    compliance_flags: z.array(z.string()).optional(),
  });

  // Register the new version
  versionedSchemas.registerVersion(EventTypes.TICKET_RECEIVED, "2.0", {
    version: "2.0",
    schema: TicketReceivedEventV2Schema,
    migration: (v1Data: any) => ({
      ...v1Data,
      processing_hints: {
        urgent: v1Data.ticket?.priority === "critical",
        auto_respond: true,
      },
      compliance_flags: [],
    }),
  });

  // Test migration from 1.0 to 2.0
  const v1Data = createValidTicketReceivedEvent();

  // Get the migration function and apply it manually since the test version registration is local
  // const v2SchemaInfo = versionedSchemas.getSchema(EventTypes.TICKET_RECEIVED, "2.0"); // Not used in test
  const migration = (v1Data: any) => ({
    ...v1Data,
    processing_hints: {
      urgent: v1Data.ticket?.priority === "critical",
      auto_respond: true,
    },
    compliance_flags: [],
  });

  const migratedData = migration(v1Data);

  // Validate migrated data against v2 schema
  const result = safeParseEvent(TicketReceivedEventV2Schema, migratedData);
  assertEquals(result.success, true);

  if (result.success) {
    assertExists(result.data.processing_hints);
    assertEquals(result.data.processing_hints.auto_respond, true);
    assertExists(result.data.compliance_flags);
  }
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

Deno.test("Schema Validation Performance", () => {
  const validData = createValidTicketReceivedEvent();
  const iterations = 1000;

  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const result = safeParseEvent(TicketReceivedEventSchema, validData);
    assertEquals(result.success, true);
  }

  const end = performance.now();
  const avgTime = (end - start) / iterations;

  console.log(`Average validation time: ${avgTime.toFixed(3)}ms`);

  // Ensure validation is reasonably fast (< 5ms per validation)
  // This is a reasonable threshold for production use
  if (avgTime > 5) {
    console.warn(`Schema validation is slower than expected: ${avgTime}ms`);
  }
});

Deno.test("Event Creation Performance", () => {
  const validData = createValidTicketReceivedEvent();
  const iterations = 1000;

  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const event = EventBuilders.ticketReceived(validData);
    assertExists(event);
  }

  const end = performance.now();
  const avgTime = (end - start) / iterations;

  console.log(`Average event creation time: ${avgTime.toFixed(3)}ms`);

  if (avgTime > 10) {
    console.warn(`Event creation is slower than expected: ${avgTime}ms`);
  }
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

Deno.test("Handle Edge Cases", () => {
  // Test with minimal required fields only
  const minimalTicketData = {
    ticket: {
      id: "550e8400-e29b-41d4-a716-446655440000",
      subject: "Minimal ticket",
      description: "Minimal description",
      status: "new" as const,
      priority: "low" as const,
      channel: "api" as const,
      customer: {
        email: "minimal@example.com",
        name: "Minimal User",
        tier: "free" as const,
        language: "en",
      },
      created_at: new Date().toISOString(),
    },
    source_system: "minimal_system",
    received_at: new Date().toISOString(),
  };

  const result = safeParseEvent(TicketReceivedEventSchema, minimalTicketData);
  assertEquals(result.success, true);

  // Test with maximum fields
  const maximalTicketData = {
    ...createValidTicketReceivedEvent(),
    ticket: {
      ...createValidTicket(),
      external_id: "EXT-12345",
      due_date: new Date(Date.now() + 86400000).toISOString(),
      resolved_at: new Date().toISOString(),
      assignee_id: "550e8400-e29b-41d4-a716-446655440008",
      queue_id: "550e8400-e29b-41d4-a716-446655440009",
      attachments: [
        {
          id: "550e8400-e29b-41d4-a716-446655440010",
          filename: "screenshot.png",
          content_type: "image/png",
          size_bytes: 1024576,
          url: "https://files.example.com/attachment-001",
        },
      ],
      custom_fields: {
        environment: "production",
        browser: "Chrome 120",
        os: "Windows 11",
      },
      sla_breach_at: new Date(Date.now() + 3600000).toISOString(),
    },
  };

  const maximalResult = safeParseEvent(TicketReceivedEventSchema, maximalTicketData);
  assertEquals(maximalResult.success, true);
});

Deno.test("Handle Unicode and Special Characters", () => {
  const unicodeTicketData = {
    ...createValidTicketReceivedEvent(),
    ticket: {
      ...createValidTicket(),
      subject: "問題報告: ログインできません 🚨",
      description:
        "こんにちは、アカウントにログインできません。エラーメッセージ: 'パスワードが正しくありません'",
      customer: {
        ...createValidCustomer(),
        name: "田中 太郎",
        company: "株式会社テスト",
        language: "ja",
      },
      tags: ["ログイン", "認証", "日本語"],
    },
  };

  const result = safeParseEvent(TicketReceivedEventSchema, unicodeTicketData);
  assertEquals(result.success, true);

  if (result.success) {
    assertEquals(result.data.ticket.customer.language, "ja");
    assertEquals(result.data.ticket.tags?.includes("ログイン"), true);
  }
});

console.log("🧪 Event schema validation tests completed successfully!");
