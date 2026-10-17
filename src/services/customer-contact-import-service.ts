import * as dbService from "./db-service.ts";
import { buildAccountDataOwnerKey } from "../utils/account-data-owner.ts";
import { buildImportedContactIdentity } from "./contact-import-utils.ts";
import { publishSharedPhoneIdentity } from "./shared-phone-directory-service.ts";

const now = () => Math.floor(Date.now() / 1000);

export async function importCustomerContactsForUser(userId: string, rows: any[]) {
  const user = await dbService.getUser(userId) as any;
  const ownerKey = buildAccountDataOwnerKey(user || userId);
  if (!ownerKey) throw new Error("Account owner could not be resolved");
  if (!Array.isArray(rows)) throw new Error("Rows must be an array");

  let imported = 0;
  let skipped = 0;
  let shared = 0;
  const errors: string[] = [];

  for (const [index, row] of rows.entries()) {
    const identity = buildImportedContactIdentity(row);
    if (!identity) {
      skipped++;
      errors.push(`Row ${index + 1}: missing phone, JID, or LID`);
      continue;
    }

    await dbService.updateCustomerProfile(ownerKey, identity.primaryJid, {
      ...identity.profilePatch,
      importedAt: now(),
      importSource: "customer_csv",
    });
    imported++;

    if (identity.phone) {
      const result = await publishSharedPhoneIdentity({
        jid: identity.primaryJid,
        phone: identity.phone,
        profilePatch: identity.profilePatch,
        source: "customer_csv",
      }).catch(() => ({ published: false }));
      if ((result as any)?.published) shared++;
    }
  }

  return { imported, skipped, shared, errors: errors.slice(0, 25) };
}
