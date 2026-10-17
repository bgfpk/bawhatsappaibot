function clean(value: any) {
  return String(value || "").trim();
}

function sameName(a: any, b: any) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function knownDeliveryNames(profile: any = {}) {
  return [
    profile.customerName,
    profile.deliveryName,
    profile.recipientName,
    profile.shippingName,
    profile.orderCustomerName,
    profile.importedName,
  ].map(clean).filter(Boolean);
}

function whatsappDisplayNames(profile: any = {}) {
  return [
    profile.name,
    profile.pushName,
    profile.notify,
    profile.verifiedName,
    profile.whatsappName,
  ].map(clean).filter(Boolean);
}

export function getSavedDeliveryName(profile: any = {}) {
  return knownDeliveryNames(profile)[0] || "";
}

export function sanitizeOrderDeliveryName(orderData: any, profile: any = {}) {
  const orderName = clean(orderData?.customerName || orderData?.customer_name || orderData?.name);
  if (!orderName) return orderData;

  const savedName = getSavedDeliveryName(profile);
  if (savedName && sameName(orderName, savedName)) return orderData;

  const looksLikeWhatsappOnlyName = whatsappDisplayNames(profile).some((name) => sameName(orderName, name));
  if (!looksLikeWhatsappOnlyName) return orderData;

  const nextCustomFields = { ...(orderData?.customFields || {}) };
  for (const key of Object.keys(nextCustomFields)) {
    if (String(key).toLowerCase().includes("name")) delete nextCustomFields[key];
  }

  return {
    ...orderData,
    customerName: "",
    customer_name: "",
    name: "",
    customFields: nextCustomFields,
    deliveryNameRequired: true,
    deliveryNameSourceRejected: "whatsapp_profile_name",
  };
}

export function buildDeliveryNameProfilePatch(orderData: any) {
  const deliveryName = clean(orderData?.customerName || orderData?.customer_name || orderData?.name);
  return deliveryName ? { customerName: deliveryName, deliveryName, orderCustomerName: deliveryName } : {};
}
