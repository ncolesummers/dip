# ADR-010: Use Zod for Runtime Validation

## Status

Accepted

## Context

TypeScript provides compile-time type safety, but we need runtime validation for:

- **External data**: API requests, event payloads, configuration files
- **Data boundaries**: Service interfaces, database operations
- **Type inference**: Deriving TypeScript types from validation schemas
- **Error messages**: User-friendly validation error messages
- **Data transformation**: Parsing and transforming input data

Our requirements:
- TypeScript type inference from schemas
- Composable schema definitions
- Good performance for high-throughput scenarios
- Clear error messages for debugging
- Support for complex validation rules
- Integration with our CloudEvents structure

## Decision

We will use Zod as our primary runtime validation library.

Implementation strategy:
1. **Define schemas for all external data** entering our services
2. **Use type inference** to derive TypeScript types from schemas
3. **Validate at service boundaries** before processing
4. **Create shared schemas** for common data structures
5. **Generate OpenAPI specs** from Zod schemas where applicable

## Consequences

### Positive

- **Type Inference**: TypeScript types automatically derived from schemas
- **Developer Experience**: Excellent TypeScript integration and autocompletion
- **Composability**: Schemas can be combined and extended easily
- **Performance**: Good performance with minimal overhead
- **Error Messages**: Clear, actionable error messages
- **Transformation**: Built-in data transformation capabilities
- **Small Bundle**: Relatively small library size
- **Active Development**: Well-maintained with regular updates

### Negative

- **Learning Curve**: Developers need to learn Zod's API
- **Schema Duplication**: May duplicate some TypeScript type definitions
- **Runtime Overhead**: Validation has performance cost
- **Migration Effort**: Existing validation needs conversion

### Neutral

- **Schema-First**: Encourages schema-first development
- **Validation Strategy**: Need to decide where to validate
- **Error Handling**: Requires consistent error handling patterns

## Alternatives Considered

### Joi

Mature validation library with extensive features.

**Pros:**
- Very mature and stable
- Extensive validation rules
- Good error messages
- Wide adoption

**Cons:**
- No TypeScript type inference
- Larger bundle size
- Less TypeScript-friendly API
- Separate type definitions needed

**Why not chosen:** Lack of type inference makes it less suitable for TypeScript-first development.

### Yup

Popular schema validation library.

**Pros:**
- Good TypeScript support
- Familiar API
- Good ecosystem
- Battle-tested

**Cons:**
- Weaker type inference than Zod
- Larger bundle size
- Less composable
- Performance concerns

**Why not chosen:** Zod's superior type inference and smaller size are better for our needs.

### io-ts

Functional programming approach to validation.

**Pros:**
- Strong type safety
- Functional programming patterns
- Good for complex transformations
- Excellent type inference

**Cons:**
- Steep learning curve
- Complex API
- Smaller community
- Less intuitive for most developers

**Why not chosen:** Too complex for team adoption, Zod provides similar benefits with simpler API.

### Manual Validation

Custom validation functions.

**Pros:**
- Complete control
- No dependencies
- Optimized for specific needs

**Cons:**
- Time-consuming to implement
- Error-prone
- No type inference
- Maintenance burden

**Why not chosen:** The effort required outweighs the benefits.

## Implementation Notes

### Basic Schema Definition

```typescript
// shared/schemas/document.ts
import { z } from "zod";

export const DocumentSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  content: z.string(),
  contentType: z.enum(["text/plain", "text/html", "application/pdf"]),
  size: z.number().positive().max(10_000_000), // 10MB max
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

// Infer TypeScript type from schema
export type Document = z.infer<typeof DocumentSchema>;
```

### CloudEvent Integration

```typescript
// shared/events/schemas.ts
export const CloudEventSchema = z.object({
  specversion: z.literal("1.0"),
  id: z.string().uuid(),
  source: z.string().url(),
  type: z.string().regex(/^com\.dip\.[a-z]+\.[a-z]+$/),
  time: z.string().datetime(),
  data: z.unknown()
});

// Typed CloudEvent with data validation
export function createTypedEventSchema<T extends z.ZodType>(
  dataSchema: T
) {
  return CloudEventSchema.extend({
    data: dataSchema
  });
}
```

### Service Validation

```typescript
// services/ingestion/handlers.ts
export async function handleIngestion(request: Request) {
  const body = await request.json();
  
  // Validate input
  const result = DocumentSchema.safeParse(body);
  
  if (!result.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: result.error.format()
      }),
      { status: 400 }
    );
  }
  
  // Process validated data
  const document = result.data;
  // ...
}
```

### Shared Schemas

```typescript
// shared/schemas/common.ts
export const PaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sort: z.enum(["asc", "desc"]).default("desc")
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
  timestamp: z.string().datetime()
});
```

### Configuration Validation

```typescript
// shared/config/schema.ts
export const ServiceConfigSchema = z.object({
  service: z.object({
    name: z.string(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    port: z.number().int().positive().max(65535)
  }),
  kafka: z.object({
    brokers: z.array(z.string()),
    groupId: z.string()
  }),
  monitoring: z.object({
    metricsPort: z.number().int().positive().max(65535),
    logLevel: z.enum(["debug", "info", "warn", "error"])
  })
});
```

## References

- [Zod Documentation](https://zod.dev/)
- [TypeScript Runtime Validation Comparison](https://github.com/moltar/typescript-runtime-type-benchmarks)
- [Zod Best Practices](https://github.com/colinhacks/zod#best-practices)
- [Type-Safe APIs with Zod](https://www.totaltypescript.com/tutorials/zod)