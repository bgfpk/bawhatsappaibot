import { normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeWhatsAppPhone(value: any) {
  let phone = String(value || "").replace(/@s\.whatsapp\.net$/i, "").replace(/[^0-9]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = `92${phone.slice(1)}`;
  if (phone.length === 10 && phone.startsWith("3")) phone = `92${phone}`;
  return phone;
}

export function resolveConfiguredAdminJid(userConfig: any) {
  const adminPhone = normalizeWhatsAppPhone(
    userConfig?.admin_number || userConfig?.adminNumber || userConfig?.whatsapp_number
  );
  return adminPhone ? `${adminPhone}@s.whatsapp.net` : "";
}

export async function sendAdminOnlyText(input: {
  sock: any;
  userConfig: any;
  customerJid?: string;
  text: string;
  label: string;
  io?: any;
}) {
  const adminJid = resolveConfiguredAdminJid(input.userConfig);
  if (!adminJid) {
    input.io?.emit?.("system-log", { type: "warning", msg: `${input.label} not sent: no admin WhatsApp number configured.` });
    return { sent: false, skipped: "no_admin", adminJid: "" };
  }

  const normalizedCustomer = normalizeWhatsAppJid(input.customerJid || "");
  if (normalizedCustomer && adminJid === normalizedCustomer) {
    input.io?.emit?.("system-log", { type: "warning", msg: `${input.label} not sent: admin and customer chat are the same.` });
    return { sent: false, skipped: "same_chat", adminJid };
  }

  const sent = await input.sock.sendMessage(adminJid, { text: clean(input.text) });
  input.io?.emit?.("system-log", { type: sent?.key?.id ? "info" : "warning", msg: `${input.label} routed to admin ${adminJid.split("@")[0]}.` });
  return { sent: Boolean(sent?.key?.id), message: sent, adminJid };
}
