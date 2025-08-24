/**
 * IngestionService - Core service implementation
 * Extends BaseService with ticket ingestion capabilities
 */

import { BaseService, type ServiceConfig } from "../../shared/services/base.ts";
import { IngestionHandlers } from "./handlers.ts";

export interface IngestionServiceConfig extends ServiceConfig {
  // Rate limiting configuration
  maxRequestsPerMinute?: number;
  
  // Deduplication configuration
  deduplicationEnabled?: boolean;
  deduplicationTtlMs?: number;
  
  // Kafka configuration
  kafkaTopicTicketReceived?: string;
  
  // Performance configuration
  requestTimeoutMs?: number;
  maxConcurrentRequests?: number;
  
  // Security configuration
  allowedOrigins?: string[];
  requireApiKey?: boolean;
  
  // Feature flags
  enableAttachments?: boolean;
  enableCustomFields?: boolean;
}

/**
 * Ingestion Service for handling support ticket intake
 * 
 * Features:
 * - HTTP API for ticket ingestion
 * - Rate limiting (100 req/min by default)
 * - Request deduplication
 * - Input validation with Zod schemas
 * - Event publishing to Kafka
 * - Comprehensive observability
 * - Graceful shutdown handling
 */
export class IngestionService extends BaseService {
  private handlers: IngestionHandlers;
  private ingestionConfig: IngestionServiceConfig;

  constructor(config: IngestionServiceConfig) {
    // Set up base service configuration
    const baseConfig: ServiceConfig = {
      ...config,
      name: config.name || "ingestion",
      version: config.version || "1.0.0",
      port: config.port || 3001,
      metricsPort: config.metricsPort || 9001,
      kafkaBrokers: config.kafkaBrokers || ["localhost:9092"],
      healthCheckPath: config.healthCheckPath || "/health",
      readinessCheckPath: config.readinessCheckPath || "/ready",
      gracefulShutdownTimeout: config.gracefulShutdownTimeout || 30000,
      environment: config.environment || Deno.env.get("DENO_ENV") || "development"
    };

    super(baseConfig);

    // Store ingestion-specific config
    this.ingestionConfig = {
      maxRequestsPerMinute: 100,
      deduplicationEnabled: true,
      deduplicationTtlMs: 5 * 60 * 1000, // 5 minutes
      kafkaTopicTicketReceived: "ticket.received",
      requestTimeoutMs: 30000,
      maxConcurrentRequests: 100,
      allowedOrigins: ["*"],
      requireApiKey: false,
      enableAttachments: true,
      enableCustomFields: true,
      ...config
    };

    // Initialize handlers with configuration
    this.handlers = new IngestionHandlers({
      maxRequestsPerMinute: this.ingestionConfig.maxRequestsPerMinute || 100,
      deduplicationTtlMs: this.ingestionConfig.deduplicationTtlMs || 5 * 60 * 1000
    });

    // Setup routes after base constructor
    this.setupRoutes();
  }

  /**
   * Setup HTTP routes for the ingestion service
   */
  private setupRoutes(): void {
    // Ticket ingestion endpoint
    this.app.post("/ingest", this.handlers.ingestTicket);
    
    // Service status endpoint (in addition to /health)
    this.app.get("/status", this.handlers.getServiceStatus);

    // Additional utility endpoints
    this.app.get("/", (c) => {
      return c.json({
        service: "ingestion-service",
        version: this.config.version,
        description: "Support ticket ingestion API",
        endpoints: {
          "POST /ingest": "Ingest a new support ticket",
          "GET /status": "Get detailed service status and metrics",
          "GET /health": "Health check endpoint",
          "GET /ready": "Readiness check endpoint",
          "GET /info": "Service information"
        },
        documentation: "https://docs.dip.com/api/ingestion",
        timestamp: new Date().toISOString()
      });
    });

    // API documentation endpoint
    this.app.get("/docs", (c) => {
      return c.json({
        openapi: "3.0.0",
        info: {
          title: "DIP Ingestion Service API",
          version: this.config.version,
          description: "API for ingesting support tickets into the DIP system"
        },
        paths: {
          "/ingest": {
            post: {
              summary: "Ingest a support ticket",
              description: "Submit a new support ticket for processing",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      required: ["subject", "description", "customer"],
                      properties: {
                        subject: {
                          type: "string",
                          maxLength: 200,
                          description: "Ticket subject line"
                        },
                        description: {
                          type: "string",
                          maxLength: 10000,
                          description: "Detailed description of the issue"
                        },
                        customer: {
                          type: "object",
                          required: ["email", "name"],
                          properties: {
                            email: { type: "string", format: "email" },
                            name: { type: "string", maxLength: 100 },
                            phone: { type: "string" },
                            company: { type: "string", maxLength: 100 },
                            tier: { 
                              type: "string", 
                              enum: ["free", "basic", "premium", "enterprise"] 
                            }
                          }
                        },
                        priority: {
                          type: "string",
                          enum: ["low", "medium", "high", "urgent", "critical"],
                          default: "medium"
                        },
                        channel: {
                          type: "string",
                          enum: ["email", "chat", "phone", "api", "web_form", "social_media", "sms"],
                          default: "api"
                        }
                      }
                    }
                  }
                }
              },
              responses: {
                "201": {
                  description: "Ticket successfully ingested",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          success: { type: "boolean", example: true },
                          data: {
                            type: "object",
                            properties: {
                              ticketId: { type: "string", format: "uuid" },
                              status: { type: "string", enum: ["received", "processing"] },
                              estimatedProcessingTime: { type: "string" },
                              created_at: { type: "string", format: "date-time" }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "400": {
                  description: "Invalid request data"
                },
                "429": {
                  description: "Rate limit exceeded"
                },
                "500": {
                  description: "Internal server error"
                }
              }
            }
          },
          "/status": {
            get: {
              summary: "Get service status",
              description: "Returns detailed service status and performance metrics",
              responses: {
                "200": {
                  description: "Service status information"
                }
              }
            }
          }
        }
      });
    });
  }

  /**
   * Initialize the ingestion service
   */
  protected async initialize(): Promise<void> {
    console.log(`🎯 Initializing ${this.config.name} service...`);

    try {
      // Initialize Kafka publisher for event publishing
      await this.initializePublisher(this.ingestionConfig.kafkaTopicTicketReceived);
      
      // Set the publisher in handlers so they can publish events
      this.handlers.setPublisher(this.publisher);

      console.log(`✅ ${this.config.name} service initialized successfully`);
      
    } catch (error) {
      console.error(`❌ Failed to initialize ${this.config.name} service:`, error);
      throw error;
    }
  }

  /**
   * Cleanup resources when shutting down
   */
  protected async cleanup(): Promise<void> {
    console.log(`🧹 Cleaning up ${this.config.name} service...`);

    try {
      // Reset handlers (clears rate limiting and deduplication caches)
      this.handlers.reset();

      console.log(`✅ ${this.config.name} service cleanup completed`);
      
    } catch (error) {
      console.error(`❌ Error during ${this.config.name} cleanup:`, error);
      // Don't throw - we want cleanup to continue
    }
  }

  /**
   * Check if service is ready to accept requests
   */
  protected async isReady(): Promise<boolean> {
    try {
      // Check if Kafka publisher is connected
      if (!this.publisher?.isConnected()) {
        return false;
      }

      // Service is ready if publisher is connected
      return true;
      
    } catch (error) {
      console.error(`Error checking readiness for ${this.config.name}:`, error);
      return false;
    }
  }

  /**
   * Perform service-specific health checks
   */
  protected async performHealthChecks(): Promise<Record<string, {
    status: "ok" | "error";
    message?: string;
    latency?: number;
  }>> {
    const checks: Record<string, { status: "ok" | "error"; message?: string; latency?: number }> = {};

    // Check handler state
    try {
      const startTime = Date.now();
      const internalStats = this.handlers.getInternalStats();
      const latency = Date.now() - startTime;

      checks.handlers = {
        status: "ok",
        message: `Rate limiter: ${internalStats.rateLimit.totalKeys} keys, Dedup cache: ${internalStats.deduplication.totalEntries} entries`,
        latency
      };
    } catch (error) {
      checks.handlers = {
        status: "error",
        message: error instanceof Error ? error.message : "Handler check failed"
      };
    }

    // Check configuration
    checks.configuration = {
      status: "ok",
      message: `Rate limit: ${this.ingestionConfig.maxRequestsPerMinute}/min, Dedup TTL: ${this.ingestionConfig.deduplicationTtlMs}ms`
    };

    // Check feature flags
    const features = [
      this.ingestionConfig.enableAttachments && "attachments",
      this.ingestionConfig.enableCustomFields && "custom-fields",
      this.ingestionConfig.deduplicationEnabled && "deduplication"
    ].filter(Boolean);

    checks.features = {
      status: "ok",
      message: `Enabled: ${features.join(", ") || "none"}`
    };

    return checks;
  }

  /**
   * Get ingestion-specific metrics
   */
  getIngestionMetrics() {
    return this.handlers.getInternalStats();
  }

  /**
   * Update configuration at runtime (for certain settings)
   */
  updateConfig(updates: Partial<IngestionServiceConfig>): void {
    // Only allow safe runtime updates
    const safeUpdates = {
      maxRequestsPerMinute: updates.maxRequestsPerMinute,
      deduplicationTtlMs: updates.deduplicationTtlMs,
      requestTimeoutMs: updates.requestTimeoutMs
    };

    // Filter out undefined values
    const actualUpdates = Object.fromEntries(
      Object.entries(safeUpdates).filter(([_, value]) => value !== undefined)
    );

    if (Object.keys(actualUpdates).length > 0) {
      Object.assign(this.ingestionConfig, actualUpdates);
      console.log(`Updated ingestion config:`, actualUpdates);
      
      // Note: Some changes would require recreating handlers
      // For now, we'll just log the update
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): IngestionServiceConfig {
    return { ...this.ingestionConfig };
  }
}