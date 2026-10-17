import {
  cleanCustomerBusinessSummary,
  hasSpecificCustomerSummaryLines,
  normalizeCustomerSummaryText,
} from "./customer-summary-cleaner-service.ts";

type SummarySource = "ai" | "software_fallback" | "";

function clean(value: any, limit = 2500) {
  return cleanCustomerBusinessSummary(String(value || "").trim(), limit);
}

function extractContentLines(summary: string) {
  return normalizeCustomerSummaryText(summary)
    .split("\n")
    .map((line) => line.trim().replace(/^[*-]\s*/, ""))
    .filter((line) => line && !/^(current|timeline|pending \/ next step|notes):$/i.test(line));
}

function isMeaningfulSummary(summary: string) {
  const lines = extractContentLines(summary);
  return Boolean(summary) && hasSpecificCustomerSummaryLines(lines);
}

function meaningfulLineCount(summary: string) {
  return extractContentLines(summary)
    .filter((line) => hasSpecificCustomerSummaryLines([line]))
    .length;
}

export function choosePersistedCustomerSummary(input: {
  existingSummary: any;
  existingSource?: any;
  candidateSummary: any;
  candidateSource?: any;
  fallbackReason?: any;
}) {
  const existingSummary = clean(input.existingSummary);
  const candidateSummary = clean(input.candidateSummary);
  const existingSource = String(input.existingSource || "").trim() as SummarySource;
  const candidateSource = String(input.candidateSource || "").trim() as SummarySource;
  const fallbackReason = String(input.fallbackReason || "").trim();

  if (candidateSource === "ai") {
    return {
      summary: candidateSummary,
      source: "ai" as const,
      preservedExisting: false,
      fallbackReason: "",
    };
  }

  const existingMeaningful = isMeaningfulSummary(existingSummary);
  const candidateMeaningful = isMeaningfulSummary(candidateSummary);
  const existingMeaningfulLines = meaningfulLineCount(existingSummary);
  const candidateMeaningfulLines = meaningfulLineCount(candidateSummary);
  const shouldPreserveExisting = existingMeaningful && (
    existingSource === "ai" ||
    !candidateMeaningful ||
    !candidateSummary ||
    (candidateSource === "software_fallback" && existingMeaningfulLines > candidateMeaningfulLines)
  );

  if (shouldPreserveExisting) {
    return {
      summary: existingSummary,
      source: existingSource || "ai",
      preservedExisting: true,
      fallbackReason: fallbackReason || "ai_summary_unavailable",
    };
  }

  return {
    summary: candidateSummary || existingSummary,
    source: candidateSource || existingSource || "software_fallback",
    preservedExisting: false,
    fallbackReason: candidateSource === "software_fallback" ? (fallbackReason || "ai_summary_unavailable") : "",
  };
}
