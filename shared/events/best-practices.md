# Event-Driven Architecture Best Practices

This document outlines best practices for designing, implementing, and evolving events in the DIP microservices platform.

## Table of Contents

- [Event Design Principles](#event-design-principles)
- [Schema Evolution Strategy](#schema-evolution-strategy)
- [Event Naming Conventions](#event-naming-conventions)
- [Error Handling Patterns](#error-handling-patterns)
- [Performance Considerations](#performance-considerations)
- [Testing Strategies](#testing-strategies)
- [Monitoring and Observability](#monitoring-and-observability)
- [Security Guidelines](#security-guidelines)

## Event Design Principles

### 1. Domain-Driven Event Design

Events should represent meaningful business events within specific domains:

```typescript
// Good: Domain-specific, business meaningful
const ticketReceivedEvent = EventBuilders.ticketReceived({
  ticket: { /* ticket data */ },
  source_system: "email_gateway",
  received_at: new Date().toISOString(),
});

// Bad: Technical implementation detail
const databaseInsertEvent = {
  table: "tickets",
  operation: "INSERT",
  row_id: 123
};
```

### 2. Event Immutability

Events should be immutable once published. Include all necessary context:

```typescript
// Good: Complete context included
const ticketUpdatedEvent = EventBuilders.ticketUpdated({
  ticket_id: "123",
  previous_state: previousTicket,
  current_state: updatedTicket,
  changed_fields: ["priority", "assignee_id"],
  updated_by: "user-456",
  update_reason: "Customer escalation request",
  updated_at: new Date().toISOString(),
});

// Bad: Minimal information, requires additional lookups
const ticketChangedEvent = {
  ticket_id: "123",
  changed: true
};
```

### 3. Self-Contained Events

Events should contain all information needed for processing without additional queries:

```typescript
// Good: Includes customer information
const responseGeneratedEvent = EventBuilders.responseGenerated({
  ticket_id: "123",
  response_id: "resp-456",
  content: {
    subject: "Re: Your support request",
    body: "Thank you for contacting us...",
    format: "plain_text"
  },
  channel: "email",
  customer: {
    email: "customer@example.com",
    name: "John Doe",
    tier: "premium"
  },
  // ... other fields
});
```

## Schema Evolution Strategy

### Version Management

Use semantic versioning for schema changes:

- **Major version (2.0.0)**: Breaking changes that require consumer updates
- **Minor version (1.1.0)**: Backward-compatible additions
- **Patch version (1.0.1)**: Bug fixes or clarifications

### Migration Strategy

```typescript
// Register schema versions with migration functions
versionedSchemas.registerVersion("com.dip.ticket.received", "2.0", {
  version: "2.0",
  schema: TicketReceivedEventV2Schema,
  migration: (v1Data: any) => {
    return {
      ...v1Data,
      // Add new fields with defaults
      processing_hints: {
        urgent: v1Data.ticket?.priority === "critical",
        auto_respond: true,
      },
      // Transform existing fields if needed
      metadata: {
        ...v1Data.metadata,
        schema_version: "2.0"
      }
    };
  }
});
```

### Backward Compatibility Rules

1. **Never remove required fields** in minor/patch versions
2. **Always provide default values** for new optional fields
3. **Use optional unions** for changing field types
4. **Deprecate before removing** fields in major versions

```typescript
// Good: Backward compatible addition
const TicketSchemaV1_1 = TicketSchemaV1_0.extend({
  estimated_resolution_time: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]), // Default for existing events
});

// Bad: Breaking change in minor version
const TicketSchemaBad = TicketSchemaV1_0.omit({ category: true }); // Removes field
```

## Event Naming Conventions

### Event Type Naming

Use reverse domain notation with consistent patterns:

```
{organization}.{domain}.{entity}.{action}
```

Examples:
- `com.dip.ticket.received`
- `com.dip.intent.classified`
- `com.dip.response.generated`
- `com.dip.system.service.started`

### Field Naming

Use snake_case for consistency with JSON conventions:

```typescript
// Good
const eventData = {
  ticket_id: "123",
  created_at: "2024-01-01T00:00:00Z",
  processing_time_ms: 150,
  customer_tier: "premium"
};

// Bad - inconsistent casing
const badEventData = {
  ticketId: "123",
  created_at: "2024-01-01T00:00:00Z",
  processingTimeMs: 150,
  customer_tier: "premium"
};
```

## Error Handling Patterns

### Structured Error Information

Always include comprehensive error context:

```typescript
const errorEvent = EventBuilders.systemError({
  error: {
    code: "ML_MODEL_TIMEOUT",
    message: "Classification model request timed out",
    details: {
      endpoint: "https://ml-service/classify",
      timeout_seconds: 30,
      request_size_bytes: 2048
    },
    stack_trace: "Error: Timeout\n  at MLClient...",
    retry_count: 2,
    max_retries: 3,
    next_retry_at: new Date(Date.now() + 60000).toISOString()
  },
  service_name: "classifier-service",
  error_category: "timeout",
  severity: "medium"
});
```

### Retry and Circuit Breaker Patterns

Implement exponential backoff and circuit breakers:

```typescript
const retryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitter: true
};

// Include retry information in events
const failedEvent = {
  error: {
    retry_count: 2,
    max_retries: 3,
    next_retry_at: calculateNextRetry(retryConfig),
    backoff_strategy: "exponential_jitter"
  }
};
```

## Performance Considerations

### Event Size Optimization

Keep events lean but informative:

```typescript
// Good: Essential information only
const optimizedEvent = {
  ticket_id: "123",
  classification: "billing_issue",
  confidence: 0.92,
  processing_time_ms: 45
};

// Bad: Includes large unnecessary data
const bloatedEvent = {
  ticket_id: "123",
  full_ticket_content: "...20KB of text...",
  raw_ml_model_output: "...50KB of vectors...",
  complete_training_dataset: "...1MB of data..."
};
```

### Batch Processing Support

Design events to support both individual and batch processing:

```typescript
// Support for batch operations
const batchValidationEvent = {
  batch_id: "batch-123",
  tickets_processed: [
    { ticket_id: "1", status: "valid" },
    { ticket_id: "2", status: "invalid", errors: [...] }
  ],
  batch_summary: {
    total_processed: 100,
    valid_count: 95,
    invalid_count: 5,
    processing_time_ms: 2500
  }
};
```

### Partitioning Strategy

Include partitioning keys for scalable event processing:

```typescript
const eventWithPartitioning = TypedCloudEvent.create({
  source: EventSources.CLASSIFIER_SERVICE,
  type: "com.dip.intent.classified",
  subject: `tenant/${tenantId}/ticket/${ticketId}`, // Partition key
  data: classificationData
});
```

## Testing Strategies

### Schema Testing

Test schema evolution and validation:

```typescript
// Test schema validation
export function testTicketEventValidation() {
  const validTicketData = createValidTicketData();
  const result = validateEventData("com.dip.ticket.received", validTicketData);
  assert(result.isValid, "Valid ticket should pass validation");

  const invalidTicketData = { ...validTicketData, priority: "invalid" };
  const invalidResult = validateEventData("com.dip.ticket.received", invalidTicketData);
  assert(!invalidResult.isValid, "Invalid priority should fail validation");
}

// Test schema migration
export function testSchemaMigration() {
  const v1Data = createV1TicketData();
  const migratedData = versionedSchemas.migrateToLatest(
    "com.dip.ticket.received", 
    v1Data, 
    "1.0"
  );
  
  const validation = validateEventData("com.dip.ticket.received", migratedData);
  assert(validation.isValid, "Migrated data should be valid");
}
```

### Event Flow Testing

Test complete event workflows:

```typescript
export async function testTicketProcessingFlow() {
  // 1. Create ticket received event
  const ticketEvent = createTestTicketEvent();
  
  // 2. Simulate classification
  const classificationEvent = simulateClassification(ticketEvent);
  
  // 3. Verify event correlation
  assert(
    classificationEvent.getCorrelationId() === ticketEvent.getCorrelationId(),
    "Events should maintain correlation"
  );
  
  // 4. Test event chaining
  const routingEvent = simulateRouting(classificationEvent);
  assert(
    routingEvent.getCausationId() === classificationEvent.getAttribute("id"),
    "Causation chain should be maintained"
  );
}
```

## Monitoring and Observability

### Event Metrics

Track key event metrics:

```typescript
const eventMetrics = EventBuilders.metricsCollected({
  collection_id: "metrics-001",
  source_service: "event-bus",
  metrics: [
    {
      name: "events_published_total",
      value: 1500,
      unit: "count",
      timestamp: new Date().toISOString(),
      dimensions: { event_type: "ticket.received", status: "success" }
    },
    {
      name: "event_processing_duration",
      value: 125.5,
      unit: "milliseconds",
      timestamp: new Date().toISOString(),
      dimensions: { service: "classifier", operation: "intent_classification" }
    }
  ],
  collected_at: new Date().toISOString()
});
```

### Distributed Tracing

Include trace context in all events:

```typescript
const eventWithTracing = TypedCloudEvent.create({
  source: EventSources.CLASSIFIER_SERVICE,
  type: "com.dip.intent.classified",
  data: classificationData
});

// Add OpenTelemetry trace context
eventWithTracing.addTraceContext(
  "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
  "congo=t61rcWkgMzE"
);
```

### Health Check Events

Implement regular health reporting:

```typescript
const healthEvent = EventBuilders.serviceHealthCheck({
  health: {
    service_name: "classifier-service",
    status: "healthy",
    version: "2.1.0",
    uptime_seconds: 86400,
    cpu_usage_percent: 45.2,
    memory_usage_percent: 67.8,
    response_time_ms: 125,
    last_health_check: new Date().toISOString()
  },
  check_type: "scheduled",
  status_changed: false,
  checked_at: new Date().toISOString()
});
```

## Security Guidelines

### Data Classification

Mark events with appropriate sensitivity levels:

```typescript
const sensitiveEvent = TypedCloudEvent.create({
  source: EventSources.AUDIT_SERVICE,
  type: "com.dip.audit.action.performed",
  data: auditData,
  // Custom extension attributes
  ["x-sensitivity-level"]: "confidential",
  ["x-compliance-tags"]: "gdpr,hipaa",
  ["x-retention-days"]: "2555" // 7 years
});
```

### PII Handling

Avoid including PII in events or encrypt it:

```typescript
// Good: Reference to customer, not full details
const secureEvent = {
  ticket_id: "123",
  customer_id: "customer-456", // Reference only
  customer_tier: "enterprise",   // Non-PII metadata only
  // PII stored securely elsewhere
};

// Bad: Exposes PII in event stream
const insecureEvent = {
  ticket_id: "123",
  customer_email: "john.doe@company.com", // PII
  customer_phone: "+1-555-0123",         // PII
  customer_ssn: "123-45-6789"            // Highly sensitive PII
};
```

### Authentication Context

Include minimal authentication context:

```typescript
const authenticatedEvent = {
  ticket_id: "123",
  actor_id: "user-456",     // Reference to authenticated user
  actor_type: "user",       // Type of actor
  session_id: "session-789", // Session reference
  // No passwords, tokens, or sensitive auth data
  metadata: {
    request_id: "req-001",
    ip_address: "192.168.1.100" // Only if needed for security
  }
};
```

### Audit Trail

Maintain comprehensive audit trails:

```typescript
const auditEvent = EventBuilders.auditLogCreated({
  audit_id: "audit-123",
  action: {
    action: "ticket.priority.changed",
    resource_type: "ticket",
    resource_id: "ticket-456",
    actor_id: "user-789",
    actor_type: "user",
    timestamp: new Date().toISOString(),
    before_state: { priority: "low" },
    after_state: { priority: "high" },
    reason: "Customer escalation request"
  },
  compliance_tags: ["gdpr", "sox"],
  retention_period_days: 2555,
  encryption_level: "high",
  logged_at: new Date().toISOString()
});
```

## Event Lifecycle Management

### Event Retention Policies

Define retention based on event type and compliance requirements:

```typescript
const retentionPolicies = {
  "com.dip.ticket.received": {
    retention_days: 2555, // 7 years for compliance
    archival_strategy: "cold_storage",
    encryption_required: true
  },
  "com.dip.system.health.check": {
    retention_days: 30,    // Short retention for system events
    archival_strategy: "delete",
    encryption_required: false
  },
  "com.dip.audit.action.performed": {
    retention_days: 3653,  // 10 years for audit
    archival_strategy: "immutable_storage",
    encryption_required: true
  }
};
```

### Dead Letter Handling

Implement dead letter queues for failed event processing:

```typescript
const deadLetterEvent = {
  original_event: failedEvent,
  failure_reason: "Repeated processing failures",
  failure_count: 5,
  first_failure_at: "2024-01-01T10:00:00Z",
  last_failure_at: "2024-01-01T10:30:00Z",
  dead_letter_queue: "dlq-classifier-failures",
  requires_manual_intervention: true
};
```

This comprehensive guide ensures consistent, scalable, and maintainable event-driven architecture across the DIP platform.