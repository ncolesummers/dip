# DIP Docker Development Environment

This directory contains all Docker-related configuration for the Document Intelligence Platform (DIP) development environment.

## Quick Start

1. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Start all services:**
   ```bash
   docker-compose up
   ```

3. **Or use the development script:**
   ```bash
   ./scripts/dev-start.sh
   ```

## Architecture Overview

The DIP development environment consists of the following components:

### Infrastructure Services
- **Kafka (KRaft mode)**: Message streaming platform for event-driven architecture
- **PostgreSQL**: Primary database with comprehensive schema
- **Redis**: Caching layer and session storage
- **Ollama**: Local AI model server for document classification and response generation

### Microservices
- **Ingestion Service** (Port 8001): Handles document upload and initial processing
- **Classifier Service** (Port 8002): AI-powered document classification
- **Routing Service** (Port 8003): Intelligent document routing
- **Response Service** (Port 8004): Response generation and delivery

### Monitoring & Management
- **Kafka UI** (Port 8080): Web interface for Kafka management
- **Prometheus** (Port 9090): Metrics collection
- **Grafana** (Port 3000): Metrics visualization (admin/admin)
- **PgAdmin** (Port 5050): Database administration
- **Redis Commander** (Port 8081): Redis management interface
- **Mailhog** (Port 8025): Email testing tool

## File Structure

```
docker/
├── docker-compose.yml           # Main service definitions
├── docker-compose.override.yml  # Development overrides
├── Dockerfile.deno             # Multi-stage Dockerfile for Deno services
├── healthcheck.ts              # Health check script for services
├── nginx-dev.conf              # Nginx configuration for development
├── prometheus.yml              # Prometheus configuration
└── init-scripts/               # PostgreSQL initialization
    ├── 01-create-extensions.sql
    ├── 02-create-schemas.sql
    ├── 03-create-types.sql
    ├── 04-create-tables.sql
    ├── 05-create-functions.sql
    └── 06-insert-seed-data.sql
```

## Service Details

### Deno Services Configuration

All microservices use the same base Dockerfile with development-specific features:

- **Hot Reload**: Automatic restart on file changes
- **Debug Support**: Each service exposes a debug port (9229-9232)
- **Volume Mounts**: Live code editing with cached volumes
- **Health Checks**: Comprehensive health monitoring
- **Logging**: Structured JSON logging with configurable levels

### Database Schema

The PostgreSQL database is automatically initialized with:

- **Extensions**: UUID, full-text search, JSON indexing, cryptographic functions
- **Schemas**: Organized by service domain (ingestion, classifier, routing, response, shared, audit, config)
- **Tables**: Complete data model with proper relationships and indexes
- **Functions**: Utility functions for common operations
- **Triggers**: Automatic timestamp updates and data validation
- **Seed Data**: Initial configuration and development test data

### Development Features

- **Network Separation**: Frontend and backend networks for security
- **Resource Limits**: Appropriate memory and CPU constraints
- **Volume Caching**: Optimized volume mounts for performance
- **Environment Variables**: Comprehensive configuration through .env
- **Development Tools**: Additional containers for debugging and management

## Usage Examples

### Start Specific Services

```bash
# Infrastructure only
docker-compose up kafka postgres redis

# Single microservice with dependencies  
docker-compose up ingestion-service

# Monitoring stack
docker-compose up prometheus grafana kafka-ui
```

### Development Workflow

```bash
# Start with logs
docker-compose up --follow

# Rebuild a specific service
docker-compose build classifier-service
docker-compose up -d classifier-service

# View service logs
docker-compose logs -f ingestion-service

# Execute commands in containers
docker-compose exec postgres psql -U dip_user -d dip_db
docker-compose exec kafka kafka-topics --bootstrap-server localhost:9092 --list
docker-compose exec redis redis-cli
```

### Debugging

Each Deno service exposes a debug port for IDE integration:

- Ingestion: `localhost:9229`
- Classifier: `localhost:9230`
- Routing: `localhost:9231`
- Response: `localhost:9232`

Connect your IDE debugger to these ports for breakpoint debugging.

## Environment Configuration

Key environment variables (see `.env.example` for complete list):

```bash
# Database
POSTGRES_USER=dip_user
POSTGRES_PASSWORD=dip_password
POSTGRES_DB=dip_db

# Kafka
KAFKA_BROKERS=kafka:29092
KAFKA_CLUSTER_ID=7F983492C65A4A46AF546EQk

# Services
LOG_LEVEL=debug
DENO_ENV=development

# AI Configuration
OLLAMA_HOST=ollama
DEFAULT_MODEL=llama2:7b
```

## Troubleshooting

### Common Issues

1. **Port Conflicts**
   ```bash
   # Check what's using ports
   netstat -tulpn | grep :8001
   
   # Modify ports in .env file
   INGESTION_PORT=8101
   ```

2. **Database Connection Issues**
   ```bash
   # Check database health
   docker-compose exec postgres pg_isready -U dip_user
   
   # Reset database
   docker-compose down postgres
   docker volume rm dip_postgres-data
   docker-compose up postgres
   ```

3. **Kafka Issues**
   ```bash
   # Check Kafka health
   docker-compose exec kafka kafka-topics --bootstrap-server localhost:9092 --list
   
   # Reset Kafka
   docker-compose down kafka
   docker volume rm dip_kafka-data
   docker-compose up kafka
   ```

4. **Service Won't Start**
   ```bash
   # Check service logs
   docker-compose logs service-name
   
   # Rebuild service
   docker-compose build service-name
   docker-compose up service-name
   ```

### Health Checks

All services include health checks. Check status with:

```bash
docker-compose ps
docker-compose exec service-name curl http://localhost:8000/health
```

### Performance Tuning

For development performance:

```bash
# Increase Docker memory (Docker Desktop)
# Settings > Resources > Memory: 4GB+

# Use volume caching
# Already configured in docker-compose.override.yml

# Disable unnecessary services
docker-compose up kafka postgres redis ingestion-service
```

## Production Considerations

This setup is optimized for development. For production:

1. **Use production Dockerfile target**
2. **Remove development tools and debug ports**
3. **Implement proper secrets management**
4. **Configure resource limits based on actual requirements**
5. **Set up proper logging and monitoring**
6. **Use external databases and message queues**
7. **Implement proper backup strategies**

## Advanced Usage

### Custom Networks

Services are organized into two networks:
- `frontend`: External-facing services
- `backend`: Internal services only

### Volume Management

```bash
# List volumes
docker volume ls

# Backup data
docker run --rm -v dip_postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .

# Restore data  
docker run --rm -v dip_postgres-data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/postgres-backup.tar.gz"
```

### Scaling Services

```bash
# Scale a service
docker-compose up -d --scale ingestion-service=3

# Load balance with nginx
# Configure upstream in nginx.conf
```

## Contributing

When modifying the Docker configuration:

1. Test locally with `docker-compose up`
2. Verify all health checks pass
3. Update documentation
4. Test with clean environment (`docker-compose down -v && docker-compose up`)

## Support

For Docker-related issues:
1. Check service logs: `docker-compose logs service-name`
2. Verify environment variables in `.env`
3. Ensure Docker has sufficient resources
4. Review this documentation for common solutions