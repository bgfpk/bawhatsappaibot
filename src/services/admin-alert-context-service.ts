const alertTargets = new Map<string, string>();

function clean(value: any) {
  return String(value || "").trim();
}

export function rememberAdminAlertTarget(messageId: any, customerJid: any) {
  const id = clean(messageId);
  const jid = clean(customerJid);
  if (id && jid) alertTargets.set(id, jid);
}

export function getAdminAlertTarget(messageId: any) {
  const id = clean(messageId);
  return id ? alertTargets.get(id) || "" : "";
}
