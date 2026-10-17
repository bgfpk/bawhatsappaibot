import { buildPhoneProfilePatch, isCustomerChatJid, normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";

export type ContactIdentityUpdate = {
  jid: string;
  profilePatch: Record<string, any>;
};

export function buildContactIdentityUpdates(contact: any): ContactIdentityUpdate[] {
  const id = normalizeWhatsAppJid(contact?.id);
  const lid = normalizeWhatsAppJid(contact?.lid);
  const phoneJid = normalizeWhatsAppJid(contact?.phoneNumber);
  const primaryJid = lid || id || phoneJid;
  if (!primaryJid || !isCustomerChatJid(primaryJid)) return [];

  const profilePatch: Record<string, any> = {
    jid: primaryJid,
    ...(contact?.name ? { name: contact.name } : {}),
    ...(contact?.notify ? { notify: contact.notify } : {}),
    ...(contact?.verifiedName ? { verifiedName: contact.verifiedName } : {}),
    ...(lid ? { lidJid: lid } : {}),
    ...(phoneJid ? { phoneJid, ...buildPhoneProfilePatch(phoneJid) } : {}),
  };

  return [{ jid: primaryJid, profilePatch }];
}

export function buildLidMappingIdentityUpdate(mapping: any): ContactIdentityUpdate | null {
  const lid = normalizeWhatsAppJid(mapping?.lid);
  const phoneJid = normalizeWhatsAppJid(mapping?.pn);
  if (!lid || !phoneJid || !isCustomerChatJid(lid)) return null;

  return {
    jid: lid,
    profilePatch: {
      jid: lid,
      lidJid: lid,
      phoneJid,
      ...buildPhoneProfilePatch(phoneJid),
    },
  };
}
