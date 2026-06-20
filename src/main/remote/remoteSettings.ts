import type {
  RemoteConnectionStatus,
  RemoteSettingsInput,
  RemoteSettingsView
} from "../../shared/apiTypes";
import {
  normalizeApiKey,
  normalizeServerUrl,
  remoteCredentialStore,
  type RemoteCredentialStore
} from "./credentials";
import { testRemoteConnection } from "./connectionTest";

export class RemoteSettingsService {
  constructor(private readonly store: RemoteCredentialStore = remoteCredentialStore) {}

  async get(): Promise<RemoteSettingsView> {
    const [serverUrl, apiKey] = await Promise.all([
      this.store.getServerUrl(),
      this.store.getApiKey()
    ]);
    return { serverUrl, hasApiKey: Boolean(apiKey) };
  }

  async save(input: RemoteSettingsInput): Promise<RemoteSettingsView> {
    const serverUrl = normalizeServerUrl(input.serverUrl ?? "");
    const apiKey = input.apiKey === undefined ? undefined : normalizeApiKey(input.apiKey);
    await this.store.setServerUrl(serverUrl);
    if (apiKey !== undefined) await this.store.setApiKey(apiKey);
    return this.get();
  }

  async clearApiKey(): Promise<RemoteSettingsView> {
    await this.store.clearApiKey();
    return this.get();
  }

  async clearAll(): Promise<RemoteSettingsView> {
    await this.store.clearAll();
    return this.get();
  }

  async testConnection(input: RemoteSettingsInput): Promise<RemoteConnectionStatus> {
    const serverUrl = input.serverUrl ?? (await this.store.getServerUrl());
    const apiKey = input.apiKey?.trim() || (await this.store.getApiKey());
    if (!serverUrl) {
      return { ok: false, status: "invalid_url", message: "Enter a server URL." };
    }
    if (!apiKey) {
      return { ok: false, status: "error", message: "Enter an API key." };
    }
    return testRemoteConnection(serverUrl, apiKey);
  }
}

export const remoteSettingsService = new RemoteSettingsService();
