/**
 * Enhanced TypedCloudEvent implementation with Deno-specific optimizations
 * and comprehensive observability features for production use
 */

import { CloudEventV1, ValidationError } from "cloudevents";
import { z } from "zod";
import { nanoid } from "nanoid";
import { Buffer } from "node:buffer";
import { CloudEventAttributesSchema } from "./base.ts";
import type { CloudEventAttributes } from "./base.ts";

// ============================================================================
// OBSERVABILITY INTERFACES
// ============================================================================

/**
 * Event metrics interface for tracking
 */
export interface EventMetrics {
  eventId: string;
  eventType: string;
  emittedAt: number;
  processedAt?: number;
  latencyMs?: number;
  size: number;
  validationDurationMs?: number;
  serializationDurationMs?: number;
  compressionRatio?: number;
}

/**
 * Trace context following W3C Trace Context standard
 */
export interface TraceContext {
  traceId: string;
  spanId: string;
  traceFlags?: string;
  traceState?: string;
}

/**
 * Event processing telemetry
 */
export interface EventTelemetry {
  metrics: EventMetrics;
  traceContext?: TraceContext;
  tags: Map<string, string>;
  annotations: Map<string, unknown>;
}

/**
 * Event observer interface for extensibility
 */
export interface EventObserver {
  onEventCreated?(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void;
  onEventValidated?(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void;
  onEventSerialized?(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void;
  onEventError?(error: Error, event?: TypedCloudEvent<unknown>): void;
}

// ============================================================================
// DENO KV INTEGRATION FOR DEDUPLICATION
// ============================================================================

/**
 * Event deduplication using Deno KV
 */
export class EventDeduplicator {
  private kv?: Deno.Kv;
  private readonly ttlMs: number;
  private readonly namespace: string[];

  constructor(ttlMs = 300000, namespace = ["events", "dedup"]) {
    this.ttlMs = ttlMs;
    this.namespace = namespace;
  }

  async init(): Promise<void> {
    if (!this.kv) {
      this.kv = await Deno.openKv();
    }
  }

  async isDuplicate(eventId: string): Promise<boolean> {
    if (!this.kv) await this.init();
    const key = [...this.namespace, eventId];
    const result = await this.kv!.get(key);
    return result.value !== null;
  }

  async markProcessed(eventId: string): Promise<void> {
    if (!this.kv) await this.init();
    const key = [...this.namespace, eventId];
    await this.kv!.set(key, Date.now(), { expireIn: this.ttlMs });
  }

  cleanup(): void {
    if (this.kv) {
      this.kv.close();
      this.kv = undefined;
    }
  }
}

// ============================================================================
// EVENT POOL FOR MEMORY EFFICIENCY
// ============================================================================

/**
 * Object pool for event instances to reduce GC pressure
 */
export class EventPool<T = unknown> {
  private pool: TypedCloudEvent<T>[] = [];
  private readonly maxSize: number;
  private created = 0;
  private reused = 0;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  acquire(event: CloudEventV1<T>, schema?: z.ZodSchema<T>): TypedCloudEvent<T> {
    if (this.pool.length > 0) {
      const instance = this.pool.pop()!;
      instance.reset(event, schema);
      this.reused++;
      return instance;
    }
    this.created++;
    return new TypedCloudEvent(event, schema);
  }

  release(event: TypedCloudEvent<T>): void {
    if (this.pool.length < this.maxSize) {
      event.clear();
      this.pool.push(event);
    }
  }

  getStats() {
    return {
      poolSize: this.pool.length,
      created: this.created,
      reused: this.reused,
      reuseRate: this.created > 0 ? this.reused / (this.created + this.reused) : 0,
    };
  }
}

// ============================================================================
// ENHANCED TYPED CLOUD EVENT
// ============================================================================

/**
 * Enhanced TypedCloudEvent with Deno optimizations and observability
 */
export class TypedCloudEvent<T = unknown> {
  private event: CloudEventV1<T>;
  private schema?: z.ZodSchema<T>;
  private telemetry: EventTelemetry;
  private signature?: string;
  private compressed?: Uint8Array;
  private static observers: Set<EventObserver> = new Set();
  private static deduplicator?: EventDeduplicator;
  private static readonly encoder = new TextEncoder();
  private static readonly decoder = new TextDecoder();

  constructor(event: CloudEventV1<T>, schema?: z.ZodSchema<T>) {
    const _startTime = performance.now();

    this.event = event;
    this.schema = schema;

    // Initialize telemetry
    this.telemetry = {
      metrics: {
        eventId: event.id,
        eventType: event.type,
        emittedAt: Date.now(),
        size: 0,
      },
      tags: new Map(),
      annotations: new Map(),
    };

    // Validate if schema provided
    if (schema && event.data !== undefined) {
      const validationStart = performance.now();
      this.validateData(event.data);
      this.telemetry.metrics.validationDurationMs = performance.now() - validationStart;
    }

    // Calculate event size
    this.telemetry.metrics.size = this.calculateSize();

    // Notify observers
    this.notifyObservers("onEventCreated");
  }

  /**
   * Reset event for pool reuse
   */
  reset(event: CloudEventV1<T>, schema?: z.ZodSchema<T>): void {
    this.event = event;
    this.schema = schema;
    this.signature = undefined;
    this.compressed = undefined;

    // Reset telemetry
    this.telemetry = {
      metrics: {
        eventId: event.id,
        eventType: event.type,
        emittedAt: Date.now(),
        size: this.calculateSize(),
      },
      tags: new Map(),
      annotations: new Map(),
    };
  }

  /**
   * Clear event data for pool storage
   */
  clear(): void {
    this.event = {} as CloudEventV1<T>;
    this.schema = undefined;
    this.signature = undefined;
    this.compressed = undefined;
    this.telemetry.tags.clear();
    this.telemetry.annotations.clear();
  }

  /**
   * Create with automatic deduplication check
   */
  static async createWithDedup<T>(
    attributes: Omit<CloudEventV1<T>, "id" | "time" | "specversion"> & {
      id?: string;
      time?: string;
    },
    schema?: z.ZodSchema<T>,
  ): Promise<TypedCloudEvent<T> | null> {
    const id = attributes.id || nanoid();

    // Check for duplicate
    if (TypedCloudEvent.deduplicator) {
      if (await TypedCloudEvent.deduplicator.isDuplicate(id)) {
        return null; // Event already processed
      }
    }

    const event = TypedCloudEvent.create(attributes, schema);

    // Mark as processed
    if (TypedCloudEvent.deduplicator) {
      await TypedCloudEvent.deduplicator.markProcessed(id);
    }

    return event;
  }

  /**
   * Create a new TypedCloudEvent with validated data
   */
  static create<T>(
    attributes: Omit<CloudEventV1<T>, "id" | "time" | "specversion"> & {
      id?: string;
      time?: string;
    },
    schema?: z.ZodSchema<T>,
  ): TypedCloudEvent<T> {
    const id = attributes.id || nanoid();
    const time = attributes.time || new Date().toISOString();

    const event: CloudEventV1<T> = {
      ...attributes,
      specversion: "1.0",
      id,
      time,
    } as CloudEventV1<T>;

    return new TypedCloudEvent(event, schema);
  }

  /**
   * Validate data against schema
   */
  private validateData(data: T): void {
    if (this.schema) {
      try {
        this.schema.parse(data);
        this.notifyObservers("onEventValidated");
      } catch (error) {
        if (error instanceof z.ZodError) {
          const validationError = new ValidationError(
            "Data validation failed",
            error.errors.map((e) => e.message),
          );
          this.notifyObservers("onEventError", validationError);
          throw validationError;
        }
        throw error;
      }
    }
  }

  /**
   * Calculate event size in bytes
   */
  private calculateSize(): number {
    const json = JSON.stringify(this.event);
    return TypedCloudEvent.encoder.encode(json).length;
  }

  /**
   * Sign event using Deno's crypto API
   */
  async sign(key: CryptoKey): Promise<void> {
    const data = TypedCloudEvent.encoder.encode(JSON.stringify(this.event));
    const signature = await crypto.subtle.sign(
      { name: "HMAC" },
      key,
      data,
    );
    this.signature = btoa(String.fromCharCode(...new Uint8Array(signature)));
    this.telemetry.annotations.set("signed", true);
  }

  /**
   * Verify event signature
   */
  async verify(key: CryptoKey): Promise<boolean> {
    if (!this.signature) return false;

    const data = TypedCloudEvent.encoder.encode(JSON.stringify(this.event));
    const signature = new Uint8Array(
      atob(this.signature).split("").map((c) => c.charCodeAt(0)),
    );

    return await crypto.subtle.verify(
      { name: "HMAC" },
      key,
      signature,
      data,
    );
  }

  /**
   * Compress event for efficient transport
   */
  async compress(): Promise<Uint8Array> {
    if (this.compressed) return this.compressed;

    const json = JSON.stringify(this.event);
    const input = TypedCloudEvent.encoder.encode(json);

    // Use CompressionStream API (available in Deno)
    const stream = new Response(input).body!
      .pipeThrough(new CompressionStream("gzip"));

    const compressed = await new Response(stream).arrayBuffer();
    this.compressed = new Uint8Array(compressed);

    // Calculate compression ratio
    this.telemetry.metrics.compressionRatio = input.length / this.compressed.length;

    return this.compressed;
  }

  /**
   * Decompress event
   */
  static async decompress<T>(
    compressed: Uint8Array,
    schema?: z.ZodSchema<T>,
  ): Promise<TypedCloudEvent<T>> {
    const stream = new Response(compressed).body!
      .pipeThrough(new DecompressionStream("gzip"));

    const decompressed = await new Response(stream).arrayBuffer();
    const json = TypedCloudEvent.decoder.decode(new Uint8Array(decompressed));
    const event = JSON.parse(json) as CloudEventV1<T>;

    return new TypedCloudEvent(event, schema);
  }

  /**
   * Serialize for Kafka with optimizations
   */
  async serializeForKafka(): Promise<Buffer> {
    const startTime = performance.now();

    // Compress if beneficial (> 1KB)
    if (this.telemetry.metrics.size > 1024) {
      const compressed = await this.compress();
      const result = Buffer.from(compressed);

      this.telemetry.metrics.serializationDurationMs = performance.now() - startTime;
      this.notifyObservers("onEventSerialized");

      return result;
    }

    // Small events: just convert to buffer
    const json = JSON.stringify(this.event);
    const result = Buffer.from(json);

    this.telemetry.metrics.serializationDurationMs = performance.now() - startTime;
    this.notifyObservers("onEventSerialized");

    return result;
  }

  /**
   * Add trace context for distributed tracing
   */
  addTraceContext(traceContext: TraceContext): void {
    const { traceId, spanId, traceFlags, traceState } = traceContext;

    // W3C Trace Context format
    const traceParent = `00-${traceId}-${spanId}-${traceFlags || "01"}`;
    (this.event as Record<string, unknown>).traceparent = traceParent;

    if (traceState) {
      (this.event as Record<string, unknown>).tracestate = traceState;
    }

    this.telemetry.traceContext = traceContext;
  }

  /**
   * Extract trace context
   */
  getTraceContext(): TraceContext | undefined {
    const traceParent = (this.event as Record<string, unknown>).traceparent as string;
    if (!traceParent) return undefined;

    const parts = traceParent.split("-");
    if (parts.length !== 4) return undefined;

    return {
      traceId: parts[1],
      spanId: parts[2],
      traceFlags: parts[3],
      traceState: (this.event as Record<string, unknown>).tracestate as string | undefined,
    };
  }

  /**
   * Add telemetry tag
   */
  addTag(key: string, value: string): void {
    this.telemetry.tags.set(key, value);
  }

  /**
   * Add telemetry annotation
   */
  addAnnotation(key: string, value: unknown): void {
    this.telemetry.annotations.set(key, value);
  }

  /**
   * Get telemetry data
   */
  getTelemetry(): EventTelemetry {
    // Update processing time if not set
    if (!this.telemetry.metrics.processedAt) {
      this.telemetry.metrics.processedAt = Date.now();
      this.telemetry.metrics.latencyMs = this.telemetry.metrics.processedAt -
        this.telemetry.metrics.emittedAt;
    }
    return this.telemetry;
  }

  /**
   * Notify observers
   */
  private notifyObservers(method: keyof EventObserver, error?: Error): void {
    for (const observer of TypedCloudEvent.observers) {
      try {
        if (method === "onEventError" && observer.onEventError) {
          observer.onEventError(error!, this);
        } else if (method !== "onEventError" && observer[method]) {
          (observer[method] as any)(this, this.telemetry);
        }
      } catch (err) {
        console.error(`Observer error in ${method}:`, err);
      }
    }
  }

  /**
   * Register global event observer
   */
  static addObserver(observer: EventObserver): void {
    TypedCloudEvent.observers.add(observer);
  }

  /**
   * Remove global event observer
   */
  static removeObserver(observer: EventObserver): void {
    TypedCloudEvent.observers.delete(observer);
  }

  /**
   * Set global deduplicator
   */
  static setDeduplicator(deduplicator: EventDeduplicator): void {
    TypedCloudEvent.deduplicator = deduplicator;
  }

  // ============================================================================
  // ORIGINAL METHODS (PRESERVED)
  // ============================================================================

  getData(): T | undefined {
    return this.event.data;
  }

  getParsedData(): T {
    if (this.schema && this.event.data !== undefined) {
      return this.schema.parse(this.event.data);
    }
    if (this.event.data === undefined) {
      throw new Error("Event has no data");
    }
    return this.event.data;
  }

  getAttributes(): CloudEventV1<T> {
    return this.event;
  }

  getAttribute<K extends keyof CloudEventV1<T>>(key: K): CloudEventV1<T>[K] {
    return this.event[key];
  }

  setCorrelationId(correlationId: string): void {
    (this.event as Record<string, unknown>).correlationid = correlationId;
    this.addTag("correlation_id", correlationId);
  }

  getCorrelationId(): string | undefined {
    return (this.event as Record<string, unknown>).correlationid as string | undefined;
  }

  setCausationId(causationId: string): void {
    (this.event as Record<string, unknown>).causationid = causationId;
    this.addTag("causation_id", causationId);
  }

  getCausationId(): string | undefined {
    return (this.event as Record<string, unknown>).causationid as string | undefined;
  }

  createResponse<R>(
    type: string,
    data: R,
    schema?: z.ZodSchema<R>,
  ): TypedCloudEvent<R> {
    const correlationId = this.getCorrelationId() || this.event.id;

    const responseEvent = TypedCloudEvent.create(
      {
        source: this.event.source,
        type,
        data,
        subject: this.event.subject,
        datacontenttype: "application/json",
      },
      schema,
    );

    responseEvent.setCorrelationId(correlationId);
    responseEvent.setCausationId(this.event.id);

    // Propagate trace context
    const traceContext = this.getTraceContext();
    if (traceContext) {
      // Generate new span ID for the response
      responseEvent.addTraceContext({
        ...traceContext,
        spanId: nanoid(16),
      });
    }

    return responseEvent;
  }

  toCloudEvent(): CloudEventV1<T> {
    return this.event;
  }

  toJSON(): string {
    return JSON.stringify(this.event);
  }

  static fromJSON<T>(json: string, schema?: z.ZodSchema<T>): TypedCloudEvent<T> {
    const event = JSON.parse(json) as CloudEventV1<T>;
    return new TypedCloudEvent(event, schema);
  }

  validate(): boolean {
    try {
      CloudEventAttributesSchema.parse(this.event);
      if (this.schema && this.event.data !== undefined) {
        this.schema.parse(this.event.data);
      }
      return true;
    } catch {
      return false;
    }
  }

  getValidationErrors(): z.ZodError | null {
    try {
      CloudEventAttributesSchema.parse(this.event);
      if (this.schema && this.event.data !== undefined) {
        this.schema.parse(this.event.data);
      }
      return null;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return error;
      }
      return null;
    }
  }

  clone(modifications?: Partial<CloudEventV1<T>>): TypedCloudEvent<T> {
    const clonedEvent = {
      ...this.event,
      ...modifications,
      id: modifications?.id || nanoid(),
      time: modifications?.time || new Date().toISOString(),
    };

    const cloned = new TypedCloudEvent(clonedEvent, this.schema);

    // Copy telemetry tags
    for (const [key, value] of this.telemetry.tags) {
      cloned.addTag(key, value);
    }

    return cloned;
  }

  isType(type: string): boolean {
    return this.event.type === type;
  }

  isFromSource(source: string): boolean {
    return this.event.source === source;
  }
}

// ============================================================================
// METRICS COLLECTOR
// ============================================================================

/**
 * Event metrics collector for observability
 */
export class EventMetricsCollector implements EventObserver {
  private metrics = new Map<string, number>();
  private histograms = new Map<string, number[]>();

  onEventCreated(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void {
    this.increment(`events.created.${event.getAttribute("type")}`);
    this.recordSize(event.getAttribute("type"), telemetry.metrics.size);
  }

  onEventValidated(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void {
    this.increment(`events.validated.${event.getAttribute("type")}`);
    if (telemetry.metrics.validationDurationMs) {
      this.recordLatency(
        `validation.${event.getAttribute("type")}`,
        telemetry.metrics.validationDurationMs,
      );
    }
  }

  onEventSerialized(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void {
    this.increment(`events.serialized.${event.getAttribute("type")}`);
    if (telemetry.metrics.serializationDurationMs) {
      this.recordLatency(
        `serialization.${event.getAttribute("type")}`,
        telemetry.metrics.serializationDurationMs,
      );
    }
    if (telemetry.metrics.compressionRatio) {
      this.record(
        `compression.ratio.${event.getAttribute("type")}`,
        telemetry.metrics.compressionRatio,
      );
    }
  }

  onEventError(_error: Error, event?: TypedCloudEvent<unknown>): void {
    const type = event ? event.getAttribute("type") : "unknown";
    this.increment(`events.errors.${type}`);
  }

  private increment(metric: string, value = 1): void {
    this.metrics.set(metric, (this.metrics.get(metric) || 0) + value);
  }

  private record(metric: string, value: number): void {
    this.metrics.set(metric, value);
  }

  private recordLatency(metric: string, ms: number): void {
    if (!this.histograms.has(metric)) {
      this.histograms.set(metric, []);
    }
    this.histograms.get(metric)!.push(ms);
  }

  private recordSize(eventType: string, bytes: number): void {
    this.record(`events.size.${eventType}`, bytes);
    this.recordLatency(`events.size.distribution.${eventType}`, bytes);
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  getHistograms(): Record<string, number[]> {
    return Object.fromEntries(this.histograms);
  }

  reset(): void {
    this.metrics.clear();
    this.histograms.clear();
  }
}

// ============================================================================
// STRUCTURED LOGGER
// ============================================================================

/**
 * Structured event logger for observability
 */
export class EventLogger implements EventObserver {
  private readonly logger: (message: string, data: Record<string, unknown>) => void;

  constructor(logger?: (message: string, data: Record<string, unknown>) => void) {
    this.logger = logger || ((msg, data) => console.log(JSON.stringify({ msg, ...data })));
  }

  onEventCreated(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void {
    this.logger("Event created", {
      eventId: event.getAttribute("id"),
      eventType: event.getAttribute("type"),
      source: event.getAttribute("source"),
      size: telemetry.metrics.size,
      tags: Object.fromEntries(telemetry.tags),
    });
  }

  onEventValidated(event: TypedCloudEvent<unknown>, telemetry: EventTelemetry): void {
    this.logger("Event validated", {
      eventId: event.getAttribute("id"),
      eventType: event.getAttribute("type"),
      validationDurationMs: telemetry.metrics.validationDurationMs,
    });
  }

  onEventError(error: Error, event?: TypedCloudEvent<unknown>): void {
    this.logger("Event error", {
      eventId: event?.getAttribute("id"),
      eventType: event?.getAttribute("type"),
      error: error.message,
      stack: error.stack,
    });
  }
}

// ============================================================================
// EXPORT DEFAULT SETUP
// ============================================================================

/**
 * Initialize event system with observability
 */
export async function initializeEventSystem(options?: {
  enableDeduplication?: boolean;
  dedupTtlMs?: number;
  enableMetrics?: boolean;
  enableLogging?: boolean;
  logger?: (message: string, data: Record<string, unknown>) => void;
}): Promise<void> {
  // Setup deduplication
  if (options?.enableDeduplication) {
    const deduplicator = new EventDeduplicator(options.dedupTtlMs);
    await deduplicator.init();
    TypedCloudEvent.setDeduplicator(deduplicator);
  }

  // Setup metrics collector
  if (options?.enableMetrics) {
    TypedCloudEvent.addObserver(new EventMetricsCollector());
  }

  // Setup structured logging
  if (options?.enableLogging) {
    TypedCloudEvent.addObserver(new EventLogger(options.logger));
  }
}

// Export everything needed
export type { CloudEventAttributes };
