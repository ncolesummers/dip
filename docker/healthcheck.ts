#!/usr/bin/env -S deno run --allow-net

/**
 * Health Check Script for DIP Microservices
 * 
 * This script performs health checks on the running service
 * Used by Docker healthcheck and monitoring systems
 */

const HEALTH_ENDPOINT = "http://localhost:8000/health";
const TIMEOUT_MS = 5000;

interface HealthResponse {
  status: "healthy" | "unhealthy" | "degraded";
  timestamp: string;
  service: string;
  version: string;
  uptime: number;
  dependencies?: Record<string, "healthy" | "unhealthy" | "unknown">;
}

async function checkHealth(): Promise<void> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    console.log(`Checking health at ${HEALTH_ENDPOINT}...`);
    
    const response = await fetch(HEALTH_ENDPOINT, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Docker-HealthCheck/1.0",
        "Accept": "application/json",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`Health check failed: HTTP ${response.status} ${response.statusText}`);
      Deno.exit(1);
    }

    const healthData: HealthResponse = await response.json();
    
    console.log(`Service: ${healthData.service}`);
    console.log(`Status: ${healthData.status}`);
    console.log(`Uptime: ${healthData.uptime}s`);
    
    if (healthData.dependencies) {
      console.log("Dependencies:");
      for (const [name, status] of Object.entries(healthData.dependencies)) {
        console.log(`  ${name}: ${status}`);
      }
    }

    if (healthData.status === "unhealthy") {
      console.error("Service reported unhealthy status");
      Deno.exit(1);
    }

    if (healthData.status === "degraded") {
      console.warn("Service reported degraded status");
      // Exit 0 for degraded - still considered passing for Docker
    }

    console.log("Health check passed ✓");
    Deno.exit(0);

  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === "AbortError") {
      console.error(`Health check timed out after ${TIMEOUT_MS}ms`);
    } else if (error instanceof TypeError && error.message.includes("connection refused")) {
      console.error("Connection refused - service may not be running");
    } else {
      console.error(`Health check failed: ${error.message}`);
    }
    
    Deno.exit(1);
  }
}

// Handle graceful shutdown
const handleSignal = (signal: string) => {
  console.log(`Received ${signal}, exiting health check...`);
  Deno.exit(1);
};

// Set up signal handlers
Deno.addSignalListener("SIGINT", () => handleSignal("SIGINT"));
Deno.addSignalListener("SIGTERM", () => handleSignal("SIGTERM"));

// Run health check
if (import.meta.main) {
  await checkHealth();
}