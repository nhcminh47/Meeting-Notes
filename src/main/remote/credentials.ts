import { app, safeStorage } from "electron";
import path from "node:path";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";

export interface RemoteCredentialStore {
  getServerUrl(): Promise<string | null>;
  setServerUrl(url: string): Promise<void>;
  getApiKey(): Promise<string | null>;
  setApiKey(apiKey: string): Promise<void>;
  clearApiKey(): Promise<void>;
  clearAll(): Promise<void>;
}

export function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Enter a valid remote server URL.");
  }
  if (!(["http:", "https:"] as string[]).includes(parsed.protocol)) {
    throw new Error("Server URL must use http:// or https://.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Server URL must not include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("Server URL must not include a query string or fragment.");
  }
  return parsed.toString().replace(/\/+$/, "");
}

export function normalizeApiKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter an API key.");
  return trimmed;
}

export function redactApiKey(value: string | null | undefined): string {
  return value ? "********" : "";
}

type RemoteConfig = { serverUrl?: string };

export class ElectronRemoteCredentialStore implements RemoteCredentialStore {
  private memoryApiKey: string | null = null;

  private get configPath(): string {
    return path.join(app.getPath("userData"), "remote-settings.json");
  }

  private get secretPath(): string {
    return path.join(app.getPath("userData"), "remote-api-key.bin");
  }

  private async readConfig(): Promise<RemoteConfig> {
    try {
      return JSON.parse(await readFile(this.configPath, "utf8")) as RemoteConfig;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw new Error("Remote settings could not be read.");
    }
  }

  async getServerUrl(): Promise<string | null> {
    return (await this.readConfig()).serverUrl ?? null;
  }

  async setServerUrl(url: string): Promise<void> {
    const normalized = normalizeServerUrl(url);
    await mkdir(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({ serverUrl: normalized }, null, 2));
    await rm(this.configPath, { force: true });
    await rename(temporaryPath, this.configPath);
  }

  async getApiKey(): Promise<string | null> {
    if (!safeStorage.isEncryptionAvailable()) return this.memoryApiKey;
    try {
      return safeStorage.decryptString(await readFile(this.secretPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error("The saved API key could not be unlocked.");
    }
  }

  async setApiKey(apiKey: string): Promise<void> {
    const normalized = normalizeApiKey(apiKey);
    if (!safeStorage.isEncryptionAvailable()) {
      this.memoryApiKey = normalized;
      return;
    }
    await mkdir(path.dirname(this.secretPath), { recursive: true });
    await writeFile(this.secretPath, safeStorage.encryptString(normalized));
    this.memoryApiKey = null;
  }

  async clearApiKey(): Promise<void> {
    this.memoryApiKey = null;
    await rm(this.secretPath, { force: true });
  }

  async clearAll(): Promise<void> {
    await Promise.all([this.clearApiKey(), rm(this.configPath, { force: true })]);
  }
}

export const remoteCredentialStore = new ElectronRemoteCredentialStore();
