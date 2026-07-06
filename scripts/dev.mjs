import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = path.join(ROOT, ".env");
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_INTERVAL_MS = 500;

const children = new Set();
let isShuttingDown = false;

loadRootEnv();

const API_HOST = readEnvString("API_HOST", "127.0.0.1");
const API_PORT = readEnvInteger("API_PORT", 4176);
const API_HEALTH_URL = "http://" + API_HOST + ":" + API_PORT + "/api/health";

function unquoteEnvValue(value) {
  if (value.length >= 2 && value[0] === value[value.length - 1] && ["'", '"'].includes(value[0])) {
    return value.slice(1, -1);
  }
  return value;
}

function loadRootEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    return;
  }

  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/u)) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.startsWith("export ")) {
      trimmed = trimmed.slice("export ".length).trim();
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = unquoteEnvValue(value);
    }
  }
}

function readEnvString(name, fallback) {
  return process.env[name] || fallback;
}

function readEnvInteger(name, fallback) {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value)) {
    throw new Error(name + " must be an integer, got " + JSON.stringify(rawValue));
  }
  return value;
}

function findPythonCommand() {
  const candidates =
    process.platform === "win32"
      ? [["python3"], ["python"], ["py", "-3"]]
      : [["python3"], ["python"]];

  for (const [command, ...args] of candidates) {
    const result = spawnSync(command, [...args, "--version"], { stdio: "ignore" });
    if (result.status === 0) {
      return [command, ...args];
    }
  }

  throw new Error("Could not find Python 3. Make python3, python, or py -3 available in PATH.");
}

function spawnManaged(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stopChildren() {
  isShuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function checkApiHealth() {
  return new Promise((resolve) => {
    const request = http.get(API_HEALTH_URL, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });

    request.on("error", () => resolve(false));
    request.setTimeout(2_000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForApiHealth() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < HEALTH_TIMEOUT_MS) {
    if (await checkApiHealth()) {
      return;
    }
    await wait(HEALTH_INTERVAL_MS);
  }

  throw new Error("API did not become healthy within " + HEALTH_TIMEOUT_MS / 1_000 + "s: " + API_HEALTH_URL);
}

async function main() {
  const [pythonCommand, ...pythonArgs] = findPythonCommand();
  const api = spawnManaged(pythonCommand, [
    ...pythonArgs,
    "-m",
    "apps.api.app.main",
    "--host",
    API_HOST,
    "--port",
    String(API_PORT),
  ]);

  api.once("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }
    console.error("API process exited. code=" + (code ?? "null") + " signal=" + (signal ?? "null"));
    stopChildren();
    process.exit(code ?? 1);
  });

  console.log("Waiting for API health check: " + API_HEALTH_URL);
  await waitForApiHealth();
  console.log("API is healthy. Starting web app...");

  const webCommand = process.platform === "win32" ? "cmd.exe" : "npm";
  const webArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm", "--workspace", "apps/web", "run", "dev"]
      : ["--workspace", "apps/web", "run", "dev"];
  const web = spawnManaged(webCommand, webArgs);

  web.once("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }
    console.error("Web process exited. code=" + (code ?? "null") + " signal=" + (signal ?? "null"));
    stopChildren();
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", () => {
  stopChildren();
  process.exit(130);
});

process.on("SIGTERM", () => {
  stopChildren();
  process.exit(143);
});

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  stopChildren();
  process.exit(1);
});
