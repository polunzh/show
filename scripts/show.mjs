#!/usr/bin/env node

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const CONFIG_DIR = path.join(os.homedir(), ".show");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const HISTORY_FILE = path.join(CONFIG_DIR, "deployments.json");
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;
const DEFAULT_API_URL = "https://show.127.dev";

// --- Config ---

function loadConfig() {
  const apiUrl = process.env.SHOW_API_URL;
  const token = process.env.SHOW_TOKEN;

  if (apiUrl || token) {
    return { apiUrl: apiUrl || DEFAULT_API_URL, token };
  }

  if (fs.existsSync(CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    return {
      apiUrl: apiUrl || config.apiUrl || DEFAULT_API_URL,
      token: token || config.token,
    };
  }

  return { apiUrl: DEFAULT_API_URL, token };
}

// --- History ---

function loadHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveHistory(entries) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2));
}

function appendHistory(entry) {
  const history = loadHistory();
  history.push(entry);
  saveHistory(history);
}

// --- Arg parsing ---

function parseArgs(args) {
  const result = { positional: [], flags: {} };
  let i = 0;
  while (i < args.length) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        result.flags[key] = args[i + 1];
        i += 2;
      } else {
        result.flags[key] = true;
        i++;
      }
    } else {
      result.positional.push(args[i]);
      i++;
    }
  }
  return result;
}

// --- Commands ---

async function deploy(args) {
  const { positional, flags } = parseArgs(args);
  const dir = positional[0];

  if (!dir) {
    console.error("Usage: show deploy <directory> [--name <name>] [--mode static|spa] [--json]");
    process.exit(2);
  }

  const absDir = path.resolve(dir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    console.error(`Error: ${absDir} is not a directory`);
    process.exit(1);
  }

  const config = loadConfig();

  const jsonOutput = flags.json === true;
  const name = typeof flags.name === "string" ? flags.name : path.basename(absDir);
  const mode = flags.mode === "spa" ? "spa" : "static";

  // Create tar.gz
  const tmpFile = path.join(os.tmpdir(), `show-upload-${Date.now()}.tar.gz`);
  try {
    if (!jsonOutput) process.stdout.write("Packing files...\n");
    execSync(`tar czf "${tmpFile}" -C "${absDir}" .`, { stdio: "pipe" });

    const stats = fs.statSync(tmpFile);
    if (stats.size > MAX_UPLOAD_SIZE) {
      console.error(
        `Error: Archive size ${(stats.size / 1024 / 1024).toFixed(1)}MB exceeds 10MB limit`,
      );
      process.exit(1);
    }

    if (!jsonOutput) process.stdout.write("Uploading...\n");

    const fileBlob = new Blob([fs.readFileSync(tmpFile)]);
    const formData = new FormData();
    formData.append("file", fileBlob, "upload.tar.gz");
    formData.append("name", name);
    formData.append("mode", mode);

    const headers = {};
    if (config.token) {
      headers.Authorization = `Bearer ${config.token}`;
    }

    const response = await fetch(`${config.apiUrl}/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    const result = await response.json();

    if (!response.ok) {
      if (jsonOutput) {
        console.log(JSON.stringify(result));
      } else {
        console.error(`Error: ${result.message || "Upload failed"} (${result.error})`);
      }
      process.exit(1);
    }

    // Save to history
    appendHistory({
      deploymentId: result.deploymentId,
      url: result.url,
      createdAt: result.createdAt,
      expiresAt: result.expiresAt,
      sourcePath: absDir,
      deploymentName: name,
      mode: result.mode,
    });

    if (jsonOutput) {
      console.log(JSON.stringify(result));
    } else {
      console.log(`\nLive at: ${result.url}`);
      console.log(`Expires: ${result.expiresAt} (48h)`);
      console.log(`Mode: ${result.mode}`);
      console.log(`ID: ${result.deploymentId}`);
    }
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

async function list(args) {
  const { flags } = parseArgs(args);
  const jsonOutput = flags.json === true;
  const history = loadHistory();

  if (history.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ active: [], expired: [] }));
    } else {
      console.log("No deployments found.");
    }
    return;
  }

  const now = Date.now();
  const active = [];
  const expired = [];

  for (const entry of history) {
    if (new Date(entry.expiresAt).getTime() > now) {
      active.push(entry);
    } else {
      expired.push(entry);
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({ active, expired }));
    return;
  }

  if (active.length > 0) {
    console.log("Active:");
    for (const e of active) {
      const remaining = Math.ceil((new Date(e.expiresAt).getTime() - now) / 3600000);
      console.log(`  ${e.url}  (${remaining}h remaining)`);
    }
  }

  if (expired.length > 0) {
    console.log("\nExpired:");
    for (const e of expired) {
      console.log(`  ${e.url}  (expired ${e.expiresAt})`);
    }
  }

  if (active.length === 0 && expired.length === 0) {
    console.log("No deployments found.");
  }
}

async function inspect(args) {
  const { positional, flags } = parseArgs(args);
  const input = positional[0];

  if (!input) {
    console.error("Usage: show inspect <url|deployment-id> [--json]");
    process.exit(2);
  }

  const config = loadConfig();

  const jsonOutput = flags.json === true;

  // Extract deployment ID from URL or use directly
  let deploymentId = input;
  try {
    const url = new URL(input);
    const hostParts = url.hostname.split(".");
    if (hostParts.length >= 3) {
      deploymentId = hostParts[0];
    }
  } catch {
    // Not a URL, use as-is
  }

  const headers = {};
  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  const response = await fetch(`${config.apiUrl}/_admin/deployments/${deploymentId}`, {
    headers,
  });

  const result = await response.json();

  if (!response.ok) {
    if (jsonOutput) {
      console.log(JSON.stringify(result));
    } else {
      console.error(`Error: ${result.message || "Inspect failed"}`);
    }
    process.exit(1);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(result));
    return;
  }

  console.log(`Deployment: ${result.deploymentId}`);
  console.log(`Status:     ${result.status}`);
  console.log(`Mode:       ${result.mode}`);
  console.log(`Created:    ${result.createdAt}`);
  console.log(`Expires:    ${result.expiresAt}`);
  console.log(`Files:      ${result.fileCount}`);
  console.log(`Size:       ${(result.totalSize / 1024).toFixed(1)} KB`);
  if (result.lastError) {
    console.log(`Error:      [${result.lastError.code}] ${result.lastError.message}`);
  }
}

// --- Init ---

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function init() {
  const existing = loadConfig();

  if (existing.token || existing.apiUrl !== DEFAULT_API_URL) {
    console.log(`Already configured:`);
    console.log(`  API: ${existing.apiUrl}`);
    if (existing.token) console.log(`  Token: ${existing.token.slice(0, 8)}...`);
    console.log("");
    const overwrite = await prompt("Overwrite? (y/N) ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("Kept existing config.");
      return;
    }
  }

  const apiUrl = String(await prompt(`API URL (default: ${DEFAULT_API_URL}): `)) || DEFAULT_API_URL;
  const token = String(await prompt("Deploy token (optional, press Enter to skip): "));

  const config = { apiUrl };
  if (token) config.token = token;

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`\nConfig saved to ${CONFIG_FILE}`);
  console.log("You're ready! Try: show deploy ./dist --name my-site");
}

// --- Main ---

const [command, ...args] = process.argv.slice(2);

const commands = { init, deploy, list, inspect };

if (!command || !commands[command]) {
  console.log("Usage: show <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  init            Configure API URL and deploy token");
  console.log("  deploy <dir>    Deploy a static site directory");
  console.log("  list            List local deployment history");
  console.log("  inspect <id>    Inspect a deployment");
  process.exit(command ? 2 : 0);
}

commands[command](args).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
