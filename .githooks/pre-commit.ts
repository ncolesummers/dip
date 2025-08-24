#!/usr/bin/env -S deno run --allow-run --allow-read --allow-env

/**
 * Pre-commit hook for DIP (Deno Intelligence Platform)
 * 
 * This hook runs before each commit to ensure code quality by:
 * 1. Checking code formatting with deno fmt
 * 2. Running linting with deno lint
 * 3. Type checking with deno check
 * 
 * Only staged TypeScript files are checked for performance.
 * Runs all checks in parallel for speed (target: < 3 seconds).
 */

import { brightGreen, brightRed, yellow, gray, bold } from "@std/fmt/colors";

interface CheckResult {
  name: string;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * Get list of staged TypeScript files
 */
async function getStagedFiles(): Promise<string[]> {
  const process = new Deno.Command("git", {
    args: ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
    stdout: "piped",
  });

  const { stdout } = await process.output();
  const output = new TextDecoder().decode(stdout);
  
  return output
    .split("\n")
    .filter(file => file.endsWith(".ts") || file.endsWith(".tsx"))
    .filter(Boolean);
}

/**
 * Run a check command and return the result
 */
async function runCheck(
  name: string,
  command: string,
  args: string[]
): Promise<CheckResult> {
  const start = performance.now();
  
  try {
    const process = new Deno.Command(command, {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const { success, stderr } = await process.output();
    const duration = performance.now() - start;

    if (!success) {
      const error = new TextDecoder().decode(stderr);
      return { name, success: false, error, duration };
    }

    return { name, success: true, duration };
  } catch (error) {
    return { 
      name, 
      success: false, 
      error: error instanceof Error ? error.message : String(error),
      duration: performance.now() - start 
    };
  }
}

/**
 * Display a progress spinner
 */
function showProgress(message: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  
  const interval = setInterval(() => {
    Deno.stdout.writeSync(
      new TextEncoder().encode(`\r${frames[i]} ${message}`)
    );
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(interval);
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K")); // Clear line
  };
}

/**
 * Main pre-commit hook logic
 */
async function main() {
  // Get staged files
  const files = await getStagedFiles();
  
  if (files.length === 0) {
    console.log(brightGreen("✓") + " No TypeScript files staged for commit");
    Deno.exit(0);
  }

  console.log(bold(`\n🔍 Pre-commit checks for DIP`));
  console.log(gray(`Checking ${files.length} staged TypeScript file${files.length > 1 ? 's' : ''}...\n`));

  // Show files being checked (truncate if too many)
  if (files.length <= 5) {
    files.forEach(file => console.log(gray(`  • ${file}`)));
  } else {
    files.slice(0, 4).forEach(file => console.log(gray(`  • ${file}`)));
    console.log(gray(`  • ... and ${files.length - 4} more`));
  }
  console.log("");

  const stopProgress = showProgress("Running quality checks...");

  // Run all checks in parallel for speed
  const checks = await Promise.all([
    runCheck("Format", "deno", ["fmt", "--check", "--quiet", ...files]),
    runCheck("Lint", "deno", ["lint", "--quiet", ...files]),
    runCheck("Type Check", "deno", ["check", "--quiet", "--no-lock", ...files]),
  ]);

  stopProgress();

  // Display results
  let hasFailures = false;
  const totalDuration = checks.reduce((sum, check) => sum + check.duration, 0);

  checks.forEach(({ name, success, duration }) => {
    const status = success ? brightGreen("✓") : brightRed("✗");
    const time = gray(`(${(duration / 1000).toFixed(2)}s)`);
    console.log(`${status} ${name} ${time}`);
    if (!success) hasFailures = true;
  });

  console.log(gray(`\nTotal time: ${(totalDuration / 1000).toFixed(2)}s`));

  // If there are failures, show helpful error messages
  if (hasFailures) {
    console.log("\n" + brightRed("❌ Pre-commit checks failed!\n"));
    
    const failedChecks = checks.filter(c => !c.success);
    
    failedChecks.forEach(({ name, error }) => {
      console.log(yellow(`${name} errors:`));
      
      if (name === "Format") {
        console.log("  Run " + bold("deno fmt") + " to fix formatting issues automatically");
      } else if (name === "Lint") {
        console.log("  Run " + bold("deno lint") + " to see detailed linting errors");
        if (error && error.includes("no-explicit-any")) {
          console.log("  Consider using " + bold("unknown") + " instead of " + bold("any"));
        }
      } else if (name === "Type Check") {
        console.log("  Run " + bold("deno check **/*.ts") + " to see type errors");
        console.log("  Make sure all imports are properly typed");
      }
      console.log("");
    });

    console.log(gray("To bypass hooks in emergency: git commit --no-verify\n"));
    Deno.exit(1);
  }

  // All checks passed!
  console.log("\n" + brightGreen("✅ All pre-commit checks passed!"));
  console.log(gray("Your code is ready to commit.\n"));
}

// Run the hook
if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    console.error(brightRed("Hook error:"), error);
    console.error(gray("\nTo bypass: git commit --no-verify"));
    Deno.exit(1);
  }
}