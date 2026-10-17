import { normalizePhoneDigits, normalizeWhatsAppJid } from "../utils/whatsapp-jid.ts";

function toComparableDigits(value: any) {
  const jid = normalizeWhatsAppJid(value);
  const raw = jid || String(value || "");
  const digits = normalizePhoneDigits(raw.split("@")[0]);
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return `92${digits.slice(1)}`;
  if (digits.startsWith("3") && digits.length === 10) return `92${digits}`;
  return digits;
}

export function normalizeMutedNumbers(values: any[] = []) {
  return Array.from(new Set(values.map(toComparableDigits).filter((digits) => digits.length >= 8)));
}

export function isMutedCustomer(jid: any, altJid: any, mutedNumbers: any[] = [], profile?: any) {
  if (profile) {
    const botReplyControl = String(profile?.botReplyControl || "").trim();
    if (botReplyControl === "active") {
      return false;
    }
    if (botReplyControl === "paused_temp") {
      const until = Number(profile?.botReplyPausedUntil || 0);
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (until <= nowSeconds) {
        return false;
      }
    }
  }

  const muted = normalizeMutedNumbers(mutedNumbers);
  if (muted.length === 0) return false;
  const candidates = normalizeMutedNumbers([
    jid,
    altJid,
    profile?.jid,
    profile?.lidJid,
    profile?.phoneJid,
    profile?.phoneNumber,
    profile?.whatsapp_number,
    ...(Array.isArray(profile?.linkedJids) ? profile.linkedJids : []),
  ]);
  return candidates.some((candidate) => muted.some((mutedNumber) =>
    candidate === mutedNumber ||
    candidate.endsWith(mutedNumber) ||
    mutedNumber.endsWith(candidate)
  ));
}

export function addMutedNumber(values: any[] = [], number: any) {
  return normalizeMutedNumbers([...values, number]);
}

export function removeMutedNumbers(values: any[] = [], numbersToRemove: any[] = []) {
  const toRemove = normalizeMutedNumbers(numbersToRemove);
  if (toRemove.length === 0) return normalizeMutedNumbers(values);
  const current = normalizeMutedNumbers(values);
  return current.filter((num) => !toRemove.some((target) =>
    num === target || num.endsWith(target) || target.endsWith(num)
  ));
}
