import { sanitizeCourierText } from "./courier-broadcast-service";

type JsonResponseOptions = {
  context?: string;
  nonJsonMessage?: string;
};

export async function readJsonResponse<T = any>(response: Response, options: JsonResponseOptions = {}): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const context = options.context || "API request";
  if (!contentType.toLowerCase().includes("application/json")) {
    const preview = sanitizeCourierText(await response.text().catch(() => ""), 120);
    const statusText = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
    const suffix = preview ? ` Preview: ${preview}` : "";
    throw new Error(`${options.nonJsonMessage || `${context} did not return JSON.`} Status: ${statusText}.${suffix}`);
  }

  const data = await response.json().catch(() => {
    throw new Error(`${context} returned invalid JSON. Status: ${response.status}.`);
  });
  if (!response.ok) {
    throw new Error(sanitizeCourierText(data?.error || data?.message || `${context} failed with status ${response.status}`));
  }
  return data as T;
}

export async function fetchJson<T = any>(input: RequestInfo | URL, init: RequestInit, options?: JsonResponseOptions): Promise<T> {
  const response = await fetch(input, init);
  return readJsonResponse<T>(response, options);
}
