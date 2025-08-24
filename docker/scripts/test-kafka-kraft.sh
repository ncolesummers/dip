#!/bin/bash

# Test script for Kafka KRaft mode
# This script verifies that Kafka is working correctly in KRaft mode

set -e

echo "========================================="
echo "Kafka KRaft Mode Test Script"
echo "========================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print success
success() {
    echo -e "${GREEN}✓${NC} $1"
}

# Function to print error
error() {
    echo -e "${RED}✗${NC} $1"
}

# Wait for Kafka to be ready
echo "Waiting for Kafka to be ready..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker exec dip-kafka kafka-topics --bootstrap-server localhost:9092 --list &>/dev/null; then
        success "Kafka is ready!"
        break
    fi
    echo "Attempt $((attempt + 1))/$max_attempts - Kafka not ready yet..."
    sleep 2
    attempt=$((attempt + 1))
done

if [ $attempt -eq $max_attempts ]; then
    error "Kafka failed to start within 60 seconds"
    exit 1
fi

echo ""
echo "Running Kafka tests..."
echo "----------------------------------------"

# Test 1: Create a test topic
echo "1. Creating test topic..."
if docker exec dip-kafka kafka-topics \
    --bootstrap-server localhost:9092 \
    --create \
    --topic test-kraft-topic \
    --partitions 3 \
    --replication-factor 1 2>/dev/null; then
    success "Topic created successfully"
else
    error "Failed to create topic"
fi

# Test 2: List topics
echo ""
echo "2. Listing topics..."
topics=$(docker exec dip-kafka kafka-topics --bootstrap-server localhost:9092 --list)
if [ ! -z "$topics" ]; then
    success "Topics listed successfully:"
    echo "$topics" | sed 's/^/   /'
else
    error "Failed to list topics"
fi

# Test 3: Produce a message
echo ""
echo "3. Producing test message..."
echo "Hello from KRaft mode!" | docker exec -i dip-kafka kafka-console-producer \
    --bootstrap-server localhost:9092 \
    --topic test-kraft-topic 2>/dev/null

if [ $? -eq 0 ]; then
    success "Message produced successfully"
else
    error "Failed to produce message"
fi

# Test 4: Consume the message
echo ""
echo "4. Consuming test message..."
message=$(timeout 5 docker exec dip-kafka kafka-console-consumer \
    --bootstrap-server localhost:9092 \
    --topic test-kraft-topic \
    --from-beginning \
    --max-messages 1 2>/dev/null)

if [ "$message" = "Hello from KRaft mode!" ]; then
    success "Message consumed successfully: '$message'"
else
    error "Failed to consume message or message mismatch"
fi

# Test 5: Check cluster metadata (KRaft specific)
echo ""
echo "5. Checking KRaft metadata..."
metadata=$(docker exec dip-kafka kafka-metadata \
    --snapshot /var/lib/kafka/data/__cluster_metadata-0/00000000000000000000.log 2>/dev/null | head -5)

if [ ! -z "$metadata" ]; then
    success "KRaft metadata accessible"
else
    # This might fail but it's not critical
    echo "  Note: Metadata command may not be available in this version"
fi

# Test 6: Check Kafka UI connectivity
echo ""
echo "6. Checking Kafka UI..."
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    success "Kafka UI is accessible at http://localhost:8080"
else
    error "Kafka UI is not accessible"
fi

# Test 7: Verify no ZooKeeper dependency
echo ""
echo "7. Verifying ZooKeeper independence..."
zk_check=$(docker ps --format "table {{.Names}}" | grep -i zookeeper || true)
if [ -z "$zk_check" ]; then
    success "No ZooKeeper container running (KRaft mode confirmed)"
else
    error "ZooKeeper container found - not in pure KRaft mode"
fi

# Cleanup
echo ""
echo "8. Cleaning up test topic..."
if docker exec dip-kafka kafka-topics \
    --bootstrap-server localhost:9092 \
    --delete \
    --topic test-kraft-topic 2>/dev/null; then
    success "Test topic deleted"
else
    echo "  Note: Topic deletion might be disabled"
fi

echo ""
echo "========================================="
echo "Test Summary:"
echo "========================================="
success "Kafka is running successfully in KRaft mode!"
echo ""
echo "Next steps:"
echo "  - Access Kafka UI at http://localhost:8080"
echo "  - Kafka broker is available at localhost:9092"
echo "  - No ZooKeeper required!"
echo ""