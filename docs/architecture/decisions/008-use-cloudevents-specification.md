# ADR-008: Use CloudEvents Specification

## Status

Accepted

## Context

With our event-driven architecture (ADR-007), we need a standardized format for events that ensures:

- **Interoperability**: Events can be consumed by any service or external system
- **Consistency**: All events follow the same structure
- **Metadata Standards**: Common metadata like source, type, and time
- **Schema Evolution**: Ability to evolve event payloads over time
- **Tool Support**: Leverage existing tooling and libraries

Without standardization, we risk:
- Each service defining its own event format
- Difficulty integrating with external systems
- Inconsistent metadata handling
- Complex event routing logic
- Poor debugging experience

## Decision

We will adopt the CloudEvents specification v1.0 for all events in our system.

Implementation details:
1. **Use CloudEvents required attributes**: id, source, specversion, type
2. **Include recommended attributes**: datacontenttype, time, subject
3. **Implement TypeScript types** for type safety
4. **Use Zod schemas** for runtime validation
5. **Support both structured and binary content modes**

## Consequences

### Positive

- **Industry Standard**: Widely adopted specification with growing support
- **Library Support**: SDKs available for multiple languages
- **Clear Structure**: Well-defined attributes and extension mechanism
- **Routing Flexibility**: Standard attributes enable content-based routing
- **Tool Compatibility**: Works with event routers, functions, and streaming platforms
- **Future Proof**: Can integrate with other CloudEvents-compliant systems

### Negative

- **Overhead**: Additional metadata increases message size
- **Learning Curve**: Developers must understand CloudEvents concepts
- **Migration Effort**: Existing events need conversion

### Neutral

- **Schema Registry**: May need central schema management
- **Versioning Strategy**: Requires decisions on schema evolution
- **Validation Overhead**: Runtime validation has performance cost

## Alternatives Considered

### Custom Event Format

Defining our own event structure.

**Pros:**
- Complete control
- Optimized for our needs
- No external dependencies

**Cons:**
- Reinventing the wheel
- No ecosystem support
- Maintenance burden
- No interoperability

**Why not chosen:** CloudEvents provides everything we need with community support.

### Apache Avro

Binary serialization format with schema evolution.

**Pros:**
- Compact binary format
- Schema evolution support
- Good performance

**Cons:**
- Binary format less debuggable
- Requires schema registry
- Less human-readable
- Steeper learning curve

**Why not chosen:** CloudEvents with JSON is more developer-friendly for our use case.

## Implementation Notes

### TypeScript Implementation

```typescript
// shared/events/types.ts
export class TypedCloudEvent<T = unknown> implements CloudEvent {
  specversion = "1.0" as const;
  id: string;
  source: string;
  type: string;
  time: string;
  datacontenttype = "application/json";
  data?: T;
  subject?: string;
  correlationid?: string;
  
  constructor(params: CloudEventParams<T>) {
    this.id = params.id || crypto.randomUUID();
    this.source = params.source;
    this.type = params.type;
    this.time = params.time || new Date().toISOString();
    this.data = params.data;
    this.subject = params.subject;
    this.correlationid = params.correlationid;
  }
}
```

### Zod Schema Validation

```typescript
// shared/events/schemas.ts
export const CloudEventSchema = z.object({
  specversion: z.literal("1.0"),
  id: z.string().uuid(),
  source: z.string(),
  type: z.string(),
  time: z.string().datetime(),
  datacontenttype: z.string().optional(),
  data: z.unknown().optional(),
  subject: z.string().optional(),
  correlationid: z.string().optional()
});
```

### Event Type Examples

```typescript
// Document ingested event
{
  "specversion": "1.0",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "source": "/services/ingestion",
  "type": "com.dip.document.ingested",
  "time": "2024-01-15T10:30:00Z",
  "datacontenttype": "application/json",
  "subject": "documents/doc-123",
  "data": {
    "documentId": "doc-123",
    "size": 1024000,
    "contentType": "application/pdf"
  }
}
```

## References

- [CloudEvents Specification](https://github.com/cloudevents/spec)
- [CloudEvents Primer](https://github.com/cloudevents/spec/blob/v1.0.2/cloudevents/primer.md)
- [CloudEvents SDK TypeScript](https://github.com/cloudevents/sdk-javascript)
- [Event-Driven Architecture with CloudEvents](https://www.asyncapi.com/blog/cloudevents-intro)