function clean(value: any) {
  return String(value || "").trim();
}

export type LatestCustomerMessageType = "text" | "audio" | "image";

export type LatestCustomerReplyRoutingStateInput = {
  latestMessageType: LatestCustomerMessageType;
  latestMessageId?: string;
  latestUserHasAudio?: boolean;
  latestUserHasImage?: boolean;
  latestUserHasMedia?: boolean;
  conversationHasAudio?: boolean;
  conversationHasMedia?: boolean;
  profileLastMediaUnderstandingEventId?: string;
  profileLastMediaUnderstandingStatus?: string;
};

export type LatestCustomerReplyRoutingState = {
  latestMessageType: LatestCustomerMessageType;
  forceTextOnly: boolean;
  hasAudio: boolean;
  hasImage: boolean;
  hasMedia: boolean;
  staleMediaRequirementCleared: boolean;
  shouldCancelPendingMediaRetry: boolean;
  staleMediaSource: "" | "conversation_media" | "profile_pending_media";
  staleMessageId: string;
};

function hasPendingProfileMediaState(status: any) {
  const value = clean(status).toLowerCase();
  if (!value) return false;
  return value.includes("image") || value.includes("audio") || value.includes("media_understanding");
}

export function resolveLatestCustomerReplyRoutingState(
  input: LatestCustomerReplyRoutingStateInput,
): LatestCustomerReplyRoutingState {
  const latestMessageType = input.latestMessageType || "text";
  const forceTextOnly = latestMessageType === "text";
  const staleProfileMedia =
    forceTextOnly &&
    hasPendingProfileMediaState(input.profileLastMediaUnderstandingStatus) &&
    clean(input.profileLastMediaUnderstandingEventId) !== "" &&
    clean(input.profileLastMediaUnderstandingEventId) !== clean(input.latestMessageId);
  const staleConversationMedia =
    forceTextOnly &&
    !staleProfileMedia &&
    (Boolean(input.conversationHasAudio) || Boolean(input.conversationHasMedia));

  return {
    latestMessageType,
    forceTextOnly,
    hasAudio: forceTextOnly ? false : Boolean(input.latestUserHasAudio),
    hasImage: forceTextOnly ? false : Boolean(input.latestUserHasImage),
    hasMedia: forceTextOnly ? false : Boolean(input.latestUserHasMedia || input.latestUserHasImage),
    staleMediaRequirementCleared: staleProfileMedia || staleConversationMedia,
    shouldCancelPendingMediaRetry: staleProfileMedia,
    staleMediaSource: staleProfileMedia
      ? "profile_pending_media"
      : staleConversationMedia
        ? "conversation_media"
        : "",
    staleMessageId: staleProfileMedia ? clean(input.profileLastMediaUnderstandingEventId) : "",
  };
}
