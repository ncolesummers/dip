# ADR-015: Adopt Kafka KRaft Mode

## Status

Accepted

## Context

Apache Kafka has historically relied on Apache ZooKeeper for metadata management, cluster coordination, and configuration management. However, this dependency has several drawbacks:

- **Operational Complexity**: Managing two distributed systems (Kafka + ZooKeeper) increases operational overhead
- **Resource Usage**: ZooKeeper requires additional memory, CPU, and disk resources
- **Learning Curve**: Teams need expertise in both Kafka and ZooKeeper
- **Scalability Limitations**: ZooKeeper can become a bottleneck for large clusters
- **Additional Failure Points**: ZooKeeper issues can impact Kafka availability

The Kafka community developed KRaft (Kafka Raft) mode to eliminate the ZooKeeper dependency by implementing metadata management directly within Kafka using a Raft-based consensus protocol.

Key timeline considerations:

- KRaft became production-ready in Kafka 3.3 (October 2022)
- Kafka 3.9 (November 2024) is the last version supporting ZooKeeper
- Kafka 4.0 (March 2025) completely removes ZooKeeper support
- ZooKeeper support ends November 2025

Since we are in early development with no existing data or production dependencies, we have the opportunity to start directly with KRaft mode, avoiding future migration complexity.

## Decision

We will use Apache Kafka in KRaft mode from the beginning of the project, completely bypassing ZooKeeper.

Implementation approach:

1. **Use KRaft mode exclusively** in all environments (development, staging, production)
2. **Configure Kafka with combined roles** (broker + controller) for development simplicity
3. **Separate roles in production** when scaling beyond 3 nodes
4. **Use Confluent Platform 7.5.0+** which has stable KRaft support
5. **Document KRaft-specific operations** for team knowledge sharing

This decision supersedes ADR-009, updating it to specify KRaft mode instead of ZooKeeper-based Kafka.

## Consequences

### Positive

- **Simplified Architecture**: One less distributed system to manage
- **Reduced Resource Usage**: ~30% less memory and CPU overhead without ZooKeeper
- **Faster Startup**: Kafka starts more quickly without ZooKeeper coordination
- **Better Scalability**: KRaft can handle more partitions and metadata operations
- **Improved Performance**: Lower latency for metadata operations
- **Future-Proof**: No migration needed when ZooKeeper support is removed
- **Simpler Development**: Easier local development with fewer containers
- **Modern Stack**: Using latest Kafka architecture from the start

### Negative

- **Newer Technology**: Less operational experience in the community
- **Limited Documentation**: Fewer resources compared to ZooKeeper mode
- **Tool Compatibility**: Some older tools may not support KRaft mode
- **No Rollback Path**: Cannot switch back to ZooKeeper mode once committed

### Neutral

- **Different Operational Procedures**: Team needs to learn KRaft-specific operations
- **Configuration Changes**: Different configuration parameters than ZooKeeper mode
- **Monitoring Adjustments**: Some metrics and monitoring approaches differ
- **Training Required**: Team needs to understand KRaft concepts

## Alternatives Considered

### Start with ZooKeeper, Migrate Later

Traditional approach using ZooKeeper initially.

**Pros:**

- More documentation and community knowledge
- Proven in production for years
- All tools support it
- Familiar to most Kafka operators

**Cons:**

- Requires future migration (complex in production)
- More resources needed
- Additional operational complexity
- Technical debt from day one
- Migration required before November 2025

**Why not chosen:** Starting with legacy architecture when we have no existing constraints would create unnecessary technical debt.

### Use Alternative Message Brokers

Consider Redis Streams, RabbitMQ, or others.

**Pros:**

- Some are simpler to operate
- Different architectural approaches
- May have specific feature advantages

**Cons:**

- Less suitable for event streaming
- Smaller ecosystems
- Would require architectural changes
- Less scalable for our use case

**Why not chosen:** Kafka's event streaming capabilities are central to our architecture (see ADR-007).

## Implementation Notes

### Development Configuration

```yaml
# docker-compose.yml
kafka:
  image: confluentinc/cp-kafka:7.5.0
  environment:
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: "broker,controller"
    KAFKA_CONTROLLER_QUORUM_VOTERS: "1@kafka:9093"
    CLUSTER_ID: "7F983492C65A4A46AF546EQk"
    # No KAFKA_ZOOKEEPER_CONNECT needed!
```

### Key Configuration Differences

**Removed (ZooKeeper-specific):**

- `KAFKA_ZOOKEEPER_CONNECT`
- `zookeeper.connection.timeout.ms`
- `zookeeper.session.timeout.ms`

**Added (KRaft-specific):**

- `KAFKA_NODE_ID`: Unique identifier for each node
- `KAFKA_PROCESS_ROLES`: Can be broker, controller, or both
- `KAFKA_CONTROLLER_QUORUM_VOTERS`: List of controller nodes
- `CLUSTER_ID`: Must be consistent across all nodes

### Operational Changes

1. **Cluster Initialization**: Use `kafka-storage format` instead of ZooKeeper initialization
2. **Metadata Management**: Stored in Kafka's log segments, not ZooKeeper znodes
3. **Configuration Updates**: Use `kafka-configs` with `--bootstrap-server` instead of `--zookeeper`
4. **Topic Management**: All commands use `--bootstrap-server`, never `--zookeeper`

### Monitoring Considerations

- Monitor controller metrics instead of ZooKeeper metrics
- Track metadata log size and growth
- Watch for controller election events
- Monitor quorum health metrics

### Migration Path for Existing Services

Since we're starting fresh:

1. All new services use `kafka:9092` for bootstrap servers
2. No ZooKeeper client libraries needed
3. Simplified connection configuration
4. No migration needed - we start with KRaft

## References

- [KIP-500: Replace ZooKeeper with a Self-Managed Metadata Quorum](https://cwiki.apache.org/confluence/display/KAFKA/KIP-500%3A+Replace+ZooKeeper+with+a+Self-Managed+Metadata+Quorum)
- [Kafka KRaft Documentation](https://kafka.apache.org/documentation/#kraft)
- [Confluent KRaft Documentation](https://docs.confluent.io/platform/current/kafka/kraft.html)
- [Kafka Without ZooKeeper: KRaft Mode](https://www.confluent.io/blog/kafka-without-zookeeper-a-sneak-peek/)
- [KRaft: The Future of Kafka](https://developer.confluent.io/learn/kraft/)
