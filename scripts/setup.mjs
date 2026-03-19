#!/usr/bin/env node

import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const CONFIG_DIR = path.join(os.homedir(), ".show");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
const WRANGLER_TOML = path.join(import.meta.dirname, "..", "worker", "wrangler.toml");

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function run(cmd, options = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: options.silent ? "pipe" : "inherit",
      ...options,
    }).trim();
  } catch {
    if (options.ignoreError) return "";
    console.error(`Command failed: ${cmd}`);
    process.exit(1);
  }
}

async function main() {
  console.log("Show Setup\n");

  // 1. Check wrangler
  try {
    execSync("wrangler --version", { stdio: "pipe" });
  } catch {
    console.error("Error: wrangler CLI not found. Install it with: npm install -g wrangler");
    process.exit(1);
  }

  // 2. Prompt for domain
  const domain = String(await prompt("Base domain (e.g., show.example.com): "));
  if (!domain) {
    console.error("Error: domain is required");
    process.exit(1);
  }

  console.log("");

  // 3. Create R2 bucket
  console.log("Creating R2 bucket...");
  run("wrangler r2 bucket create show-files", { ignoreError: true });

  // 4. Create KV namespace
  console.log("Creating KV namespace...");
  const kvOutput = run("wrangler kv namespace create show-meta", { silent: true });
  const kvIdMatch = kvOutput.match(/id\s*=\s*"([^"]+)"/);
  if (!kvIdMatch) {
    console.error("Error: Failed to extract KV namespace ID from output:");
    console.error(kvOutput);
    process.exit(1);
  }
  const kvId = kvIdMatch[1];
  console.log(`  KV namespace ID: ${kvId}`);

  // 5. Generate deploy token
  const deployToken = crypto.randomBytes(32).toString("hex");
  console.log(`  Deploy token generated`);

  // 6. Update wrangler.toml
  console.log("Updating wrangler.toml...");
  let toml = fs.readFileSync(WRANGLER_TOML, "utf-8");
  toml = toml.replace("PLACEHOLDER_KV_ID", kvId);
  toml = toml.replace("show.example.com", domain);
  fs.writeFileSync(WRANGLER_TOML, toml);

  // 7. Deploy Worker
  console.log("Deploying Worker...");
  run(`wrangler deploy --config "${WRANGLER_TOML}"`);

  // 8. Set secret
  console.log("Setting deploy token secret...");
  run(`echo "${deployToken}" | wrangler secret put DEPLOY_TOKEN --config "${WRANGLER_TOML}"`);

  // 9. Configure route
  console.log(`\nDNS Setup Required:`);
  console.log(`  Add a wildcard CNAME record for *.${domain} pointing to your Worker.`);
  console.log(`  Then add a Worker route: *.${domain}/*`);
  console.log(`  See: https://developers.cloudflare.com/workers/configuration/routing/routes/`);

  // 10. Write local config
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify(
      {
        apiUrl: `https://${domain}`,
        token: deployToken,
      },
      null,
      2,
    ),
  );

  console.log("\nSetup complete!");
  console.log(`  Config saved to: ${CONFIG_FILE}`);
  console.log(`  Deploy token: ${deployToken}`);
  console.log(`\nTry it out:`);
  console.log(`  node scripts/show.mjs deploy ./dist --name my-site`);
}

main().catch((err) => {
  console.error(`Setup failed: ${err.message}`);
  process.exit(1);
});
