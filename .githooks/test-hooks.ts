#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write --allow-env

/**
 * Test script for DIP git hooks
 * Tests both pre-commit and commit-msg hooks
 */

import { brightGreen, brightRed, yellow, bold } from "@std/fmt/colors.ts";

async function testPreCommit() {
  console.log(bold("\n🧪 Testing pre-commit hook...\n"));
  
  const process = new Deno.Command("deno", {
    args: ["run", "--allow-run", "--allow-read", "--allow-env", ".githooks/pre-commit.ts"],
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stdout, stderr } = await process.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  console.log(output);
  if (error) console.error(error);

  if (success || output.includes("No TypeScript files staged")) {
    console.log(brightGreen("✅ Pre-commit hook test passed!"));
    return true;
  } else {
    console.log(brightRed("❌ Pre-commit hook test failed!"));
    return false;
  }
}

async function testCommitMsg(message: string, shouldPass: boolean) {
  // Create a temporary file with the commit message
  const tempFile = await Deno.makeTempFile();
  await Deno.writeTextFile(tempFile, message);

  const process = new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-env", ".githooks/commit-msg.ts", tempFile],
    stdout: "piped",
    stderr: "piped",
  });

  const { success, stdout, stderr } = await process.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  // Clean up temp file
  await Deno.remove(tempFile);

  console.log(output);
  if (error) console.error(error);

  const passed = success === shouldPass;
  return passed;
}

async function main() {
  console.log(bold("🚀 DIP Git Hooks Test Suite\n"));

  let allPassed = true;

  // Test pre-commit hook
  const preCommitPassed = await testPreCommit();
  allPassed = allPassed && preCommitPassed;

  // Test commit-msg hook with valid messages
  console.log(bold("\n🧪 Testing commit-msg hook with VALID messages...\n"));
  
  const validMessages = [
    "feat: add new feature",
    "fix(auth): resolve login issue",
    "docs: update README",
    "chore(deps): upgrade dependencies",
    "test(services): add unit tests",
  ];

  for (const msg of validMessages) {
    console.log(yellow(`Testing: "${msg}"`));
    const passed = await testCommitMsg(msg, true);
    if (passed) {
      console.log(brightGreen("  ✓ Passed (as expected)"));
    } else {
      console.log(brightRed("  ✗ Failed (should have passed!)"));
      allPassed = false;
    }
    console.log("");
  }

  // Test commit-msg hook with invalid messages
  console.log(bold("\n🧪 Testing commit-msg hook with INVALID messages...\n"));
  
  const invalidMessages = [
    "bad commit message",
    "feat add feature without colon",
    "invalid: not a valid type",
    "Fix: should be lowercase",
    "feat: Should start with lowercase.",
  ];

  for (const msg of invalidMessages) {
    console.log(yellow(`Testing: "${msg}"`));
    const passed = await testCommitMsg(msg, false);
    if (passed) {
      console.log(brightGreen("  ✓ Failed correctly (as expected)"));
    } else {
      console.log(brightRed("  ✗ Passed (should have failed!)"));
      allPassed = false;
    }
    console.log("");
  }

  // Final result
  console.log(bold("\n📊 Test Results:"));
  if (allPassed) {
    console.log(brightGreen("✅ All hook tests passed!"));
    console.log("\nYour git hooks are working correctly! 🎉");
  } else {
    console.log(brightRed("❌ Some hook tests failed!"));
    console.log("\nPlease check the output above for details.");
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}