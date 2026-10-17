import { cleanCustomerBusinessSummary } from "./customer-summary-cleaner-service.ts";

const MAX_SUMMARY_LENGTH = 2500;

function clean(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: any) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function metadataAliases(label: string) {
  const key = normalizeKey(label);
  const aliases = new Set([key]);
  if (key === "language preference") aliases.add("customer language preference");
  if (key === "reply preference") aliases.add("customer reply preference");
  if (key === "persona voice preference") aliases.add("customer persona voice preference");
  return aliases;
}

export function upsertCustomerSummaryMetadataLine(summary: any, label: string, value: any) {
  const cleanLabel = clean(label).replace(/:$/, "");
  const cleanValue = clean(value);
  if (!cleanLabel || !cleanValue) return cleanCustomerBusinessSummary(summary, MAX_SUMMARY_LENGTH);

  const prefix = `${cleanLabel}:`;
  const nextLine = `${prefix} ${cleanValue}.`.replace(/\.\.+$/, ".");
  const existing = cleanCustomerBusinessSummary(summary, MAX_SUMMARY_LENGTH);
  const aliases = metadataAliases(cleanLabel);
  const withoutOld = existing
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !aliases.has(normalizeKey(line.split(":")[0])));

  withoutOld.push(nextLine);
  return cleanCustomerBusinessSummary(withoutOld.join("\n"), MAX_SUMMARY_LENGTH);
}
