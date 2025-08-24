/**
 * TypedCloudEvent implementation with Zod validation
 * Provides type-safe CloudEvents with automatic schema validation
 */

import { CloudEventV1, ValidationError } from "cloudevents";
import { z } from "zod";
import { nanoid } from "nanoid";

/**
 * Base CloudEvent attributes schema
 */
export const CloudEventAttributesSchema = z.object({
  specversion: z.literal("1.0"),
  id: z.string().min(1),
  source: z.string().min(1),
  type: z.string().min(1),
  datacontenttype: z.string().optional().default("application/json"),
  dataschema: z.string().url().optional(),
  subject: z.string().optional(),
  time: z.string().datetime().optional(),
  correlationid: z.string().optional(),
  causationid: z.string().optional(),
  traceparent: z.string().optional(),
  tracestate: z.string().optional(),
});

export type CloudEventAttributes = z.infer<typeof CloudEventAttributesSchema>;

/**
 * TypedCloudEvent class with generic data type
 */
export class TypedCloudEvent<T = unknown> {
  private event: CloudEventV1<T>;
  private schema?: z.ZodSchema<T>;

  constructor(event: CloudEventV1<T>, schema?: z.ZodSchema<T>) {
    this.event = event;
    this.schema = schema;

    if (schema && event.data !== undefined) {
      this.validateData(event.data);
    }
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
      specversion: "1.0",
      id,
      time,
      ...attributes,
    };

    return new TypedCloudEvent(event, schema);
  }

  /**
   * Create from a raw CloudEvent with validation
   */
  static fromCloudEvent<T>(
    event: CloudEventV1<unknown>,
    schema: z.ZodSchema<T>,
  ): TypedCloudEvent<T> {
    const validatedData = schema.parse(event.data);
    const typedEvent: CloudEventV1<T> = {
      ...event,
      data: validatedData,
    };

    return new TypedCloudEvent(typedEvent, schema);
  }

  /**
   * Validate data against schema
   */
  private validateData(data: T): void {
    if (this.schema) {
      try {
        this.schema.parse(data);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError("Data validation failed", error.errors.map(e => e.message));
        }
        throw error;
      }
    }
  }

  /**
   * Get validated data
   */
  getData(): T | undefined {
    return this.event.data;
  }

  /**
   * Get parsed and validated data (throws if invalid)
   */
  getParsedData(): T {
    if (this.schema && this.event.data !== undefined) {
      return this.schema.parse(this.event.data);
    }
    if (this.event.data === undefined) {
      throw new Error("Event has no data");
    }
    return this.event.data;
  }

  /**
   * Get event attributes
   */
  getAttributes(): CloudEventV1<T> {
    return this.event;
  }

  /**
   * Get specific attribute
   */
  getAttribute<K extends keyof CloudEventV1<T>>(key: K): CloudEventV1<T>[K] {
    return this.event[key];
  }

  /**
   * Set correlation ID for event chaining
   */
  setCorrelationId(correlationId: string): void {
    (this.event as Record<string, unknown>).correlationid = correlationId;
  }

  /**
   * Get correlation ID
   */
  getCorrelationId(): string | undefined {
    return (this.event as Record<string, unknown>).correlationid as string | undefined;
  }

  /**
   * Set causation ID (ID of the event that caused this one)
   */
  setCausationId(causationId: string): void {
    (this.event as Record<string, unknown>).causationid = causationId;
  }

  /**
   * Get causation ID
   */
  getCausationId(): string | undefined {
    return (this.event as Record<string, unknown>).causationid as string | undefined;
  }

  /**
   * Create a response event with correlation
   */
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

    return responseEvent;
  }

  /**
   * Convert to plain CloudEvent
   */
  toCloudEvent(): CloudEventV1<T> {
    return this.event;
  }

  /**
   * Convert to JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.event);
  }

  /**
   * Parse from JSON string
   */
  static fromJSON<T>(json: string, schema?: z.ZodSchema<T>): TypedCloudEvent<T> {
    const event = JSON.parse(json) as CloudEventV1<T>;
    return new TypedCloudEvent(event, schema);
  }

  /**
   * Validate against CloudEvents spec
   */
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

  /**
   * Get validation errors
   */
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

  /**
   * Clone the event with optional modifications
   */
  clone(modifications?: Partial<CloudEventV1<T>>): TypedCloudEvent<T> {
    const clonedEvent = {
      ...this.event,
      ...modifications,
      id: modifications?.id || nanoid(),
      time: modifications?.time || new Date().toISOString(),
    };

    return new TypedCloudEvent(clonedEvent, this.schema);
  }

  /**
   * Check if event matches a specific type
   */
  isType(type: string): boolean {
    return this.event.type === type;
  }

  /**
   * Check if event is from a specific source
   */
  isFromSource(source: string): boolean {
    return this.event.source === source;
  }

  /**
   * Add trace context for distributed tracing
   */
  addTraceContext(traceParent: string, traceState?: string): void {
    (this.event as Record<string, unknown>).traceparent = traceParent;
    if (traceState) {
      (this.event as Record<string, unknown>).tracestate = traceState;
    }
  }

  /**
   * Get trace context
   */
  getTraceContext(): { traceParent?: string; traceState?: string } {
    return {
      traceParent: (this.event as Record<string, unknown>).traceparent as string | undefined,
      traceState: (this.event as Record<string, unknown>).tracestate as string | undefined,
    };
  }
}
