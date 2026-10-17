export function isBillingNotificationInCooldown(lastSentAt: any, cooldownSeconds: any, nowMs = Date.now()) {
  const last = Number(lastSentAt || 0);
  const cooldown = Math.max(0, Number(cooldownSeconds || 0));
  if (!last || cooldown <= 0) return false;
  return nowMs - last < cooldown * 1000;
}
