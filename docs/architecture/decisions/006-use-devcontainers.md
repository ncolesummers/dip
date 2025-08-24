# ADR-006: Use DevContainers for Development Environment

## Status

Accepted

## Context

The Deno Intelligence Platform involves multiple technologies and tools that need to be consistently configured across all developer machines. Setting up a development environment currently requires:

- Installing Deno with specific version
- Configuring Docker and Docker Compose
- Setting up Kafka and supporting infrastructure
- Installing monitoring tools (Prometheus, Grafana)
- Configuring IDE extensions and settings
- Managing environment variables and secrets
- Ensuring consistent tool versions across the team

These challenges lead to:

- **Onboarding friction**: New developers spend hours or days setting up their environment
- **Works on my machine**: Inconsistent environments cause debugging difficulties
- **Version drift**: Different developers using different tool versions
- **Configuration sprawl**: Environment setup instructions become outdated
- **Platform differences**: Variations between Windows, macOS, and Linux

We need a solution that provides instant, consistent, and reproducible development environments.

## Decision

We will use Visual Studio Code DevContainers (Development Containers) to standardize our development environment.

Implementation strategy:

1. **Create a DevContainer configuration** that includes all required tools and dependencies
2. **Pre-install VS Code extensions** needed for Deno and our tech stack
3. **Configure automatic port forwarding** for services
4. **Include development utilities** (git, curl, httpie, etc.)
5. **Mount local code** while keeping dependencies containerized
6. **Provide environment templates** for different development scenarios

The DevContainer will include:

- Deno runtime with exact version
- Docker-in-Docker for service orchestration
- Pre-configured VS Code settings
- Development tools and utilities
- Access to local Docker daemon for docker-compose

## Consequences

### Positive

- **Instant Onboarding**: New developers productive in minutes, not hours
- **Guaranteed Consistency**: Identical environment for all developers
- **Version Control**: Environment configuration in git with the code
- **Isolation**: Development environment doesn't affect local machine
- **Reproducible Issues**: Bugs can be reproduced in identical environment
- **Cloud Development Ready**: Works with GitHub Codespaces and similar services
- **Pre-configured Tools**: All necessary extensions and settings included
- **Easy Updates**: Environment updates distributed through git pull

### Negative

- **VS Code Dependency**: Primarily designed for Visual Studio Code
- **Performance Overhead**: Container layer may impact performance
- **Resource Usage**: Requires Docker Desktop and additional memory
- **Learning Curve**: Developers need to understand container concepts
- **Network Complexity**: Some networking scenarios more complex in containers

### Neutral

- **Docker Requirement**: Requires Docker Desktop installation
- **Storage Usage**: Container images consume disk space
- **Rebuild Time**: Container rebuilds needed for some changes
- **Remote Development**: Changes development workflow for some developers

## Alternatives Considered

### Virtual Machines (Vagrant)

Traditional VM-based development environments.

**Pros:**

- Complete isolation
- Works with any IDE
- Full OS simulation
- Good for complex scenarios

**Cons:**

- Heavy resource usage
- Slow to start
- Large disk footprint
- Complex provisioning

**Why not chosen:** Too heavyweight for rapid development iteration.

### Docker Compose Only

Using Docker Compose without IDE integration.

**Pros:**

- IDE independent
- Lightweight
- Simple configuration
- Standard Docker workflow

**Cons:**

- No IDE integration
- Manual configuration needed
- No standardized extensions
- Less developer-friendly

**Why not chosen:** Lacks the integrated development experience and automatic configuration.

### Local Installation Scripts

Automated scripts for local environment setup.

**Pros:**

- Native performance
- No containerization overhead
- Works with any IDE
- Direct hardware access

**Cons:**

- Platform-specific scripts
- Version conflicts possible
- Pollution of local system
- Hard to maintain

**Why not chosen:** Doesn't solve the consistency and isolation problems.

### Cloud Development Environments

Fully cloud-based development (Gitpod, GitHub Codespaces without local option).

**Pros:**

- Zero local setup
- Accessible anywhere
- Scalable resources
- Automatic updates

**Cons:**

- Requires internet connection
- Potential latency issues
- Cost for compute time
- Data privacy concerns

**Why not chosen:** Want to support both local and cloud development options.

### Nix/NixOS

Declarative development environments using Nix.

**Pros:**

- Truly reproducible
- No containerization overhead
- Precise dependency management
- Works with any editor

**Cons:**

- Steep learning curve
- Limited Windows support
- Smaller ecosystem
- Complex for teams

**Why not chosen:** Learning curve too steep for team adoption.

## Implementation Notes

### DevContainer Configuration

```json
// .devcontainer/devcontainer.json
{
  "name": "DIP Development",
  "dockerComposeFile": "docker-compose.yml",
  "service": "devcontainer",
  "workspaceFolder": "/workspace",

  "features": {
    "ghcr.io/devcontainers/features/docker-in-docker:2": {},
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },

  "customizations": {
    "vscode": {
      "extensions": [
        "denoland.vscode-deno",
        "ms-azuretools.vscode-docker",
        "ms-vscode.makefile-tools",
        "esbenp.prettier-vscode",
        "dbaeumer.vscode-eslint",
        "zxh404.vscode-proto3",
        "ms-kubernetes-tools.vscode-kubernetes-tools"
      ],
      "settings": {
        "deno.enable": true,
        "deno.lint": true,
        "deno.unstable": true,
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "denoland.vscode-deno"
      }
    }
  },

  "forwardPorts": [
    3000, // Grafana
    8080, // Service ports
    9090, // Prometheus
    9092 // Kafka
  ],

  "postCreateCommand": "deno cache shared/deps.ts",
  "remoteUser": "vscode"
}
```

### Dockerfile for DevContainer

```dockerfile
# .devcontainer/Dockerfile
FROM mcr.microsoft.com/devcontainers/base:ubuntu

# Install Deno
ENV DENO_VERSION=1.39.1
RUN curl -fsSL https://deno.land/x/install/install.sh | sh -s v${DENO_VERSION}
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install additional tools
RUN apt-get update && apt-get install -y \
    httpie \
    jq \
    kafkacat \
    postgresql-client \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

# Install global npm tools (for compatibility)
RUN npm install -g @biomejs/biome

# Pre-cache common Deno dependencies
RUN deno cache \
    https://deno.land/std@0.208.0/http/server.ts \
    https://deno.land/x/zod@v3.22.4/mod.ts \
    https://deno.land/x/hono@v3.11.7/mod.ts

# Setup workspace
WORKDIR /workspace
```

### Docker Compose for Development

```yaml
# .devcontainer/docker-compose.yml
version: "3.8"

services:
  devcontainer:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ..:/workspace:cached
      - /var/run/docker.sock:/var/run/docker.sock
    command: sleep infinity
    network_mode: host
    environment:
      - DISPLAY=${DISPLAY}
    cap_add:
      - SYS_PTRACE
    security_opt:
      - seccomp:unconfined
```

### Usage Instructions

```bash
# For VS Code users
1. Install VS Code and Docker Desktop
2. Install "Dev Containers" extension
3. Open project folder
4. Click "Reopen in Container" when prompted
# or press F1 and select "Dev Containers: Reopen in Container"

# For terminal users
# Build and enter the container
docker-compose -f .devcontainer/docker-compose.yml up -d
docker exec -it dip-devcontainer-1 /bin/bash

# For GitHub Codespaces
# Simply open the repository in Codespaces
# DevContainer configuration is automatically used
```

### Environment Variables

```bash
# .devcontainer/.env.example
KAFKA_BROKER=localhost:9092
POSTGRES_HOST=localhost
REDIS_HOST=localhost
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3000
DENO_ENV=development
```

### Maintenance

1. **Regular Updates**: Update base image and tools monthly
2. **Extension Review**: Audit VS Code extensions quarterly
3. **Performance Monitoring**: Track container rebuild times
4. **Feedback Loop**: Collect developer feedback on environment
5. **Documentation**: Keep setup instructions current

## References

- [VS Code DevContainers Documentation](https://code.visualstudio.com/docs/devcontainers/containers)
- [DevContainer Specification](https://containers.dev/)
- [DevContainer Features](https://github.com/devcontainers/features)
- [GitHub Codespaces](https://github.com/features/codespaces)
- [Docker Best Practices for DevContainers](https://docs.docker.com/develop/dev-best-practices/)
