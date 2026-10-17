type EditableCustomerUpdate = {
  type?: string;
  status?: string;
  message?: string;
  productName?: string;
};

export function canEditCustomerUpdate(item: EditableCustomerUpdate) {
  return (item.type === "planned" || item.type === "stock") && item.status !== "sent";
}

export function shouldShowScheduleFields(item: EditableCustomerUpdate | null) {
  return item?.type !== "stock";
}

export function getUpdateMessageFieldLabel(item: EditableCustomerUpdate | null) {
  return item?.type === "stock" ? "Product / Alert Label" : "Message";
}

export function getUpdateMessagePlaceholder(item: EditableCustomerUpdate | null) {
  return item?.type === "stock" ? "Product name to show in stock alert..." : "Message to send...";
}

export function getEditableUpdateMessage(item: EditableCustomerUpdate) {
  return item.type === "stock" ? (item.productName || item.message || "") : (item.message || "");
}
