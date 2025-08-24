# ADR-002: Use Deno as Runtime Platform

## Status

Accepted

## Context

The Deno Intelligence Platform requires a modern, secure, and performant runtime for its microservices architecture. We need a platform that:

- **Provides excellent TypeScript support** without complex build configurations
- **Ensures security by default** to minimize attack surface in a distributed system
- **Offers built-in tooling** to reduce dependency management complexity
- **Supports modern web standards** for compatibility and developer familiarity
- **Enables rapid development** with minimal boilerplate

The JavaScript/TypeScript ecosystem has evolved significantly, and we have the opportunity to choose a runtime that learns from Node.js's decade of lessons while embracing modern development practices.

Key requirements for our runtime:

- First-class TypeScript support without transpilation overhead
- Strong security model for handling untrusted inputs
- Built-in testing, formatting, and linting tools
- Modern module system without node_modules complexity
- Performance suitable for high-throughput event processing

## Decision

We will use Deno as the runtime platform for all microservices in the DIP architecture.

Deno will be used for:

- All service implementations (ingestion, classification, routing, response)
- Shared libraries and utilities
- Testing and development tooling
- Build and deployment scripts

We will leverage Deno's built-in features:

- TypeScript execution without separate compilation step
- Permission system for security boundaries
- Built-in test runner for unit and integration tests
- Standard library for common operations
- URL-based module imports with lock files for reproducibility

## Consequences

### Positive

- **Zero-Config TypeScript**: Run TypeScript directly without webpack, babel, or ts-node configuration
- **Security First**: Explicit permissions prevent unauthorized file, network, or environment access
- **Unified Toolchain**: Built-in formatter (deno fmt), linter (deno lint), and test runner (deno test)
- **No node_modules**: Dependencies cached globally, reducing disk usage and simplifying deployments
- **Web Standards**: Uses Web APIs (fetch, WebSocket, etc.) improving portability
- **Better Developer Experience**: Faster startup times, better error messages, and simpler mental model
- **Built-in TypeScript**: No version mismatches between TypeScript and the runtime
- **Modern Module System**: ES modules only, with top-level await support

### Negative

- **Smaller Ecosystem**: Fewer packages compared to npm (though npm packages can be used via CDNs)
- **Learning Curve**: Team needs to learn Deno-specific patterns and APIs
- **Tooling Maturity**: Some tools and IDEs have better Node.js support
- **Migration Complexity**: Existing Node.js code requires adaptation
- **Enterprise Adoption**: Less prevalent in enterprise environments

### Neutral

- **Different Module Resolution**: URL-based imports instead of node_modules require adjustment
- **Explicit Permissions**: More secure but requires careful permission management
- **Standard Library Differences**: Some APIs differ from Node.js equivalents
- **Docker Image Size**: Deno images are comparable to Node.js but different optimization strategies apply

## Alternatives Considered

### Node.js with TypeScript

The traditional and most widely adopted JavaScript runtime.

**Pros:**

- Massive ecosystem with npm
- Mature tooling and widespread knowledge
- Extensive enterprise adoption
- Battle-tested in production

**Cons:**

- Complex TypeScript setup with multiple tools
- No built-in security model
- node_modules dependency hell
- Requires additional tools for testing, linting, formatting
- Slower development iteration due to build steps

**Why not chosen:** The complexity overhead and lack of built-in TypeScript support would slow development and increase maintenance burden.

### Bun

A newer, performance-focused JavaScript runtime.

**Pros:**

- Exceptional performance claims
- Node.js compatibility
- Built-in bundler and transpiler
- Fast installation and execution

**Cons:**

- Very new and rapidly changing
- Smaller community and ecosystem
- Less mature, potential stability issues
- Limited production deployments

**Why not chosen:** Too immature for a production system that requires stability and long-term support.

### Go

A statically typed, compiled language.

**Pros:**

- Excellent performance
- Strong concurrency model
- Single binary deployment
- Good microservices ecosystem

**Cons:**

- Different language from frontend (assuming TypeScript/JavaScript frontend)
- Longer development cycles due to compilation
- Less flexibility for rapid prototyping
- Would split the team's expertise

**Why not chosen:** The context switch between frontend and backend languages would reduce team velocity and increase complexity.

## Implementation Notes

### Project Structure

```
services/
  ingestion/
    main.ts         # Entry point
    deno.json       # Deno configuration
  classification/
    main.ts
    deno.json
shared/
  deps.ts           # Centralized dependencies
  types.ts          # Shared TypeScript types
```

### Deno Configuration Example

```json
{
  "tasks": {
    "dev": "deno run --allow-net --allow-env --watch main.ts",
    "test": "deno test --allow-read",
    "fmt": "deno fmt",
    "lint": "deno lint"
  },
  "imports": {
    "@std/": "https://deno.land/std@0.208.0/",
    "@shared/": "../shared/"
  }
}
```

### Permission Model

Each service runs with minimal required permissions:

```bash
# Ingestion service: needs network for Kafka, env for configuration
deno run --allow-net --allow-env services/ingestion/main.ts

# Classification service: adds read for model files
deno run --allow-net --allow-env --allow-read=./models services/classification/main.ts
```

### Dependency Management

Use import maps for version management:

```typescript
// deps.ts - centralized dependency management
export { serve } from "https://deno.land/std@0.208.0/http/server.ts";
export { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
export { Hono } from "https://deno.land/x/hono@v3.11.7/mod.ts";
```

### Docker Deployment

```dockerfile
FROM denoland/deno:1.39.1

WORKDIR /app

# Cache dependencies
COPY deps.ts .
RUN deno cache deps.ts

# Copy application code
COPY . .

# Compile the application
RUN deno cache main.ts

# Run with specific permissions
CMD ["run", "--allow-net", "--allow-env", "main.ts"]
```

## References

- [Deno Official Documentation](https://deno.land/)
- [Deno Manual](https://deno.land/manual)
- [Deno by Example](https://examples.deno.land/)
- [Node.js to Deno Cheatsheet](https://deno.land/manual/node/cheatsheet)
- [Ryan Dahl: 10 Things I Regret About Node.js](https://www.youtube.com/watch?v=M3BM9TB-8yA) - JSConf EU 2018
