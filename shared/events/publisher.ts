/**
 * Kafka publisher abstraction for CloudEvents
 * Provides type-safe event publishing with automatic validation
 */

import { Kafka, Producer, ProducerConfig, ProducerRecord, RecordMetadata } from "kafkajs";
import { TypedCloudEvent } from "./base.ts";
import { EventType } from "./types.ts";
import { commonMetrics } from "@observability/metrics.ts";

export interface PublisherOptions {
  clientId: string;
  brokers: string[];
  defaultTopic?: string;
  acks?: -1 | 0 | 1;
  timeout?: number;
  compression?: "none" | "gzip" | "snappy" | "lz4" | "zstd";
  maxInFlightRequests?: number;
  idempotent?: boolean;
  transactionalId?: string;
  maxRetries?: number;
  retry?: {
    initialRetryTime?: number;
    retries?: number;
    maxRetryTime?: number;
    factor?: number;
    multiplier?: number;
  };
}

export interface PublishOptions {
  topic?: string;
  key?: string;
  partition?: number;
  headers?: Record<string, string>;
  timestamp?: string;
}

export class CloudEventPublisher {
  private kafka: Kafka;
  private producer: Producer;
  private options: PublisherOptions;
  private connected = false;

  constructor(options: PublisherOptions) {
    this.options = options;

    this.kafka = new Kafka({
      clientId: options.clientId,
      brokers: options.brokers,
      retry: options.retry || {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2,
      },
    });

    const producerConfig: ProducerConfig = {
      allowAutoTopicCreation: true,
      transactionTimeout: 60000,
      idempotent: options.idempotent ?? true,
      maxInFlightRequests: options.maxInFlightRequests ?? 5,
    };

    if (options.transactionalId) {
      producerConfig.transactionalId = options.transactionalId;
    }

    this.producer = this.kafka.producer(producerConfig);
  }

  /**
   * Connect to Kafka
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.producer.connect();
    this.connected = true;
    console.log(`CloudEvent publisher connected to Kafka`);
  }

  /**
   * Publish a single event
   */
  async publish<T>(
    event: TypedCloudEvent<T>,
    options?: PublishOptions,
  ): Promise<RecordMetadata[]> {
    if (!this.connected) {
      await this.connect();
    }

    const topic = options?.topic || this.options.defaultTopic;
    if (!topic) {
      throw new Error("No topic specified and no default topic configured");
    }

    const startTime = Date.now();
    const eventType = event.getAttribute("type") as EventType;

    try {
      // Prepare the message
      const record: ProducerRecord = {
        topic,
        messages: [
          {
            key: options?.key || event.getAttribute("id"),
            value: event.toJSON(),
            headers: this.prepareHeaders(event, options?.headers),
            timestamp: options?.timestamp,
            partition: options?.partition,
          },
        ],
        acks: this.options.acks ?? -1, // Wait for all replicas by default
        timeout: this.options.timeout ?? 30000,
        compression: this.mapCompression(this.options.compression),
      };

      // Send the message
      const metadata = await this.producer.send(record);

      // Track metrics
      commonMetrics.kafkaMessagesPublished.inc({
        topic,
        status: "success",
      });

      const duration = (Date.now() - startTime) / 1000;
      commonMetrics.eventProcessingDuration.observe({ type: eventType }, duration);

      console.log(`Published event ${eventType} to topic ${topic}`);
      return metadata;
    } catch (error) {
      console.error(`Failed to publish event ${eventType}:`, error);

      // Track failure
      commonMetrics.kafkaMessagesPublished.inc({
        topic,
        status: "failure",
      });

      throw error;
    }
  }

  /**
   * Publish multiple events in a batch
   */
  async publishBatch<T>(
    events: TypedCloudEvent<T>[],
    options?: PublishOptions,
  ): Promise<RecordMetadata[]> {
    if (!this.connected) {
      await this.connect();
    }

    const topic = options?.topic || this.options.defaultTopic;
    if (!topic) {
      throw new Error("No topic specified and no default topic configured");
    }

    const startTime = Date.now();

    try {
      // Prepare messages
      const messages = events.map((event) => ({
        key: options?.key || event.getAttribute("id"),
        value: event.toJSON(),
        headers: this.prepareHeaders(event, options?.headers),
        timestamp: options?.timestamp,
        partition: options?.partition,
      }));

      // Send batch
      const record: ProducerRecord = {
        topic,
        messages,
        acks: this.options.acks ?? -1,
        timeout: this.options.timeout ?? 30000,
        compression: this.mapCompression(this.options.compression),
      };

      const metadata = await this.producer.send(record);

      // Track metrics
      commonMetrics.kafkaMessagesPublished.inc(
        { topic, status: "success" },
        events.length,
      );

      const duration = (Date.now() - startTime) / 1000;
      console.log(`Published batch of ${events.length} events to topic ${topic} in ${duration}s`);

      return metadata;
    } catch (error) {
      console.error(`Failed to publish batch:`, error);

      // Track failure
      commonMetrics.kafkaMessagesPublished.inc(
        { topic, status: "failure" },
        events.length,
      );

      throw error;
    }
  }

  /**
   * Publish event with transaction
   */
  async publishWithTransaction<T>(
    events: TypedCloudEvent<T>[],
    options?: PublishOptions,
  ): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }

    if (!this.options.transactionalId) {
      throw new Error("Transactional ID not configured");
    }

    const topic = options?.topic || this.options.defaultTopic;
    if (!topic) {
      throw new Error("No topic specified and no default topic configured");
    }

    const transaction = await this.producer.transaction();

    try {
      // Send all events in transaction
      for (const event of events) {
        await transaction.send({
          topic,
          messages: [
            {
              key: options?.key || event.getAttribute("id"),
              value: event.toJSON(),
              headers: this.prepareHeaders(event, options?.headers),
            },
          ],
        });
      }

      // Commit transaction
      await transaction.commit();

      // Track metrics
      commonMetrics.kafkaMessagesPublished.inc(
        { topic, status: "success" },
        events.length,
      );

      console.log(`Published ${events.length} events in transaction to topic ${topic}`);
    } catch (error) {
      // Abort transaction on error
      await transaction.abort();

      // Track failure
      commonMetrics.kafkaMessagesPublished.inc(
        { topic, status: "failure" },
        events.length,
      );

      console.error("Transaction failed:", error);
      throw error;
    }
  }

  /**
   * Prepare headers for Kafka message
   */
  private prepareHeaders(
    event: TypedCloudEvent,
    additionalHeaders?: Record<string, string>,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "ce-specversion": "1.0",
      "ce-type": event.getAttribute("type") as string,
      "ce-source": event.getAttribute("source") as string,
      "ce-id": event.getAttribute("id") as string,
      "content-type": event.getAttribute("datacontenttype") || "application/json",
    };

    // Add optional CloudEvent attributes
    const subject = event.getAttribute("subject");
    if (subject) headers["ce-subject"] = subject;

    const time = event.getAttribute("time");
    if (time) headers["ce-time"] = time;

    // Add correlation and causation IDs
    const correlationId = event.getCorrelationId();
    if (correlationId) headers["ce-correlationid"] = correlationId;

    const causationId = event.getCausationId();
    if (causationId) headers["ce-causationid"] = causationId;

    // Add trace context
    const { traceParent, traceState } = event.getTraceContext();
    if (traceParent) headers["traceparent"] = traceParent;
    if (traceState) headers["tracestate"] = traceState;

    // Add additional headers
    if (additionalHeaders) {
      Object.assign(headers, additionalHeaders);
    }

    return headers;
  }

  /**
   * Map compression type
   */
  private mapCompression(compression?: string): number {
    switch (compression) {
      case "gzip":
        return 1;
      case "snappy":
        return 2;
      case "lz4":
        return 3;
      case "zstd":
        return 4;
      default:
        return 0; // None
    }
  }

  /**
   * Disconnect from Kafka
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.producer.disconnect();
    this.connected = false;
    console.log("CloudEvent publisher disconnected from Kafka");
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Create a publisher with common configuration
 */
export function createPublisher(
  serviceName: string,
  defaultTopic?: string,
  options?: Partial<PublisherOptions>,
): CloudEventPublisher {
  const brokers = (Deno.env.get("KAFKA_BROKERS") || "localhost:9092").split(",");

  return new CloudEventPublisher({
    clientId: `${serviceName}-producer`,
    brokers,
    defaultTopic,
    compression: "snappy",
    idempotent: true,
    ...options,
  });
}

/**
 * Publisher with retry and circuit breaker
 */
export class ResilientCloudEventPublisher extends CloudEventPublisher {
  private circuitBreakerState: "closed" | "open" | "half-open" = "closed";
  private failureCount = 0;
  private failureThreshold = 5;
  private resetTimeout = 60000; // 1 minute
  private lastFailureTime?: number;
  private retryAttempts = 3;
  private retryDelay = 1000;

  constructor(
    options: PublisherOptions & {
      failureThreshold?: number;
      resetTimeout?: number;
      retryAttempts?: number;
      retryDelay?: number;
    },
  ) {
    super(options);
    this.failureThreshold = options.failureThreshold || this.failureThreshold;
    this.resetTimeout = options.resetTimeout || this.resetTimeout;
    this.retryAttempts = options.retryAttempts || this.retryAttempts;
    this.retryDelay = options.retryDelay || this.retryDelay;
  }

  /**
   * Publish with circuit breaker and retry
   */
  async publish<T>(
    event: TypedCloudEvent<T>,
    options?: PublishOptions,
  ): Promise<RecordMetadata[]> {
    // Check circuit breaker
    if (this.circuitBreakerState === "open") {
      if (this.shouldResetCircuit()) {
        this.circuitBreakerState = "half-open";
      } else {
        throw new Error("Circuit breaker is open");
      }
    }

    // Try publishing with retry
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await super.publish(event, options);

        // Success - update circuit breaker
        if (this.circuitBreakerState === "half-open") {
          this.circuitBreakerState = "closed";
          this.failureCount = 0;
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Update failure count
        this.failureCount++;
        this.lastFailureTime = Date.now();

        // Check if circuit should open
        if (this.failureCount >= this.failureThreshold) {
          this.circuitBreakerState = "open";
          console.error("Circuit breaker opened due to failures");
          throw error;
        }

        // Wait before retry
        if (attempt < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying publish in ${delay}ms (attempt ${attempt}/${this.retryAttempts})`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Failed to publish after retries");
  }

  /**
   * Check if circuit should reset
   */
  private shouldResetCircuit(): boolean {
    if (!this.lastFailureTime) {
      return true;
    }
    return Date.now() - this.lastFailureTime > this.resetTimeout;
  }

  /**
   * Get circuit breaker state
   */
  getCircuitState(): string {
    return this.circuitBreakerState;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuit(): void {
    this.circuitBreakerState = "closed";
    this.failureCount = 0;
    this.lastFailureTime = undefined;
  }
}
