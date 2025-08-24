/**
 * Main entry point for the Ingestion Service
 * Handles service startup, configuration, and graceful shutdown
 */

import { IngestionService, type IngestionServiceConfig } from "./service.ts";

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Load configuration from environment variables
 */
function loadConfig(): IngestionServiceConfig {
  const config: IngestionServiceConfig = {
    name: "ingestion",
    version: "1.0.0",
    
    // Server configuration
    port: parseInt(Deno.env.get("PORT") || "3001"),
    metricsPort: parseInt(Deno.env.get("METRICS_PORT") || "9001"),
    environment: Deno.env.get("DENO_ENV") || "development",
    
    // Kafka configuration
    kafkaBrokers: Deno.env.get("KAFKA_BROKERS")?.split(",") || ["localhost:9092"],
    kafkaTopicTicketReceived: Deno.env.get("KAFKA_TOPIC_TICKET_RECEIVED") || "ticket.received",
    
    // Rate limiting configuration
    maxRequestsPerMinute: parseInt(Deno.env.get("RATE_LIMIT_MAX_REQUESTS") || "100"),
    
    // Deduplication configuration
    deduplicationEnabled: Deno.env.get("DEDUPLICATION_ENABLED") !== "false",
    deduplicationTtlMs: parseInt(Deno.env.get("DEDUPLICATION_TTL_MS") || "300000"), // 5 minutes
    
    // Performance configuration
    requestTimeoutMs: parseInt(Deno.env.get("REQUEST_TIMEOUT_MS") || "30000"),
    maxConcurrentRequests: parseInt(Deno.env.get("MAX_CONCURRENT_REQUESTS") || "100"),
    gracefulShutdownTimeout: parseInt(Deno.env.get("GRACEFUL_SHUTDOWN_TIMEOUT") || "30000"),
    
    // Security configuration
    allowedOrigins: Deno.env.get("ALLOWED_ORIGINS")?.split(",") || ["*"],
    requireApiKey: Deno.env.get("REQUIRE_API_KEY") === "true",
    
    // Feature flags
    enableAttachments: Deno.env.get("ENABLE_ATTACHMENTS") !== "false",
    enableCustomFields: Deno.env.get("ENABLE_CUSTOM_FIELDS") !== "false"
  };

  return config;
}

/**
 * Validate configuration
 */
function validateConfig(config: IngestionServiceConfig): void {
  const errors: string[] = [];

  if (config.port <= 0 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port}`);
  }

  if (config.metricsPort && (config.metricsPort <= 0 || config.metricsPort > 65535)) {
    errors.push(`Invalid metrics port: ${config.metricsPort}`);
  }

  if (config.maxRequestsPerMinute && config.maxRequestsPerMinute <= 0) {
    errors.push(`Invalid max requests per minute: ${config.maxRequestsPerMinute}`);
  }

  if (config.deduplicationTtlMs && config.deduplicationTtlMs <= 0) {
    errors.push(`Invalid deduplication TTL: ${config.deduplicationTtlMs}`);
  }

  if (!config.kafkaBrokers || config.kafkaBrokers.length === 0) {
    errors.push("No Kafka brokers configured");
  }

  if (errors.length > 0) {
    console.error("Configuration validation failed:");
    errors.forEach(error => console.error(`  - ${error}`));
    Deno.exit(1);
  }
}

/**
 * Display startup banner
 */
function displayBanner(config: IngestionServiceConfig): void {
  const banner = `
╔══════════════════════════════════════════════════════════════════════════════╗
║                              DIP INGESTION SERVICE                           ║
║                                   v${config.version.padEnd(8)}                           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Environment: ${config.environment?.padEnd(15)} │ Port: ${config.port.toString().padEnd(19)} ║
║  Metrics Port: ${config.metricsPort?.toString().padEnd(13)} │ Rate Limit: ${config.maxRequestsPerMinute}/min      ║
║  Kafka Brokers: ${config.kafkaBrokers?.join(", ").padEnd(12)} │ Dedup TTL: ${Math.floor((config.deduplicationTtlMs || 0) / 1000).toString()}s       ║
╚══════════════════════════════════════════════════════════════════════════════╝
`;
  
  console.log(banner);
}

/**
 * Setup process event handlers
 */
function setupProcessHandlers(service: IngestionService): void {
  // Handle uncaught exceptions
  globalThis.addEventListener("error", (event) => {
    console.error("Uncaught exception:", event.error);
    console.error("Stack trace:", event.error?.stack);
    
    // Give the service a chance to cleanup
    service.shutdown().catch(err => {
      console.error("Error during emergency shutdown:", err);
      Deno.exit(1);
    });
  });

  // Handle unhandled promise rejections
  globalThis.addEventListener("unhandledrejection", (event) => {
    console.error("Unhandled promise rejection:", event.reason);
    event.preventDefault(); // Prevent default behavior (logging to console)
    
    // Give the service a chance to cleanup
    service.shutdown().catch(err => {
      console.error("Error during emergency shutdown:", err);
      Deno.exit(1);
    });
  });
}

/**
 * Health check and monitoring setup
 */
async function setupMonitoring(service: IngestionService): Promise<void> {
  // Wait for service to be ready
  let retries = 0;
  const maxRetries = 10;
  
  while (retries < maxRetries) {
    try {
      // Use a simpler check since getHealthStatus is protected
      const serviceStatus = service.getStatus();
      if (serviceStatus.isRunning) {
        console.log("✅ Service is healthy and ready to accept requests");
        break;
      }
    } catch (error) {
      console.log(`⏳ Waiting for service to be ready... (attempt ${retries + 1}/${maxRetries})`);
    }
    
    retries++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (retries >= maxRetries) {
    console.warn("⚠️  Service health check timeout - proceeding anyway");
  }
}

/**
 * Main application entry point
 */
async function main(): Promise<void> {
  console.log("🚀 Starting DIP Ingestion Service...");

  try {
    // Load and validate configuration
    const config = loadConfig();
    validateConfig(config);
    
    // Display startup information
    displayBanner(config);
    
    console.log("📋 Configuration loaded:");
    console.log(`  - Environment: ${config.environment}`);
    console.log(`  - Port: ${config.port}`);
    console.log(`  - Metrics Port: ${config.metricsPort}`);
    console.log(`  - Kafka Brokers: ${config.kafkaBrokers?.join(", ")}`);
    console.log(`  - Rate Limit: ${config.maxRequestsPerMinute} requests/minute`);
    console.log(`  - Deduplication: ${config.deduplicationEnabled ? "enabled" : "disabled"}`);
    console.log(`  - Attachments: ${config.enableAttachments ? "enabled" : "disabled"}`);
    console.log(`  - Custom Fields: ${config.enableCustomFields ? "enabled" : "disabled"}`);

    // Create and initialize service
    console.log("🔧 Creating service instance...");
    const service = new IngestionService(config);
    
    // Setup error handling
    setupProcessHandlers(service);
    
    // Start the service
    console.log("🎯 Starting service...");
    
    // Start service (this will block until shutdown)
    await service.start();
    
  } catch (error) {
    console.error("💥 Failed to start service:", error);
    
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      const env = Deno.env.get("DENO_ENV") || "development";
      if (env === "development") {
        console.error("Stack trace:", error.stack);
      }
    }
    
    Deno.exit(1);
  }
}

/**
 * CLI command handling
 */
if (import.meta.main) {
  const args = Deno.args;
  
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
DIP Ingestion Service v1.0.0

USAGE:
  deno run --allow-all main.ts [OPTIONS]

OPTIONS:
  --help, -h              Show this help message
  --version, -v           Show version information
  --config, -c            Show configuration (without starting)

ENVIRONMENT VARIABLES:
  PORT                    HTTP server port (default: 3001)
  METRICS_PORT           Metrics server port (default: 9001)
  DENO_ENV               Environment (development|staging|production)
  KAFKA_BROKERS          Comma-separated Kafka broker list
  RATE_LIMIT_MAX_REQUESTS Max requests per minute (default: 100)
  DEDUPLICATION_ENABLED   Enable request deduplication (default: true)
  DEDUPLICATION_TTL_MS    Deduplication TTL in milliseconds (default: 300000)
  ENABLE_ATTACHMENTS      Enable file attachments (default: true)
  ENABLE_CUSTOM_FIELDS    Enable custom fields (default: true)

EXAMPLES:
  # Start with default configuration
  deno run --allow-all main.ts
  
  # Start with custom port
  PORT=8080 deno run --allow-all main.ts
  
  # Start in production mode
  DENO_ENV=production deno run --allow-all main.ts

For more information, visit: https://docs.dip.com/services/ingestion
`);
    Deno.exit(0);
  }
  
  if (args.includes("--version") || args.includes("-v")) {
    console.log("DIP Ingestion Service v1.0.0");
    Deno.exit(0);
  }
  
  if (args.includes("--config") || args.includes("-c")) {
    const config = loadConfig();
    console.log("Current configuration:");
    console.log(JSON.stringify(config, null, 2));
    Deno.exit(0);
  }
  
  // Start the service
  await main();
}