# Kafka KRaft Mode Migration Guide

## Overview

We've migrated from ZooKeeper-based Kafka to KRaft mode (Kafka without ZooKeeper). This simplifies our architecture and improves performance.

## What Changed?

### Before (ZooKeeper Mode)

- 2 containers: `dip-zookeeper` + `dip-kafka`
- More complex configuration
- ~30% more resource usage
- ZooKeeper dependency for metadata

### After (KRaft Mode)

- 1 container: `dip-kafka` only
- Simpler configuration
- Better performance
- Self-contained metadata management

## How to Use the New Setup

### Starting Fresh (Recommended)

1. **Stop and remove old containers:**

```bash
cd docker
docker-compose down -v  # This removes old volumes
```

2. **Start KRaft-mode Kafka:**

```bash
docker-compose -f docker-compose.kraft.yml up -d
```

3. **Verify it's working:**

```bash
./scripts/test-kafka-kraft.sh
```

4. **Access Kafka UI:**
   Open http://localhost:8080 in your browser

### Switching Between Modes

If you need to switch back to ZooKeeper mode temporarily:

```bash
# Stop KRaft mode
docker-compose -f docker-compose.kraft.yml down

# Start ZooKeeper mode
docker-compose -f docker-compose.yml up -d
```

## Making KRaft the Default

Once you're confident with KRaft mode:

```bash
# Backup old configuration
mv docker-compose.yml docker-compose.zookeeper.yml

# Make KRaft the default
mv docker-compose.kraft.yml docker-compose.yml

# Now you can just use:
docker-compose up -d
```

## Key Differences for Developers

### Connection Strings

- **No change needed!** Still use `kafka:9092` or `localhost:9092`
- No ZooKeeper connection string needed anywhere

### Kafka CLI Commands

All commands now use `--bootstrap-server` instead of `--zookeeper`:

```bash
# Old way (ZooKeeper)
kafka-topics --zookeeper localhost:2181 --list

# New way (KRaft)
kafka-topics --bootstrap-server localhost:9092 --list
```

### Configuration

Services don't need any ZooKeeper-related configuration. Just Kafka bootstrap servers.

## Troubleshooting

### Issue: Kafka won't start

**Solution:** Make sure you've removed old volumes:

```bash
docker-compose down -v
docker volume prune  # Remove unused volumes
```

### Issue: Can't connect to Kafka

**Solution:** Check if Kafka is running:

```bash
docker ps | grep kafka
docker logs dip-kafka
```

### Issue: Kafka UI shows no brokers

**Solution:** Kafka UI might need a restart:

```bash
docker-compose restart kafka-ui
```

## Benefits of KRaft Mode

1. **Simpler Operations**: One less system to monitor and maintain
2. **Better Performance**: Lower latency, higher throughput
3. **Reduced Resources**: ~30% less memory and CPU usage
4. **Faster Startup**: Kafka starts more quickly
5. **Future-Proof**: ZooKeeper support ends in 2025

## Additional Resources

- [ADR-015: Adopt Kafka KRaft Mode](../docs/architecture/decisions/015-adopt-kafka-kraft-mode.md)
- [Official Kafka KRaft Documentation](https://kafka.apache.org/documentation/#kraft)
- [Test Script](./scripts/test-kafka-kraft.sh)

## Questions?

If you encounter any issues with the KRaft setup, please:

1. Check this guide first
2. Run the test script: `./scripts/test-kafka-kraft.sh`
3. Check Docker logs: `docker logs dip-kafka`
4. Open an issue if problems persist
