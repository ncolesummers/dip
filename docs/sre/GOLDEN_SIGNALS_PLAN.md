# Golden Signals Planning for DIP (Deno Intelligence Platform)

## Overview

The four golden signals—latency, traffic, errors, and saturation—provide the foundation for monitoring the health and performance of our event-driven microservices platform. This document defines what these signals mean in the context of DIP and establishes reasonable targets for each.

---

## 1. Latency

### Definition

For an event-driven system, latency encompasses multiple dimensions:

- **Event Processing Latency**: Time from event receipt to completion
- **HTTP Request Latency**: Time to respond to synchronous API calls
- **End-to-End Latency**: Total time from ticket submission to initial response
- **Queue Latency**: Time events spend waiting in Kafka topics

### Why This Matters

- Users expect rapid acknowledgment when submitting tickets
- Downstream services depend on timely event processing
- High latency compounds across the event chain, creating cascading delays
- Customer satisfaction directly correlates with response times

### Proposed Targets

#### Event Processing (per service)

- **p50**: < 100ms (typical events process quickly)
- **p95**: < 500ms (most events complete reasonably fast)
- **p99**: < 2000ms (occasional complex processing acceptable)
- **p99.9**: < 5000ms (rare edge cases with retries)

#### HTTP API Endpoints

- **p50**: < 50ms (simple validations and acknowledgments)
- **p95**: < 200ms (including database writes)
- **p99**: < 1000ms (handling peak load conditions)

#### End-to-End Processing

- **Ticket Acknowledgment**: < 100ms (HTTP 202 response)
- **Initial Classification**: < 5 seconds
- **Routing Decision**: < 10 seconds
- **First Auto-Response**: < 30 seconds

### Measurement Approach

```typescript
// Conceptual measurement points
- Ingestion: Track time from HTTP request to Kafka publish
- Processing: Track time from Kafka consume to event emission
- Database: Track query execution times
- External APIs: Track LLM inference latencies
```

### Dashboard Visualizations

1. **Latency Heatmap**: Shows distribution over time
2. **Percentile Graph**: p50, p95, p99 trends with SLO lines
3. **Service Comparison**: Side-by-side latency by service
4. **Slowest Operations**: Top 10 slowest event types
5. **Queue Time Distribution**: Histogram of Kafka wait times

---

## 2. Traffic

### Definition

Traffic in DIP encompasses:

- **Event Volume**: Messages flowing through Kafka topics
- **HTTP Requests**: API calls to service endpoints
- **Ticket Volume**: Business-level traffic metrics
- **Service Interactions**: Internal service-to-service calls

### Why This Matters

- Capacity planning requires understanding normal vs peak traffic
- Anomaly detection helps identify attacks or system issues
- Business metrics tie technical metrics to revenue/cost
- Traffic patterns reveal user behavior and system hotspots

### Expected Patterns

#### Daily Patterns

- **Business Hours Peak**: 2-3x baseline (9 AM - 5 PM local)
- **After-Hours Trough**: 0.3x baseline
- **Lunch Dip**: 0.7x baseline (12 PM - 1 PM)

#### Weekly Patterns

- **Monday Surge**: 1.5x normal (weekend backlog)
- **Friday Decline**: 0.8x normal (reduced activity)
- **Weekend Base**: 0.4x weekday average

#### Event Rates (per service)

- **Ingestion Service**: 10-100 tickets/second baseline
- **Classifier Service**: 1:1 with ingestion (all tickets classified)
- **Router Service**: 1:1 with classification
- **KB Search**: 0.3x ticket rate (30% require search)
- **Auto-Response**: 0.1x ticket rate (10% auto-resolved)

### Measurement Approach

```typescript
// Key metrics to track
- Events per second by type
- Requests per second by endpoint
- Concurrent connections
- Kafka partition throughput
- Business metrics (tickets by priority/source)
```

### Dashboard Visualizations

1. **Traffic Overview**: Combined event/HTTP traffic rates
2. **Service Flow Diagram**: Real-time flow between services
3. **Topic Throughput**: Kafka messages/sec per topic
4. **Business Metrics**: Tickets by priority, source, intent
5. **Capacity Gauges**: Current vs maximum capacity

---

## 3. Errors

### Definition

Errors in an event-driven system include:

- **Event Processing Failures**: Unable to process CloudEvents
- **Validation Errors**: Zod schema validation failures
- **Service Errors**: HTTP 5xx responses
- **Client Errors**: HTTP 4xx responses (still important to track)
- **Timeout Errors**: Operations exceeding deadlines
- **Dead Letter Events**: Permanently failed messages

### Why This Matters

- Errors directly impact user experience and data integrity
- High error rates indicate systemic issues requiring intervention
- Error budgets determine acceptable risk for changes
- Different error types require different response strategies

### Error Categories & Targets

#### Critical Errors (User-Impacting)

- **Target**: < 0.1% of requests
- **Examples**:
  - Ticket submission failures
  - Complete service outages
  - Data corruption events

#### Recoverable Errors (Self-Healing)

- **Target**: < 1% of events
- **Examples**:
  - Transient network failures
  - Temporary LLM timeouts
  - Kafka rebalancing errors

#### Validation Errors (Client Issues)

- **Target**: < 5% of requests (education opportunity)
- **Examples**:
  - Malformed ticket data
  - Missing required fields
  - Invalid event formats

#### Business Logic Errors

- **Target**: < 2% of processing
- **Examples**:
  - Unable to classify intent
  - No matching routing rules
  - Confidence below threshold

### Measurement Approach

```typescript
// Error tracking strategy
- HTTP status codes (4xx, 5xx)
- CloudEvent processing outcomes
- Zod validation error details
- Retry attempt counts
- Dead letter queue sizes
- Circuit breaker trips
```

### Dashboard Visualizations

1. **Error Rate Timeline**: Stacked by error type
2. **Service Error Matrix**: Grid showing errors by service/type
3. **Error Budget Burn**: Current vs allocated error budget
4. **Top Errors List**: Most frequent errors with counts
5. **Recovery Metrics**: Retry success rates, MTTR

---

## 4. Saturation

### Definition

Saturation indicates how "full" a service is:

- **CPU Utilization**: Processing capacity consumed
- **Memory Usage**: Heap and system memory consumption
- **Queue Depth**: Kafka consumer lag and backlogs
- **Connection Pools**: Database and HTTP connection usage
- **Thread/Worker Saturation**: Concurrent operation limits

### Why This Matters

- Saturation predicts when scaling is needed before failures occur
- High saturation leads to increased latency and errors
- Resource planning requires understanding saturation patterns
- Different resources saturate at different rates

### Saturation Thresholds

#### CPU Utilization

- **Healthy**: < 60% (normal operations)
- **Warning**: 60-80% (monitor closely)
- **Critical**: > 80% (scale immediately)
- **Target**: Maintain below 70% during peak

#### Memory Usage

- **Healthy**: < 70% of limit
- **Warning**: 70-85% of limit
- **Critical**: > 85% of limit
- **Target**: Stay below 75% to handle spikes

#### Queue Depth (Kafka Lag)

- **Healthy**: < 1000 messages behind
- **Warning**: 1000-5000 messages
- **Critical**: > 5000 messages
- **Target**: Process within 10 seconds of production

#### Connection Pools

- **Healthy**: < 50% utilized
- **Warning**: 50-75% utilized
- **Critical**: > 75% utilized
- **Target**: Maintain 2x headroom

#### Deno Worker Utilization

- **Healthy**: < 70% of max workers
- **Warning**: 70-90% of max workers
- **Critical**: > 90% of max workers

### Scaling Triggers

```typescript
// Auto-scaling rules based on saturation
if (cpu > 75% for 5 minutes) -> scale out
if (memory > 80% for 3 minutes) -> scale out
if (queue_lag > 5000 for 2 minutes) -> scale out
if (all metrics < 30% for 15 minutes) -> scale in
```

### Dashboard Visualizations

1. **Resource Utilization Grid**: CPU/Memory/Disk per service
2. **Queue Depth Graph**: Kafka lag over time with thresholds
3. **Saturation Score**: Combined 0-100 health score
4. **Scaling Events**: Timeline of scale up/down actions
5. **Predictive Graph**: Forecasted saturation based on trends

---

## Implementation Priority

### Phase 1: Foundation (MVP)

1. Basic latency tracking (p50, p95)
2. Simple traffic counters
3. Error rate monitoring
4. CPU/Memory basics

### Phase 2: Enhancement

1. Full percentile tracking (p99, p99.9)
2. Traffic pattern analysis
3. Error categorization
4. Queue depth monitoring

### Phase 3: Advanced

1. End-to-end tracing
2. Predictive scaling
3. Anomaly detection
4. Business metric correlation

---

## Tool Recommendations

### For Development/MVP

- **Metrics**: Built-in Prometheus client (already implemented)
- **Visualization**: Grafana Cloud free tier (10k series)
- **Logging**: Console with structured JSON
- **Tracing**: OpenTelemetry with Jaeger

### For Production

- **Metrics**: Prometheus + Thanos for long-term storage
- **Visualization**: Self-hosted Grafana with custom dashboards
- **Logging**: Loki for cost-effective log aggregation
- **Tracing**: Tempo for distributed tracing

---

## Success Criteria

A well-implemented golden signals monitoring system will:

1. **Detect issues within 2 minutes** of occurrence
2. **Provide clear problem localization** (which service, what type)
3. **Show business impact** (affected users, lost events)
4. **Enable data-driven decisions** (when to scale, what to optimize)
5. **Reduce MTTR by 50%** compared to log-based debugging

---

## Review Cycle

- **Weekly**: Review signal trends and anomalies
- **Monthly**: Adjust thresholds based on observed patterns
- **Quarterly**: Comprehensive review of targets and dashboards
- **Annually**: Full reassessment of golden signals strategy

---

_Note: These are proposed targets for discussion. Actual values should be adjusted based on:_

- _Real-world performance testing_
- _Business requirements and SLAs_
- _Infrastructure cost constraints_
- _Team operational capacity_
