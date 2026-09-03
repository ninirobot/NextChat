import { ACCESS_CODE_PREFIX } from "../constant";
import { useAccessStore } from "../store/access";
import type { WebSearchResponse } from "../web-search/types";
import { fetch } from "../utils/stream";

const WEB_SEARCH_TIMEOUT_MS = 35_000;

export async function searchWeb(
  query: string,
  signal?: AbortSignal,
): Promise<WebSearchResponse> {
  const accessStore = useAccessStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (accessStore.enabledAccessControl() && accessStore.accessCode) {
    headers.Authorization = `Bearer ${ACCESS_CODE_PREFIX}${accessStore.accessCode}`;
  }

  // Combine external signal with internal timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEB_SEARCH_TIMEOUT_MS);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const response = await fetch("/api/web-search", {
      method: "POST",
      headers,
      body: JSON.stringify({ query }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = "Web search failed";
      try {
        const errorBody = (await response.json()) as { error?: string };
        errorMessage = errorBody.error || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage);
    }

    const body = (await response.json()) as WebSearchResponse;
    return body;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Web search timed out. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
