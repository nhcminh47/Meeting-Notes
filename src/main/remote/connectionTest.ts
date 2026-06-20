import type { RemoteConnectionStatus } from "../../shared/apiTypes";
import { normalizeApiKey, normalizeServerUrl } from "./credentials";

export async function testRemoteConnection(
  serverUrl: string,
  apiKey: string,
  options: { fetch?: typeof fetch; timeoutMs?: number } = {}
): Promise<RemoteConnectionStatus> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeServerUrl(serverUrl);
  } catch (error) {
    return {
      ok: false,
      status: "invalid_url",
      message: error instanceof Error ? error.message : "Invalid remote settings."
    };
  }
  let normalizedKey: string;
  try {
    normalizedKey = normalizeApiKey(apiKey);
  } catch {
    return { ok: false, status: "error", message: "Enter an API key." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  try {
    const response = await (options.fetch ?? fetch)(`${normalizedUrl}/health/private`, {
      method: "GET",
      headers: { Authorization: `Bearer ${normalizedKey}` },
      signal: controller.signal
    });
    if (response.status === 200) {
      return { ok: true, status: "connected", message: "Connected to remote server." };
    }
    if (response.status === 401) {
      return { ok: false, status: "unauthorized", message: "Invalid API key." };
    }
    return {
      ok: false,
      status: "error",
      message: `Remote server returned status ${response.status}.`
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: "timeout", message: "Connection timed out." };
    }
    return { ok: false, status: "unreachable", message: "Remote server is unreachable." };
  } finally {
    clearTimeout(timeout);
  }
}
