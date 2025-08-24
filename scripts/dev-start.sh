#!/bin/bash

# =============================================================================
# DIP Development Environment Startup Script
# =============================================================================
# 
# This script provides an easy way to start the development environment
# with proper dependency management and health checks
#
# Usage:
#   ./scripts/dev-start.sh [service-name]
#   ./scripts/dev-start.sh --help
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default values
SELECTED_SERVICE=""
WAIT_FOR_DEPS=true
SHOW_LOGS=false
DETACH=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[DIP]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show help
show_help() {
    cat << EOF
DIP Development Environment Startup Script

Usage: $0 [OPTIONS] [SERVICE]

Services:
  all                    Start all services (default)
  infrastructure         Start only infrastructure (Kafka, PostgreSQL, Redis)
  ingestion-service      Start ingestion service and dependencies
  classifier-service     Start classifier service and dependencies  
  routing-service        Start routing service and dependencies
  response-service       Start response service and dependencies
  monitoring             Start monitoring stack (Prometheus, Grafana)

Options:
  -h, --help            Show this help message
  -d, --detach          Run in detached mode
  -l, --logs            Show logs after startup
  --no-wait             Don't wait for dependencies to be ready
  --clean               Clean up containers and volumes before starting

Examples:
  $0                              # Start all services
  $0 infrastructure               # Start only infrastructure
  $0 ingestion-service --logs     # Start ingestion service and show logs
  $0 --clean all                  # Clean and start all services

EOF
}

# Function to parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit 0
                ;;
            -d|--detach)
                DETACH=true
                shift
                ;;
            -l|--logs)
                SHOW_LOGS=true
                shift
                ;;
            --no-wait)
                WAIT_FOR_DEPS=false
                shift
                ;;
            --clean)
                clean_environment
                shift
                ;;
            all|infrastructure|ingestion-service|classifier-service|routing-service|response-service|monitoring)
                SELECTED_SERVICE="$1"
                shift
                ;;
            *)
                print_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Default to all services if none specified
    if [[ -z "$SELECTED_SERVICE" ]]; then
        SELECTED_SERVICE="all"
    fi
}

# Function to clean environment
clean_environment() {
    print_status "Cleaning up Docker environment..."
    
    # Stop all containers
    docker-compose down --remove-orphans 2>/dev/null || true
    
    # Remove volumes (ask for confirmation)
    read -p "Remove all volumes? This will delete all data (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker-compose down -v --remove-orphans
        print_success "Volumes removed"
    fi
    
    # Clean up images
    read -p "Remove unused images? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker image prune -f
        print_success "Unused images removed"
    fi
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to check if .env file exists
check_env_file() {
    if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
        print_warning ".env file not found. Creating from template..."
        if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
            cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
            print_success ".env file created from template"
            print_warning "Please review and customize the .env file if needed"
        else
            print_error ".env.example file not found"
            exit 1
        fi
    fi
}

# Function to wait for service health
wait_for_service() {
    local service_name="$1"
    local max_attempts=30
    local attempt=1
    
    print_status "Waiting for $service_name to be healthy..."
    
    while [[ $attempt -le $max_attempts ]]; do
        if docker-compose ps "$service_name" | grep -q "healthy\|Up"; then
            print_success "$service_name is ready"
            return 0
        fi
        
        echo -n "."
        sleep 2
        ((attempt++))
    done
    
    print_warning "$service_name did not become healthy within expected time"
    return 1
}

# Function to start infrastructure
start_infrastructure() {
    print_status "Starting infrastructure services..."
    
    docker-compose up -d kafka postgres redis
    
    if [[ "$WAIT_FOR_DEPS" == true ]]; then
        wait_for_service "kafka"
        wait_for_service "postgres"  
        wait_for_service "redis"
    fi
}

# Function to start monitoring
start_monitoring() {
    print_status "Starting monitoring services..."
    
    docker-compose up -d prometheus grafana kafka-ui
    
    if [[ "$WAIT_FOR_DEPS" == true ]]; then
        wait_for_service "prometheus"
        wait_for_service "grafana"
        wait_for_service "kafka-ui"
    fi
}

# Function to start specific microservice
start_microservice() {
    local service="$1"
    
    print_status "Starting $service..."
    
    # Ensure infrastructure is running first
    start_infrastructure
    
    # Start the specific service
    docker-compose up -d "$service"
    
    if [[ "$WAIT_FOR_DEPS" == true ]]; then
        wait_for_service "$service"
    fi
}

# Function to start all services
start_all() {
    print_status "Starting all services..."
    
    # Start in order of dependencies
    start_infrastructure
    start_monitoring
    
    # Start microservices
    docker-compose up -d \
        ingestion-service \
        classifier-service \
        routing-service \
        response-service \
        ollama
    
    if [[ "$WAIT_FOR_DEPS" == true ]]; then
        wait_for_service "ingestion-service"
        wait_for_service "classifier-service"
        wait_for_service "routing-service"
        wait_for_service "response-service"
    fi
    
    # Start development tools
    docker-compose up -d \
        pgadmin \
        redis-commander \
        mailhog \
        nginx-dev
}

# Function to show service URLs
show_service_urls() {
    print_success "DIP Development Environment is running!"
    echo
    echo "Service URLs:"
    echo "============="
    echo "Ingestion Service:    http://localhost:8001"
    echo "Classifier Service:   http://localhost:8002"
    echo "Routing Service:      http://localhost:8003"
    echo "Response Service:     http://localhost:8004"
    echo
    echo "Management Interfaces:"
    echo "====================="
    echo "Kafka UI:            http://localhost:8080"
    echo "PgAdmin:             http://localhost:5050"
    echo "Redis Commander:     http://localhost:8081"
    echo "Grafana:             http://localhost:3000 (admin/admin)"
    echo "Prometheus:          http://localhost:9090"
    echo "Mailhog:             http://localhost:8025"
    echo
    echo "Development Tools:"
    echo "=================="
    echo "File Server:         http://localhost:8080"
    echo
    echo "Debugging Ports:"
    echo "==============="
    echo "Ingestion Debug:     localhost:9229"
    echo "Classifier Debug:    localhost:9230"
    echo "Routing Debug:       localhost:9231"
    echo "Response Debug:      localhost:9232"
    echo
}

# Function to show logs
show_logs() {
    if [[ "$SELECTED_SERVICE" == "all" ]]; then
        print_status "Showing logs for all services (Ctrl+C to exit)..."
        docker-compose logs -f
    else
        print_status "Showing logs for $SELECTED_SERVICE (Ctrl+C to exit)..."
        docker-compose logs -f "$SELECTED_SERVICE"
    fi
}

# Main execution
main() {
    cd "$PROJECT_ROOT"
    
    print_status "Starting DIP Development Environment"
    print_status "Selected service: $SELECTED_SERVICE"
    
    # Pre-flight checks
    check_docker
    check_env_file
    
    # Start services based on selection
    case "$SELECTED_SERVICE" in
        infrastructure)
            start_infrastructure
            ;;
        monitoring)
            start_monitoring
            ;;
        ingestion-service|classifier-service|routing-service|response-service)
            start_microservice "$SELECTED_SERVICE"
            ;;
        all)
            start_all
            ;;
        *)
            print_error "Unknown service: $SELECTED_SERVICE"
            exit 1
            ;;
    esac
    
    # Show service information
    show_service_urls
    
    # Show logs if requested
    if [[ "$SHOW_LOGS" == true ]]; then
        show_logs
    fi
}

# Parse arguments and run main function
parse_args "$@"
main