/**
 * Input validation schemas for the Ingestion Service
 * Provides comprehensive validation for incoming support ticket data
 */

import { z } from "zod";
import { 
  TicketSchema,
  CustomerSchema,
  TicketPrioritySchema,
  TicketChannelSchema 
} from "../../shared/events/schemas.ts";

// ============================================================================
// REQUEST VALIDATION SCHEMAS
// ============================================================================

/**
 * Ingest ticket request schema
 * Validates incoming ticket data with required and optional fields
 */
export const IngestTicketRequestSchema = z.object({
  // Required ticket information
  subject: z.string()
    .min(1, "Subject is required")
    .max(200, "Subject must be 200 characters or less")
    .trim(),
  
  description: z.string()
    .min(1, "Description is required")
    .max(10000, "Description must be 10000 characters or less")
    .trim(),

  // Customer information (required)
  customer: z.object({
    email: z.string()
      .email("Invalid email format")
      .max(254, "Email must be 254 characters or less")
      .toLowerCase(),
    
    name: z.string()
      .min(1, "Customer name is required")
      .max(100, "Customer name must be 100 characters or less")
      .trim(),
    
    phone: z.string()
      .regex(/^[\+]?[1-9][\d]{0,15}$/, "Invalid phone number format")
      .optional(),
    
    company: z.string()
      .max(100, "Company name must be 100 characters or less")
      .trim()
      .optional(),
    
    tier: z.enum(["free", "basic", "premium", "enterprise"])
      .default("free")
      .optional()
      .transform(val => val ?? "free"),
    
    language: z.string()
      .length(2, "Language code must be 2 characters")
      .toLowerCase()
      .default("en")
      .optional()
      .transform(val => val ?? "en"),
    
    timezone: z.string()
      .regex(/^[A-Za-z_]+\/[A-Za-z_]+$/, "Invalid timezone format")
      .optional(),
    
    custom_fields: z.record(z.string(), z.unknown())
      .optional()
  }),

  // Optional ticket metadata
  priority: TicketPrioritySchema
    .default("medium")
    .optional()
    .transform(val => val ?? "medium"),

  channel: TicketChannelSchema
    .default("api")
    .optional()
    .transform(val => val ?? "api"),

  external_id: z.string()
    .max(100, "External ID must be 100 characters or less")
    .optional(),

  category: z.string()
    .max(50, "Category must be 50 characters or less")
    .trim()
    .optional(),

  subcategory: z.string()
    .max(50, "Subcategory must be 50 characters or less")
    .trim()
    .optional(),

  tags: z.array(z.string().max(30).trim())
    .max(10, "Maximum 10 tags allowed")
    .default([])
    .optional()
    .transform(val => val ?? []),

  due_date: z.string()
    .datetime("Invalid due date format")
    .optional(),

  // File attachments
  attachments: z.array(z.object({
    filename: z.string()
      .min(1, "Filename is required")
      .max(255, "Filename must be 255 characters or less"),
    
    content_type: z.string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/, "Invalid content type"),
    
    size_bytes: z.number()
      .positive("File size must be positive")
      .max(25 * 1024 * 1024, "File size must be less than 25MB"), // 25MB limit
    
    url: z.string()
      .url("Invalid attachment URL"),
    
    checksum: z.string()
      .optional()
  }))
  .max(5, "Maximum 5 attachments allowed")
  .optional(),

  custom_fields: z.record(z.string(), z.unknown())
    .optional(),

  // Request metadata
  source_system: z.string()
    .max(50, "Source system must be 50 characters or less")
    .default("api")
    .optional()
    .transform(val => val ?? "api"),

  raw_content: z.string()
    .max(50000, "Raw content must be 50000 characters or less")
    .optional()
});

/**
 * Rate limiting configuration schema
 */
export const RateLimitConfigSchema = z.object({
  maxRequests: z.number().positive().default(100),
  windowMs: z.number().positive().default(60 * 1000), // 1 minute
  skipSuccessfulRequests: z.boolean().default(false),
  skipFailedRequests: z.boolean().default(false),
  keyGenerator: z.function().optional()
});

/**
 * Deduplication configuration schema  
 */
export const DeduplicationConfigSchema = z.object({
  enabled: z.boolean().default(true),
  ttlMs: z.number().positive().default(5 * 60 * 1000), // 5 minutes
  keyFields: z.array(z.string()).default(["subject", "customer.email", "description"])
});

/**
 * Service status response schema
 */
export const ServiceStatusResponseSchema = z.object({
  service: z.string(),
  version: z.string(),
  status: z.enum(["operational", "degraded", "maintenance", "outage"]),
  uptime: z.number().nonnegative(),
  metrics: z.object({
    totalRequests: z.number().nonnegative(),
    successfulRequests: z.number().nonnegative(),
    failedRequests: z.number().nonnegative(),
    averageLatencyMs: z.number().nonnegative(),
    p95LatencyMs: z.number().nonnegative(),
    rateLimitedRequests: z.number().nonnegative(),
    duplicateRequests: z.number().nonnegative()
  }),
  timestamp: z.string().datetime()
});

// ============================================================================
// RESPONSE SCHEMAS
// ============================================================================

/**
 * Successful ingest response schema
 */
export const IngestSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    ticketId: z.string().uuid(),
    status: z.enum(["received", "processing"]),
    estimatedProcessingTime: z.string(),
    created_at: z.string().datetime()
  }),
  metadata: z.object({
    requestId: z.string().uuid(),
    processingTimeMs: z.number().positive(),
    deduplication: z.object({
      isDuplicate: z.boolean(),
      originalTicketId: z.string().uuid().optional()
    }).optional()
  })
});

/**
 * Error response schema
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string().datetime(),
    requestId: z.string().uuid()
  }),
  validationErrors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string(),
    receivedValue: z.unknown().optional()
  })).optional()
});

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validation error details interface
 */
export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
  receivedValue?: unknown;
}

/**
 * Validation result interface
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationErrorDetail[];
}

/**
 * Safe validation wrapper that returns structured results
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context?: string
): ValidationResult<T> {
  try {
    const result = schema.safeParse(data);
    
    if (result.success) {
      return {
        success: true,
        data: result.data
      };
    }

    // Transform Zod errors to our format
    const errors: ValidationErrorDetail[] = result.error.issues.map(issue => ({
      field: issue.path.length > 0 ? issue.path.join('.') : 'root',
      message: issue.message,
      code: issue.code,
      receivedValue: issue.path.length > 0 
        ? getNestedValue(data, issue.path)
        : data
    }));

    return {
      success: false,
      errors
    };

  } catch (error) {
    return {
      success: false,
      errors: [{
        field: context || 'unknown',
        message: error instanceof Error ? error.message : 'Validation failed',
        code: 'validation_error'
      }]
    };
  }
}

/**
 * Get nested value from object using path array
 */
function getNestedValue(obj: unknown, path: (string | number)[]): unknown {
  let current = obj;
  
  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as any)[key];
  }
  
  return current;
}

/**
 * Sanitize and normalize ticket data
 */
export function sanitizeTicketData(data: z.infer<typeof IngestTicketRequestSchema>): z.infer<typeof IngestTicketRequestSchema> {
  return {
    ...data,
    subject: data.subject.trim(),
    description: data.description.trim(),
    priority: data.priority ?? "medium", // Ensure priority is always set
    customer: {
      ...data.customer,
      email: data.customer.email.toLowerCase().trim(),
      name: data.customer.name.trim(),
      company: data.customer.company?.trim(),
      language: data.customer.language ?? "en" // Ensure language is always set
    },
    category: data.category?.trim(),
    subcategory: data.subcategory?.trim(),
    tags: data.tags ?? [],
    source_system: data.source_system ?? "api"
  };
}

/**
 * Generate deduplication key from ticket data
 */
export function generateDeduplicationKey(
  data: z.infer<typeof IngestTicketRequestSchema>,
  keyFields: string[] = ["subject", "customer.email", "description"]
): string {
  const values = keyFields.map(field => {
    if (field === "subject") return data.subject.toLowerCase().trim();
    if (field === "customer.email") return data.customer.email.toLowerCase().trim();
    if (field === "description") return data.description.toLowerCase().trim().slice(0, 100);
    return "";
  }).filter(Boolean);

  // Create a hash of the combined values
  const combined = values.join("|");
  return btoa(combined).replace(/[+=\/]/g, "").substring(0, 32);
}

/**
 * Validate attachment security
 */
export function validateAttachmentSecurity(attachment: any): ValidationResult<any> {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (!allowedTypes.includes(attachment.content_type)) {
    return {
      success: false,
      errors: [{
        field: 'content_type',
        message: `File type ${attachment.content_type} is not allowed`,
        code: 'invalid_file_type',
        receivedValue: attachment.content_type
      }]
    };
  }

  // Check for suspicious filenames
  const suspiciousPatterns = [
    /\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, /\.pif$/i,
    /\.com$/i, /\.vbs$/i, /\.js$/i, /\.jar$/i, /\.app$/i
  ];

  if (suspiciousPatterns.some(pattern => pattern.test(attachment.filename))) {
    return {
      success: false,
      errors: [{
        field: 'filename',
        message: 'Potentially unsafe file extension detected',
        code: 'unsafe_file_extension',
        receivedValue: attachment.filename
      }]
    };
  }

  return { success: true, data: attachment };
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type IngestTicketRequest = z.infer<typeof IngestTicketRequestSchema>;
export type IngestSuccessResponse = z.infer<typeof IngestSuccessResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ServiceStatusResponse = z.infer<typeof ServiceStatusResponseSchema>;
export type RateLimitConfig = z.infer<typeof RateLimitConfigSchema>;
export type DeduplicationConfig = z.infer<typeof DeduplicationConfigSchema>;