export type WebSearchSource = {
  id: number;
  title: string;
  url: string;
  description: string;
  source: string;
  relevance: number;
};

export type WebSearchActivity = {
  status: "searching" | "completed" | "error";
  resultCount?: number;
  error?: string;
};

export type WebSearchResponse = {
  query: string;
  sources: WebSearchSource[];
};
