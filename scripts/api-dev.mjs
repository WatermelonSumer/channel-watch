import { spawn, spawnSync } from "node:child_process";

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

const [pythonCommand, ...pythonArgs] = findPythonCommand();
const child = spawn(pythonCommand, [...pythonArgs, "-m", "apps.api.app.main", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
