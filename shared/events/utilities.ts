/**
 * Event processing utilities for enhanced TypedCloudEvent
 * Provides helper functions for routing, filtering, batching, and replay
 */

import { TraceContext, TypedCloudEvent } from "./enhanced-base.ts";
import { EventPriority, EventType } from "./types.ts";

// ============================================================================
// EVENT FILTERING AND ROUTING
// ============================================================================

/**
 * Event filter function type
 */
export type EventFilter<T = unknown> = (event: TypedCloudEvent<T>) => boolean;

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (
  event: TypedCloudEvent<T>,
) => void | Promise<void>;

/**
 * Event router configuration
 */
export interface RouterConfig {
  routes: RouteDefinition[];
  defaultHandler?: EventHandler;
  errorHandler?: (error: Error, event: TypedCloudEvent) => void;
  concurrency?: number;
}

/**
 * Route definition
 */
export interface RouteDefinition {
  filter: EventFilter;
  handler: EventHandler;
  priority?: number;
  name?: string;
}

/**
 * Event router for pattern-based routing
 */
export class EventRouter {
  private routes: RouteDefinition[] = [];
  private defaultHandler?: EventHandler;
  private errorHandler?: (error: Error, event: TypedCloudEvent) => void;
  private concurrency: number;
  private activeHandlers = 0;
  private queue: Array<{ event: TypedCloudEvent; resolve: () => void }> = [];

  constructor(config: RouterConfig) {
    this.routes = config.routes.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    this.defaultHandler = config.defaultHandler;
    this.errorHandler = config.errorHandler;
    this.concurrency = config.concurrency || 10;
  }

  /**
   * Route an event to appropriate handlers
   */
  route(event: TypedCloudEvent): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ event, resolve });
      this.processQueue();
    });
  }

  /**
   * Process queued events
   */
  private processQueue(): void {
    while (this.queue.length > 0 && this.activeHandlers < this.concurrency) {
      const item = this.queue.shift();
      if (!item) break;

      this.activeHandlers++;
      this.handleEvent(item.event)
        .finally(() => {
          this.activeHandlers--;
          item.resolve();
          this.processQueue();
        });
    }
  }

  /**
   * Handle a single event
   */
  private async handleEvent(event: TypedCloudEvent): Promise<void> {
    try {
      let handled = false;

      for (const route of this.routes) {
        if (route.filter(event)) {
          await route.handler(event);
          handled = true;
          break; // First match wins
        }
      }

      if (!handled && this.defaultHandler) {
        await this.defaultHandler(event);
      }
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler(error as Error, event);
      } else {
        throw error;
      }
    }
  }

  /**
   * Add a new route
   */
  addRoute(route: RouteDefinition): void {
    this.routes.push(route);
    this.routes.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Remove a route by name
   */
  removeRoute(name: string): void {
    this.routes = this.routes.filter((r) => r.name !== name);
  }

  /**
   * Get router statistics
   */
  getStats() {
    return {
      totalRoutes: this.routes.length,
      activeHandlers: this.activeHandlers,
      queuedEvents: this.queue.length,
      concurrency: this.concurrency,
    };
  }
}

// ============================================================================
// EVENT FILTERING HELPERS
// ============================================================================

/**
 * Common event filters
 */
export class EventFilters {
  /**
   * Filter by event type
   */
  static byType(type: EventType | EventType[]): EventFilter {
    const types = Array.isArray(type) ? type : [type];
    return (event) => types.includes(event.getAttribute("type") as EventType);
  }

  /**
   * Filter by source
   */
  static bySource(source: string | string[]): EventFilter {
    const sources = Array.isArray(source) ? source : [source];
    return (event) => sources.includes(event.getAttribute("source"));
  }

  /**
   * Filter by subject pattern
   */
  static bySubject(pattern: RegExp | string): EventFilter {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    return (event) => {
      const subject = event.getAttribute("subject");
      return subject ? regex.test(subject) : false;
    };
  }

  /**
   * Filter by priority
   */
  static byPriority(priority: EventPriority | EventPriority[]): EventFilter {
    const priorities = Array.isArray(priority) ? priority : [priority];
    return (event) => {
      const data = event.getData() as any;
      return data?.metadata?.priority && priorities.includes(data.metadata.priority);
    };
  }

  /**
   * Filter by age
   */
  static byAge(maxAgeMs: number): EventFilter {
    return (event) => {
      const time = event.getAttribute("time");
      if (!time) return false;
      const age = Date.now() - new Date(time).getTime();
      return age <= maxAgeMs;
    };
  }

  /**
   * Combine filters with AND logic
   */
  static and(...filters: EventFilter[]): EventFilter {
    return (event) => filters.every((filter) => filter(event));
  }

  /**
   * Combine filters with OR logic
   */
  static or(...filters: EventFilter[]): EventFilter {
    return (event) => filters.some((filter) => filter(event));
  }

  /**
   * Negate a filter
   */
  static not(filter: EventFilter): EventFilter {
    return (event) => !filter(event);
  }
}

// ============================================================================
// EVENT BATCHING
// ============================================================================

/**
 * Batch configuration
 */
export interface BatchConfig {
  maxSize: number;
  maxWaitMs: number;
  handler: (events: TypedCloudEvent[]) => void | Promise<void>;
  errorHandler?: (error: Error, events: TypedCloudEvent[]) => void;
}

/**
 * Event batcher for efficient bulk processing
 */
export class EventBatcher {
  private batch: TypedCloudEvent[] = [];
  private config: BatchConfig;
  private timer?: number;
  private processing = false;

  constructor(config: BatchConfig) {
    this.config = config;
  }

  /**
   * Add event to batch
   */
  add(event: TypedCloudEvent): void {
    this.batch.push(event);

    if (this.batch.length >= this.config.maxSize) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.config.maxWaitMs);
    }
  }

  /**
   * Flush the current batch
   */
  async flush(): Promise<void> {
    if (this.processing || this.batch.length === 0) return;

    this.processing = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }

    const events = [...this.batch];
    this.batch = [];

    try {
      await this.config.handler(events);
    } catch (error) {
      if (this.config.errorHandler) {
        this.config.errorHandler(error as Error, events);
      } else {
        throw error;
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get batch statistics
   */
  getStats() {
    return {
      currentBatchSize: this.batch.length,
      maxBatchSize: this.config.maxSize,
      processing: this.processing,
      hasTimer: !!this.timer,
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.batch = [];
  }
}

// ============================================================================
// EVENT REPLAY
// ============================================================================

/**
 * Event replay configuration
 */
export interface ReplayConfig {
  events: TypedCloudEvent[];
  handler: EventHandler;
  speed?: number; // 1 = normal, 2 = 2x speed, 0.5 = half speed
  preserveTiming?: boolean;
  filter?: EventFilter;
  onComplete?: () => void;
  onError?: (error: Error, event: TypedCloudEvent) => void;
}

/**
 * Event replayer for testing and debugging
 */
export class EventReplayer {
  private config: ReplayConfig;
  private playing = false;
  private currentIndex = 0;
  private startTime?: number;
  private timers: number[] = [];

  constructor(config: ReplayConfig) {
    this.config = {
      speed: 1,
      preserveTiming: true,
      ...config,
    };
  }

  /**
   * Start replay
   */
  async start(): Promise<void> {
    if (this.playing) return;

    this.playing = true;
    this.currentIndex = 0;
    this.startTime = Date.now();

    const events = this.config.filter
      ? this.config.events.filter(this.config.filter)
      : this.config.events;

    if (!this.config.preserveTiming) {
      // Process all events immediately
      for (const event of events) {
        if (!this.playing) break;
        await this.processEvent(event);
      }
      this.complete();
    } else {
      // Schedule events based on their timestamps
      this.scheduleEvents(events);
    }
  }

  /**
   * Schedule events based on timing
   */
  private scheduleEvents(events: TypedCloudEvent[]): void {
    if (events.length === 0) {
      this.complete();
      return;
    }

    const firstTime = new Date(events[0].getAttribute("time")!).getTime();

    for (const event of events) {
      const eventTime = new Date(event.getAttribute("time")!).getTime();
      const delay = (eventTime - firstTime) / (this.config.speed || 1);

      const timer = setTimeout(async () => {
        if (this.playing) {
          await this.processEvent(event);
          this.currentIndex++;

          if (this.currentIndex >= events.length) {
            this.complete();
          }
        }
      }, delay);

      this.timers.push(timer);
    }
  }

  /**
   * Process a single event
   */
  private async processEvent(event: TypedCloudEvent): Promise<void> {
    try {
      await this.config.handler(event);
    } catch (error) {
      if (this.config.onError) {
        this.config.onError(error as Error, event);
      } else {
        throw error;
      }
    }
  }

  /**
   * Stop replay
   */
  stop(): void {
    this.playing = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  /**
   * Pause replay
   */
  pause(): void {
    this.playing = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  /**
   * Resume replay
   */
  resume(): void {
    if (!this.playing && this.currentIndex < this.config.events.length) {
      this.playing = true;
      const remainingEvents = this.config.events.slice(this.currentIndex);

      if (this.config.preserveTiming) {
        this.scheduleEvents(remainingEvents);
      } else {
        this.start();
      }
    }
  }

  /**
   * Complete replay
   */
  private complete(): void {
    this.playing = false;
    this.timers = [];
    if (this.config.onComplete) {
      this.config.onComplete();
    }
  }

  /**
   * Get replay statistics
   */
  getStats() {
    return {
      playing: this.playing,
      currentIndex: this.currentIndex,
      totalEvents: this.config.events.length,
      elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
      speed: this.config.speed,
    };
  }
}

// ============================================================================
// EVENT STREAM UTILITIES
// ============================================================================

/**
 * Event stream processor using async iterators
 */
export class EventStream {
  private events: TypedCloudEvent[] = [];
  private subscribers: Array<(event: TypedCloudEvent) => void> = [];
  private closed = false;

  /**
   * Add event to stream
   */
  push(event: TypedCloudEvent): void {
    if (this.closed) throw new Error("Stream is closed");

    this.events.push(event);
    this.subscribers.forEach((subscriber) => subscriber(event));
  }

  /**
   * Create async iterator for the stream
   */
  async *[Symbol.asyncIterator](): AsyncIterator<TypedCloudEvent> {
    let index = 0;

    while (!this.closed || index < this.events.length) {
      if (index < this.events.length) {
        yield this.events[index++];
      } else {
        // Wait for new events
        await new Promise<void>((resolve) => {
          const subscriber = () => {
            this.subscribers = this.subscribers.filter((s) => s !== subscriber);
            resolve();
          };
          this.subscribers.push(subscriber);
        });
      }
    }
  }

  /**
   * Transform stream
   */
  map<T>(
    transformer: (event: TypedCloudEvent) => TypedCloudEvent<T>,
  ): EventStream {
    const newStream = new EventStream();

    (async () => {
      for await (const event of this) {
        newStream.push(transformer(event));
      }
      newStream.close();
    })();

    return newStream;
  }

  /**
   * Filter stream
   */
  filter(predicate: EventFilter): EventStream {
    const newStream = new EventStream();

    (async () => {
      for await (const event of this) {
        if (predicate(event)) {
          newStream.push(event);
        }
      }
      newStream.close();
    })();

    return newStream;
  }

  /**
   * Take first n events
   */
  take(n: number): EventStream {
    const newStream = new EventStream();
    let count = 0;

    (async () => {
      for await (const event of this) {
        if (count >= n) break;
        newStream.push(event);
        count++;
      }
      newStream.close();
    })();

    return newStream;
  }

  /**
   * Buffer events
   */
  buffer(size: number): EventStream {
    const newStream = new EventStream();
    let buffer: TypedCloudEvent[] = [];

    (async () => {
      for await (const event of this) {
        buffer.push(event);
        if (buffer.length >= size) {
          // Create a batch event
          const batchEvent = TypedCloudEvent.create({
            source: "event.stream.buffer",
            type: "batch",
            data: buffer.map((e) => e.toCloudEvent()),
          });
          newStream.push(batchEvent);
          buffer = [];
        }
      }

      // Flush remaining
      if (buffer.length > 0) {
        const batchEvent = TypedCloudEvent.create({
          source: "event.stream.buffer",
          type: "batch",
          data: buffer.map((e) => e.toCloudEvent()),
        });
        newStream.push(batchEvent);
      }

      newStream.close();
    })();

    return newStream;
  }

  /**
   * Close the stream
   */
  close(): void {
    this.closed = true;
    this.subscribers.forEach((subscriber) => subscriber(null as any));
    this.subscribers = [];
  }

  /**
   * Get stream statistics
   */
  getStats() {
    return {
      eventCount: this.events.length,
      subscriberCount: this.subscribers.length,
      closed: this.closed,
    };
  }
}

// ============================================================================
// EVENT PIPELINE
// ============================================================================

/**
 * Pipeline stage
 */
export interface PipelineStage<TIn = unknown, TOut = unknown> {
  name: string;
  process: (event: TypedCloudEvent<TIn>) => Promise<TypedCloudEvent<TOut> | null>;
  onError?: (error: Error, event: TypedCloudEvent<TIn>) => void;
}

/**
 * Event processing pipeline
 */
export class EventPipeline {
  private stages: PipelineStage[] = [];
  private metrics = new Map<string, { processed: number; errors: number; duration: number }>();

  /**
   * Add a stage to the pipeline
   */
  addStage<TIn, TOut>(stage: PipelineStage<TIn, TOut>): EventPipeline {
    this.stages.push(stage as PipelineStage);
    this.metrics.set(stage.name, { processed: 0, errors: 0, duration: 0 });
    return this;
  }

  /**
   * Process an event through the pipeline
   */
  async process(event: TypedCloudEvent): Promise<TypedCloudEvent | null> {
    let current: TypedCloudEvent | null = event;

    for (const stage of this.stages) {
      if (!current) break;

      const startTime = performance.now();
      const stageMetrics = this.metrics.get(stage.name)!;

      try {
        current = await stage.process(current);
        stageMetrics.processed++;
        stageMetrics.duration += performance.now() - startTime;
      } catch (error) {
        stageMetrics.errors++;

        if (stage.onError) {
          stage.onError(error as Error, current);
        } else {
          throw error;
        }

        return null;
      }
    }

    return current;
  }

  /**
   * Process multiple events
   */
  processMany(events: TypedCloudEvent[]): Promise<(TypedCloudEvent | null)[]> {
    return Promise.all(events.map((event) => this.process(event)));
  }

  /**
   * Get pipeline metrics
   */
  getMetrics() {
    const metrics: Record<string, any> = {};

    for (const [name, stats] of this.metrics) {
      metrics[name] = {
        ...stats,
        avgDuration: stats.processed > 0 ? stats.duration / stats.processed : 0,
        errorRate: stats.processed > 0 ? stats.errors / stats.processed : 0,
      };
    }

    return metrics;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    for (const [name] of this.metrics) {
      this.metrics.set(name, { processed: 0, errors: 0, duration: 0 });
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a trace context for distributed tracing
 */
export function createTraceContext(): TraceContext {
  return {
    traceId: crypto.randomUUID().replace(/-/g, ""),
    spanId: crypto.randomUUID().replace(/-/g, "").substring(0, 16),
    traceFlags: "01",
  };
}

/**
 * Extract correlation chain from an event
 */
export function getCorrelationChain(event: TypedCloudEvent): string[] {
  const chain: string[] = [event.getAttribute("id")];

  let correlationId = event.getCorrelationId();
  while (correlationId && !chain.includes(correlationId)) {
    chain.push(correlationId);
    correlationId = undefined; // Would need event store to continue chain
  }

  return chain;
}

/**
 * Calculate event age in milliseconds
 */
export function getEventAge(event: TypedCloudEvent): number {
  const time = event.getAttribute("time");
  if (!time) return 0;
  return Date.now() - new Date(time).getTime();
}

/**
 * Check if event is expired based on TTL
 */
export function isEventExpired(event: TypedCloudEvent, ttlMs: number): boolean {
  return getEventAge(event) > ttlMs;
}

/**
 * Group events by a key function
 */
export function groupEvents<K>(
  events: TypedCloudEvent[],
  keyFn: (event: TypedCloudEvent) => K,
): Map<K, TypedCloudEvent[]> {
  const groups = new Map<K, TypedCloudEvent[]>();

  for (const event of events) {
    const key = keyFn(event);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(event);
  }

  return groups;
}

/**
 * Sort events by time
 */
export function sortEventsByTime(
  events: TypedCloudEvent[],
  ascending = true,
): TypedCloudEvent[] {
  return [...events].sort((a, b) => {
    const timeA = new Date(a.getAttribute("time")!).getTime();
    const timeB = new Date(b.getAttribute("time")!).getTime();
    return ascending ? timeA - timeB : timeB - timeA;
  });
}

/**
 * Deduplicate events by ID
 */
export function deduplicateEvents(events: TypedCloudEvent[]): TypedCloudEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const id = event.getAttribute("id");
    if (seen.has(id)) {
      return false;
    }
    seen.add(id);
    return true;
  });
}
