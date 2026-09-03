import type { WebSearchSource } from "./types";

const MAX_RESULTS = 8;
const MAX_DESCRIPTION_LENGTH = 600;

export type BraveSearchResponse = {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
};

export function normalizeBraveResults(
  data: BraveSearchResponse,
): WebSearchSource[] {
  const results = data.web?.results ?? [];
  const sources: WebSearchSource[] = [];

  for (const result of results) {
    if (sources.length >= MAX_RESULTS || !result.url) continue;

    try {
      const parsedUrl = new URL(result.url);
      if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        continue;
      }

      sources.push({
        id: sources.length + 1,
        title: (result.title ?? parsedUrl.hostname).slice(0, 300),
        url: parsedUrl.toString(),
        description: (result.description ?? "").slice(
          0,
          MAX_DESCRIPTION_LENGTH,
        ),
        source: parsedUrl.hostname,
        relevance: sources.length + 1,
      });
    } catch {
      // A malformed result must not break the complete search response.
    }
  }

  return sources;
}
