function clean(value: any) {
  return String(value || "").trim();
}

export function buildWelcomeSequenceProfilePatch(input: {
  status: "sent" | "skipped" | "failed" | "pending";
  reason?: string;
  source?: string;
  timestamp?: number;
}) {
  return {
    lastWelcomeSequenceStatus: input.status,
    lastWelcomeSequenceReason: clean(input.reason),
    lastWelcomeSequenceSource: clean(input.source),
    lastWelcomeSequenceAt: Number(input.timestamp) || Math.floor(Date.now() / 1000),
  };
}

export function buildWelcomeSequenceTimelineLine(profile: any = {}) {
  const status = clean(profile?.lastWelcomeSequenceStatus).toLowerCase();
  const reason = clean(profile?.lastWelcomeSequenceReason);
  const source = clean(profile?.lastWelcomeSequenceSource).toLowerCase();

  if (status === "sent") {
    return source.includes("recovery") ? "Welcome sequence recovered and sent." : "Welcome sequence sent.";
  }
  if (status === "skipped") {
    return reason ? `Welcome sequence skipped: ${reason}.` : "Welcome sequence skipped.";
  }
  if (status === "failed") {
    return reason ? `Welcome sequence failed: ${reason}.` : "Welcome sequence failed.";
  }
  if (status === "pending") {
    return reason ? `Welcome sequence pending: ${reason}.` : "Welcome sequence pending.";
  }
  return "";
}
