# ADR-007: Adopt Event-Driven Architecture

## Status

Accepted

## Context

The Deno Intelligence Platform needs to process high volumes of data with varying workloads while maintaining loose coupling between services. Traditional request-response architectures create tight coupling and synchronous dependencies that can lead to:

- **Cascading failures** when one service goes down
- **Performance bottlenecks** from synchronous calls
- **Difficult scaling** of individual components
- **Complex orchestration** for multi-step workflows
- **Limited flexibility** for adding new consumers

Our requirements include:

- Processing events asynchronously at scale
- Adding new services without modifying existing ones
- Handling bursts of traffic gracefully
- Enabling event replay for debugging and recovery
- Supporting multiple consumers for the same events

## Decision

We will adopt an event-driven architecture using publish-subscribe patterns for inter-service communication.

Key principles:

1. **Events as First-Class Citizens**: Services communicate primarily through events
2. **Event Sourcing**: Critical state changes are captured as events
3. **Eventual Consistency**: Accept eventual consistency for scalability
4. **Smart Endpoints, Dumb Pipes**: Business logic in services, not in the message layer
5. **Event Schemas**: Strongly typed events using CloudEvents specification

Implementation approach:

- Services publish events for significant state changes
- Services subscribe to events they're interested in
- No direct service-to-service calls for async operations
- Synchronous APIs only for user-facing endpoints

## Consequences

### Positive

- **Loose Coupling**: Services can evolve independently
- **Scalability**: Services scale based on their specific load
- **Resilience**: Failures don't cascade through the system
- **Flexibility**: Easy to add new event consumers
- **Auditability**: Event stream provides audit trail
- **Replayability**: Can replay events for recovery or testing
- **Real-time Processing**: Events processed as they occur

### Negative

- **Complexity**: More complex than synchronous architectures
- **Debugging Difficulty**: Tracing issues across async boundaries
- **Eventual Consistency**: No immediate consistency guarantees
- **Duplicate Processing**: Must handle duplicate events
- **Ordering Challenges**: Event ordering not guaranteed globally

### Neutral

- **Mental Model Shift**: Requires thinking in events vs requests
- **Operational Overhead**: Message broker infrastructure required
- **Monitoring Complexity**: Need distributed tracing
- **Schema Evolution**: Managing event schema changes

## Alternatives Considered

### Synchronous Microservices

Traditional REST/RPC communication between services.

**Pros:**

- Simpler mental model
- Immediate consistency
- Easier debugging
- Well-understood patterns

**Cons:**

- Tight coupling
- Cascading failures
- Difficult to scale
- Synchronous bottlenecks

**Why not chosen:** Doesn't meet our scalability and resilience requirements.

### Orchestrated Workflows

Central orchestrator managing service interactions.

**Pros:**

- Clear flow control
- Easier to understand
- Central monitoring
- Consistent error handling

**Cons:**

- Single point of failure
- Orchestrator becomes bottleneck
- Harder to evolve
- Complex orchestrator logic

**Why not chosen:** Creates a central bottleneck and single point of failure.

### Actor Model

Each service as an actor with message passing.

**Pros:**

- Strong isolation
- Location transparency
- Good for stateful services
- Natural concurrency

**Cons:**

- Complex programming model
- Limited tooling in JavaScript
- Harder to debug
- Steeper learning curve

**Why not chosen:** Complexity outweighs benefits for our use case.

## Implementation Notes

### Event Flow Example

```typescript
// Ingestion service publishes event
await this.publishEvent({
  type: "com.dip.document.ingested",
  source: "/services/ingestion",
  data: {
    documentId: "doc-123",
    contentType: "application/pdf",
    size: 1024000,
  },
});

// Classification service subscribes
this.subscribeToEvents("com.dip.document.ingested", async (event) => {
  const classification = await this.classify(event.data);
  await this.publishEvent({
    type: "com.dip.document.classified",
    source: "/services/classification",
    data: {
      documentId: event.data.documentId,
      category: classification.category,
      confidence: classification.confidence,
    },
  });
});
```

### Event Naming Convention

```
com.dip.[domain].[action]

Examples:
- com.dip.document.ingested
- com.dip.document.classified
- com.dip.routing.decided
- com.dip.response.generated
```

### Service Boundaries

Each service:

- Owns its data and state
- Publishes events for state changes
- Subscribes to relevant events
- Maintains idempotency
- Handles its own errors

### Error Handling

```typescript
// Retry with exponential backoff
async function processEventWithRetry(event: CloudEvent) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await processEvent(event);
      return;
    } catch (error) {
      await sleep(Math.pow(2, attempt) * 1000);
    }
  }
  // Send to dead letter queue
  await deadLetterQueue.send(event);
}
```

## References

- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html) - Martin Fowler
- [Building Event-Driven Microservices](https://www.oreilly.com/library/view/building-event-driven-microservices/9781492057888/) - Adam Bellemare
- [CloudEvents Specification](https://cloudevents.io/)
- [Designing Data-Intensive Applications](https://dataintensive.net/) - Martin Kleppmann
