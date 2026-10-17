/**
 * Personal Delegation Policy Utilities (Browser and Server Safe)
 * 
 * Provides pure policy calculation functions safe for frontend bundling.
 */

import type { PersonalDelegationPolicy } from "./personal-delegation-types.ts";

/**
 * Checks if a requested policy update makes the assistant more autonomous.
 * Broadening updates require explicit owner confirmation.
 */
export function isBroadeningPolicyChange(
  current: PersonalDelegationPolicy,
  requested: Partial<PersonalDelegationPolicy>
): { isBroadening: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (requested.orders) {
    if (!current.orders.allowOrderCommitment && requested.orders.allowOrderCommitment) {
      reasons.push("Enabling autonomous order commitments");
    }
    if (
      current.orders.orderCommitmentMode === "ASK_EACH_TIME" &&
      requested.orders.orderCommitmentMode === "WITHIN_LIMITS"
    ) {
      reasons.push("Switching order commitment mode from 'Ask each time' to 'Within limits'");
    }
    if (
      requested.orders.maxOrderValuePerTask !== undefined &&
      requested.orders.maxOrderValuePerTask > current.orders.maxOrderValuePerTask
    ) {
      reasons.push(`Increasing max order value per task from ${current.orders.maxOrderValuePerTask} to ${requested.orders.maxOrderValuePerTask}`);
    }
    if (
      requested.orders.maxOrderValuePerDay !== undefined &&
      requested.orders.maxOrderValuePerDay > current.orders.maxOrderValuePerDay
    ) {
      reasons.push(`Increasing daily order limit from ${current.orders.maxOrderValuePerDay} to ${requested.orders.maxOrderValuePerDay}`);
    }
  }

  if (requested.dataDisclosure) {
    if (
      !current.dataDisclosure.allowDeliveryAddressForShopping &&
      requested.dataDisclosure.allowDeliveryAddressForShopping
    ) {
      reasons.push("Allowing delivery address sharing without per-task confirmation");
    }
    if (
      current.dataDisclosure.allowEmailSharing !== "AUTHORIZED_TASKS" &&
      requested.dataDisclosure.allowEmailSharing === "AUTHORIZED_TASKS"
    ) {
      reasons.push("Allowing email sharing for authorized tasks");
    }
    if (
      current.dataDisclosure.allowPhoneSharing !== "AUTHORIZED_TASKS" &&
      requested.dataDisclosure.allowPhoneSharing === "AUTHORIZED_TASKS"
    ) {
      reasons.push("Allowing phone sharing for authorized tasks");
    }
  }

  if (requested.appointments) {
    if (
      !current.appointments.allowMeetingConfirmation &&
      requested.appointments.allowMeetingConfirmation
    ) {
      reasons.push("Allowing autonomous meeting confirmations");
    }
  }

  if (requested.negotiation) {
    if (
      !current.negotiation.allowAcceptFinalOffer &&
      requested.negotiation.allowAcceptFinalOffer
    ) {
      reasons.push("Allowing assistant to autonomously accept final offers");
    }
  }

  return {
    isBroadening: reasons.length > 0,
    reasons,
  };
}
