/**
 * Common Zod schemas used across services
 * Provides reusable validation patterns
 */

import { z } from "zod";

/**
 * UUID v4 schema
 */
export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

/**
 * ISO 8601 datetime schema
 */
export const DateTimeSchema = z.string().datetime();
export type DateTime = z.infer<typeof DateTimeSchema>;

/**
 * Email schema with additional validation
 */
export const EmailSchema = z.string().email().toLowerCase();
export type Email = z.infer<typeof EmailSchema>;

/**
 * URL schema
 */
export const URLSchema = z.string().url();
export type URL = z.infer<typeof URLSchema>;

/**
 * Pagination parameters
 */
export const PaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type Pagination = z.infer<typeof PaginationSchema>;

/**
 * Paginated response wrapper
 */
export const PaginatedResponseSchema = <T extends z.ZodSchema>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      total: z.number(),
      totalPages: z.number(),
      hasNext: z.boolean(),
      hasPrevious: z.boolean(),
    }),
  });

/**
 * Error response
 */
export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  timestamp: DateTimeSchema,
  service: z.string().optional(),
  correlationId: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Success response wrapper
 */
export const SuccessResponseSchema = <T extends z.ZodSchema>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    timestamp: DateTimeSchema,
    correlationId: z.string().optional(),
  });

/**
 * API response wrapper (success or error)
 */
export const ApiResponseSchema = <T extends z.ZodSchema>(dataSchema: T) =>
  z.union([
    SuccessResponseSchema(dataSchema),
    ErrorResponseSchema,
  ]);

/**
 * Environment variables schema
 */
export const EnvSchema = z.object({
  // Service configuration
  SERVICE_NAME: z.string().min(1),
  SERVICE_VERSION: z.string().default("0.0.1"),
  SERVICE_PORT: z.string().transform(Number).pipe(z.number().int().positive()),
  METRICS_PORT: z.string().transform(Number).pipe(z.number().int().positive()).optional(),

  // Environment
  DENO_ENV: z.enum(["development", "staging", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Kafka configuration
  KAFKA_BROKERS: z.string().transform((val) => val.split(",")).optional(),
  KAFKA_CLIENT_ID: z.string().optional(),
  KAFKA_GROUP_ID: z.string().optional(),

  // Database configuration
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  // External services
  OLLAMA_URL: z.string().url().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // Security
  JWT_SECRET: z.string().min(32).optional(),
  API_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().transform((val) => val.split(",")).optional(),
});
export type Env = z.infer<typeof EnvSchema>;

/**
 * Validate and parse environment variables
 */
export function validateEnv(env: Record<string, string | undefined> = Deno.env.toObject()): Env {
  return EnvSchema.parse(env);
}

/**
 * Phone number validation (E.164 format)
 */
export const PhoneNumberSchema = z.string().regex(
  /^\+[1-9]\d{1,14}$/,
  "Invalid phone number format (use E.164 format)",
);
export type PhoneNumber = z.infer<typeof PhoneNumberSchema>;

/**
 * Color hex code
 */
export const HexColorSchema = z.string().regex(
  /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
  "Invalid hex color format",
);
export type HexColor = z.infer<typeof HexColorSchema>;

/**
 * File upload schema
 */
export const FileUploadSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().positive().max(10 * 1024 * 1024), // 10MB max
  data: z.string().optional(), // Base64 encoded
  url: URLSchema.optional(),
});
export type FileUpload = z.infer<typeof FileUploadSchema>;

/**
 * Coordinate schema
 */
export const CoordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type Coordinate = z.infer<typeof CoordinateSchema>;

/**
 * Address schema
 */
export const AddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postalCode: z.string().optional(),
  coordinates: CoordinateSchema.optional(),
});
export type Address = z.infer<typeof AddressSchema>;

/**
 * Time range schema
 */
export const TimeRangeSchema = z.object({
  start: DateTimeSchema,
  end: DateTimeSchema,
}).refine((data) => new Date(data.start) < new Date(data.end), {
  message: "Start time must be before end time",
});
export type TimeRange = z.infer<typeof TimeRangeSchema>;

/**
 * Metadata schema (flexible key-value pairs)
 */
export const MetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type Metadata = z.infer<typeof MetadataSchema>;

/**
 * Audit log entry
 */
export const AuditLogSchema = z.object({
  id: UUIDSchema.optional(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string(),
  userId: z.string().optional(),
  changes: z.record(z.unknown()).optional(),
  metadata: MetadataSchema.optional(),
  timestamp: DateTimeSchema,
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/**
 * Rate limit info
 */
export const RateLimitSchema = z.object({
  limit: z.number().int().positive(),
  remaining: z.number().int().min(0),
  reset: DateTimeSchema,
});
export type RateLimit = z.infer<typeof RateLimitSchema>;

/**
 * Health check status
 */
export const HealthStatusSchema = z.enum(["healthy", "degraded", "unhealthy"]);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Service info
 */
export const ServiceInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  environment: z.string(),
  uptime: z.number(),
  timestamp: DateTimeSchema,
});
export type ServiceInfo = z.infer<typeof ServiceInfoSchema>;
