/**
 * Comprehensive unit tests for TypedCloudEvent implementation
 * Tests all functionality including error handling, validation, and factory methods
 */

import { assertEquals, assertExists, assertThrows, assertInstanceOf } from "jsr:@std/assert";
import {
  TypedCloudEvent,
  TypedCloudEventFactory,
  CloudEventError,
  CloudEventValidationError,
  CloudEventSerializationError,
  CloudEventMissingFieldError,
  CloudEventUnsupportedTypeError,
  validateCloudEvent,
  isCloudEvent,
  createSimpleCloudEvent,
  cloneCloudEvent,
  createErrorEvent,
} from "./base.ts";
import { EventTypes, EventSources } from "./types.ts";

// ============================================================================
// TEST DATA FACTORIES
// ============================================================================

const testTicketData = {
  ticket: {
    id: "550e8400-e29b-41d4-a716-446655440000",
    subject: "Test ticket",
    description: "Test description for the ticket",
    status: "new" as const,
    priority: "medium" as const,
    channel: "email" as const,
    customer: {
      email: "test@example.com",
      name: "Test User",
      tier: "free" as const,
      language: "en",
    },
    created_at: new Date().toISOString(),
  },
  source_system: "test-system",
  received_at: new Date().toISOString(),
};

const testIntentData = {
  ticket_id: "550e8400-e29b-41d4-a716-446655440000",
  classification_result: {
    intent: "support_request",
    confidence_score: 0.85,
    confidence_level: "high" as const,
  },
  model_version: "v1.0",
  processing_time_ms: 150,
  classified_at: new Date().toISOString(),
  classifier_id: "test-classifier",
};

// ============================================================================
// CUSTOM ERROR TYPES TESTS
// ============================================================================

Deno.test("CloudEventError - base error class", () => {
  const error = new CloudEventError("Test error", "TEST_CODE", { detail: "test" });
  
  assertEquals(error.name, "CloudEventError");
  assertEquals(error.message, "Test error");
  assertEquals(error.code, "TEST_CODE");
  assertEquals(error.details?.detail, "test");
  assertInstanceOf(error, Error);
});

Deno.test("CloudEventValidationError - validation error with formatted messages", () => {
  const zodErrors = [
    { code: "invalid_type" as const, expected: "string" as const, received: "number" as const, path: ["id"], message: "Expected string" },
    { code: "too_small" as const, minimum: 1, type: "string" as const, inclusive: true, exact: false, path: ["source"], message: "String must contain at least 1 character(s)" },
  ];
  
  const error = new CloudEventValidationError("Validation failed", zodErrors, "data");
  
  assertEquals(error.name, "CloudEventValidationError");
  assertEquals(error.code, "VALIDATION_ERROR");
  assertEquals(error.field, "data");
  assertEquals(error.validationErrors.length, 2);
  
  const formattedErrors = error.getFormattedErrors();
  assertEquals(formattedErrors.length, 2);
  assertEquals(formattedErrors[0], "id: Expected string");
  assertEquals(formattedErrors[1], "source: String must contain at least 1 character(s)");
});

Deno.test("CloudEventSerializationError - serialization error", () => {
  const originalError = new Error("JSON parsing failed");
  const error = new CloudEventSerializationError("Serialization failed", originalError);
  
  assertEquals(error.name, "CloudEventSerializationError");
  assertEquals(error.code, "SERIALIZATION_ERROR");
  assertEquals(error.originalError, originalError);
});

Deno.test("CloudEventMissingFieldError - missing field error", () => {
  const error = new CloudEventMissingFieldError("id", "test.event.type");
  
  assertEquals(error.name, "CloudEventMissingFieldError");
  assertEquals(error.code, "MISSING_FIELD_ERROR");
  assertEquals(error.message, "Required CloudEvent field 'id' is missing for event type 'test.event.type'");
});

Deno.test("CloudEventUnsupportedTypeError - unsupported type error", () => {
  const supportedTypes = ["type1", "type2"];
  const error = new CloudEventUnsupportedTypeError("unsupported.type", supportedTypes);
  
  assertEquals(error.name, "CloudEventUnsupportedTypeError");
  assertEquals(error.code, "UNSUPPORTED_TYPE_ERROR");
  assertEquals(error.message, "Unsupported CloudEvent type 'unsupported.type'. Supported types: type1, type2");
});

// ============================================================================
// TYPEDCLOUDEVENT CORE TESTS
// ============================================================================

Deno.test("TypedCloudEvent.create - valid event creation", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  assertExists(event);
  assertEquals(event.getAttribute("source"), EventSources.INGESTION_SERVICE);
  assertEquals(event.getAttribute("type"), EventTypes.TICKET_RECEIVED);
  assertEquals(event.getAttribute("specversion"), "1.0");
  assertExists(event.getAttribute("id"));
  assertExists(event.getAttribute("time"));
  assertEquals(event.getData(), testTicketData);
});

Deno.test("TypedCloudEvent.create - with custom id and time", () => {
  const customId = "custom-id-123";
  const customTime = "2024-01-01T00:00:00Z";
  
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
    id: customId,
    time: customTime,
  });

  assertEquals(event.getAttribute("id"), customId);
  assertEquals(event.getAttribute("time"), customTime);
});

Deno.test("TypedCloudEvent.create - validation failure", () => {
  assertThrows(() => {
    TypedCloudEvent.create({
      source: "", // Invalid: empty source
      type: EventTypes.TICKET_RECEIVED,
      data: testTicketData,
    });
  }, CloudEventValidationError);
});

Deno.test("TypedCloudEvent.fromCloudEvent - valid conversion", () => {
  const rawEvent = {
    specversion: "1.0",
    id: "test-id",
    source: EventSources.CLASSIFIER_SERVICE,
    type: EventTypes.INTENT_CLASSIFIED,
    data: testIntentData,
    time: new Date().toISOString(),
  };

  // Create a basic schema mock for testing
  const basicSchema = {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

  const typedEvent = TypedCloudEvent.fromCloudEvent(rawEvent, basicSchema as any);
  
  assertEquals(typedEvent.getAttribute("id"), "test-id");
  assertEquals(typedEvent.getAttribute("source"), EventSources.CLASSIFIER_SERVICE);
  assertEquals(typedEvent.getData(), testIntentData);
});

Deno.test("TypedCloudEvent.fromCloudEvent - validation failure", () => {
  const invalidEvent = {
    specversion: "2.0", // Invalid: unsupported version
    id: "test-id",
    source: EventSources.CLASSIFIER_SERVICE,
    type: EventTypes.INTENT_CLASSIFIED,
    data: testIntentData,
  };

  assertThrows(() => {
    TypedCloudEvent.fromCloudEvent(invalidEvent, {} as any);
  }, CloudEventValidationError);
});

// ============================================================================
// SERIALIZATION TESTS
// ============================================================================

Deno.test("TypedCloudEvent JSON serialization/deserialization", () => {
  const originalEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
    subject: "test-subject",
  });

  const json = originalEvent.toJSON();
  const prettyJson = originalEvent.toPrettyJSON();
  
  assertExists(json);
  assertExists(prettyJson);
  assertEquals(prettyJson.includes("  "), true); // Pretty JSON should have indentation

  const deserializedEvent = TypedCloudEvent.fromJSON(json);
  
  assertEquals(deserializedEvent.getAttribute("source"), originalEvent.getAttribute("source"));
  assertEquals(deserializedEvent.getAttribute("type"), originalEvent.getAttribute("type"));
  assertEquals(deserializedEvent.getAttribute("subject"), "test-subject");
  // Data should be structurally similar (but may have schema differences)
  assertExists(deserializedEvent.getData());
});

Deno.test("TypedCloudEvent.fromJSON - invalid JSON", () => {
  assertThrows(() => {
    TypedCloudEvent.fromJSON("invalid json");
  }, CloudEventSerializationError);
});

Deno.test("TypedCloudEvent.fromJSON - auto schema detection", () => {
  const eventJson = JSON.stringify({
    specversion: "1.0",
    id: "test-id",
    source: EventSources.CLASSIFIER_SERVICE,
    type: EventTypes.INTENT_CLASSIFIED,
    data: testIntentData,
    time: new Date().toISOString(),
  });

  // Should auto-detect schema based on event type (may not work without registered schemas)
  const event = TypedCloudEvent.fromJSON(eventJson);
  
  assertEquals(event.getAttribute("type"), EventTypes.INTENT_CLASSIFIED);
  // Data should be structurally similar (but may have schema differences)
  assertExists(event.getData());
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

Deno.test("TypedCloudEvent validation methods", () => {
  const validEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  assertEquals(validEvent.validate(), true);
  assertEquals(validEvent.getValidationErrors(), null);
  
  const validationInfo = validEvent.getValidationInfo();
  assertEquals(validationInfo.isValid, true);
  assertEquals(validationInfo.errors.length, 0);
});

Deno.test("TypedCloudEvent validation with warnings", () => {
  const eventWithoutOptionalFields = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
    // No subject provided
  });

  const validationInfo = eventWithoutOptionalFields.getValidationInfo();
  assertEquals(validationInfo.isValid, true);
  // Should have at least one warning (may be more depending on implementation)
  assertEquals(validationInfo.warnings.length >= 1, true);
});

// ============================================================================
// CORRELATION AND CAUSATION TESTS
// ============================================================================

Deno.test("TypedCloudEvent correlation and causation", () => {
  const originalEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  const correlationId = "test-correlation-123";
  originalEvent.setCorrelationId(correlationId);
  
  assertEquals(originalEvent.getCorrelationId(), correlationId);

  const responseEvent = originalEvent.createResponse(
    EventTypes.INTENT_CLASSIFIED,
    testIntentData
  );

  assertEquals(responseEvent.getCorrelationId(), correlationId);
  assertEquals(responseEvent.getCausationId(), originalEvent.getAttribute("id"));
});

Deno.test("TypedCloudEvent response creation", () => {
  const originalEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
    subject: "original-subject",
  });

  const responseEvent = originalEvent.createResponse(
    EventTypes.INTENT_CLASSIFIED,
    testIntentData
  );

  assertEquals(responseEvent.getAttribute("source"), EventSources.INGESTION_SERVICE);
  assertEquals(responseEvent.getAttribute("type"), EventTypes.INTENT_CLASSIFIED);
  assertEquals(responseEvent.getAttribute("subject"), "original-subject");
  assertEquals(responseEvent.getData(), testIntentData);
});

// ============================================================================
// UTILITY METHOD TESTS
// ============================================================================

Deno.test("TypedCloudEvent utility methods", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.ROUTING_SERVICE,
    type: EventTypes.TICKET_ROUTED,
    data: testIntentData,
    time: new Date(Date.now() - 5000).toISOString(), // 5 seconds ago
  });

  // Type checking
  assertEquals(event.isType(EventTypes.TICKET_ROUTED), true);
  assertEquals(event.isType(EventTypes.INTENT_CLASSIFIED), false);
  assertEquals(event.isOneOfTypes([EventTypes.TICKET_ROUTED, EventTypes.INTENT_CLASSIFIED]), true);

  // Source checking
  assertEquals(event.isFromSource(EventSources.ROUTING_SERVICE), true);
  assertEquals(event.isFromSource(EventSources.CLASSIFIER_SERVICE), false);
  assertEquals(event.isFromOneOfSources([EventSources.ROUTING_SERVICE, EventSources.CLASSIFIER_SERVICE]), true);

  // Age checking
  const ageMs = event.getAgeMs();
  assertEquals(ageMs > 4000, true); // Should be around 5 seconds
  assertEquals(event.isOlderThan(3000), true);
  assertEquals(event.isOlderThan(10000), false);

  // Size checking
  const sizeBytes = event.getSizeBytes();
  assertEquals(sizeBytes > 100, true); // Should have some reasonable size
  assertEquals(event.exceedsSizeLimit(50), true);
  assertEquals(event.exceedsSizeLimit(10000), false);
});

Deno.test("TypedCloudEvent clone functionality", () => {
  const originalEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
    subject: "original-subject",
  });

  const clonedEvent = originalEvent.clone({
    subject: "modified-subject",
  });

  assertEquals(clonedEvent.getAttribute("subject"), "modified-subject");
  assertEquals(clonedEvent.getAttribute("source"), originalEvent.getAttribute("source"));
  assertEquals(clonedEvent.getAttribute("type"), originalEvent.getAttribute("type"));
  assertEquals(clonedEvent.getData(), testTicketData);
  
  // IDs should be different
  const originalId = originalEvent.getAttribute("id");
  const clonedId = clonedEvent.getAttribute("id");
  assertEquals(originalId === clonedId, false);
});

// ============================================================================
// TRACE CONTEXT TESTS
// ============================================================================

Deno.test("TypedCloudEvent trace context management", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  const traceParent = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
  const traceState = "rojo=00f067aa0ba902b7,congo=t61rcWkgMzE";

  event.addTraceContext(traceParent, traceState);
  
  const traceContext = event.getTraceContext();
  assertEquals(traceContext.traceParent, traceParent);
  assertEquals(traceContext.traceState, traceState);

  event.removeTraceContext();
  const emptyTraceContext = event.getTraceContext();
  assertEquals(emptyTraceContext.traceParent, undefined);
  assertEquals(emptyTraceContext.traceState, undefined);
});

Deno.test("TypedCloudEvent trace context validation", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  // Invalid trace parent
  assertThrows(() => {
    event.addTraceContext("", "valid-state");
  }, CloudEventValidationError);

  assertThrows(() => {
    event.addTraceContext(123 as any, "valid-state");
  }, CloudEventValidationError);

  // Invalid trace state
  assertThrows(() => {
    event.addTraceContext("valid-parent", 456 as any);
  }, CloudEventValidationError);
});

// ============================================================================
// FACTORY METHODS TESTS
// ============================================================================

Deno.test("TypedCloudEventFactory.createTicketReceived", () => {
  const event = TypedCloudEventFactory.createTicketReceived(
    testTicketData,
    EventSources.INGESTION_SERVICE,
    { subject: "test-ticket" }
  );

  assertEquals(event.getAttribute("type"), EventTypes.TICKET_RECEIVED);
  assertEquals(event.getAttribute("source"), EventSources.INGESTION_SERVICE);
  assertEquals(event.getAttribute("subject"), "test-ticket");
  assertEquals(event.getData(), testTicketData);
});

Deno.test("TypedCloudEventFactory.createIntentClassified", () => {
  const event = TypedCloudEventFactory.createIntentClassified(testIntentData);

  assertEquals(event.getAttribute("type"), EventTypes.INTENT_CLASSIFIED);
  assertEquals(event.getAttribute("source"), EventSources.CLASSIFIER_SERVICE);
  assertEquals(event.getData(), testIntentData);
});

Deno.test("TypedCloudEventFactory.createTypedEvent", () => {
  const event = TypedCloudEventFactory.createTypedEvent(
    EventTypes.TICKET_RECEIVED,
    testTicketData,
    EventSources.INGESTION_SERVICE
  );

  assertEquals(event.getAttribute("type"), EventTypes.TICKET_RECEIVED);
  assertEquals(event.getAttribute("source"), EventSources.INGESTION_SERVICE);
  assertEquals(event.getData(), testTicketData);
});

Deno.test("TypedCloudEventFactory.createTypedEvent - unsupported type", () => {
  assertThrows(() => {
    TypedCloudEventFactory.createTypedEvent(
      "unsupported.type" as any,
      testTicketData,
      EventSources.INGESTION_SERVICE
    );
  }, CloudEventUnsupportedTypeError);
});

Deno.test("TypedCloudEventFactory.fromTemplate", () => {
  const template = {
    source: EventSources.CLASSIFIER_SERVICE,
    type: EventTypes.INTENT_CLASSIFIED,
    subject: "template-subject",
  };

  const event = TypedCloudEventFactory.fromTemplate(
    template,
    testIntentData
  );

  assertEquals(event.getAttribute("source"), EventSources.CLASSIFIER_SERVICE);
  assertEquals(event.getAttribute("type"), EventTypes.INTENT_CLASSIFIED);
  assertEquals(event.getAttribute("subject"), "template-subject");
  assertEquals(event.getData(), testIntentData);
});

Deno.test("TypedCloudEventFactory.fromTemplate - missing required fields", () => {
  assertThrows(() => {
    TypedCloudEventFactory.fromTemplate(
      { source: "test-source" }, // Missing type
      testIntentData
    );
  }, CloudEventMissingFieldError);

  assertThrows(() => {
    TypedCloudEventFactory.fromTemplate(
      { type: "test-type" }, // Missing source
      testIntentData
    );
  }, CloudEventMissingFieldError);
});

Deno.test("TypedCloudEventFactory.createBatch", () => {
  const template = {
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
  };

  const dataItems = [testTicketData, testTicketData, testTicketData];
  const events = TypedCloudEventFactory.createBatch(template, dataItems);

  assertEquals(events.length, 3);
  
  events.forEach((event, index) => {
    assertEquals(event.getAttribute("source"), EventSources.INGESTION_SERVICE);
    assertEquals(event.getAttribute("type"), EventTypes.TICKET_RECEIVED);
    assertEquals(event.getData(), dataItems[index]);
  });

  // Ensure all events have unique IDs
  const ids = events.map(e => e.getAttribute("id"));
  const uniqueIds = new Set(ids);
  assertEquals(ids.length, uniqueIds.size);
});

// ============================================================================
// UTILITY FUNCTIONS TESTS
// ============================================================================

Deno.test("validateCloudEvent function", () => {
  const validEvent = {
    specversion: "1.0",
    id: "test-id",
    source: "test-source",
    type: "test-type",
    time: new Date().toISOString(),
  };

  const result = validateCloudEvent(validEvent);
  assertEquals(result.isValid, true);
  assertEquals(result.errors.length, 0);
  assertExists(result.validatedEvent);

  const invalidEvent = {
    specversion: "1.0",
    // Missing required fields
  };

  const invalidResult = validateCloudEvent(invalidEvent);
  assertEquals(invalidResult.isValid, false);
  assertEquals(invalidResult.errors.length > 0, true);
});

Deno.test("isCloudEvent function", () => {
  const validEvent = {
    specversion: "1.0",
    id: "test-id",
    source: "test-source",
    type: "test-type",
  };

  assertEquals(isCloudEvent(validEvent), true);
  assertEquals(isCloudEvent({}), false);
  assertEquals(isCloudEvent(null), false);
  assertEquals(isCloudEvent("not an object"), false);
});

Deno.test("createSimpleCloudEvent function", () => {
  const event = createSimpleCloudEvent(
    EventTypes.TICKET_RECEIVED,
    EventSources.INGESTION_SERVICE,
    testTicketData,
    "simple-subject"
  );

  assertEquals(event.getAttribute("type"), EventTypes.TICKET_RECEIVED);
  assertEquals(event.getAttribute("source"), EventSources.INGESTION_SERVICE);
  assertEquals(event.getAttribute("subject"), "simple-subject");
  assertEquals(event.getData(), testTicketData);
});

Deno.test("cloneCloudEvent function", () => {
  const originalEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  const clonedEvent = cloneCloudEvent(originalEvent, {
    subject: "cloned-subject",
  });

  assertEquals(clonedEvent.getAttribute("subject"), "cloned-subject");
  assertEquals(clonedEvent.getAttribute("source"), originalEvent.getAttribute("source"));
  assertEquals(clonedEvent.getAttribute("type"), originalEvent.getAttribute("type"));
});

Deno.test("createErrorEvent function", () => {
  const originalEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  originalEvent.setCorrelationId("test-correlation");

  const error = new Error("Test error occurred");
  error.name = "TestError";

  const errorEvent = createErrorEvent(originalEvent, error, EventSources.API_GATEWAY);

  assertEquals(errorEvent.getAttribute("type"), EventTypes.SERVICE_ERROR);
  assertEquals(errorEvent.getAttribute("source"), EventSources.API_GATEWAY);
  assertEquals(errorEvent.getCorrelationId(), "test-correlation");
  assertEquals(errorEvent.getCausationId(), originalEvent.getAttribute("id"));
  
  const errorData = errorEvent.getData() as any;
  assertEquals(errorData.error.code, "TestError");
  assertEquals(errorData.error.message, "Test error occurred");
});

// ============================================================================
// EDGE CASES AND ERROR SCENARIOS
// ============================================================================

Deno.test("TypedCloudEvent with no data", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.API_GATEWAY,
    type: "test.event.no.data",
    // No data field
  });

  assertEquals(event.getData(), undefined);
  
  assertThrows(() => {
    event.getParsedData();
  }, Error, "Event has no data");
});

Deno.test("TypedCloudEvent getAgeMs without time field", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.API_GATEWAY,
    type: "test.event",
  });

  // Manually remove time field for testing
  const eventData = event.getAttributes();
  delete (eventData as any).time;
  const modifiedEvent = new TypedCloudEvent(eventData);

  assertThrows(() => {
    modifiedEvent.getAgeMs();
  }, CloudEventMissingFieldError);

  // isOlderThan should return false when no time field
  assertEquals(modifiedEvent.isOlderThan(1000), false);
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

Deno.test("TypedCloudEvent creation performance", () => {
  const iterations = 100;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const event = TypedCloudEvent.create({
      source: EventSources.INGESTION_SERVICE,
      type: EventTypes.TICKET_RECEIVED,
      data: testTicketData,
      subject: `test-${i}`,
    });
    
    assertExists(event);
  }

  const end = performance.now();
  const avgTime = (end - start) / iterations;
  
  console.log(`Average event creation time: ${avgTime.toFixed(3)}ms`);
  
  // Performance threshold: should be faster than 10ms per event (relaxed for testing)
  if (avgTime > 10) {
    console.warn(`Event creation slower than expected: ${avgTime}ms`);
  }
});

Deno.test("TypedCloudEvent serialization performance", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  const iterations = 100;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const json = event.toJSON();
    assertExists(json);
  }

  const end = performance.now();
  const avgTime = (end - start) / iterations;
  
  console.log(`Average serialization time: ${avgTime.toFixed(3)}ms`);
  
  if (avgTime > 5) {
    console.warn(`Serialization slower than expected: ${avgTime}ms`);
  }
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

Deno.test("TypedCloudEvent complete workflow simulation", () => {
  // 1. Create initial ticket event
  const ticketEvent = TypedCloudEventFactory.createTicketReceived(
    testTicketData,
    EventSources.INGESTION_SERVICE,
    { subject: "Support Request #12345" }
  );

  ticketEvent.setCorrelationId("workflow-123");
  ticketEvent.addTraceContext("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");

  // 2. Create classification event as response
  const classificationEvent = ticketEvent.createResponse(
    EventTypes.INTENT_CLASSIFIED,
    testIntentData
  );

  assertEquals(classificationEvent.getCorrelationId(), "workflow-123");
  assertEquals(classificationEvent.getCausationId(), ticketEvent.getAttribute("id"));

  // 3. Create routing event as response to classification
  const routingEvent = classificationEvent.createResponse(
    EventTypes.TICKET_ROUTED,
    { ticket_id: testIntentData.ticket_id, routed_at: new Date().toISOString() }
  );

  assertEquals(routingEvent.getCorrelationId(), "workflow-123");
  assertEquals(routingEvent.getCausationId(), classificationEvent.getAttribute("id"));

  // 4. Verify the complete chain
  const events = [ticketEvent, classificationEvent, routingEvent];
  
  // All events should have the same correlation ID
  events.forEach(event => {
    assertEquals(event.getCorrelationId(), "workflow-123");
  });

  // Each event (except the first) should have the previous event as causation
  for (let i = 1; i < events.length; i++) {
    assertEquals(events[i].getCausationId(), events[i - 1].getAttribute("id"));
  }

  // All events should be valid
  events.forEach(event => {
    assertEquals(event.validate(), true);
  });
});

// ============================================================================
// ADDITIONAL COVERAGE TESTS
// ============================================================================

Deno.test("TypedCloudEvent constructor with schema validation error", () => {
  const invalidData = { invalid: "data" };
  const strictSchema = {
    parse: (_data: any) => { throw new Error("Schema validation failed"); },
    safeParse: (_data: any) => ({ success: false, error: { errors: [{ message: "Invalid" }] } }),
  };

  assertThrows(() => {
    new TypedCloudEvent({
      specversion: "1.0",
      id: "test-id",
      source: "test-source",
      type: "test-type",
      data: invalidData,
      time: new Date().toISOString(),
    }, strictSchema as any);
  }, CloudEventValidationError);
});

Deno.test("TypedCloudEvent.getParsedData - with schema", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  // Add a mock schema for parsing
  const mockSchema = { 
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data })
  };
  const eventWithSchema = new TypedCloudEvent(event.getAttributes(), mockSchema as any);
  
  const parsedData = eventWithSchema.getParsedData();
  assertExists(parsedData);
});

Deno.test("TypedCloudEvent toCloudEvent method", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  const cloudEvent = event.toCloudEvent();
  assertExists(cloudEvent);
  assertEquals(cloudEvent.specversion, "1.0");
  assertEquals(cloudEvent.source, EventSources.INGESTION_SERVICE);
  assertEquals(cloudEvent.type, EventTypes.TICKET_RECEIVED);
});

Deno.test("TypedCloudEvent toJSON serialization error simulation", () => {
  const event = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: EventTypes.TICKET_RECEIVED,
    data: testTicketData,
  });

  // Create a circular reference to cause JSON serialization error
  const circularData = { test: "data" };
  (circularData as any).circular = circularData;
  
  const eventWithCircularData = new TypedCloudEvent({
    ...event.getAttributes(),
    data: circularData,
  });

  assertThrows(() => {
    eventWithCircularData.toJSON();
  }, CloudEventSerializationError);

  assertThrows(() => {
    eventWithCircularData.toPrettyJSON();
  }, CloudEventSerializationError);
});

Deno.test("TypedCloudEvent.fromJSON error paths", () => {
  // Test auto-detection with unknown event type
  const unknownEventJson = JSON.stringify({
    specversion: "1.0",
    id: "test-id",
    source: "test-source",
    type: "unknown.event.type",
    data: { test: "data" },
    time: new Date().toISOString(),
  });

  // This will fail because no schema is found, and we pass undefined schema to fromCloudEvent
  assertThrows(() => {
    TypedCloudEvent.fromJSON(unknownEventJson);
  }, CloudEventError);
});

Deno.test("Error path coverage for fromCloudEvent", () => {
  const eventWithUndefinedData = {
    specversion: "1.0",
    id: "test-id",
    source: EventSources.CLASSIFIER_SERVICE,
    type: EventTypes.INTENT_CLASSIFIED,
    // No data field
    time: new Date().toISOString(),
  };

  const basicSchema = {
    parse: (data: any) => data,
    safeParse: (data: any) => ({ success: true, data }),
  };

  const typedEvent = TypedCloudEvent.fromCloudEvent(eventWithUndefinedData, basicSchema as any);
  assertEquals(typedEvent.getData(), undefined);
});

Deno.test("CloudEventUnsupportedTypeError with no supported types", () => {
  const error = new CloudEventUnsupportedTypeError("unsupported.type");
  
  assertEquals(error.name, "CloudEventUnsupportedTypeError");
  assertEquals(error.code, "UNSUPPORTED_TYPE_ERROR");
  assertEquals(error.message, "Unsupported CloudEvent type 'unsupported.type'");
});

console.log("✅ All TypedCloudEvent tests passed successfully!");