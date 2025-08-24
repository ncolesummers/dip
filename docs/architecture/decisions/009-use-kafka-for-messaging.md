# ADR-009: Use Apache Kafka for Message Bus

## Status

Accepted

## Context

Our event-driven architecture (ADR-007) requires a robust message broker that can:

- **Handle high throughput**: Process millions of events per day
- **Provide durability**: Events must not be lost
- **Enable replay**: Support event replay for recovery and debugging
- **Scale horizontally**: Add capacity without downtime
- **Guarantee ordering**: Maintain order within partitions
- **Support multiple consumers**: Fan-out to multiple services

Key requirements:

- At-least-once delivery semantics
- Message retention for audit and replay
- Partitioning for parallel processing
- Consumer group management
- High availability and fault tolerance

## Decision

We will use Apache Kafka as our central message bus for event streaming.

Implementation approach:

1. **Deploy Kafka cluster** with 3+ brokers for high availability
2. **Use topic-per-event-type** strategy for organization
3. **Implement partitioning** based on document/entity ID
4. **Configure retention** based on compliance requirements
5. **Use consumer groups** for service scaling

## Consequences

### Positive

- **Battle-Tested**: Proven at massive scale in production
- **High Throughput**: Handles millions of messages per second
- **Durability**: Persistent storage with replication
- **Replay Capability**: Messages retained for configured period
- **Ordering Guarantees**: Per-partition ordering maintained
- **Ecosystem**: Rich tooling and integration options
- **Stream Processing**: Kafka Streams for complex event processing

### Negative

- **Operational Complexity**: Requires ZooKeeper (until KRaft adoption)
- **Learning Curve**: Complex concepts (partitions, consumer groups, offsets)
- **Resource Intensive**: Requires significant memory and storage
- **Latency**: Not optimized for low-latency messaging

### Neutral

- **Java-Based**: JVM tuning may be required
- **Configuration Complexity**: Many tuning parameters
- **Monitoring Requirements**: Need comprehensive monitoring
- **Upgrade Process**: Requires careful planning

## Alternatives Considered

### RabbitMQ

Traditional message broker with AMQP support.

**Pros:**

- Simpler to operate
- Better for low-latency
- Flexible routing
- Good management UI

**Cons:**

- Lower throughput
- Less suitable for streaming
- Limited replay capability
- Smaller ecosystem

**Why not chosen:** Kafka's streaming capabilities and throughput better match our needs.

### Redis Streams

Redis-based streaming solution.

**Pros:**

- Simple setup
- Low latency
- Multi-purpose (cache + streams)
- Good for small scale

**Cons:**

- Limited durability
- Memory constraints
- Less mature for streaming
- Fewer features

**Why not chosen:** Lacks the durability and scale we require.

### NATS/NATS Streaming

Lightweight messaging system.

**Pros:**

- Very lightweight
- Simple protocol
- Good performance
- Easy clustering

**Cons:**

- Less mature ecosystem
- Limited persistence options
- Fewer enterprise features
- Smaller community

**Why not chosen:** Kafka's maturity and feature set better suit enterprise needs.

## Implementation Notes

### Topic Configuration

```bash
# Create topics with appropriate settings
kafka-topics --create \
  --topic dip.documents.ingested \
  --partitions 10 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config compression.type=snappy
```

### Producer Configuration

```typescript
// shared/events/kafka-producer.ts
const producer = new KafkaProducer({
  "metadata.broker.list": "kafka:9092",
  "compression.type": "snappy",
  "enable.idempotence": true,
  "acks": "all",
  "retries": 10,
  "max.in.flight.requests.per.connection": 5,
});
```

### Consumer Configuration

```typescript
// shared/events/kafka-consumer.ts
const consumer = new KafkaConsumer({
  "metadata.broker.list": "kafka:9092",
  "group.id": "classification-service",
  "enable.auto.commit": false,
  "auto.offset.reset": "earliest",
  "isolation.level": "read_committed",
});
```

### Topic Naming Convention

```
dip.[domain].[event-type]

Examples:
- dip.documents.ingested
- dip.documents.classified
- dip.routing.decided
- dip.responses.generated
```

### Monitoring Metrics

- Consumer lag per partition
- Production/consumption rate
- Broker disk usage
- Replication lag
- Failed message rate

## References

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [Kafka: The Definitive Guide](https://www.oreilly.com/library/view/kafka-the-definitive/9781491936153/)
- [Confluent Best Practices](https://docs.confluent.io/platform/current/kafka/deployment.html)
- [Kafka Performance Tuning](https://www.confluent.io/blog/kafka-fastest-messaging-system/)
