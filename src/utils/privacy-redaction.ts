export type PrivacyRedactionOptions = {
  codeReplacement?: string;
  secretReplacement?: string;
  tokenReplacement?: string;
  maxLength?: number;
};

const DEFAULT_CODE_REPLACEMENT = "[redacted code]";
const DEFAULT_SECRET_REPLACEMENT = "[redacted secret]";
const DEFAULT_TOKEN_REPLACEMENT = "[redacted token]";

type RedactionConfig = Required<Pick<PrivacyRedactionOptions, "codeReplacement" | "secretReplacement" | "tokenReplacement">> & {
  maxLength?: number;
};

function toDisplayText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getConfig(options: PrivacyRedactionOptions = {}): RedactionConfig {
  return {
    codeReplacement: options.codeReplacement || DEFAULT_CODE_REPLACEMENT,
    secretReplacement: options.secretReplacement || DEFAULT_SECRET_REPLACEMENT,
    tokenReplacement: options.tokenReplacement || DEFAULT_TOKEN_REPLACEMENT,
    maxLength: options.maxLength,
  };
}

function redactCodeContext(text: string, replacement: string) {
  let next = text;
  const codeKeywords = "(?:otp|one[-\\s]?time password|login code|verification code|verify code|two[-\\s]?factor code|2fa code|authentication code|auth code|security code)";
  const codePattern = new RegExp(`\\b(${codeKeywords})([^.\\n\\r]{0,80}?(?:is|:|=|-)\\s*)([A-Za-z0-9-]{4,12})\\b`, "gi");
  next = next.replace(codePattern, (_match, label, joiner) => `${label}${joiner}${replacement}`);

  const passcodePattern = /\b(passcode)([^.\n\r]{0,40}?(?:is|:|=|-)\s*)([A-Za-z0-9-]{4,16})\b/gi;
  next = next.replace(passcodePattern, (_match, label, joiner) => `${label}${joiner}${replacement}`);

  return next;
}

function redactLabelledSecrets(text: string, secretReplacement: string, tokenReplacement: string) {
  let next = text;
  const bearerPattern = /\b(Bearer)(\s+)([A-Za-z0-9._~+/=-]{8,})\b/g;
  next = next.replace(bearerPattern, (_match, label, joiner) => `${label}${joiner}${tokenReplacement}`);

  const labelledSecretPattern = /\b(api[_\s-]?key|access[_\s-]?token|refresh[_\s-]?token|auth[_\s-]?token|token|client[_\s-]?secret|webhook[_\s-]?secret|signing[_\s-]?secret|secret|password)\b(\s*(?:is|:|=|-)\s*)(["']?)([^\s,;\n\r]{4,})/gi;
  next = next.replace(labelledSecretPattern, (_match, label, joiner, quote) => `${label}${joiner}${quote || ""}${secretReplacement}`);
  return next;
}

function redactLongSuspiciousTokens(text: string, tokenReplacement: string) {
  const longTokenPattern = /\b(?=[A-Za-z0-9._-]{24,}\b)(?=[A-Za-z0-9._-]*[A-Za-z])(?=[A-Za-z0-9._-]*\d)[A-Za-z0-9._-]{24,}\b/g;
  return text.replace(longTokenPattern, tokenReplacement);
}

export function redactSensitiveText(value: unknown, options: PrivacyRedactionOptions = {}) {
  const config = getConfig(options);
  let text = toDisplayText(value);
  if (!text) return "";

  text = redactCodeContext(text, config.codeReplacement);
  text = redactLabelledSecrets(text, config.secretReplacement, config.tokenReplacement);
  text = redactLongSuspiciousTokens(text, config.tokenReplacement);

  if (config.maxLength && text.length > config.maxLength) {
    return `${text.slice(0, Math.max(0, config.maxLength - 1)).trimEnd()}…`;
  }

  return text;
}

export function containsSensitiveText(value: unknown) {
  const text = toDisplayText(value);
  if (!text) return false;
  return redactSensitiveText(text) !== text;
}

export function redactObjectPreview(value: unknown, options: PrivacyRedactionOptions = {}) {
  const text = toDisplayText(value);
  return redactSensitiveText(text, options);
}
