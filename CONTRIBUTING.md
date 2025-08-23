# Contributing to DIP

First off, thank you for considering contributing to DIP! It's people like you
that make DIP such a great platform for the community. We welcome contributions
from everyone, whether you're a seasoned developer or just starting your
journey.

## 🎯 Our Philosophy

DIP is built on the principles of:

- **Inclusivity**: Everyone's contribution matters
- **Quality**: We strive for excellence in code and documentation
- **Innovation**: We embrace new ideas and approaches
- **Collaboration**: We work together to build something amazing

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Environment Setup](#development-environment-setup)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Process](#development-process)
- [Testing Requirements](#testing-requirements)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Conventions](#commit-message-conventions)
- [Pull Request Process](#pull-request-process)
- [Community](#community)

## 📜 Code of Conduct

This project and everyone participating in it is governed by the
[DIP Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to
uphold this code. Please report unacceptable behavior to the project
maintainers.

## 🚀 Getting Started

### Finding Good First Issues

We use several labels to help you find issues that match your experience level:

- `good first issue` - Perfect for newcomers to the project
- `help wanted` - Issues where we particularly need community help
- `documentation` - Help improve our docs (great for first-time contributors!)
- `bug` - Something isn't working as expected
- `enhancement` - New features or improvements
- `evaluation` - Help us write better tests and benchmarks

Browse our [issue tracker](https://github.com/ncolesummers/dip/issues) to find
something that interests you!

### Understanding the Codebase

Before diving in, familiarize yourself with:

1. **Project Structure**: Review the README.md for an overview
2. **Architecture**: Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (when
   available)
3. **Existing Code**: Browse the `services/` and `shared/` directories
4. **Tests**: Look at existing tests in `tests/` to understand our testing
   approach

## 🛠️ Development Environment Setup

### Option 1: DevContainer (Recommended)

The fastest way to get a fully configured development environment:

1. **Prerequisites**:
   - [Docker Desktop](https://www.docker.com/products/docker-desktop)
   - [VS Code](https://code.visualstudio.com/)
   - [Remote - Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

2. **Setup**:
   ```bash
   git clone https://github.com/ncolesummers/dip.git
   cd dip
   code .
   ```

3. **When VS Code opens**, you'll see a notification to "Reopen in Container".
   Click it!
   - Alternatively, use Command Palette (F1):
     `Remote-Containers: Reopen in Container`

4. **Wait for container to build** (first time takes ~5 minutes)
   - Installs Deno, Claude CLI, and all tools
   - Sets up VS Code with proper extensions
   - Configures git and environment

5. **Start developing**:
   ```bash
   # Inside the container terminal
   docker compose up -d  # Start Kafka, PostgreSQL, etc.
   deno task dev        # Start development
   ```

### Option 2: Local Development

If you prefer local development:

1. **Install Deno**:
   ```bash
   # macOS/Linux
   curl -fsSL https://deno.land/install.sh | sh

   # Windows (PowerShell)
   irm https://deno.land/install.ps1 | iex
   ```

2. **Install Docker** for running infrastructure:
   - [Docker Desktop](https://www.docker.com/products/docker-desktop)

3. **Clone and setup**:
   ```bash
   git clone https://github.com/ncolesummers/dip.git
   cd dip

   # Start infrastructure
   docker compose up -d

   # Install dependencies
   deno cache --reload import_map.json
   ```

4. **Configure your editor**:
   - **VS Code**: Install
     [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
   - **Other editors**: See
     [Deno's editor setup guide](https://deno.land/manual/getting_started/setup_your_environment)

### For AI Developers

We embrace AI-assisted development! If you're using Claude, GitHub Copilot, or
other AI tools:

1. **DevContainer includes Claude CLI** pre-installed
2. **Use AI for**:
   - Generating boilerplate code
   - Writing tests
   - Improving documentation
   - Refactoring suggestions

3. **Always**:
   - Review AI-generated code carefully
   - Ensure it follows our style guidelines
   - Add appropriate tests
   - Document AI assistance in PR descriptions when significant

## 🤔 How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.
When you create a bug report, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **System information** (OS, Deno version, etc.)
- **Relevant logs or error messages**
- **Code samples** if applicable

Use our [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an
enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description** of the proposed feature
- **Explain why** this enhancement would be useful
- **List any alternatives** you've considered
- **Include mockups or examples** if applicable

Use our [feature request template](.github/ISSUE_TEMPLATE/feature_request.md).

### Contributing Code

#### For Small Changes (typos, small bugs)

1. Fork the repository
2. Create your fix
3. Submit a pull request

#### For Larger Changes

1. **Discuss first**: Open an issue to discuss your proposed changes
2. **Get feedback**: Ensure the community agrees with the direction
3. **Fork and develop**: Create your feature branch
4. **Test thoroughly**: Add/update tests as needed
5. **Document**: Update relevant documentation
6. **Submit PR**: Follow our PR process

### Contributing Documentation

Documentation is crucial! You can help by:

- **Fixing typos and improving clarity**
- **Adding examples and tutorials**
- **Translating documentation**
- **Creating diagrams and visualizations**
- **Writing guides for specific use cases**

## 🔄 Development Process

### Branch Strategy

- `main` - Production-ready code
- `develop` - Integration branch for features
- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation updates
- `test/*` - Test improvements

### Workflow

1. **Fork** the repository
2. **Create** a branch from `develop`:
   ```bash
   git checkout -b feature/amazing-feature develop
   ```
3. **Make** your changes
4. **Test** your changes:
   ```bash
   deno test --allow-all
   deno lint
   deno fmt --check
   ```
5. **Commit** with meaningful messages
6. **Push** to your fork
7. **Open** a Pull Request to `develop`

## 🧪 Testing Requirements

All contributions must include appropriate tests. We use Deno's built-in testing
framework.

### Test Types

#### Unit Tests

Located in `tests/unit/`, these test individual functions and classes:

```typescript
// tests/unit/example.test.ts
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { processData } from "../../services/example/processor.ts";

Deno.test("processData transforms input correctly", () => {
  const input = { raw: "data" };
  const expected = { processed: "DATA" };
  assertEquals(processData(input), expected);
});
```

#### Integration Tests

Located in `tests/integration/`, these test service interactions:

```typescript
// tests/integration/service.test.ts
Deno.test("Service publishes event after processing", async () => {
  const service = new TestService();
  await service.start();

  const result = await service.processEvent(mockEvent);

  assertExists(result.correlationId);
  await service.stop();
});
```

#### Evaluation Suites

Located in `tests/evals/`, these are comprehensive test suites:

```typescript
// tests/evals/performance.eval.ts
Deno.test("Performance Evaluation Suite", async (t) => {
  await t.step("handles 1000 concurrent requests", async () => {
    // Performance test implementation
  });

  await t.step("maintains <100ms p99 latency", async () => {
    // Latency test implementation
  });
});
```

### Running Tests

```bash
# Run all tests
deno test --allow-all

# Run specific test file
deno test tests/unit/example.test.ts --allow-all

# Run with coverage
deno test --allow-all --coverage=coverage

# Generate coverage report
deno coverage coverage --lcov > coverage.lcov
```

### Test Coverage Requirements

- **New features**: Minimum 80% coverage
- **Bug fixes**: Include regression tests
- **Critical paths**: 90%+ coverage recommended

## 📝 Code Style Guidelines

We use Deno's built-in formatter and linter. These are non-negotiable - code
must pass both before merging.

### TypeScript Guidelines

#### Use Explicit Types for Function Parameters

```typescript
// ✅ Good
function processTicket(ticket: Ticket, priority: Priority): Promise<Result> {
  // Implementation
}

// ❌ Avoid
function processTicket(ticket, priority) {
  // Implementation
}
```

#### Leverage Zod for Runtime Validation

```typescript
// Define schemas with Zod
import { z } from "zod";

export const TicketSchema = z.object({
  id: z.string().regex(/^TKT-\d{6}$/),
  text: z.string().min(1).max(5000),
  priority: z.enum(["low", "medium", "high", "critical"]),
  createdAt: z.date().default(() => new Date()),
});

// Infer TypeScript types from schemas
export type Ticket = z.infer<typeof TicketSchema>;

// Validate at runtime
export function validateTicket(data: unknown): Ticket {
  return TicketSchema.parse(data);
}
```

#### Service Structure Pattern

```typescript
// services/my-service/service.ts
import { BaseService } from "../../shared/services/base.ts";
import { CloudEvent } from "../../shared/events/types.ts";

export class MyService extends BaseService {
  constructor() {
    super("my-service");
  }

  protected async onStart(): Promise<void> {
    // Initialize resources
    await this.connectToKafka();
  }

  protected async onStop(): Promise<void> {
    // Cleanup resources
    await this.disconnectFromKafka();
  }

  async processEvent(event: CloudEvent): Promise<void> {
    // Validate input
    const data = MySchema.parse(event.data);

    // Process
    const result = await this.process(data);

    // Publish result
    await this.publish("my.event.processed", result);
  }
}
```

#### Error Handling

```typescript
// Use custom error classes
export class ServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

// Handle errors appropriately
try {
  const result = await riskyOperation();
} catch (error) {
  if (error instanceof ZodError) {
    // Handle validation errors
    logger.error("Validation failed", { error: error.errors });
    throw new ServiceError("Invalid input", "VALIDATION_ERROR", 400);
  }

  // Re-throw unexpected errors
  throw error;
}
```

### File Organization

- **One class/interface per file** (with related types)
- **Explicit exports** (no default exports except for main entry points)
- **Descriptive file names** (use kebab-case)
- **Group related files** in directories

### Import Guidelines

```typescript
// 1. Deno standard library
import { assertEquals } from "https://deno.land/std/testing/asserts.ts";

// 2. External dependencies (from import_map.json)
import { z } from "zod";
import { Hono } from "hono";

// 3. Shared modules (absolute paths from project root)
import { BaseService } from "../../shared/services/base.ts";
import { CloudEvent } from "../../shared/events/types.ts";

// 4. Local modules (relative paths)
import { processData } from "./processor.ts";
import type { Config } from "./types.ts";
```

## 📮 Commit Message Conventions

We follow a conventional commit format for clear history and automated changelog
generation.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Test additions or corrections
- `build`: Build system changes
- `ci`: CI configuration changes
- `chore`: Other changes that don't modify src or test files

### Examples

```bash
# Feature
feat(ingestion): add retry logic for failed events

# Bug fix
fix(classifier): handle empty text in classification request

# Documentation
docs(readme): update quick start guide with new commands

# Performance
perf(events): optimize event serialization using buffer pooling

# With breaking change
feat(api)!: change ticket endpoint to use POST instead of PUT

BREAKING CHANGE: The /api/ticket endpoint now requires POST method.
Migration: Update all clients to use POST instead of PUT.
```

### Scope Examples

- `ingestion`, `classifier`, `routing` - Service names
- `events`, `schemas`, `services` - Shared modules
- `docker`, `ci`, `deps` - Infrastructure
- `docs`, `readme` - Documentation

## 🔀 Pull Request Process

### Before Submitting

1. **Update documentation** for any changed functionality
2. **Add/update tests** to cover your changes
3. **Run the test suite** to ensure nothing is broken
4. **Format and lint** your code:
   ```bash
   deno fmt
   deno lint
   ```
5. **Update CHANGELOG.md** if applicable

### PR Guidelines

#### Title

Use the same format as commit messages: `type(scope): description`

#### Description Template

```markdown
## Description

Brief description of what this PR does.

## Motivation and Context

Why is this change required? What problem does it solve? Related Issue: #(issue
number)

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to
      not work as expected)
- [ ] Documentation update

## How Has This Been Tested?

Describe the tests that you ran to verify your changes.

## Checklist

- [ ] My code follows the style guidelines of this project
- [ ] I have performed a self-review of my own code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes
- [ ] Any dependent changes have been merged and published

## Screenshots (if appropriate)

Add screenshots to help explain your changes.

## Additional Notes

Any additional information that reviewers should know.
```

### Review Process

1. **Automated checks** run (tests, lint, format)
2. **Code review** by at least one maintainer
3. **Address feedback** through discussion or additional commits
4. **Approval** from maintainer
5. **Merge** to develop branch

### After Your PR is Merged

- Delete your branch (if it's not automatically deleted)
- Update your local repository
- Celebrate your contribution! 🎉

## 🌟 Recognition

We believe in recognizing all contributions:

- **Code contributors** are listed in [CONTRIBUTORS.md](CONTRIBUTORS.md)
- **Issue reporters** help us improve quality
- **Documentation writers** make the project accessible
- **Community helpers** who answer questions
- **Reviewers** who help maintain code quality

## 💬 Community

### Getting Help

- **GitHub Discussions**: Ask questions and share ideas
- **Issue Tracker**: Report bugs or request features
- **Stack Overflow**: Tag questions with `deno` and `dip`

### Staying Updated

- Watch the repository for updates
- Read our blog posts and announcements

## 🎓 Learning Resources

### New to Deno?

- [Deno Manual](https://deno.land/manual)
- [Deno by Example](https://examples.deno.land)
- [Deno Tutorial](https://deno.land/manual/introduction)

### Understanding Our Stack

- [Hono Documentation](https://hono.dev)
- [Zod Documentation](https://zod.dev)
- [CloudEvents Specification](https://cloudevents.io)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)

### TypeScript Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

## 📄 License

By contributing to DIP, you agree that your contributions will be licensed under
the MIT License.

## 🙏 Thank You!

Your contributions make DIP better for everyone. Whether you're fixing a typo,
adding a feature, or helping others in discussions, every contribution matters.

Welcome to the DIP community! We're excited to see what we'll build together!
🦕✨
