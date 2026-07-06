import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function readIntegerEnv(env: Record<string, string>, name: string, fallback: number): number {
  const rawValue = env[name];
  if (!rawValue) {
    return fallback;
  }
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value)) {
    throw new Error(name + " must be an integer, got " + JSON.stringify(rawValue));
  }
  return value;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, workspaceRoot, "");
  const apiHost = env.API_HOST || "127.0.0.1";
  const apiPort = readIntegerEnv(env, "API_PORT", 4176);
  const webHost = env.WEB_HOST || "127.0.0.1";
  const webPort = readIntegerEnv(env, "WEB_PORT", 5173);

  return {
    envDir: workspaceRoot,
    plugins: [react()],
    server: {
      host: webHost,
      port: webPort,
      proxy: {
        "/api": env.API_PROXY_TARGET || "http://" + apiHost + ":" + apiPort,
      },
    },
    preview: {
      host: webHost,
      port: webPort,
    },
  };
});
