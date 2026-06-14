import { spawn } from "node:child_process";
import path from "node:path";
import { logError, logEvent } from "./eventLogger";

export async function runProcess(
  executable: string,
  args: string[],
  options?: {
    cwd?: string;
    signal?: AbortSignal;
    onStdout?: (text: string) => void;
    onStderr?: (text: string) => void;
  }
): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number }> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const processName = path.basename(executable);
    logEvent("info", "process", "Child process started.", {
      processName,
      argumentCount: args.length
    });
    const child = spawn(executable, args, {
      cwd: options?.cwd,
      windowsHide: true,
      shell: false
    });
    let stdout = "";
    let stderr = "";
    let aborted = false;
    const abort = () => {
      aborted = true;
      child.kill();
    };
    options?.signal?.addEventListener("abort", abort, { once: true });

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options?.onStdout?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      options?.onStderr?.(text);
    });
    child.on("error", (error) => {
      logError("process", "Child process failed to start.", error, { processName });
      reject(error);
    });
    child.on("close", (code) => {
      options?.signal?.removeEventListener("abort", abort);
      if (aborted) {
        const error = new Error("Process was cancelled.");
        error.name = "AbortError";
        logEvent("warn", "process", "Child process cancelled.", {
          processName,
          durationMs: Date.now() - startedAt
        });
        reject(error);
        return;
      }
      if (code === 0) {
        const durationMs = Date.now() - startedAt;
        logEvent("info", "process", "Child process completed.", {
          processName,
          exitCode: code,
          durationMs
        });
        resolve({ stdout, stderr, exitCode: code, durationMs });
      } else {
        const error = new Error(
          `Process exited with code ${code ?? "unknown"}: ${stderr.trim() || stdout.trim()}`
        );
        logError("process", "Child process exited with an error.", error, {
          processName,
          exitCode: code ?? -1,
          durationMs: Date.now() - startedAt
        });
        reject(error);
      }
    });
  });
}
