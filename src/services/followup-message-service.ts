export function buildStaticFollowupMessage(input: { offerContext?: any; text?: any } = {}) {
  const message = input.offerContext ?? input.text ?? "";
  return String(message).trim();
}

export function hasStaticFollowupMessage(value: any) {
  return buildStaticFollowupMessage({ offerContext: value }).length > 0;
}
