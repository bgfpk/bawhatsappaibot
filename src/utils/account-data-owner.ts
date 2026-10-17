type UserLike = {
  $id?: string;
  id?: string;
  user_id?: string;
  email?: string;
} | string | null | undefined;

const OWNER_PREFIX = "account:";

function clean(value: any) {
  return String(value || "").trim().toLowerCase();
}

function getUserId(value: UserLike) {
  if (!value || typeof value === "string") return clean(value);
  return clean(value.$id || value.id || value.user_id);
}

function getEmail(value: UserLike) {
  if (!value || typeof value === "string") return "";
  return clean(value.email);
}

export function buildAccountDataOwnerKey(value: UserLike, fallback?: string) {
  const email = getEmail(value);
  const userId = getUserId(value);
  const raw = email || userId || clean(fallback);
  return raw ? `${OWNER_PREFIX}${raw}` : "";
}

export function collectAccountDataOwnerCandidates(user: UserLike, bots: any[] = []) {
  const keys = new Set<string>();
  const add = (value: any) => {
    const text = clean(value);
    if (text) keys.add(text);
  };

  const primary = buildAccountDataOwnerKey(user);
  add(primary);

  const email = getEmail(user);
  const userId = getUserId(user);
  add(email);
  add(userId);
  if (email) add(`${OWNER_PREFIX}${email}`);
  if (userId) add(`${OWNER_PREFIX}${userId}`);

  for (const bot of bots || []) {
    add(bot?.jid);
    add(bot?.jid ? String(bot.jid).split("@")[0] : "");
    add(bot?.$id || bot?.id);
  }

  return Array.from(keys);
}

export function isAccountDataOwnerKey(value: any) {
  return clean(value).startsWith(OWNER_PREFIX);
}
