export type InstanceIdentityInput = {
  $id?: string;
  id?: string;
  name?: string;
  jid?: string;
  connectionStatus?: string;
  connection_status?: string;
  is_active?: number | boolean;
  last_activity_at?: number;
  updated_at?: number;
};

export function normalizeInstancePhone(value: any) {
  const raw = String(value || "").trim();
  const phone = raw.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  return phone.length >= 7 && phone.length <= 18 ? phone : "";
}

export function formatInstancePhone(value: any) {
  const phone = normalizeInstancePhone(value);
  return phone ? `+${phone}` : "";
}

export function getInstanceInternalId(instance: InstanceIdentityInput = {}) {
  return String(instance?.$id || instance?.id || "").trim();
}

export function getInstanceName(instance: InstanceIdentityInput = {}) {
  return String(instance?.name || "").trim();
}

export function getInstanceConnectionStatus(instance: InstanceIdentityInput = {}) {
  const status = String(instance?.connectionStatus || instance?.connection_status || "").trim().toLowerCase();
  if (status) return status;
  if (instance?.jid) return "connected";
  if (instance?.is_active === 0 || instance?.is_active === false) return "inactive";
  return "not_connected";
}

export function getInstanceDisplayIdentity(instance: InstanceIdentityInput = {}) {
  const phone = formatInstancePhone(instance?.jid);
  const name = getInstanceName(instance);
  const id = getInstanceInternalId(instance);

  if (phone && name) return `${phone} · ${name}`;
  if (phone) return phone;
  if (name) return `${name} · Not connected`;
  if (id) return `${id} · Not connected`;
  return "Unlinked instance";
}

export function getInstanceShortIdentity(instance: InstanceIdentityInput = {}) {
  return formatInstancePhone(instance?.jid) || getInstanceName(instance) || getInstanceInternalId(instance) || "Unlinked";
}

export function buildInstanceIdentitySummary(instance: InstanceIdentityInput = {}) {
  const phone = formatInstancePhone(instance?.jid);
  const internalId = getInstanceInternalId(instance);
  const name = getInstanceName(instance);
  const status = getInstanceConnectionStatus(instance);
  return {
    displayIdentity: getInstanceDisplayIdentity(instance),
    shortIdentity: getInstanceShortIdentity(instance),
    phone,
    connectedNumber: phone,
    internalId,
    name,
    status,
    isConnected: Boolean(phone),
  };
}
