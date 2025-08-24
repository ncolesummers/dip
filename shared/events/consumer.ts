/**
 * Kafka consumer abstraction for CloudEvents
 * Provides type-safe event consumption with automatic validation
 */

import { Consumer, ConsumerConfig, EachMessagePayload, Kafka } from "kafkajs";
import { z } from "zod";
import { TypedCloudEvent } from "./base.ts";
import { EventType } from "./types.ts";
import { commonMetrics } from "@observability/metrics.ts";

export interface ConsumerOptions {
  clientId: string;
  brokers: string[];
  groupId: string;
  topics: string[];
  fromBeginning?: boolean;
  sessionTimeout?: number;
  heartbeatInterval?: number;
  maxBytesPerPartition?: number;
  minBytes?: number;
  maxBytes?: number;
  maxWaitTimeInMs?: number;
  retry?: {
    initialRetryTime?: number;
    retries?: number;
    maxRetryTime?: number;
    factor?: number;
    multiplier?: number;
  };
}

export interface EventHandler<T = unknown> {
  eventType: EventType | EventType[];
  schema?: z.ZodSchema<T>;
  handler: (event: TypedCloudEvent<T>) => Promise<void>;
  onError?: (error: Error, event: TypedCloudEvent<T>) => Promise<void>;
}

export class CloudEventConsumer {
  private kafka: Kafka;
  private consumer: Consumer;
  private handlers: Map<EventType, EventHandler[]> = new Map();
  private running = false;
  private options: ConsumerOptions;

  constructor(options: ConsumerOptions) {
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

    const consumerConfig: ConsumerConfig = {
      groupId: options.groupId,
      sessionTimeout: options.sessionTimeout || 30000,
      heartbeatInterval: options.heartbeatInterval || 3000,
      maxBytesPerPartition: options.maxBytesPerPartition || 1048576, // 1MB
      minBytes: options.minBytes || 1,
      maxBytes: options.maxBytes || 10485760, // 10MB
      maxWaitTimeInMs: options.maxWaitTimeInMs || 5000,
    };

    this.consumer = this.kafka.consumer(consumerConfig);
  }

  /**
   * Register an event handler
   */
  on<T>(handler: EventHandler<T>): void {
    const eventTypes = Array.isArray(handler.eventType) ? handler.eventType : [handler.eventType];

    for (const eventType of eventTypes) {
      const handlers = this.handlers.get(eventType) || [];
      handlers.push(handler as EventHandler);
      this.handlers.set(eventType, handlers);
    }
  }

  /**
   * Start consuming messages
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error("Consumer is already running");
    }

    await this.consumer.connect();

    // Subscribe to topics
    for (const topic of this.options.topics) {
      await this.consumer.subscribe({
        topic,
        fromBeginning: this.options.fromBeginning ?? false,
      });
    }

    this.running = true;

    // Start consuming
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    console.log(`CloudEvent consumer started for topics: ${this.options.topics.join(", ")}`);
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    const startTime = Date.now();

    try {
      // Parse the message
      const messageValue = message.value?.toString();
      if (!messageValue) {
        console.error("Received empty message");
        return;
      }

      // Parse CloudEvent
      const cloudEvent = TypedCloudEvent.fromJSON(messageValue);
      const eventType = cloudEvent.getAttribute("type") as EventType;

      // Track metrics
      commonMetrics.kafkaMessagesConsumed.inc({
        topic,
        status: "received",
      });

      // Find and execute handlers
      const handlers = this.handlers.get(eventType) || [];

      if (handlers.length === 0) {
        console.warn(`No handlers registered for event type: ${eventType}`);
        return;
      }

      for (const handler of handlers) {
        try {
          // Validate with schema if provided
          if (handler.schema) {
            const typedEvent = TypedCloudEvent.fromCloudEvent(
              cloudEvent.toCloudEvent(),
              handler.schema,
            );
            await handler.handler(typedEvent);
          } else {
            await handler.handler(cloudEvent);
          }

          // Track success
          commonMetrics.eventsProcessedTotal.inc({
            type: eventType,
            status: "success",
          });
        } catch (error) {
          console.error(`Error processing event ${eventType}:`, error);

          // Track failure
          commonMetrics.eventsProcessedTotal.inc({
            type: eventType,
            status: "failure",
          });

          // Call error handler if provided
          if (handler.onError) {
            await handler.onError(error as Error, cloudEvent);
          }

          throw error;
        }
      }

      // Track processing duration
      const duration = (Date.now() - startTime) / 1000;
      commonMetrics.eventProcessingDuration.observe({ type: eventType }, duration);
    } catch (error) {
      console.error("Error processing message:", error);

      // Track consumer error
      commonMetrics.kafkaMessagesConsumed.inc({
        topic,
        status: "error",
      });

      // Rethrow to trigger Kafka retry mechanism
      throw error;
    }
  }

  /**
   * Stop consuming messages
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    await this.consumer.disconnect();
    console.log("CloudEvent consumer stopped");
  }

  /**
   * Pause consumption
   */
  pause(): void {
    const assignments = this.consumer.assignment();
    if (assignments && assignments.length > 0) {
      this.consumer.pause(assignments);
      console.log("Consumer paused");
    }
  }

  /**
   * Resume consumption
   */
  resume(): void {
    const assignments = this.consumer.assignment();
    if (assignments && assignments.length > 0) {
      this.consumer.resume(assignments);
      console.log("Consumer resumed");
    }
  }

  /**
   * Commit offsets manually
   */
  async commitOffsets(): Promise<void> {
    await this.consumer.commitOffsets([]);
  }

  /**
   * Seek to specific offset
   */
  async seek(topic: string, partition: number, offset: string): Promise<void> {
    await this.consumer.seek({ topic, partition, offset });
  }

  /**
   * Get consumer metrics
   */
  getMetrics(): unknown {
    return this.consumer.describeGroup();
  }

  /**
   * Check if consumer is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get registered handlers
   */
  getHandlers(): Map<EventType, EventHandler[]> {
    return this.handlers;
  }
}

/**
 * Create a consumer with common configuration
 */
export function createConsumer(
  serviceName: string,
  topics: string[],
  options?: Partial<ConsumerOptions>,
): CloudEventConsumer {
  const brokers = (Deno.env.get("KAFKA_BROKERS") || "localhost:9092").split(",");

  return new CloudEventConsumer({
    clientId: `${serviceName}-consumer`,
    groupId: `${serviceName}-group`,
    brokers,
    topics,
    fromBeginning: false,
    ...options,
  });
}

/**
 * Batch consumer for processing multiple messages at once
 */
export class BatchCloudEventConsumer extends CloudEventConsumer {
  private batchSize: number;
  private batchTimeout: number;
  private batch: TypedCloudEvent[] = [];
  private batchTimer?: number;
  private batchHandler?: (events: TypedCloudEvent[]) => Promise<void>;

  constructor(
    options: ConsumerOptions & {
      batchSize?: number;
      batchTimeout?: number;
    },
  ) {
    super(options);
    this.batchSize = options.batchSize || 100;
    this.batchTimeout = options.batchTimeout || 5000;
  }

  /**
   * Register batch handler
   */
  onBatch(handler: (events: TypedCloudEvent[]) => Promise<void>): void {
    this.batchHandler = handler;
  }

  /**
   * Process batch
   */
  private async processBatch(): Promise<void> {
    if (this.batch.length === 0 || !this.batchHandler) {
      return;
    }

    const batchToProcess = [...this.batch];
    this.batch = [];

    try {
      await this.batchHandler(batchToProcess);

      // Track batch metrics
      commonMetrics.eventsProcessedTotal.inc({
        type: "batch",
        status: "success",
      }, batchToProcess.length);
    } catch (error) {
      console.error("Error processing batch:", error);

      // Track batch error
      commonMetrics.eventsProcessedTotal.inc({
        type: "batch",
        status: "failure",
      }, batchToProcess.length);

      throw error;
    }
  }

  /**
   * Add event to batch
   */
  protected async addToBatch(event: TypedCloudEvent): Promise<void> {
    this.batch.push(event);

    // Process if batch is full
    if (this.batch.length >= this.batchSize) {
      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
        this.batchTimer = undefined;
      }
      await this.processBatch();
    } else if (!this.batchTimer) {
      // Set timeout for batch processing
      this.batchTimer = setTimeout(async () => {
        this.batchTimer = undefined;
        await this.processBatch();
      }, this.batchTimeout);
    }
  }

  /**
   * Stop consumer and process remaining batch
   */
  async stop(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    await this.processBatch();
    await super.stop();
  }
}
