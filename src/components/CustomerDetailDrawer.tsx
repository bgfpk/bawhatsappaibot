import React from "react";
import { Customer360Panel } from "./dashboard/pages/Customer360Panel";

type Props = {
  customer: any;
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (customer: any, profile: any) => void;
  onSummaryRefreshQueued?: () => void;
  formatDate: (value: any, includeTime?: boolean) => string;
};

function profileOf(customer: any) {
  const raw = customer?.profile;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

function clean(value: any) {
  return String(value ?? "").trim();
}

function firstValue(...values: any[]) {
  return values.map(clean).find(Boolean) || "";
}

function latestRecord(profile: any) {
  const record = profile.latestOrder || profile.latestLead || profile.latestRecord || profile.orderLeadState || profile.activeRecord || {};
  return record && typeof record === "object" && !Array.isArray(record) ? record : {};
}

export function getCustomerListPreview(customer: any) {
  const profile = profileOf(customer);
  return firstValue(
    profile.lastCustomerMessagePreview,
    profile.lastInteractionPreview,
    profile.lastMessagePreview,
    profile.lastCustomerMessage,
    profile.lastMessage,
    customer?.last_message,
    profile.lastBotReply,
  )
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export function getCustomerStatusLabel(customer: any) {
  const profile = profileOf(customer);
  if (profile.aiPaused || profile.ai_paused || profile.botReplyControl === "paused_permanent" || profile.botReplyControl === "paused_temp") {
    return "Paused";
  }
  if (profile.manualReviewRequired || profile.manual_review || profile.customerStatus === "manual_review") return "Manual review";
  return firstValue(profile.customerStatus, profile.status, profile.lifecycleStatus) || "Active";
}

export function getCustomerLeadOrderStatusLabel(customer: any) {
  const profile = profileOf(customer);
  const record = latestRecord(profile);
  return firstValue(
    record.recordStatus,
    record.orderStatus,
    record.transactionStatus,
    profile.recordStatus,
    profile.orderStatus,
    profile.leadStatus,
    profile.latestOrderRef ? "Order recorded" : "",
  ) || "No active record";
}

export function CustomerDetailDrawer(props: Props) {
  return <Customer360Panel {...props} />;
}
