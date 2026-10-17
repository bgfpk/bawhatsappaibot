import * as dbService from "./db-service.ts";
import { buildAccountDataOwnerKey } from "../utils/account-data-owner.ts";

const ownerCache = new Map<string, string>();

export async function resolveAccountDataOwnerKey(userId?: string, fallback?: string) {
  const cacheKey = userId || fallback || "";
  if (cacheKey && ownerCache.has(cacheKey)) return ownerCache.get(cacheKey)!;

  let user: any = null;
  if (userId) {
    user = await dbService.getUser(userId).catch(() => null);
  }

  const ownerKey = buildAccountDataOwnerKey(user || userId, fallback);
  if (cacheKey && ownerKey) ownerCache.set(cacheKey, ownerKey);
  return ownerKey || fallback || "";
}
