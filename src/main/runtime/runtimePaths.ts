import { app } from "electron";
import path from "node:path";

export function getUserDataPath(): string {
  return app.getPath("userData");
}

export function resolveUserDataPath(relativePath: string): string {
  const root = path.resolve(getUserDataPath());
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error("Runtime path escapes the application data directory.");
  }
  return resolved;
}

export function getRuntimePaths() {
  const runtimeRoot = resolveUserDataPath("runtime");
  return {
    runtimeRoot,
    manifestPath: path.join(runtimeRoot, "manifest.local.json"),
    downloadsRoot: path.join(runtimeRoot, "downloads"),
    tempRoot: path.join(runtimeRoot, "downloads", "temp"),
    workRoot: resolveUserDataPath("work")
  };
}

export function createWorkPaths(jobId: string) {
  if (!/^[a-f0-9-]+$/i.test(jobId)) {
    throw new Error("Invalid work job identifier.");
  }
  const jobRoot = path.join(getRuntimePaths().workRoot, jobId);
  return {
    jobRoot,
    wavPath: path.join(jobRoot, "audio.wav"),
    transcriptPrefix: path.join(jobRoot, "transcript")
  };
}
