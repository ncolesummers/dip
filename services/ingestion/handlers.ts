/**
 * HTTP request handlers for the Ingestion Service
 * Handles ticket ingestion, status checks, and rate limiting
 */

import { Context } from "hono";
import { nanoid } from "nanoid";
import { TypedCloudEventFactory } from "../../shared/events/base.ts";
import { EventTypes, EventSources } from "../../shared/events/types.ts";
import { TicketReceivedEventSchema } from "../../shared/events/schemas.ts";
import {
  IngestTicketRequestSchema,
  ServiceStatusResponseSchema,
  safeValidate,
  sanitizeTicketData,
  generateDeduplicationKey,
  validateAttachmentSecurity,
  type IngestTicketRequest,
  type IngestSuccessResponse,
  type ErrorResponse,
  type ServiceStatusResponse,
  type ValidationErrorDetail
} from "./validation.ts";

// ============================================================================
// RATE LIMITING IMPLEMENTATION
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
  lastRequest: number;
}

/**
 * In-memory rate limiter with sliding window
 */
class RateLimiter {
  private requests = new Map<string, RateLimitEntry>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests = 100, windowMs = 60 * 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Clean up old entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  isAllowed(key: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.requests.get(key);

    if (!entry || now > entry.resetTime) {
      // New window or first request
      const resetTime = now + this.windowMs;
      this.requests.set(key, {
        count: 1,
        resetTime,
        lastRequest: now
      });

      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime
      };
    }

    // Update last request time
    entry.lastRequest = now;

    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }

    entry.count++;
    this.requests.set(key, entry);

    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetTime: entry.resetTime
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime + this.windowMs) {
        this.requests.delete(key);
      }
    }
  }

  getStats(): { totalKeys: number; activeRequests: number } {
    const now = Date.now();
    let activeRequests = 0;

    for (const entry of this.requests.values()) {
      if (now <= entry.resetTime) {
        activeRequests += entry.count;
      }
    }

    return {
      totalKeys: this.requests.size,
      activeRequests
    };
  }

  reset(): void {
    this.requests.clear();
  }
}

// ============================================================================
// DEDUPLICATION IMPLEMENTATION
// ============================================================================

interface DeduplicationEntry {
  ticketId: string;
  timestamp: number;
}

/**
 * In-memory deduplication cache
 */
class DeduplicationCache {
  private cache = new Map<string, DeduplicationEntry>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;

    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  isDuplicate(key: string): { isDuplicate: boolean; originalTicketId?: string } {
    const entry = this.cache.get(key);
    if (!entry) {
      return { isDuplicate: false };
    }

    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return { isDuplicate: false };
    }

    return {
      isDuplicate: true,
      originalTicketId: entry.ticketId
    };
  }

  store(key: string, ticketId: string): void {
    this.cache.set(key, {
      ticketId,
      timestamp: Date.now()
    });
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
      }
    }
  }

  getStats(): { totalEntries: number; oldestEntry: number | null } {
    const timestamps = Array.from(this.cache.values()).map(e => e.timestamp);
    return {
      totalEntries: this.cache.size,
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null
    };
  }

  reset(): void {
    this.cache.clear();
  }
}

// ============================================================================
// METRICS TRACKING
// ============================================================================

interface ServiceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  duplicateRequests: number;
  latencies: number[];
  startTime: number;
}

/**
 * Service metrics collector
 */
class MetricsCollector {
  private metrics: ServiceMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    duplicateRequests: 0,
    latencies: [],
    startTime: Date.now()
  };

  recordRequest(): void {
    this.metrics.totalRequests++;
  }

  recordSuccess(latencyMs: number): void {
    this.metrics.successfulRequests++;
    this.recordLatency(latencyMs);
  }

  recordFailure(): void {
    this.metrics.failedRequests++;
  }

  recordRateLimit(): void {
    this.metrics.rateLimitedRequests++;
  }

  recordDuplicate(): void {
    this.metrics.duplicateRequests++;
  }

  private recordLatency(ms: number): void {
    this.metrics.latencies.push(ms);
    // Keep only last 1000 latencies for memory efficiency
    if (this.metrics.latencies.length > 1000) {
      this.metrics.latencies.shift();
    }
  }

  getMetrics() {
    const latencies = this.metrics.latencies;
    const averageLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const p95Latency = latencies.length > 0
      ? this.calculatePercentile(latencies, 0.95)
      : 0;

    return {
      totalRequests: this.metrics.totalRequests,
      successfulRequests: this.metrics.successfulRequests,
      failedRequests: this.metrics.failedRequests,
      rateLimitedRequests: this.metrics.rateLimitedRequests,
      duplicateRequests: this.metrics.duplicateRequests,
      averageLatencyMs: Math.round(averageLatency * 100) / 100,
      p95LatencyMs: Math.round(p95Latency * 100) / 100,
      uptime: Math.floor((Date.now() - this.metrics.startTime) / 1000)
    };
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[index] || 0;
  }

  reset(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      duplicateRequests: 0,
      latencies: [],
      startTime: Date.now()
    };
  }
}

// ============================================================================
// HANDLER CLASS
// ============================================================================

/**
 * Request handlers for the Ingestion Service
 */
export class IngestionHandlers {
  private rateLimiter: RateLimiter;
  private deduplicationCache: DeduplicationCache;
  private metrics: MetricsCollector;
  private publisher?: any; // CloudEventPublisher type

  constructor(config: {
    maxRequestsPerMinute?: number;
    deduplicationTtlMs?: number;
  } = {}) {
    this.rateLimiter = new RateLimiter(
      config.maxRequestsPerMinute || 100,
      60 * 1000 // 1 minute window
    );
    this.deduplicationCache = new DeduplicationCache(
      config.deduplicationTtlMs || 5 * 60 * 1000
    );
    this.metrics = new MetricsCollector();
  }

  /**
   * Set the event publisher for publishing events
   */
  setPublisher(publisher: any): void {
    this.publisher = publisher;
  }

  /**
   * Handle ticket ingestion requests
   */
  ingestTicket = async (c: Context): Promise<Response> => {
    const startTime = Date.now();
    const requestId = nanoid();

    try {
      this.metrics.recordRequest();

      // Extract client IP for rate limiting
      const clientIp = this.getClientIp(c);
      
      // Check rate limits
      const rateLimitResult = this.rateLimiter.isAllowed(clientIp);
      if (!rateLimitResult.allowed) {
        this.metrics.recordRateLimit();
        
        return c.json({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later.",
            timestamp: new Date().toISOString(),
            requestId
          }
        } as ErrorResponse, 429, {
          'X-RateLimit-Limit': '100',
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
        });
      }

      // Parse and validate request body
      const rawBody = await c.req.json().catch(() => null);
      if (!rawBody) {
        this.metrics.recordFailure();
        return c.json({
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "Invalid JSON in request body",
            timestamp: new Date().toISOString(),
            requestId
          }
        } as ErrorResponse, 400);
      }

      // Validate request data
      const validation = safeValidate(IngestTicketRequestSchema, rawBody, 'request');
      if (!validation.success) {
        this.metrics.recordFailure();
        return c.json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            timestamp: new Date().toISOString(),
            requestId
          },
          validationErrors: validation.errors
        } as ErrorResponse, 400);
      }

      // Sanitize the data
      const ticketData = sanitizeTicketData(validation.data!);

      // Validate attachments if present
      if (ticketData.attachments) {
        for (const attachment of ticketData.attachments) {
          const attachmentValidation = validateAttachmentSecurity(attachment);
          if (!attachmentValidation.success) {
            this.metrics.recordFailure();
            return c.json({
              success: false,
              error: {
                code: "UNSAFE_ATTACHMENT",
                message: "Attachment failed security validation",
                timestamp: new Date().toISOString(),
                requestId
              },
              validationErrors: attachmentValidation.errors
            } as ErrorResponse, 400);
          }
        }
      }

      // Check for duplicates
      const dedupKey = generateDeduplicationKey(ticketData);
      const dedupResult = this.deduplicationCache.isDuplicate(dedupKey);
      
      if (dedupResult.isDuplicate) {
        this.metrics.recordDuplicate();
        const processingTime = Date.now() - startTime;
        
        return c.json({
          success: true,
          data: {
            ticketId: dedupResult.originalTicketId!,
            status: "received" as const,
            estimatedProcessingTime: "Already processed",
            created_at: new Date().toISOString()
          },
          metadata: {
            requestId,
            processingTimeMs: processingTime,
            deduplication: {
              isDuplicate: true,
              originalTicketId: dedupResult.originalTicketId
            }
          }
        } as IngestSuccessResponse, 200);
      }

      // Generate ticket ID and create ticket object
      const ticketId = nanoid();
      const now = new Date().toISOString();

      const ticket = {
        id: ticketId,
        external_id: ticketData.external_id,
        subject: ticketData.subject,
        description: ticketData.description,
        status: "new" as const,
        priority: ticketData.priority,
        channel: ticketData.channel,
        customer: {
          id: nanoid(), // Generate customer ID
          ...ticketData.customer
        },
        created_at: now,
        updated_at: now,
        due_date: ticketData.due_date,
        category: ticketData.category,
        subcategory: ticketData.subcategory,
        tags: ticketData.tags,
        attachments: ticketData.attachments?.map(att => ({
          id: nanoid(),
          ...att
        })),
        custom_fields: ticketData.custom_fields
      };

      // Store in deduplication cache
      this.deduplicationCache.store(dedupKey, ticketId);

      // Create and publish TicketReceived event
      if (this.publisher) {
        try {
          const eventData = {
            ticket,
            source_system: ticketData.source_system,
            received_at: now,
            raw_content: ticketData.raw_content,
            metadata: {
              requestId,
              clientIp,
              userAgent: c.req.header('user-agent'),
              timestamp: now
            }
          };

          const event = TypedCloudEventFactory.createTicketReceived(
            eventData,
            EventSources.INGESTION_SERVICE,
            {
              subject: `ticket.${ticketId}`,
              correlationid: requestId,
              time: now
            }
          );

          await this.publisher.publish(event, {
            topic: 'ticket.received'
          });

        } catch (publishError) {
          console.error('Failed to publish ticket received event:', publishError);
          // Log error but don't fail the request - ticket was received successfully
        }
      }

      const processingTime = Date.now() - startTime;
      this.metrics.recordSuccess(processingTime);

      return c.json({
        success: true,
        data: {
          ticketId,
          status: "received" as const,
          estimatedProcessingTime: "2-5 minutes",
          created_at: now
        },
        metadata: {
          requestId,
          processingTimeMs: processingTime
        }
      } as IngestSuccessResponse, 201);

    } catch (error) {
      this.metrics.recordFailure();
      console.error('Error processing ticket ingestion:', error);

      const processingTime = Date.now() - startTime;

      return c.json({
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while processing your request",
          timestamp: new Date().toISOString(),
          requestId,
          details: {
            processingTimeMs: processingTime
          }
        }
      } as ErrorResponse, 500);
    }
  };

  /**
   * Handle service status requests
   */
  getServiceStatus = async (c: Context): Promise<Response> => {
    try {
      const metrics = this.metrics.getMetrics();
      const rateLimitStats = this.rateLimiter.getStats();
      const dedupStats = this.deduplicationCache.getStats();

      const status: ServiceStatusResponse = {
        service: "ingestion-service",
        version: "1.0.0",
        status: "operational",
        uptime: metrics.uptime,
        metrics: {
          totalRequests: metrics.totalRequests,
          successfulRequests: metrics.successfulRequests,
          failedRequests: metrics.failedRequests,
          averageLatencyMs: metrics.averageLatencyMs,
          p95LatencyMs: metrics.p95LatencyMs,
          rateLimitedRequests: metrics.rateLimitedRequests,
          duplicateRequests: metrics.duplicateRequests
        },
        timestamp: new Date().toISOString()
      };

      // Determine service status based on metrics
      const errorRate = metrics.totalRequests > 0 
        ? (metrics.failedRequests / metrics.totalRequests) * 100 
        : 0;

      if (errorRate > 50) {
        status.status = "outage";
      } else if (errorRate > 10 || metrics.p95LatencyMs > 1000) {
        status.status = "degraded";
      }

      return c.json(status, 200, {
        'Cache-Control': 'no-cache',
        'X-Rate-Limit-Active-Keys': rateLimitStats.totalKeys.toString(),
        'X-Dedup-Cache-Size': dedupStats.totalEntries.toString()
      });

    } catch (error) {
      console.error('Error getting service status:', error);

      return c.json({
        service: "ingestion-service",
        version: "1.0.0",
        status: "outage",
        uptime: 0,
        metrics: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageLatencyMs: 0,
          p95LatencyMs: 0,
          rateLimitedRequests: 0,
          duplicateRequests: 0
        },
        timestamp: new Date().toISOString()
      } as ServiceStatusResponse, 500);
    }
  };

  /**
   * Extract client IP address from request
   */
  private getClientIp(c: Context): string {
    // Check various headers for the real client IP
    const headers = [
      'x-forwarded-for',
      'x-real-ip',
      'x-client-ip',
      'cf-connecting-ip',
      'x-cluster-client-ip'
    ];

    for (const header of headers) {
      const value = c.req.header(header);
      if (value) {
        // Take the first IP if there are multiple
        return value.split(',')[0]?.trim() || 'unknown';
      }
    }

    // Fallback - this won't work in serverless environments
    return 'unknown';
  }

  /**
   * Reset all internal state (useful for testing)
   */
  reset(): void {
    this.rateLimiter.reset();
    this.deduplicationCache.reset();
    this.metrics.reset();
  }

  /**
   * Get internal stats for monitoring
   */
  getInternalStats() {
    return {
      rateLimit: this.rateLimiter.getStats(),
      deduplication: this.deduplicationCache.getStats(),
      metrics: this.metrics.getMetrics()
    };
  }
}