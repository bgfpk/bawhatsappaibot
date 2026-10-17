/**
 * Personal Assistant Hub Utilities
 * 
 * Deterministic attention sorting, phone masking/normalization,
 * and presentation helpers.
 */

import type { AttentionItem, AttentionItemType } from "./hub-types.ts";

export const ATTENTION_PRIORITY_MAP: Record<AttentionItemType, number> = {
  approval_required: 1,
  owner_question_required: 2,
  failed_task: 3,
  google_issue: 4,
  manual_takeover: 5,
  notice: 6,
};

/**
 * Deterministically sorts attention queue items.
 * Priority 1 (highest) to 6 (lowest), and oldest unresolved first within the same priority.
 */
export function sortAttentionQueue(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const pA = ATTENTION_PRIORITY_MAP[a.type] || 6;
    const pB = ATTENTION_PRIORITY_MAP[b.type] || 6;
    if (pA !== pB) {
      return pA - pB;
    }
    // Oldest first within same priority
    return (a.timestamp || 0) - (b.timestamp || 0);
  });
}

/**
 * Ensures phone numbers are safely formatted and NEVER displays raw LID as a phone number.
 */
export function formatSafePhone(jid?: string, fallbackPhone?: string): string {
  const cleanJid = String(jid || "").trim().toLowerCase();
  if (cleanJid.endsWith("@lid")) {
    // If it's an LID without an explicit phone number, never show LID digits as a phone
    if (fallbackPhone && !fallbackPhone.includes("@") && fallbackPhone.replace(/\D/g, "").length >= 7) {
      return formatPhoneDigits(fallbackPhone);
    }
    return "WhatsApp Identity (LID)";
  }

  if (cleanJid.endsWith("@s.whatsapp.net")) {
    const digits = cleanJid.split("@")[0].replace(/\D/g, "");
    return formatPhoneDigits(digits);
  }

  if (fallbackPhone) {
    return formatPhoneDigits(fallbackPhone);
  }

  return "Unknown Contact";
}

function formatPhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "No phone";
  if (digits.length === 12 && digits.startsWith("92")) {
    return `+92 ${digits.substring(2, 5)} ${digits.substring(5)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.substring(1, 4)}) ${digits.substring(4, 7)}-${digits.substring(7)}`;
  }
  return `+${digits}`;
}

export function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  if (diff < 0) return "Just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
