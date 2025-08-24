/**
 * Example usage patterns for the event-driven microservices schemas
 * Demonstrates best practices for creating, validating, and handling events
 */

import { TypedCloudEvent } from "./base.ts";
import {
  EventBuilders,
  EventSources,
  validateEventData,
  versionedSchemas,
  type TicketReceivedEvent,
  type IntentClassifiedEvent,
  type TicketRoutedEvent,
  type ResponseGeneratedEvent,
  EventMetadataSchema,
  TicketReceivedEventSchema,
} from "./schemas.ts";

// ============================================================================
// EXAMPLE 1: Creating and Publishing Events
// ============================================================================

/**
 * Example: Ticket processing workflow
 */
export async function exampleTicketProcessingWorkflow() {
  // Step 1: Create ticket received event
  const ticketReceivedEvent = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: "com.dip.ticket.received",
    data: {
      ticket: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        subject: "Unable to login to my account",
        description: "I keep getting an error when trying to log into my account. The error says 'Invalid credentials' but I'm sure my password is correct.",
        status: "new",
        priority: "medium",
        channel: "email",
        customer: {
          email: "john.doe@example.com",
          name: "John Doe",
          company: "Acme Corp",
          tier: "premium",
          language: "en",
        },
        created_at: new Date().toISOString(),
        tags: ["login", "authentication"],
        category: "technical_support",
        subcategory: "authentication",
      },
      source_system: "email_gateway",
      received_at: new Date().toISOString(),
      metadata: {
        version: "1.0",
        environment: "production",
        tenantId: "123e4567-e89b-12d3-a456-426614174000",
        priority: "medium",
        tags: ["customer_facing"],
      },
    },
    datacontenttype: "application/json",
  }, TicketReceivedEventSchema);

  console.log("Ticket received event created:", ticketReceivedEvent.toJSON());

  // Step 2: Create classification event (response to ticket received)
  const classificationEvent = ticketReceivedEvent.createResponse(
    "com.dip.intent.classified",
    {
      ticket_id: "550e8400-e29b-41d4-a716-446655440000",
      classification_result: {
        intent: "authentication_issue",
        confidence_score: 0.92,
        confidence_level: "high",
        sub_intents: [
          { intent: "password_reset", confidence_score: 0.78 },
          { intent: "account_locked", confidence_score: 0.65 },
        ],
        entities: [
          {
            entity: "authentication_method",
            value: "password",
            confidence_score: 0.89,
          },
          {
            entity: "error_type",
            value: "invalid_credentials",
            confidence_score: 0.95,
          },
        ],
        sentiment: {
          polarity: "negative",
          score: -0.3,
          confidence: 0.85,
        },
        language_detected: "en",
        topics: ["login", "password", "authentication"],
      },
      model_version: "classifier-v2.1.0",
      processing_time_ms: 245,
      classified_at: new Date().toISOString(),
      classifier_id: "nlp-classifier-001",
      training_data_version: "2024-01-15",
      metadata: {
        version: "1.0",
        environment: "production",
        tenantId: "123e4567-e89b-12d3-a456-426614174000",
      },
    }
  );

  console.log("Classification event created:", classificationEvent.toJSON());
}

// ============================================================================
// EXAMPLE 2: Event Validation and Error Handling
// ============================================================================

/**
 * Example: Validating incoming events with error handling
 */
export function exampleEventValidation() {
  // Valid event data
  const validEventData = {
    ticket: {
      id: "550e8400-e29b-41d4-a716-446655440000",
      subject: "Test ticket",
      description: "Test description",
      status: "new",
      priority: "low",
      channel: "api",
      customer: {
        email: "test@example.com",
        name: "Test User",
        tier: "free",
        language: "en",
      },
      created_at: new Date().toISOString(),
    },
    source_system: "api_gateway",
    received_at: new Date().toISOString(),
  };

  // Validate the event
  const validation = validateEventData("com.dip.ticket.received", validEventData);
  
  if (validation.isValid) {
    console.log("Event is valid:", validation.validatedData);
    
    // Create typed event
    const typedEvent = TypedCloudEvent.create({
      source: EventSources.INGESTION_SERVICE,
      type: "com.dip.ticket.received",
      data: validation.validatedData as TicketReceivedEvent,
    }, TicketReceivedEventSchema);
    
    return typedEvent;
  } else {
    console.error("Event validation failed:", validation.errors?.issues);
    
    // Handle validation errors gracefully
    const errorEvent = TypedCloudEvent.create({
      source: EventSources.INGESTION_SERVICE,
      type: "com.dip.ticket.invalid",
      data: {
        ticket_id: "unknown",
        is_valid: false,
        validation_errors: validation.errors?.issues.map(issue => ({
          field: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })) || [],
        validated_at: new Date().toISOString(),
      },
    });
    
    return errorEvent;
  }
}

// ============================================================================
// EXAMPLE 3: Event Builders Usage
// ============================================================================

/**
 * Example: Using type-safe event builders
 */
export function exampleEventBuilders() {
  try {
    // Create ticket received event using builder
    const ticketEvent = EventBuilders.ticketReceived({
      ticket: {
        id: "123e4567-e89b-12d3-a456-426614174001",
        subject: "Payment processing error",
        description: "Transaction failed with error code 500",
        status: "new",
        priority: "high",
        channel: "api",
        customer: {
          email: "customer@business.com",
          name: "Jane Smith",
          company: "Business Inc",
          tier: "enterprise",
          language: "en",
        },
        created_at: new Date().toISOString(),
        category: "billing",
        subcategory: "payment_processing",
        tags: ["payment", "error", "urgent"],
      },
      source_system: "payment_gateway",
      received_at: new Date().toISOString(),
      metadata: {
        version: "1.0",
        environment: "production",
        tenantId: "456e7890-e89b-12d3-a456-426614174001",
        priority: "high",
        tags: ["revenue_impacting"],
      },
    });

    console.log("Builder created event:", ticketEvent);

    // Create system error event
    const errorEvent = EventBuilders.systemError({
      error: {
        code: "DB_CONNECTION_FAILED",
        message: "Unable to connect to database",
        details: {
          host: "db-primary.internal",
          port: 5432,
          database: "tickets",
        },
        retry_count: 3,
        max_retries: 5,
      },
      service_name: "classifier-service",
      error_category: "database",
      severity: "high",
      affected_operations: ["classify_intent", "update_classification"],
      recovery_action: "Fallback to secondary database",
      occurred_at: new Date().toISOString(),
      user_impact: "moderate",
      metadata: {
        version: "1.0",
        environment: "production",
        priority: "high",
      },
    });

    console.log("Error event created:", errorEvent);

  } catch (error) {
    console.error("Event builder validation failed:", error);
  }
}

// ============================================================================
// EXAMPLE 4: Event Chaining and Correlation
// ============================================================================

/**
 * Example: Event chaining with correlation IDs
 */
export function exampleEventChaining() {
  // Original ticket event
  const originalTicket = TypedCloudEvent.create({
    source: EventSources.INGESTION_SERVICE,
    type: "com.dip.ticket.received",
    data: {
      ticket: {
        id: "789e0123-e89b-12d3-a456-426614174002",
        subject: "Feature request",
        description: "Please add dark mode to the application",
        status: "new",
        priority: "low",
        channel: "web_form",
        customer: {
          email: "user@example.org",
          name: "Alex Johnson",
          tier: "basic",
          language: "en",
        },
        created_at: new Date().toISOString(),
        category: "feature_request",
      },
      source_system: "web_portal",
      received_at: new Date().toISOString(),
    },
  }, TicketReceivedEventSchema);

  // Set correlation ID
  originalTicket.setCorrelationId("correlation-789");

  // Create chained classification event
  const classifiedEvent = originalTicket.createResponse(
    "com.dip.intent.classified",
    {
      ticket_id: "789e0123-e89b-12d3-a456-426614174002",
      classification_result: {
        intent: "feature_request",
        confidence_score: 0.96,
        confidence_level: "very_high",
        topics: ["ui", "user_experience", "dark_mode"],
      },
      model_version: "classifier-v2.1.0",
      processing_time_ms: 180,
      classified_at: new Date().toISOString(),
      classifier_id: "nlp-classifier-002",
    }
  );

  // Create routing event from classification
  const routedEvent = classifiedEvent.createResponse(
    "com.dip.routing.routed",
    {
      ticket_id: "789e0123-e89b-12d3-a456-426614174002",
      queue: {
        id: "queue-product-team",
        name: "Product Team",
        description: "Product feature requests and enhancements",
        capacity: 50,
        current_load: 12,
        priority_weight: 30,
        skills_required: ["product_management", "ui_ux"],
      },
      routing_decision: {
        strategy: "skill_based",
        reason: "Feature request requires product management expertise",
        confidence_score: 0.88,
        factors_considered: ["intent_type", "required_skills", "queue_capacity"],
        processing_time_ms: 85,
      },
      routed_at: new Date().toISOString(),
      estimated_wait_time_minutes: 240,
    }
  );

  console.log("Event chain correlation IDs:");
  console.log("Original:", originalTicket.getCorrelationId());
  console.log("Classified:", classifiedEvent.getCorrelationId());
  console.log("Routed:", routedEvent.getCorrelationId());

  console.log("Event chain causation:");
  console.log("Classified caused by:", classifiedEvent.getCausationId());
  console.log("Routed caused by:", routedEvent.getCausationId());
}

// ============================================================================
// EXAMPLE 5: Event Versioning and Migration
// ============================================================================

/**
 * Example: Event schema versioning
 */
export function exampleEventVersioning() {
  // Register a new version of the ticket schema
  const TicketReceivedEventV2Schema = TicketReceivedEventSchema.extend({
    processing_hints: z.object({
      urgent: z.boolean().default(false),
      vip_customer: z.boolean().default(false),
      auto_respond: z.boolean().default(true),
    }).optional(),
    compliance_flags: z.array(z.string()).optional(),
  });

  // Register the new version
  versionedSchemas.registerVersion("com.dip.ticket.received", "2.0", {
    version: "2.0",
    schema: TicketReceivedEventV2Schema,
    migration: (oldData: unknown) => {
      // Migration from v1.0 to v2.0
      const v1Data = oldData as any;
      return {
        ...v1Data,
        processing_hints: {
          urgent: v1Data.ticket?.priority === "urgent" || v1Data.ticket?.priority === "critical",
          vip_customer: v1Data.ticket?.customer?.tier === "enterprise",
          auto_respond: true,
        },
        compliance_flags: v1Data.ticket?.customer?.tier === "enterprise" ? ["gdpr", "sox"] : [],
      };
    },
  });

  // Example of handling versioned events
  const v1EventData = {
    ticket: {
      id: "version-test-123",
      subject: "Version test",
      description: "Testing versioning",
      status: "new",
      priority: "urgent",
      channel: "email",
      customer: {
        email: "enterprise@bigcorp.com",
        name: "Enterprise User",
        company: "BigCorp",
        tier: "enterprise",
        language: "en",
      },
      created_at: new Date().toISOString(),
    },
    source_system: "test_system",
    received_at: new Date().toISOString(),
  };

  // Migrate to latest version
  const migratedData = versionedSchemas.migrateToLatest(
    "com.dip.ticket.received",
    v1EventData,
    "1.0"
  );

  console.log("Migrated event data:", migratedData);
}

// ============================================================================
// EXAMPLE 6: Complex Event Processing
// ============================================================================

/**
 * Example: Processing complex multi-service workflow
 */
export async function exampleComplexWorkflow() {
  // Simulate a complex customer support workflow
  
  // 1. High priority ticket received
  const urgentTicket = EventBuilders.ticketReceived({
    ticket: {
      id: "urgent-456",
      subject: "Service completely down - losing revenue!",
      description: "Our entire service is offline and we're losing thousands per minute. This is a critical issue!",
      status: "new",
      priority: "critical",
      channel: "phone",
      customer: {
        email: "cto@megacorp.com",
        name: "Sarah Chen",
        company: "MegaCorp Industries",
        tier: "enterprise",
        language: "en",
        phone: "+1-555-0199",
      },
      created_at: new Date().toISOString(),
      category: "service_outage",
      subcategory: "complete_outage",
      tags: ["outage", "critical", "revenue_impact"],
      sla_breach_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
    },
    source_system: "phone_system",
    received_at: new Date().toISOString(),
    metadata: {
      version: "1.0",
      environment: "production",
      tenantId: "enterprise-001",
      priority: "critical",
      tags: ["revenue_critical", "escalation_required"],
    },
  });

  // 2. Immediate classification (bypassing normal ML due to keywords)
  const emergencyClassification = EventBuilders.intentClassified({
    ticket_id: "urgent-456",
    classification_result: {
      intent: "service_outage",
      confidence_score: 0.99,
      confidence_level: "very_high",
      entities: [
        { entity: "outage_type", value: "complete", confidence_score: 0.98 },
        { entity: "business_impact", value: "revenue_loss", confidence_score: 0.97 },
      ],
      sentiment: {
        polarity: "negative",
        score: -0.8,
        confidence: 0.95,
      },
      topics: ["outage", "downtime", "service_interruption"],
    },
    model_version: "emergency-classifier-v1.0",
    processing_time_ms: 50,
    classified_at: new Date().toISOString(),
    classifier_id: "emergency-classifier",
    fallback_used: true, // Used rule-based classification for speed
    metadata: {
      version: "1.0",
      environment: "production",
      priority: "critical",
      tags: ["emergency_path"],
    },
  });

  // 3. Emergency routing to on-call engineer
  const emergencyRouting = EventBuilders.ticketRouted({
    ticket_id: "urgent-456",
    agent: {
      id: "agent-oncall-001",
      name: "Mike Rodriguez",
      email: "mike.r@company.com",
      skills: ["infrastructure", "database", "networking", "incident_response"],
      capacity: 5,
      current_load: 1, // Taking this critical ticket
      availability_status: "available",
      language_codes: ["en", "es"],
      specializations: ["outage_response", "enterprise_support"],
    },
    routing_decision: {
      strategy: "manual",
      reason: "Critical outage requires immediate on-call engineer assignment",
      confidence_score: 1.0,
      factors_considered: ["priority_level", "on_call_status", "expertise_match"],
      processing_time_ms: 25,
    },
    routed_at: new Date().toISOString(),
    estimated_wait_time_minutes: 0, // Immediate
    sla_deadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    escalation_path: [
      {
        level: 1,
        queue_id: "engineering-leads",
        trigger_after_minutes: 10,
      },
      {
        level: 2,
        queue_id: "executive-escalation",
        trigger_after_minutes: 20,
      },
    ],
    metadata: {
      version: "1.0",
      environment: "production",
      priority: "critical",
    },
  });

  // 4. Quick acknowledgment response
  const acknowledgeResponse = EventBuilders.responseGenerated({
    ticket_id: "urgent-456",
    response_id: "response-urgent-ack",
    response_type: "template_based",
    content: {
      subject: "URGENT: Service Outage - Immediate Response",
      body: "Dear Sarah,\n\nWe have received your critical service outage report and have immediately assigned our on-call infrastructure engineer Mike Rodriguez to investigate. He will contact you directly within the next 5 minutes.\n\nTicket ID: urgent-456\nSeverity: Critical\nEstimated Response Time: Immediate\n\nWe understand the business impact and are treating this as our highest priority.\n\nBest regards,\nTechnical Support Team",
      format: "plain_text",
    },
    channel: "email",
    generated_by: "emergency-response-template",
    generation_method: "rule_based_template",
    processing_time_ms: 120,
    quality_metrics: {
      relevance_score: 0.95,
      sentiment_appropriateness: 0.88,
      completeness_score: 0.92,
    },
    generated_at: new Date().toISOString(),
    requires_approval: false, // Pre-approved template for critical issues
    metadata: {
      version: "1.0",
      environment: "production",
      priority: "critical",
    },
  });

  console.log("Complex workflow events created:");
  console.log("1. Urgent ticket:", urgentTicket.type);
  console.log("2. Emergency classification:", emergencyClassification.type);
  console.log("3. Emergency routing:", emergencyRouting.type);
  console.log("4. Acknowledgment response:", acknowledgeResponse.type);
}

// ============================================================================
// EXAMPLE 7: Event Analytics and Monitoring
// ============================================================================

/**
 * Example: Analytics events for business intelligence
 */
export function exampleAnalyticsEvents() {
  // Create comprehensive metrics event
  const analyticsEvent = EventBuilders.metricsCollected({
    collection_id: "metrics-hourly-001",
    source_service: "analytics-service",
    metrics: [
      {
        name: "tickets_received",
        value: 127,
        unit: "count",
        timestamp: new Date().toISOString(),
        dimensions: {
          channel: "email",
          priority: "medium",
          hour: "14",
        },
        tags: ["customer_support", "hourly"],
      },
      {
        name: "avg_classification_time",
        value: 1.2,
        unit: "seconds",
        timestamp: new Date().toISOString(),
        dimensions: {
          model_version: "v2.1.0",
          confidence_level: "high",
        },
        tags: ["performance", "ml_metrics"],
      },
      {
        name: "customer_satisfaction",
        value: 4.3,
        unit: "rating",
        timestamp: new Date().toISOString(),
        dimensions: {
          response_type: "auto_generated",
          resolution_time: "under_1_hour",
        },
        tags: ["quality", "customer_experience"],
      },
    ],
    collection_period: {
      start_time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      end_time: new Date().toISOString(),
    },
    collection_method: "scheduled",
    collected_at: new Date().toISOString(),
    metadata: {
      version: "1.0",
      environment: "production",
      tags: ["business_intelligence", "reporting"],
    },
  });

  console.log("Analytics event:", analyticsEvent);
}

// ============================================================================
// EXAMPLE 8: Error Handling and Retry Patterns
// ============================================================================

/**
 * Example: Comprehensive error handling
 */
export function exampleErrorHandling() {
  // Create a classification failure event
  const classificationError = EventBuilders.systemError({
    error: {
      code: "ML_MODEL_TIMEOUT",
      message: "Classification model request timed out after 30 seconds",
      details: {
        model_endpoint: "https://ml-api.internal/classify",
        timeout_seconds: 30,
        ticket_id: "timeout-test-123",
        request_payload_size: 2048,
      },
      stack_trace: "Error: Timeout\n  at MLClient.classify\n  at ClassifierService.processTicket",
      retry_count: 2,
      max_retries: 3,
      next_retry_at: new Date(Date.now() + 60000).toISOString(), // 1 minute from now
    },
    service_name: "classifier-service",
    error_category: "timeout",
    severity: "medium",
    affected_operations: ["ticket_classification"],
    recovery_action: "Retry with fallback rule-based classifier",
    occurred_at: new Date().toISOString(),
    user_impact: "minimal", // Fallback exists
    metadata: {
      version: "1.0",
      environment: "production",
      priority: "medium",
      tags: ["ml_service", "timeout", "retry_required"],
    },
  });

  console.log("Error event with retry information:", classificationError);
}

// Export all examples for easy testing
export const examples = {
  ticketProcessingWorkflow: exampleTicketProcessingWorkflow,
  eventValidation: exampleEventValidation,
  eventBuilders: exampleEventBuilders,
  eventChaining: exampleEventChaining,
  eventVersioning: exampleEventVersioning,
  complexWorkflow: exampleComplexWorkflow,
  analyticsEvents: exampleAnalyticsEvents,
  errorHandling: exampleErrorHandling,
};