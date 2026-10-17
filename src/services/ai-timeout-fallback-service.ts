export function isAiTimeoutError(error: any) {
  return /timed out|timeout/i.test(String(error?.message || error || ""));
}
