#!/usr/bin/env -S deno run --allow-read --allow-env

/**
 * Commit message hook for DIP (Deno Intelligence Platform)
 * 
 * Enforces conventional commit format:
 * - type(scope): description
 * - type: description
 * 
 * Also validates:
 * - Message length constraints
 * - Proper formatting
 * - Valid commit types
 */

import { brightGreen, brightRed, yellow, gray, bold, cyan } from "@std/fmt/colors";

// Valid commit types based on Conventional Commits and Angular convention
const COMMIT_TYPES = {
  feat: "A new feature",
  fix: "A bug fix",
  docs: "Documentation only changes",
  style: "Changes that don't affect code meaning (white-space, formatting, etc)",
  refactor: "Code change that neither fixes a bug nor adds a feature",
  perf: "Code change that improves performance",
  test: "Adding missing tests or correcting existing tests",
  build: "Changes that affect the build system or external dependencies",
  ci: "Changes to CI configuration files and scripts",
  chore: "Other changes that don't modify src or test files",
  revert: "Reverts a previous commit",
  wip: "Work in progress (should not be used in main branch)",
};

// Special commit patterns to allow
const SPECIAL_PATTERNS = [
  /^Merge branch/,
  /^Merge pull request/,
  /^Revert "/,
  /^Initial commit$/,
];

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Read the commit message from the file provided by git
 */
async function readCommitMessage(filepath: string): Promise<string> {
  try {
    const content = await Deno.readTextFile(filepath);
    // Remove comments and trailing whitespace
    return content
      .split("\n")
      .filter(line => !line.startsWith("#"))
      .join("\n")
      .trim();
  } catch (error) {
    throw new Error(`Failed to read commit message: ${error}`);
  }
}

/**
 * Validate the commit message format
 */
function validateCommitMessage(message: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check for special patterns (merge commits, reverts, etc.)
  if (SPECIAL_PATTERNS.some(pattern => pattern.test(message))) {
    return { valid: true, errors, warnings, suggestions };
  }

  // Split into lines
  const lines = message.split("\n");
  const firstLine = lines[0];

  // Check first line length (should be <= 72 characters)
  if (firstLine.length > 72) {
    warnings.push(`First line is ${firstLine.length} characters (recommended: ≤72)`);
  }

  // Check for empty commit message
  if (!firstLine || firstLine.trim().length === 0) {
    errors.push("Commit message cannot be empty");
    return { valid: false, errors, warnings, suggestions };
  }

  // Conventional commit regex
  // Matches: type(scope): description or type: description
  const conventionalCommitRegex = /^(\w+)(\([\w\-\/]+\))?!?: .+$/;
  
  if (!conventionalCommitRegex.test(firstLine)) {
    errors.push("Message doesn't follow conventional commit format");
    suggestions.push("Format: <type>(<scope>): <description>");
    suggestions.push("Example: feat(auth): add login functionality");
    suggestions.push("Example: fix: resolve memory leak in event handler");
    
    // Try to provide more specific guidance
    if (!firstLine.includes(":")) {
      errors.push("Missing colon after type/scope");
    }
    if (firstLine.startsWith(" ")) {
      errors.push("Message should not start with whitespace");
    }
    
    return { valid: false, errors, warnings, suggestions };
  }

  // Extract type and validate it
  const typeMatch = firstLine.match(/^(\w+)/);
  if (typeMatch) {
    const type = typeMatch[1];
    if (!Object.keys(COMMIT_TYPES).includes(type)) {
      errors.push(`Invalid commit type: '${type}'`);
      suggestions.push(`Valid types: ${Object.keys(COMMIT_TYPES).join(", ")}`);
    }
  }

  // Check for scope format if present
  const scopeMatch = firstLine.match(/\(([^)]+)\)/);
  if (scopeMatch) {
    const scope = scopeMatch[1];
    // Validate scope format (alphanumeric, dash, slash)
    if (!/^[\w\-\/]+$/.test(scope)) {
      warnings.push(`Scope '${scope}' contains invalid characters (use letters, numbers, -, /)`);
    }
    
    // Check for common DIP scopes
    const commonScopes = [
      "ingestion", "classifier", "routing", "response", 
      "events", "schemas", "services", "observability",
      "docker", "docs", "deps", "config", "tests"
    ];
    
    if (!commonScopes.includes(scope.toLowerCase())) {
      suggestions.push(`Common scopes in DIP: ${commonScopes.slice(0, 5).join(", ")}...`);
    }
  }

  // Check description
  const descriptionMatch = firstLine.match(/: (.+)$/);
  if (descriptionMatch) {
    const description = descriptionMatch[1];
    
    // Description should start with lowercase
    if (description[0] === description[0].toUpperCase() && !/^[A-Z]{2,}/.test(description)) {
      warnings.push("Description should start with lowercase");
    }
    
    // Description should not end with period
    if (description.endsWith(".")) {
      warnings.push("Description should not end with a period");
    }
    
    // Check for imperative mood
    const nonImperativeStarts = ["added", "adds", "adding", "fixed", "fixes", "fixing"];
    const firstWord = description.split(" ")[0].toLowerCase();
    if (nonImperativeStarts.includes(firstWord)) {
      warnings.push(`Use imperative mood (e.g., 'add' instead of '${firstWord}')`);
    }
  }

  // Check body format if present
  if (lines.length > 1) {
    // Should have blank line after first line
    if (lines[1].trim() !== "") {
      errors.push("Add blank line after first line before body");
    }
    
    // Check body line length
    for (let i = 2; i < lines.length; i++) {
      if (lines[i].length > 100) {
        warnings.push(`Line ${i + 1} is ${lines[i].length} characters (recommended: ≤100)`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions,
  };
}

/**
 * Display validation results with nice formatting
 */
function displayResults(result: ValidationResult, message: string) {
  if (result.valid) {
    console.log(brightGreen("✓") + " Commit message validation passed");
    
    if (result.warnings.length > 0) {
      console.log(yellow("\n⚠ Warnings:"));
      result.warnings.forEach(warning => {
        console.log(yellow("  •") + " " + warning);
      });
    }
    
    return;
  }

  // Display errors
  console.log(brightRed("\n❌ Commit message validation failed!\n"));
  
  console.log(bold("Your message:"));
  console.log(gray("  " + message.split("\n")[0]));
  
  if (result.errors.length > 0) {
    console.log(brightRed("\n✗ Errors:"));
    result.errors.forEach(error => {
      console.log(brightRed("  •") + " " + error);
    });
  }
  
  if (result.suggestions.length > 0) {
    console.log(cyan("\n💡 Suggestions:"));
    result.suggestions.forEach(suggestion => {
      console.log(cyan("  •") + " " + suggestion);
    });
  }
  
  // Show valid commit types
  console.log(bold("\n📝 Valid commit types:"));
  Object.entries(COMMIT_TYPES).forEach(([type, description]) => {
    console.log(gray(`  ${type.padEnd(10)} - ${description}`));
  });
  
  console.log(bold("\n📚 Examples of good commit messages:"));
  console.log(gray("  • feat(services): add health check endpoint to BaseService"));
  console.log(gray("  • fix: resolve memory leak in Kafka consumer"));
  console.log(gray("  • docs: update ADR for KRaft migration"));
  console.log(gray("  • test(ingestion): add unit tests for event validation"));
  console.log(gray("  • chore(deps): upgrade Deno to 2.0.0"));
  
  console.log(gray("\n🔧 To edit your commit message:"));
  console.log(gray("  git commit --amend"));
  console.log(gray("\n⚡ To bypass this check (not recommended):"));
  console.log(gray("  git commit --no-verify"));
}

/**
 * Main commit-msg hook logic
 */
async function main() {
  // Git passes the commit message file as the first argument
  const commitMsgFile = Deno.args[0];
  
  if (!commitMsgFile) {
    console.error(brightRed("Error: No commit message file provided"));
    Deno.exit(1);
  }
  
  try {
    console.log(bold("\n📋 Validating commit message for DIP..."));
    
    const message = await readCommitMessage(commitMsgFile);
    const result = validateCommitMessage(message);
    
    displayResults(result, message);
    
    if (!result.valid) {
      Deno.exit(1);
    }
    
    // If there are warnings but no errors, still pass
    if (result.warnings.length > 0) {
      console.log(gray("\nProceeding with warnings..."));
    }
    
  } catch (error) {
    console.error(brightRed("Hook error:"), error);
    Deno.exit(1);
  }
}

// Run the hook
if (import.meta.main) {
  await main();
}