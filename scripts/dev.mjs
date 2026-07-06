import { spawn, spawnSync } from "node:child_process";
import http from "node:http";

const API_HOST = "127.0.0.1";
const API_PORT = 4176;
const API_HEALTH_URL = `http://${API_HOST}:${API_PORT}/api/health`;
const HEALTH_TIMEOUT_MS = 30_000;
const HEALTH_INTERVAL_MS = 500;

const children = new Set();
let isShuttingDown = false;

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

  throw new Error(`API did not become healthy within ${HEALTH_TIMEOUT_MS / 1_000}s: ${API_HEALTH_URL}`);
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
    console.error(`API process exited. code=${code ?? "null"} signal=${signal ?? "null"}`);
    stopChildren();
    process.exit(code ?? 1);
  });

  console.log(`Waiting for API health check: ${API_HEALTH_URL}`);
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
    console.error(`Web process exited. code=${code ?? "null"} signal=${signal ?? "null"}`);
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
