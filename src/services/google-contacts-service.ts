/**
 * Google Contacts Integration Service (Free-Only V1)
 * 
 * Strict Read-Only People API Operations:
 * - Search owner contacts by name, email, or phone
 * - Safe ambiguity detection preventing unverified assumptions
 * - Phone normalization through canonical Personal Contact identity primitives
 * - Explicit selection linking with provenance google_contacts_owner_selected
 * - Absolutely NO contact creation, mutation, or deletion
 */

import { getValidGoogleAccessToken } from "./google-personal-oauth-service.ts";
import {
  evaluateGoogleFreeUsage,
  recordGoogleUsageSuccess,
} from "./google-free-usage-guard.ts";
import { extractPhoneDigits } from "./whatsapp-contact-identity-resolver.ts";
import { formatInternationalPhone } from "../utils/contact-identity.ts";
import {
  savePersonalContactDoc,
  getPersonalContactDoc,
  recordContactAlias,
} from "./personal-contact-storage-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";
import crypto from "node:crypto";

export const googleContactsDeps = {
  fetch: (url: string, init?: RequestInit) => fetch(url, init),
};

export interface GoogleContactPerson {
  resourceName: string;
  etag?: string;
  displayName: string;
  phoneNumbers: string[];
  emailAddresses: string[];
  organization?: string;
}

export interface SearchGoogleContactsParams {
  accountId: string;
  query: string;
  pageSize?: number;
  now?: number;
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>;
}

export interface GoogleContactSearchResult {
  query: string;
  matches: GoogleContactPerson[];
  isAmbiguous: boolean;
  totalMatches: number;
}

export async function searchGoogleContacts(
  params: SearchGoogleContactsParams
): Promise<GoogleContactSearchResult> {
  const { accountId, query, pageSize = 10, now = Date.now() } = params;

  // 1. Free-only usage guard check
  const guard = await evaluateGoogleFreeUsage({
    accountId,
    service: "contacts",
    method: "search",
    estimatedQuotaUnits: 1,
    now,
  });

  if (guard.decision !== "ALLOW") {
    const err: any = new Error(guard.reasonMessage);
    err.code = guard.reasonCode;
    throw err;
  }

  // 2. Obtain valid token and verify capability
  const { accessToken, connection } = await getValidGoogleAccessToken(accountId);
  if (!connection.capabilities.googleContactsRead) {
    const err: any = new Error("GOOGLE_CONTACTS_READ_NOT_GRANTED");
    err.code = "GOOGLE_SCOPE_NOT_GRANTED";
    throw err;
  }

  // 3. Query Google People API
  const fetchFn = params.overrideFetch || googleContactsDeps.fetch;
  const url = new URL("https://people.googleapis.com/v1/people:searchContacts");
  url.searchParams.set("query", query);
  url.searchParams.set("pageSize", String(Math.min(pageSize, 30)));
  url.searchParams.set("readMask", "names,phoneNumbers,emailAddresses,organizations");

  const res = await fetchFn(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err: any = new Error(data.error?.message || "GOOGLE_CONTACTS_SEARCH_FAILED");
    err.code = "CONTACTS_API_ERROR";
    throw err;
  }

  // 4. Record usage on success
  await recordGoogleUsageSuccess({
    accountId,
    service: "contacts",
    method: "search",
    estimatedQuotaUnits: 1,
    now,
  });

  const rawResults: any[] = data.results || [];
  const matches: GoogleContactPerson[] = rawResults.map((r: any) => {
    const person = r.person || {};
    const nameObj = person.names?.[0] || {};
    const displayName = nameObj.displayName || nameObj.givenName || "Unknown Contact";
    const phones = (person.phoneNumbers || []).map((p: any) => String(p.value || "")).filter(Boolean);
    const emails = (person.emailAddresses || []).map((e: any) => String(e.value || "")).filter(Boolean);
    const org = person.organizations?.[0]?.name;

    return {
      resourceName: person.resourceName || `people/${Date.now()}`,
      displayName,
      phoneNumbers: phones,
      emailAddresses: emails,
      organization: org,
    };
  });

  return {
    query,
    matches,
    isAmbiguous: matches.length > 1,
    totalMatches: matches.length,
  };
}

export interface LinkGoogleContactParams {
  accountId: string;
  selectedPerson: GoogleContactPerson;
  primaryPhoneNumber?: string;
  primaryEmail?: string;
  now?: number;
}

export async function linkGoogleContactToPersonalContact(
  params: LinkGoogleContactParams
): Promise<PersonalContact> {
  const { accountId, selectedPerson, now = Date.now() } = params;

  // Resolve phone number
  const chosenRawPhone = params.primaryPhoneNumber || selectedPerson.phoneNumbers[0] || "";
  const phoneDigits = extractPhoneDigits(chosenRawPhone);
  const formattedPhone = phoneDigits ? formatInternationalPhone(phoneDigits, { trusted: true }) : undefined;
  const jid = phoneDigits ? `${phoneDigits}@s.whatsapp.net` : `google_${Date.now()}@s.whatsapp.net`;

  const contactId = `pc_g_${crypto.createHash("sha256").update(`${accountId}:${selectedPerson.resourceName}`).digest("hex").slice(0, 16)}`;

  // Check if already linked
  const existing = await getPersonalContactDoc(accountId, contactId);
  if (existing) {
    return existing;
  }

  const newContact: PersonalContact = {
    contactId,
    schemaVersion: 1,
    revision: 1,
    accountId,
    status: "active",
    displayName: selectedPerson.displayName,
    relationship: "other",
    relationshipProvenance: "owner_provided",
    communicationPreferences: {
      preferredLanguage: "en",
      contactCommunicationStatus: "active",
    },
    whatsappIdentities: [
      {
        personalInstanceId: "default",
        jid,
        jidType: "pn",
        canonicalPhone: formattedPhone,
        pushName: selectedPerson.displayName,
        source: "google_contacts_owner_selected",
        firstSeenAt: now,
        lastSeenAt: now,
      },
    ],
    durableFacts: [
      ...(selectedPerson.emailAddresses[0]
        ? [{
            factId: `f_${Date.now()}`,
            category: "identity" as const,
            label: "email",
            value: selectedPerson.emailAddresses[0],
            source: "owner_dashboard" as const,
            sourceTimestamp: now,
            createdAt: now,
            updatedAt: now,
            lastConfirmedAt: now,
            status: "current" as const,
            sensitivity: "standard" as const,
          }]
        : []),
    ],
    ownerNotes: [],
    createdAt: now,
    updatedAt: now,
  };

  await savePersonalContactDoc(newContact);
  if (phoneDigits) {
    await recordContactAlias(accountId, `pn:${phoneDigits}`, contactId);
  }

  return newContact;
}
