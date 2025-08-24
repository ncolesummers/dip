#!/usr/bin/env -S deno run --allow-read --allow-write --allow-run

/**
 * Git hooks installation script for DIP (Deno Intelligence Platform)
 * 
 * This script installs or uninstalls the Deno-based git hooks.
 * It configures git to use the .githooks directory for hooks.
 * 
 * Usage:
 *   deno run --allow-read --allow-write --allow-run .githooks/install.ts
 *   deno run --allow-read --allow-write --allow-run .githooks/install.ts --uninstall
 */

import { brightGreen, brightRed, yellow, gray, bold, cyan } from "@std/fmt/colors.ts";
import { parse } from "@std/flags";
import { exists } from "@std/fs";

interface InstallOptions {
  uninstall: boolean;
  force: boolean;
  help: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): InstallOptions {
  const args = parse(Deno.args, {
    boolean: ["uninstall", "force", "help"],
    alias: {
      u: "uninstall",
      f: "force",
      h: "help",
    },
  });

  return {
    uninstall: args.uninstall as boolean || false,
    force: args.force as boolean || false,
    help: args.help as boolean || false,
  };
}

/**
 * Display help message
 */
function showHelp() {
  console.log(bold("\n🪝 DIP Git Hooks Installer\n"));
  console.log("Install or uninstall Deno-based git hooks for code quality enforcement.\n");
  console.log(bold("Usage:"));
  console.log("  deno task hooks:install       Install git hooks");
  console.log("  deno task hooks:uninstall     Uninstall git hooks");
  console.log("");
  console.log(bold("Options:"));
  console.log("  -u, --uninstall    Uninstall hooks and restore defaults");
  console.log("  -f, --force        Force installation, overwriting existing hooks");
  console.log("  -h, --help         Show this help message");
  console.log("");
  console.log(bold("Examples:"));
  console.log(gray("  # Install hooks"));
  console.log("  deno run --allow-read --allow-write --allow-run .githooks/install.ts");
  console.log("");
  console.log(gray("  # Uninstall hooks"));
  console.log("  deno run --allow-read --allow-write --allow-run .githooks/install.ts --uninstall");
}

/**
 * Check if git is installed and we're in a git repository
 */
async function checkGitRepository(): Promise<boolean> {
  try {
    const process = new Deno.Command("git", {
      args: ["rev-parse", "--git-dir"],
      stdout: "piped",
      stderr: "piped",
    });
    
    const { success } = await process.output();
    return success;
  } catch {
    return false;
  }
}

/**
 * Get the current git hooks path
 */
async function getCurrentHooksPath(): Promise<string | null> {
  try {
    const process = new Deno.Command("git", {
      args: ["config", "--get", "core.hooksPath"],
      stdout: "piped",
    });
    
    const { stdout, success } = await process.output();
    if (!success) return null;
    
    const path = new TextDecoder().decode(stdout).trim();
    return path || null;
  } catch {
    return null;
  }
}

/**
 * Install the git hooks
 */
async function installHooks(options: InstallOptions): Promise<void> {
  console.log(bold("\n🚀 Installing DIP Git Hooks\n"));

  // Check if we're in a git repository
  if (!await checkGitRepository()) {
    console.error(brightRed("✗") + " Not in a git repository!");
    console.error(gray("  Please run this command from the project root."));
    Deno.exit(1);
  }

  // Check current hooks path
  const currentPath = await getCurrentHooksPath();
  if (currentPath === ".githooks" && !options.force) {
    console.log(brightGreen("✓") + " Hooks are already installed!");
    console.log(gray("  Use --force to reinstall."));
    return;
  }

  if (currentPath && currentPath !== ".githooks" && !options.force) {
    console.log(yellow("⚠") + ` Git hooks are currently set to: ${currentPath}`);
    console.log("  Use --force to override this setting.");
    const proceed = confirm("Do you want to continue?");
    if (!proceed) {
      console.log(gray("Installation cancelled."));
      return;
    }
  }

  // Check if hooks directory exists
  if (!await exists(".githooks")) {
    console.error(brightRed("✗") + " .githooks directory not found!");
    console.error(gray("  Please ensure you're in the project root."));
    Deno.exit(1);
  }

  // Set git hooks path
  console.log(gray("Setting git hooks path to .githooks..."));
  const setPathProcess = new Deno.Command("git", {
    args: ["config", "core.hooksPath", ".githooks"],
  });
  
  const { success: setPathSuccess } = await setPathProcess.output();
  if (!setPathSuccess) {
    console.error(brightRed("✗") + " Failed to set git hooks path!");
    Deno.exit(1);
  }

  // Make hook files executable (Unix-like systems)
  if (Deno.build.os !== "windows") {
    console.log(gray("Making hook files executable..."));
    
    const hooks = ["pre-commit.ts", "commit-msg.ts"];
    for (const hook of hooks) {
      const hookPath = `.githooks/${hook}`;
      if (await exists(hookPath)) {
        await Deno.chmod(hookPath, 0o755);
      }
    }
  }

  // Display success message
  console.log("\n" + brightGreen("✅ Git hooks installed successfully!\n"));
  
  console.log(bold("Installed hooks:"));
  console.log(brightGreen("  ✓") + " pre-commit   - Runs formatting, linting, and type checking");
  console.log(brightGreen("  ✓") + " commit-msg   - Enforces conventional commit format");
  
  console.log(bold("\n📝 Commit format:"));
  console.log(gray("  <type>(<scope>): <description>"));
  console.log(gray("  Example: feat(services): add health check endpoint"));
  
  console.log(bold("\n🛠️ Available commands:"));
  console.log(cyan("  deno task hooks:test") + "      - Test hooks without committing");
  console.log(cyan("  deno task hooks:uninstall") + " - Remove hooks");
  console.log(cyan("  git commit --no-verify") + "    - Bypass hooks (emergency only)");
  
  console.log(gray("\n💡 Tip: Hooks run automatically on git commit"));
}

/**
 * Uninstall the git hooks
 */
async function uninstallHooks(): Promise<void> {
  console.log(bold("\n🔄 Uninstalling DIP Git Hooks\n"));

  // Check if we're in a git repository
  if (!await checkGitRepository()) {
    console.error(brightRed("✗") + " Not in a git repository!");
    Deno.exit(1);
  }

  // Check current hooks path
  const currentPath = await getCurrentHooksPath();
  if (!currentPath || currentPath !== ".githooks") {
    console.log(yellow("⚠") + " Hooks don't appear to be installed");
    console.log(gray(`  Current hooks path: ${currentPath || "(default)"}`));
  }

  // Reset git hooks path to default
  console.log(gray("Resetting git hooks path to default..."));
  const unsetProcess = new Deno.Command("git", {
    args: ["config", "--unset", "core.hooksPath"],
  });
  
  const { success } = await unsetProcess.output();
  if (!success) {
    // Try to set it to .git/hooks explicitly
    const resetProcess = new Deno.Command("git", {
      args: ["config", "core.hooksPath", ".git/hooks"],
    });
    await resetProcess.output();
  }

  console.log("\n" + brightGreen("✅ Git hooks uninstalled successfully!"));
  console.log(gray("  Git will now use the default .git/hooks directory."));
  console.log(gray("\n💡 To reinstall: deno task hooks:install"));
}

/**
 * Main installation logic
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    return;
  }

  try {
    if (options.uninstall) {
      await uninstallHooks();
    } else {
      await installHooks(options);
    }
  } catch (error) {
    console.error(brightRed("\n❌ Installation failed!"));
    console.error(brightRed("Error:"), error);
    Deno.exit(1);
  }
}

// Run the installer
if (import.meta.main) {
  await main();
}