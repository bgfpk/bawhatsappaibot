type ExplicitCacheCooldownDeps = {
  now: () => number;
  cooldownMs: () => number;
};

const cooldownUntilByKey = new Map<string, number>();

const cooldownDeps: ExplicitCacheCooldownDeps = {
  now: () => Date.now(),
  cooldownMs: () => 10 * 60 * 1000,
};

function buildCooldownKey(botId: string, model: string) {
  return `${String(botId || "").trim()}|${String(model || "").trim()}`;
}

export function isExplicitCacheCooldownActive(input: { botId: string; model: string }) {
  const key = buildCooldownKey(input.botId, input.model);
  const expiresAt = cooldownUntilByKey.get(key) || 0;
  const active = expiresAt > cooldownDeps.now();
  if (!active && expiresAt) cooldownUntilByKey.delete(key);
  return active;
}

export function activateExplicitCacheCooldown(input: { botId: string; model: string }) {
  const key = buildCooldownKey(input.botId, input.model);
  cooldownUntilByKey.set(key, cooldownDeps.now() + cooldownDeps.cooldownMs());
}

export function isExplicitCacheInvalidArgumentError(error: any) {
  const text = String(error?.message || error?.status || error?.code || error || "").toLowerCase();
  return text.includes("invalid_argument") || (text.includes("cachedcontent") && text.includes("system_instruction"));
}

export function __setExplicitCacheCooldownTestDeps(overrides: Partial<ExplicitCacheCooldownDeps>) {
  Object.assign(cooldownDeps, overrides || {});
}

export function __resetExplicitCacheCooldownTestDeps() {
  Object.assign(cooldownDeps, {
    now: () => Date.now(),
    cooldownMs: () => 10 * 60 * 1000,
  });
  cooldownUntilByKey.clear();
}
