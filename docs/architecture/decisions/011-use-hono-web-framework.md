# ADR-011: Use Hono Web Framework

## Status

Accepted

## Context

Our microservices need a web framework for HTTP APIs that:

- **Works with Deno**: First-class Deno support
- **High performance**: Minimal overhead for high-throughput services
- **Type safety**: Full TypeScript support with type inference
- **Lightweight**: Small bundle size and fast startup
- **Standards-based**: Uses Web Standards APIs
- **Middleware support**: Extensible with middleware pattern
- **Multi-runtime**: Can run on Deno, Node, and edge runtimes

Key requirements:
- Fast routing performance
- Built-in middleware for common tasks
- Good developer experience
- Active maintenance and community
- CloudFlare Workers compatibility for future edge deployment

## Decision

We will use Hono as our web framework for HTTP APIs in all services.

Implementation approach:
1. **Use Hono for all HTTP endpoints** in our services
2. **Leverage built-in middleware** for CORS, logging, etc.
3. **Create custom middleware** for authentication and metrics
4. **Use Hono's validation** with our Zod schemas
5. **Implement OpenAPI generation** using Hono's OpenAPI support

## Consequences

### Positive

- **Ultrafast**: One of the fastest JavaScript web frameworks
- **Small Size**: Minimal bundle size (~12KB)
- **Web Standards**: Based on Fetch API and Web Standards
- **Type Safety**: Excellent TypeScript support with RPC mode
- **Multi-Runtime**: Runs on Deno, Node, Bun, and edge runtimes
- **Developer Experience**: Clean, intuitive API
- **Built-in Middleware**: Rich set of official middleware
- **Active Development**: Regular updates and improvements

### Negative

- **Smaller Ecosystem**: Fewer third-party middleware compared to Express
- **Less Mature**: Newer framework with less production usage
- **Documentation**: Less comprehensive than established frameworks
- **Community Size**: Smaller community than Express/Fastify

### Neutral

- **Different Patterns**: Not Express-compatible
- **Learning Curve**: New API to learn
- **Migration Path**: Existing Express code needs rewriting

## Alternatives Considered

### Oak

Deno-native web framework inspired by Koa.

**Pros:**
- Deno-first design
- Familiar Koa-like API
- Good middleware ecosystem
- Mature for Deno

**Cons:**
- Deno-only
- Larger than Hono
- Less performance
- No edge runtime support

**Why not chosen:** Hono's performance and multi-runtime support are superior.

### Express with Deno

Using Express through npm compatibility.

**Pros:**
- Most popular framework
- Huge ecosystem
- Well-documented
- Familiar to developers

**Cons:**
- Not Deno-native
- Performance overhead
- Legacy design
- Compatibility issues

**Why not chosen:** Not optimized for Deno, performance concerns.

### Fresh

Deno-native full-stack framework.

**Pros:**
- Deno-first
- Islands architecture
- Built-in SSR
- Good DX

**Cons:**
- Full-stack focused
- Overkill for APIs
- Opinionated structure
- Learning curve

**Why not chosen:** Too heavy for microservice APIs.

### Native Deno.serve

Using Deno's built-in HTTP server.

**Pros:**
- No dependencies
- Maximum performance
- Full control
- Minimal overhead

**Cons:**
- No routing
- No middleware
- More boilerplate
- Manual everything

**Why not chosen:** Lack of features would slow development.

## Implementation Notes

### Basic Service Setup

```typescript
// services/ingestion/main.ts
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { compress } from "hono/compress";

const app = new Hono();

// Middleware
app.use("*", cors());
app.use("*", logger());
app.use("*", compress());

// Routes
app.get("/health", (c) => c.json({ status: "healthy" }));
app.post("/ingest", ingestHandler);

// Start server
Deno.serve({ port: 8080 }, app.fetch);
```

### Zod Integration

```typescript
import { zValidator } from "@hono/zod-validator";
import { DocumentSchema } from "@shared/schemas";

app.post(
  "/documents",
  zValidator("json", DocumentSchema),
  async (c) => {
    const document = c.req.valid("json");
    // Type-safe document handling
    const result = await processDocument(document);
    return c.json(result);
  }
);
```

### Custom Middleware

```typescript
// shared/middleware/metrics.ts
export function metricsMiddleware() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = c.req.path;
    
    await next();
    
    const duration = Date.now() - start;
    const status = c.res.status;
    
    // Record metrics
    httpRequestDuration.observe(
      { method, path, status },
      duration / 1000
    );
  };
}
```

### Error Handling

```typescript
app.onError((err, c) => {
  console.error(`Error handling request: ${err}`);
  
  if (err instanceof ValidationError) {
    return c.json(
      { error: "Validation failed", details: err.errors },
      400
    );
  }
  
  return c.json(
    { error: "Internal server error" },
    500
  );
});
```

### OpenAPI Generation

```typescript
import { OpenAPIHono } from "@hono/zod-openapi";

const app = new OpenAPIHono();

app.openapi(
  {
    method: "post",
    path: "/documents",
    request: {
      body: {
        content: {
          "application/json": {
            schema: DocumentSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: "Success",
        content: {
          "application/json": {
            schema: ResponseSchema
          }
        }
      }
    }
  },
  handler
);

// Generate OpenAPI spec
app.doc("/openapi.json", {
  info: {
    title: "DIP Ingestion Service",
    version: "1.0.0"
  }
});
```

## References

- [Hono Documentation](https://hono.dev/)
- [Hono GitHub](https://github.com/honojs/hono)
- [Web Framework Benchmarks](https://github.com/delvedor/find-my-way-bench)
- [Hono vs Express Performance](https://hono.dev/concepts/benchmarks)