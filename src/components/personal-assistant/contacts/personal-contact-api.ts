/**
 * Personal Contacts API Client
 */

import type {
  PersonalContact,
  PersonalContactSummaryContext,
  PersonalContactRelationship,
  PersonalContactFactCategory,
} from "../../../services/personal-contact-types.ts";

export async function fetchPersonalContacts(params?: { status?: string; search?: string }): Promise<PersonalContact[]> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);

  const res = await fetch(`/api/personal-assistant/contacts?${query.toString()}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch personal contacts");
  }
  const data = await res.json();
  return data.contacts || [];
}

export async function fetchPersonalContactDetails(
  contactId: string
): Promise<{ contact: PersonalContact; context: PersonalContactSummaryContext }> {
  const res = await fetch(`/api/personal-assistant/contacts/${encodeURIComponent(contactId)}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to fetch contact details");
  }
  return res.json();
}

export async function updatePersonalContactRelationship(
  contactId: string,
  relationship: PersonalContactRelationship,
  customLabel?: string
): Promise<PersonalContact> {
  const res = await fetch(`/api/personal-assistant/contacts/${encodeURIComponent(contactId)}/relationship`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ relationship, customLabel }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update relationship");
  }
  const data = await res.json();
  return data.contact;
}

export async function addPersonalContactFactApi(
  contactId: string,
  fact: { label: string; value: string; category?: PersonalContactFactCategory; validUntil?: number }
): Promise<PersonalContact> {
  const res = await fetch(`/api/personal-assistant/contacts/${encodeURIComponent(contactId)}/facts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fact),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to add fact");
  }
  const data = await res.json();
  return data.contact;
}

export async function removePersonalContactFactApi(
  contactId: string,
  factId: string
): Promise<PersonalContact> {
  const res = await fetch(`/api/personal-assistant/contacts/${encodeURIComponent(contactId)}/facts/${encodeURIComponent(factId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to remove fact");
  }
  const data = await res.json();
  return data.contact;
}

export async function addPersonalContactNoteApi(
  contactId: string,
  text: string
): Promise<PersonalContact> {
  const res = await fetch(`/api/personal-assistant/contacts/${encodeURIComponent(contactId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to add note");
  }
  const data = await res.json();
  return data.contact;
}

export async function removePersonalContactNoteApi(
  contactId: string,
  noteId: string
): Promise<PersonalContact> {
  const res = await fetch(`/api/personal-assistant/contacts/${encodeURIComponent(contactId)}/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to remove note");
  }
  const data = await res.json();
  return data.contact;
}

export async function clearPersonalContactMemoryApi(
  contactId: string
): Promise<PersonalContact> {
  const res = await fetch(`/api/personal-assistant/contacts/${encodeURIComponent(contactId)}/clear-memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmClear: true }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to clear memory");
  }
  const data = await res.json();
  return data.contact;
}
