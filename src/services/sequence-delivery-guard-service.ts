const BLOCKING_SEQUENCE_STATUSES = [
  "shipped",
  "shipping",
  "dispatched",
  "in transit",
  "delivered",
  "completed",
  "cancelled",
  "canceled",
  "refunded",
  "returned",
];

function normalizeStatus(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function statusMatchesBlock(normalizedStatus: string) {
  return BLOCKING_SEQUENCE_STATUSES.some(status =>
    normalizedStatus === status || normalizedStatus.includes(status)
  );
}

export function getSequenceStatusBlockReason(profile: any) {
  if (!profile || typeof profile !== "object") return "";

  const statuses = [
    profile.orderStatus,
    profile.order_status,
    profile.status,
    profile.latestTrackingStatus,
    profile.latest_tracking_status,
    profile.latestTrackingStatusCode,
  ];

  for (const status of statuses) {
    const normalized = normalizeStatus(status);
    if (normalized && statusMatchesBlock(normalized)) {
      return `customer status is ${status}`;
    }
  }
  return "";
}

export function isSequenceSentValue(value: any) {
  if (value === true) return true;
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) && numeric > 0;
}

export function shouldHideSequencesFromAi(profile: any) {
  return Boolean(getSequenceStatusBlockReason(profile));
}
