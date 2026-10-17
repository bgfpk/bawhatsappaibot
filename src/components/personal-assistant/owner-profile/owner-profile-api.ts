import type { Owner360Profile } from "./owner-profile-types.ts";

export interface OwnerProfileApiResponse {
  success: boolean;
  profile: Owner360Profile;
  suggestions?: {
    preferredName?: string;
    email?: string;
  };
}

export async function fetchOwnerProfileApi(): Promise<OwnerProfileApiResponse> {
  const res = await fetch("/api/owner-profile");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to load owner profile");
  }
  return await res.json();
}

export async function saveOwnerProfileApi(
  profile: Owner360Profile,
  expectedRevision?: number
): Promise<{ profile: Owner360Profile }> {
  const res = await fetch("/api/owner-profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile,
      expectedRevision: expectedRevision ?? profile.revision,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 409 || data.code === "REVISION_CONFLICT") {
    const err: any = new Error("Profile was modified elsewhere. Please refresh to review latest updates.");
    err.code = "REVISION_CONFLICT";
    throw err;
  }

  if (!res.ok) {
    throw new Error(data.error || "Failed to save owner profile");
  }

  return data;
}

export async function clearOwnerProfileApi(
  expectedRevision?: number
): Promise<{ profile: Owner360Profile }> {
  const res = await fetch("/api/owner-profile/clear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      confirmClear: true,
      expectedRevision,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to reset profile");
  }

  return data;
}
