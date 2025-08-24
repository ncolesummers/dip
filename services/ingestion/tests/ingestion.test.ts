/**
 * Comprehensive test suite for the Ingestion Service
 * Tests all components including validation, handlers, and service functionality
 */

import { assertEquals, assertExists, assertRejects, assert } from "@std/assert";
import { beforeAll, beforeEach, afterEach, afterAll, describe, it } from "@std/testing/bdd";
import { IngestionService, type IngestionServiceConfig } from "../service.ts";
import { IngestionHandlers } from "../handlers.ts";
import { 
  IngestTicketRequestSchema,
  safeValidate,
  sanitizeTicketData,
  generateDeduplicationKey,
  validateAttachmentSecurity,
  type IngestTicketRequest
} from "../validation.ts";

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a valid ticket request for testing
 */
function createValidTicketRequest(overrides: Partial<IngestTicketRequest> = {}): IngestTicketRequest {
  return {
    subject: "Test ticket subject",
    description: "This is a detailed description of the test ticket issue that needs to be resolved.",
    customer: {
      email: "test@example.com",
      name: "Test Customer",
      phone: "+1234567890",
      company: "Test Company",
      tier: "premium",
      language: "en",
      timezone: "America/New_York"
    },
    priority: "medium",
    channel: "api",
    external_id: "EXT-123",
    category: "technical",
    subcategory: "bug",
    tags: ["urgent", "api", "test"],
    source_system: "test-suite",
    ...overrides
  };
}

/**
 * Create test service configuration
 */
function createTestConfig(): IngestionServiceConfig {
  return {
    name: "ingestion-test",
    version: "1.0.0",
    port: 0, // Random port for testing
    metricsPort: 0,
    environment: "test",
    kafkaBrokers: ["localhost:9092"],
    maxRequestsPerMinute: 1000, // High limit for testing
    deduplicationEnabled: true,
    deduplicationTtlMs: 1000, // Short TTL for testing
    enableAttachments: true,
    enableCustomFields: true
  };
}

/**
 * Mock Kafka publisher for testing
 */
class MockPublisher {
  private publishedEvents: any[] = [];
  private connected = true;

  async publish(event: any, options?: any): Promise<void> {
    if (!this.connected) {
      throw new Error("Publisher not connected");
    }
    this.publishedEvents.push({ event, options });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  getPublishedEvents(): any[] {
    return [...this.publishedEvents];
  }

  reset(): void {
    this.publishedEvents = [];
  }
}

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe("Validation", () => {
  describe("IngestTicketRequestSchema", () => {
    it("should validate a correct ticket request", () => {
      const validRequest = createValidTicketRequest();
      const result = safeValidate(IngestTicketRequestSchema, validRequest);
      
      assertEquals(result.success, true);
      assertExists(result.data);
    });

    it("should reject request with missing required fields", () => {
      const invalidRequest = {
        description: "Missing subject and customer"
      };
      
      const result = safeValidate(IngestTicketRequestSchema, invalidRequest);
      
      assertEquals(result.success, false);
      assertExists(result.errors);
      assert(result.errors!.some(e => e.field === "subject"));
      assert(result.errors!.some(e => e.field === "customer"));
    });

    it("should validate customer email format", () => {
      const invalidRequest = createValidTicketRequest({
        customer: {
          ...createValidTicketRequest().customer,
          email: "invalid-email"
        }
      });
      
      const result = safeValidate(IngestTicketRequestSchema, invalidRequest);
      
      assertEquals(result.success, false);
      assertExists(result.errors);
      assert(result.errors!.some(e => e.field === "customer.email"));
    });

    it("should enforce subject length limits", () => {
      const longSubject = "a".repeat(201);
      const invalidRequest = createValidTicketRequest({
        subject: longSubject
      });
      
      const result = safeValidate(IngestTicketRequestSchema, invalidRequest);
      
      assertEquals(result.success, false);
      assertExists(result.errors);
      assert(result.errors!.some(e => e.field === "subject"));
    });

    it("should validate priority values", () => {
      const invalidRequest = createValidTicketRequest({
        priority: "invalid" as any
      });
      
      const result = safeValidate(IngestTicketRequestSchema, invalidRequest);
      
      assertEquals(result.success, false);
      assertExists(result.errors);
      assert(result.errors!.some(e => e.field === "priority"));
    });

    it("should enforce tag limits", () => {
      const tooManyTags = Array(11).fill("tag");
      const invalidRequest = createValidTicketRequest({
        tags: tooManyTags
      });
      
      const result = safeValidate(IngestTicketRequestSchema, invalidRequest);
      
      assertEquals(result.success, false);
      assertExists(result.errors);
      assert(result.errors!.some(e => e.field === "tags"));
    });
  });

  describe("sanitizeTicketData", () => {
    it("should trim and normalize text fields", () => {
      const dirtyRequest = createValidTicketRequest({
        subject: "  Test Subject  ",
        customer: {
          ...createValidTicketRequest().customer,
          email: "  TEST@EXAMPLE.COM  ",
          name: "  Test Customer  "
        },
        category: "  Technical  "
      });
      
      const sanitized = sanitizeTicketData(dirtyRequest);
      
      assertEquals(sanitized.subject, "Test Subject");
      assertEquals(sanitized.customer.email, "test@example.com");
      assertEquals(sanitized.customer.name, "Test Customer");
      assertEquals(sanitized.category, "Technical");
    });

    it("should lowercase tags", () => {
      const request = createValidTicketRequest({
        tags: ["URGENT", "Bug", "API"]
      });
      
      const sanitized = sanitizeTicketData(request);
      
      assertEquals(sanitized.tags, ["urgent", "bug", "api"]);
    });
  });

  describe("generateDeduplicationKey", () => {
    it("should generate consistent keys for same data", () => {
      const request1 = createValidTicketRequest();
      const request2 = createValidTicketRequest();
      
      const key1 = generateDeduplicationKey(request1);
      const key2 = generateDeduplicationKey(request2);
      
      assertEquals(key1, key2);
    });

    it("should generate different keys for different data", () => {
      const request1 = createValidTicketRequest();
      const request2 = createValidTicketRequest({
        subject: "Different subject"
      });
      
      const key1 = generateDeduplicationKey(request1);
      const key2 = generateDeduplicationKey(request2);
      
      assert(key1 !== key2);
    });

    it("should handle case insensitive data", () => {
      const request1 = createValidTicketRequest({
        subject: "test subject",
        customer: { ...createValidTicketRequest().customer, email: "test@example.com" }
      });
      const request2 = createValidTicketRequest({
        subject: "TEST SUBJECT",
        customer: { ...createValidTicketRequest().customer, email: "TEST@EXAMPLE.COM" }
      });
      
      const key1 = generateDeduplicationKey(request1);
      const key2 = generateDeduplicationKey(request2);
      
      assertEquals(key1, key2);
    });
  });

  describe("validateAttachmentSecurity", () => {
    it("should allow safe file types", () => {
      const safeAttachment = {
        filename: "document.pdf",
        content_type: "application/pdf",
        size_bytes: 1024,
        url: "https://example.com/file.pdf"
      };
      
      const result = validateAttachmentSecurity(safeAttachment);
      
      assertEquals(result.success, true);
    });

    it("should reject unsafe file types", () => {
      const unsafeAttachment = {
        filename: "malware.exe",
        content_type: "application/octet-stream",
        size_bytes: 1024,
        url: "https://example.com/malware.exe"
      };
      
      const result = validateAttachmentSecurity(unsafeAttachment);
      
      assertEquals(result.success, false);
      assertExists(result.errors);
    });

    it("should reject suspicious file extensions", () => {
      const suspiciousAttachment = {
        filename: "document.pdf.exe",
        content_type: "application/pdf",
        size_bytes: 1024,
        url: "https://example.com/document.pdf.exe"
      };
      
      const result = validateAttachmentSecurity(suspiciousAttachment);
      
      assertEquals(result.success, false);
      assertExists(result.errors);
    });
  });
});

// ============================================================================
// HANDLERS TESTS
// ============================================================================

describe("IngestionHandlers", () => {
  let handlers: IngestionHandlers;
  let mockPublisher: MockPublisher;

  beforeEach(() => {
    handlers = new IngestionHandlers({
      maxRequestsPerMinute: 1000,
      deduplicationTtlMs: 1000
    });
    
    mockPublisher = new MockPublisher();
    handlers.setPublisher(mockPublisher);
  });

  afterEach(() => {
    handlers.reset();
    mockPublisher.reset();
  });

  describe("Rate Limiting", () => {
    it("should allow requests within limit", async () => {
      const validRequest = createValidTicketRequest();
      
      // Mock context
      const mockContext = {
        req: {
          json: () => Promise.resolve(validRequest),
          header: () => "127.0.0.1",
          method: "POST",
          path: "/ingest"
        },
        json: (data: any, status: number, headers?: any) => ({ 
          data, 
          status, 
          headers 
        }),
        header: () => {}
      } as any;

      const response = await handlers.ingestTicket(mockContext);
      
      assertEquals(response.status, 201);
    });

    it("should block requests exceeding rate limit", async () => {
      // Create handler with very low rate limit
      const restrictiveHandlers = new IngestionHandlers({
        maxRequestsPerMinute: 1,
        deduplicationTtlMs: 1000
      });
      restrictiveHandlers.setPublisher(mockPublisher);

      const validRequest = createValidTicketRequest();
      const mockContext = {
        req: {
          json: () => Promise.resolve(validRequest),
          header: () => "127.0.0.1",
          method: "POST",
          path: "/ingest"
        },
        json: (data: any, status: number, headers?: any) => ({ 
          data, 
          status, 
          headers 
        }),
        header: () => {}
      } as any;

      // First request should succeed
      const response1 = await restrictiveHandlers.ingestTicket(mockContext);
      assertEquals(response1.status, 201);

      // Second request should be rate limited
      const response2 = await restrictiveHandlers.ingestTicket(mockContext);
      assertEquals(response2.status, 429);
    });
  });

  describe("Deduplication", () => {
    it("should detect duplicate requests", async () => {
      const validRequest = createValidTicketRequest();
      const mockContext = {
        req: {
          json: () => Promise.resolve(validRequest),
          header: () => "127.0.0.1",
          method: "POST",
          path: "/ingest"
        },
        json: (data: any, status: number) => ({ 
          data, 
          status 
        }),
        header: () => {}
      } as any;

      // First request
      const response1 = await handlers.ingestTicket(mockContext);
      assertEquals(response1.status, 201);

      // Second identical request should be detected as duplicate
      const response2 = await handlers.ingestTicket(mockContext);
      assertEquals(response2.status, 200);
      assert(response2.data.metadata?.deduplication?.isDuplicate);
    });

    it("should expire duplicate detection after TTL", async () => {
      const validRequest = createValidTicketRequest();
      const mockContext = {
        req: {
          json: () => Promise.resolve(validRequest),
          header: () => "127.0.0.1",
          method: "POST",
          path: "/ingest"
        },
        json: (data: any, status: number) => ({ 
          data, 
          status 
        }),
        header: () => {}
      } as any;

      // First request
      const response1 = await handlers.ingestTicket(mockContext);
      assertEquals(response1.status, 201);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Second request after TTL should be treated as new
      const response2 = await handlers.ingestTicket(mockContext);
      assertEquals(response2.status, 201);
      assert(!response2.data.metadata?.deduplication?.isDuplicate);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid JSON", async () => {
      const mockContext = {
        req: {
          json: () => Promise.reject(new Error("Invalid JSON")),
          header: () => "127.0.0.1",
          method: "POST",
          path: "/ingest"
        },
        json: (data: any, status: number) => ({ 
          data, 
          status 
        }),
        header: () => {}
      } as any;

      const response = await handlers.ingestTicket(mockContext);
      
      assertEquals(response.status, 400);
      assertEquals(response.data.error.code, "INVALID_JSON");
    });

    it("should handle validation errors", async () => {
      const invalidRequest = {
        description: "Missing required fields"
      };
      
      const mockContext = {
        req: {
          json: () => Promise.resolve(invalidRequest),
          header: () => "127.0.0.1",
          method: "POST",
          path: "/ingest"
        },
        json: (data: any, status: number) => ({ 
          data, 
          status 
        }),
        header: () => {}
      } as any;

      const response = await handlers.ingestTicket(mockContext);
      
      assertEquals(response.status, 400);
      assertEquals(response.data.error.code, "VALIDATION_ERROR");
      assertExists(response.data.validationErrors);
    });
  });

  describe("Event Publishing", () => {
    it("should publish TicketReceived event", async () => {
      const validRequest = createValidTicketRequest();
      const mockContext = {
        req: {
          json: () => Promise.resolve(validRequest),
          header: (name: string) => {
            if (name === 'user-agent') return 'test-agent';
            return "127.0.0.1";
          },
          method: "POST",
          path: "/ingest"
        },
        json: (data: any, status: number) => ({ 
          data, 
          status 
        }),
        header: () => {}
      } as any;

      const response = await handlers.ingestTicket(mockContext);
      
      assertEquals(response.status, 201);
      
      const publishedEvents = mockPublisher.getPublishedEvents();
      assertEquals(publishedEvents.length, 1);
      
      const event = publishedEvents[0].event;
      assertEquals(event.getAttribute("type"), "com.dip.ticket.received");
      assertExists(event.getData().ticket);
    });
  });
});

// ============================================================================
// SERVICE INTEGRATION TESTS
// ============================================================================

describe("IngestionService", () => {
  let service: IngestionService;
  let config: IngestionServiceConfig;

  beforeAll(() => {
    config = createTestConfig();
  });

  beforeEach(async () => {
    service = new IngestionService(config);
    // Don't start the full service for unit tests
  });

  afterEach(async () => {
    if (service) {
      await service.cleanup();
    }
  });

  describe("Configuration", () => {
    it("should create service with valid configuration", () => {
      assertExists(service);
      
      const status = service.getStatus();
      assertEquals(status.service, "ingestion");
      assertEquals(status.version, "1.0.0");
    });

    it("should allow configuration updates", () => {
      const updates = {
        maxRequestsPerMinute: 50,
        deduplicationTtlMs: 10000
      };
      
      service.updateConfig(updates);
      
      const updatedConfig = service.getConfig();
      assertEquals(updatedConfig.maxRequestsPerMinute, 50);
      assertEquals(updatedConfig.deduplicationTtlMs, 10000);
    });
  });

  describe("Health Checks", () => {
    it("should report health status", async () => {
      const health = await service.getHealthStatus();
      
      assertExists(health);
      assertEquals(health.service, "ingestion");
      assertEquals(health.version, "1.0.0");
      assertExists(health.checks);
    });

    it("should check readiness", async () => {
      // Without Kafka connection, should not be ready
      const isReady = await service.isReady();
      assertEquals(isReady, false);
    });
  });

  describe("Metrics", () => {
    it("should collect service metrics", () => {
      const metrics = service.getIngestionMetrics();
      
      assertExists(metrics);
      assertExists(metrics.metrics);
      assertExists(metrics.rateLimit);
      assertExists(metrics.deduplication);
    });
  });

  describe("Service Lifecycle", () => {
    it("should initialize and cleanup properly", async () => {
      // Test initialization without starting full server
      await service.initialize();
      await service.cleanup();
      
      // Should complete without throwing
      assert(true);
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe("Performance", () => {
  let handlers: IngestionHandlers;
  let mockPublisher: MockPublisher;

  beforeEach(() => {
    handlers = new IngestionHandlers();
    mockPublisher = new MockPublisher();
    handlers.setPublisher(mockPublisher);
  });

  afterEach(() => {
    handlers.reset();
  });

  it("should handle concurrent requests", async () => {
    const validRequest = createValidTicketRequest();
    const mockContext = {
      req: {
        json: () => Promise.resolve(validRequest),
        header: () => "127.0.0.1",
        method: "POST",
        path: "/ingest"
      },
      json: (data: any, status: number) => ({ data, status }),
      header: () => {}
    } as any;

    const startTime = Date.now();
    
    // Send 10 concurrent requests
    const promises = Array(10).fill(null).map(() => 
      handlers.ingestTicket(mockContext)
    );
    
    const responses = await Promise.all(promises);
    const endTime = Date.now();
    
    // All requests should succeed (different contexts would have different IPs in real scenario)
    responses.forEach(response => {
      assert(response.status === 201 || response.status === 200); // 200 for duplicates
    });
    
    // Should complete within reasonable time (less than 1 second for 10 requests)
    assert(endTime - startTime < 1000);
  });

  it("should process requests within latency requirement", async () => {
    const validRequest = createValidTicketRequest();
    const mockContext = {
      req: {
        json: () => Promise.resolve(validRequest),
        header: () => "127.0.0.1",
        method: "POST", 
        path: "/ingest"
      },
      json: (data: any, status: number) => ({ data, status }),
      header: () => {}
    } as any;

    const startTime = Date.now();
    const response = await handlers.ingestTicket(mockContext);
    const endTime = Date.now();
    
    const latency = endTime - startTime;
    
    // Should be well under the 50ms p95 requirement for individual requests
    assert(latency < 50, `Request took ${latency}ms, should be under 50ms`);
    assertEquals(response.status, 201);
  });
});