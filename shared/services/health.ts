/**
 * Health check utilities
 * Common health check implementations for services
 */

import postgres from "postgres";

/**
 * Check PostgreSQL connectivity
 */
export async function checkPostgres(connectionString: string): Promise<{
  status: "ok" | "error";
  message?: string;
  latency?: number;
}> {
  const start = Date.now();

  try {
    const sql = postgres(connectionString, {
      max: 1,
      timeout: 5,
    });

    await sql`SELECT 1 as check`;
    await sql.end();

    return {
      status: "ok",
      message: "PostgreSQL is reachable",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "error",
      message: `PostgreSQL check failed: ${error.message}`,
      latency: Date.now() - start,
    };
  }
}

/**
 * Check Redis connectivity
 */
export async function checkRedis(url: string): Promise<{
  status: "ok" | "error";
  message?: string;
  latency?: number;
}> {
  const start = Date.now();

  try {
    const { createClient } = await import("redis");
    const client = createClient({ url });

    await client.connect();
    await client.ping();
    await client.disconnect();

    return {
      status: "ok",
      message: "Redis is reachable",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Redis check failed: ${error.message}`,
      latency: Date.now() - start,
    };
  }
}

/**
 * Check HTTP endpoint
 */
export async function checkHttpEndpoint(url: string, expectedStatus = 200): Promise<{
  status: "ok" | "error";
  message?: string;
  latency?: number;
}> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.status === expectedStatus) {
      return {
        status: "ok",
        message: `HTTP endpoint returned ${response.status}`,
        latency: Date.now() - start,
      };
    } else {
      return {
        status: "error",
        message: `HTTP endpoint returned ${response.status}, expected ${expectedStatus}`,
        latency: Date.now() - start,
      };
    }
  } catch (error) {
    return {
      status: "error",
      message: `HTTP check failed: ${error.message}`,
      latency: Date.now() - start,
    };
  }
}

/**
 * Check Kafka connectivity
 */
export async function checkKafka(brokers: string[]): Promise<{
  status: "ok" | "error";
  message?: string;
  latency?: number;
}> {
  const start = Date.now();

  try {
    const { Kafka } = await import("kafkajs");

    const kafka = new Kafka({
      clientId: "health-check",
      brokers,
      connectionTimeout: 5000,
      requestTimeout: 5000,
    });

    const admin = kafka.admin();
    await admin.connect();
    await admin.listTopics();
    await admin.disconnect();

    return {
      status: "ok",
      message: "Kafka is reachable",
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Kafka check failed: ${error.message}`,
      latency: Date.now() - start,
    };
  }
}

/**
 * Check disk space
 */
export async function checkDiskSpace(path = "/", thresholdPercent = 90): Promise<{
  status: "ok" | "error";
  message?: string;
  usage?: number;
}> {
  try {
    const command = new Deno.Command("df", {
      args: ["-h", path],
    });

    const { stdout } = await command.output();
    const output = new TextDecoder().decode(stdout);
    const lines = output.split("\n");

    if (lines.length < 2) {
      throw new Error("Unable to parse df output");
    }

    const dataLine = lines[1];
    const parts = dataLine.split(/\s+/);
    const usageStr = parts[4];
    const usage = parseInt(usageStr.replace("%", ""));

    if (usage >= thresholdPercent) {
      return {
        status: "error",
        message: `Disk usage is ${usage}%, exceeds threshold of ${thresholdPercent}%`,
        usage,
      };
    }

    return {
      status: "ok",
      message: `Disk usage is ${usage}%`,
      usage,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Disk check failed: ${error.message}`,
    };
  }
}

/**
 * Check memory usage
 */
export function checkMemory(thresholdPercent = 90): {
  status: "ok" | "error";
  message?: string;
  usage?: number;
} {
  try {
    const memInfo = Deno.memoryUsage();
    const totalMemory = memInfo.rss;
    const usedMemory = memInfo.heapUsed;
    const usage = Math.round((usedMemory / totalMemory) * 100);

    if (usage >= thresholdPercent) {
      return {
        status: "error",
        message: `Memory usage is ${usage}%, exceeds threshold of ${thresholdPercent}%`,
        usage,
      };
    }

    return {
      status: "ok",
      message: `Memory usage is ${usage}%`,
      usage,
    };
  } catch (error) {
    return {
      status: "error",
      message: `Memory check failed: ${error.message}`,
    };
  }
}

/**
 * Check external API
 */
export async function checkExternalApi(
  url: string,
  headers?: Record<string, string>,
  expectedResponseTime = 2000,
): Promise<{
  status: "ok" | "error";
  message?: string;
  latency?: number;
}> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), expectedResponseTime);

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);
    const latency = Date.now() - start;

    if (!response.ok) {
      return {
        status: "error",
        message: `API returned ${response.status} ${response.statusText}`,
        latency,
      };
    }

    if (latency > expectedResponseTime) {
      return {
        status: "error",
        message: `API response time ${latency}ms exceeds threshold ${expectedResponseTime}ms`,
        latency,
      };
    }

    return {
      status: "ok",
      message: "API is responsive",
      latency,
    };
  } catch (error) {
    return {
      status: "error",
      message: `API check failed: ${error.message}`,
      latency: Date.now() - start,
    };
  }
}

/**
 * Composite health check runner
 */
export class HealthCheckRunner {
  private checks: Map<
    string,
    () => Promise<{
      status: "ok" | "error";
      message?: string;
      [key: string]: unknown;
    }>
  > = new Map();

  /**
   * Register a health check
   */
  register(
    name: string,
    check: () => Promise<{
      status: "ok" | "error";
      message?: string;
      [key: string]: unknown;
    }>,
  ): void {
    this.checks.set(name, check);
  }

  /**
   * Run all health checks
   */
  async runAll(): Promise<
    Record<string, {
      status: "ok" | "error";
      message?: string;
      [key: string]: unknown;
    }>
  > {
    const results: Record<string, {
      status: "ok" | "error";
      message?: string;
      [key: string]: unknown;
    }> = {};

    const promises = Array.from(this.checks.entries()).map(async ([name, check]) => {
      try {
        results[name] = await check();
      } catch (error) {
        results[name] = {
          status: "error",
          message: `Check failed: ${error.message}`,
        };
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Run health checks with timeout
   */
  runWithTimeout(timeoutMs = 10000): Promise<
    Record<string, {
      status: "ok" | "error";
      message?: string;
      [key: string]: unknown;
    }>
  > {
    return Promise.race([
      this.runAll(),
      new Promise<Record<string, {
        status: "ok" | "error";
        message?: string;
        [key: string]: unknown;
      }>>((_, reject) =>
        setTimeout(() => reject(new Error("Health check timeout")), timeoutMs)
      ),
    ]);
  }

  /**
   * Get overall health status
   */
  async getOverallStatus(): Promise<"healthy" | "degraded" | "unhealthy"> {
    const results = await this.runAll();
    const statuses = Object.values(results).map((r) => r.status);

    if (statuses.every((s) => s === "ok")) {
      return "healthy";
    } else if (statuses.some((s) => s === "ok")) {
      return "degraded";
    } else {
      return "unhealthy";
    }
  }
}
