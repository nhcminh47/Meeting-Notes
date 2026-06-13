import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export async function calculateSha256(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

export function normalizeSha256(value: string): string {
  const normalized = value.toLowerCase().replace(/^sha256:/, "");
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error("Expected SHA256 must be a 64-character hexadecimal value.");
  }
  return normalized;
}
