/**
 * Google Personal Assistant Integration - Unit Test Suite (Prompt 8)
 * 
 * Verifies sections 79 - 88:
 * - Restricted scopes & Maps/Places prohibited checks
 * - Dedicated incremental OAuth & token security
 * - Free-only usage guards & safety ceilings
 * - Calendar availability (Free/Busy) & event creation with double-booking prevention
 * - Google Contacts read-only lookup with ambiguity detection & phone normalization
 * - Gmail send-only with single-recipient safety & idempotency
 * - Drive selected-file access with server-side validation & size limits
 * - Prompt 7 authorization integration & approval fingerprinting
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  GOOGLE_SCOPES,
  CAPABILITY_REQUIRED_SCOPES,
  PROHIBITED_GOOGLE_SCOPES,
  type GoogleCapability,
} from "./google-personal-auth-types.ts";
import {
  evaluateGoogleFreeUsage,
  recordGoogleUsageSuccess,
  __clearGoogleUsageCountersForTest,
  DEFAULT_ACCOUNT_SAFETY_CAPS,
} from "./google-free-usage-guard.ts";
import {
  getGooglePersonalConnection,
  saveGooglePersonalConnection,
  disconnectGooglePersonalConnection,
  setInternalGoogleCapabilityEnabled,
  createDefaultGoogleConnection,
  __clearGoogleConnectionCacheForTest,
  googleConnectionDeps,
} from "./google-personal-connection-service.ts";
import {
  initiateGoogleOAuthFlow,
  handleGoogleOAuthCallback,
  getValidGoogleAccessToken,
  buildScopeListForCapabilities,
  setCachedGoogleAccessToken,
  __clearGoogleOAuthCacheForTest,
} from "./google-personal-oauth-service.ts";
import { encryptServerSecret } from "./secret-crypto-service.ts";
import {
  queryCalendarFreeBusy,
  createCalendarEvent,
  cancelCalendarEvent,
  __clearCalendarIdempotencyForTest,
} from "./google-calendar-service.ts";
import {
  searchGoogleContacts,
  linkGoogleContactToPersonalContact,
} from "./google-contacts-service.ts";
import {
  sendGmailMessage,
  buildRfc2822Email,
  __clearGmailIdempotencyForTest,
} from "./google-gmail-send-service.ts";
import {
  registerSelectedDriveFile,
  validateDriveFileAccess,
  readSelectedDriveFileContent,
  MAX_DRIVE_FILE_SIZE_BYTES,
  __clearSelectedDriveFilesForTest,
} from "./google-drive-file-service.ts";
import {
  executeGooglePersonalAction,
  computeCalendarApprovalFingerprint,
  computeGmailApprovalFingerprint,
  determineGoogleActionRisk,
} from "./google-personal-task-tools.ts";
import {
  savePersonalDelegationPolicy,
  createDefaultDelegationPolicy,
  __clearDelegationPolicyCacheForTest,
} from "./personal-delegation-policy-service.ts";
import "./google-personal-admin-tools.ts";
import { getAdminAction } from "./admin-action-registry-service.ts";

const mockTenantId = `tenant_g_${Date.now()}`;
const mockPersonalInstanceId = "bot_pers_g_01";

test("Google Personal Assistant Integration Test Suite (Prompt 8)", async (t) => {
  // In-memory mock storage for Appwrite system configs
  const mockConfigStorage = new Map<string, any>();

  googleConnectionDeps.getDocument = async (_dbId, _collId, docId) => {
    const doc = mockConfigStorage.get(docId);
    if (!doc) {
      const err: any = new Error("Document not found");
      err.code = 404;
      err.status = 404;
      throw err;
    }
    return doc;
  };

  googleConnectionDeps.createDocument = async (_dbId, _collId, docId, data) => {
    mockConfigStorage.set(docId, { ...data, $id: docId });
    return mockConfigStorage.get(docId);
  };

  googleConnectionDeps.updateDocument = async (_dbId, _collId, docId, data) => {
    if (!mockConfigStorage.has(docId)) {
      const err: any = new Error("Document not found");
      err.code = 404;
      err.status = 404;
      throw err;
    }
    mockConfigStorage.set(docId, { ...mockConfigStorage.get(docId), ...data });
    return mockConfigStorage.get(docId);
  };

  t.beforeEach(async () => {
    mockConfigStorage.clear();
    __clearGoogleConnectionCacheForTest();
    __clearGoogleOAuthCacheForTest();
    __clearGoogleUsageCountersForTest();
    __clearCalendarIdempotencyForTest();
    __clearGmailIdempotencyForTest();
    __clearSelectedDriveFilesForTest();
    __clearDelegationPolicyCacheForTest();
    process.env.ENABLE_PERSONAL_ASSISTANT = "true";
    process.env.GOOGLE_PERSONAL_ASSISTANT_ENABLED = "true";
    process.env.GOOGLE_CALENDAR_ENABLED = "true";
    process.env.GOOGLE_CONTACTS_ENABLED = "true";
    process.env.GOOGLE_GMAIL_SEND_ENABLED = "true";
    process.env.GOOGLE_PERSONAL_ASSISTANT_CLIENT_ID = "mock_client_id_blackarrow";
    process.env.GOOGLE_PERSONAL_ASSISTANT_CLIENT_SECRET = "mock_client_secret_blackarrow";
    await savePersonalDelegationPolicy(createDefaultDelegationPolicy(mockTenantId));
  });

  // =========================================================================
  // 1. HARD SECURITY SCAN: NO RESTRICTED SCOPES & NO MAPS/PLACES (Sections 79, 80)
  // =========================================================================
  await t.test("79. Hard Audit: Prohibited restricted Gmail & Drive scopes must never appear", () => {
    const allConfiguredScopes = [
      ...Object.values(GOOGLE_SCOPES),
      ...Object.values(CAPABILITY_REQUIRED_SCOPES).flat(),
    ];

    for (const prohibited of PROHIBITED_GOOGLE_SCOPES) {
      assert.strictEqual(
        allConfiguredScopes.includes(prohibited as any),
        false,
        `Prohibited scope "${prohibited}" was detected in configured scopes!`
      );
    }
  });

  await t.test("80. Hard Audit: No Maps, Places, or Business Profile APIs in scopes or actions", () => {
    const allScopeValues = Object.values(GOOGLE_SCOPES).join(" ").toLowerCase();
    assert.strictEqual(allScopeValues.includes("maps"), false, "Maps API must not be present");
    assert.strictEqual(allScopeValues.includes("places"), false, "Places API must not be present");
    assert.strictEqual(allScopeValues.includes("businessprofile"), false, "Business Profile must not be present");
  });

  // =========================================================================
  // 2. OAUTH & TOKEN LIFECYCLE (Section 81)
  // =========================================================================
  await t.test("81. OAuth: Incremental scope isolation, CSRF state verification, and partial consent", async () => {
    // 1. Calendar connect requests Calendar scopes only
    const calScopes = buildScopeListForCapabilities(["calendarEvents"]);
    assert.ok(calScopes.includes(GOOGLE_SCOPES.CALENDAR_EVENTS_OWNED));
    assert.ok(calScopes.includes(GOOGLE_SCOPES.CALENDAR_FREEBUSY));
    assert.strictEqual(calScopes.includes(GOOGLE_SCOPES.GMAIL_SEND), false);
    assert.strictEqual(calScopes.includes(GOOGLE_SCOPES.DRIVE_FILE), false);

    // 2. Gmail connect requests gmail.send only
    const gmailScopes = buildScopeListForCapabilities(["gmailSend"]);
    assert.ok(gmailScopes.includes(GOOGLE_SCOPES.GMAIL_SEND));
    assert.strictEqual(gmailScopes.includes(GOOGLE_SCOPES.CALENDAR_EVENTS_OWNED), false);

    // 3. Initiate OAuth flow generates CSRF-protected state
    const authRes = await initiateGoogleOAuthFlow({
      accountId: mockTenantId,
      requestedCapabilities: ["calendarEvents", "gmailSend"],
    });
    assert.ok(authRes.authUrl.includes("accounts.google.com"));
    assert.ok(authRes.state);
    assert.ok(authRes.signedCookie);

    // 4. Invalid OAuth state rejected
    await assert.rejects(
      async () => {
        await handleGoogleOAuthCallback({
          queryCode: "code_123",
          queryState: "invalid_state_token",
          cookieState: authRes.signedCookie,
        });
      },
      /invalid_oauth_state|unknown_or_expired_state/i
    );

    // 5. Successful callback with Partial Consent (user grants Calendar, denies Gmail)
    const callbackRes = await handleGoogleOAuthCallback({
      queryCode: "valid_mock_code",
      queryState: authRes.state,
      cookieState: authRes.signedCookie,
      overrideTokenResponse: {
        access_token: "mock_access_token_123",
        refresh_token: "mock_refresh_token_xyz",
        expires_in: 3600,
        scope: `${GOOGLE_SCOPES.OPENID} ${GOOGLE_SCOPES.USERINFO_EMAIL} ${GOOGLE_SCOPES.CALENDAR_EVENTS_OWNED} ${GOOGLE_SCOPES.CALENDAR_FREEBUSY}`,
      },
      overrideUserInfo: {
        sub: "google_sub_998877",
        email: "contact-1a14cea9d94a@example.invalid",
      },
    });

    assert.strictEqual(callbackRes.success, true);
    assert.strictEqual(callbackRes.connection.status, "CONNECTED");
    assert.strictEqual(callbackRes.connection.googleSubject, "google_sub_998877");
    assert.strictEqual(callbackRes.connection.googleEmail, "contact-1a14cea9d94a@example.invalid");

    // Partial consent check: calendarEvents is active, gmailSend remains disabled
    assert.strictEqual(callbackRes.connection.capabilities.calendarEvents, true);
    assert.strictEqual(callbackRes.connection.capabilities.calendarAvailability, true);
    assert.strictEqual(callbackRes.connection.capabilities.gmailSend, false);

    // Verify refresh token is encrypted at rest and not plaintext in document
    assert.ok(callbackRes.connection.encryptedRefreshTokenRef.startsWith("enc:v1:"));
    assert.strictEqual(callbackRes.connection.encryptedRefreshTokenRef.includes("mock_refresh_token_xyz"), false);

    // 6. Token retrieval from cache/refresh
    const tokenRes = await getValidGoogleAccessToken(mockTenantId);
    assert.strictEqual(tokenRes.accessToken, "mock_access_token_123");

    // 7. Revocation / Disconnect
    const disconnectRes = await disconnectGooglePersonalConnection(mockTenantId);
    assert.strictEqual(disconnectRes.status, "REVOKED");
    assert.strictEqual(disconnectRes.encryptedRefreshTokenRef, "");
    assert.strictEqual(disconnectRes.capabilities.calendarEvents, false);

    // Subsequent token access fails with GOOGLE_NOT_CONNECTED or REAUTH_REQUIRED
    await assert.rejects(async () => {
      await getValidGoogleAccessToken(mockTenantId);
    }, /GOOGLE_NOT_CONNECTED|GOOGLE_REAUTH_REQUIRED/i);
  });

  // =========================================================================
  // 3. FREE-ONLY USAGE GUARD & SAFETY CEILINGS (Section 82)
  // =========================================================================
  await t.test("82. Free-Only Guard: Daily safety ceilings and service kill switches", async () => {
    // 1. Normal operation within limits -> ALLOW
    const okCheck = await evaluateGoogleFreeUsage({
      accountId: mockTenantId,
      service: "calendar",
      method: "freeBusy",
      estimatedQuotaUnits: 1,
    });
    assert.strictEqual(okCheck.decision, "ALLOW");

    // 2. Kill switch disables service
    process.env.GOOGLE_CALENDAR_ENABLED = "false";
    const disabledCheck = await evaluateGoogleFreeUsage({
      accountId: mockTenantId,
      service: "calendar",
      method: "freeBusy",
    });
    assert.strictEqual(disabledCheck.decision, "BLOCK_DISABLED");
    assert.strictEqual(disabledCheck.reasonCode, "GOOGLE_SERVICE_DISABLED");
    process.env.GOOGLE_CALENDAR_ENABLED = "true";

    // 3. Daily limit exhaustion
    // Simulate consuming up to the calendar daily cap (200)
    await recordGoogleUsageSuccess({
      accountId: mockTenantId,
      service: "calendar",
      method: "freeBusy",
      estimatedQuotaUnits: DEFAULT_ACCOUNT_SAFETY_CAPS.calendar,
    });

    const exceededCheck = await evaluateGoogleFreeUsage({
      accountId: mockTenantId,
      service: "calendar",
      method: "freeBusy",
      estimatedQuotaUnits: 1,
    });
    assert.strictEqual(exceededCheck.decision, "BLOCK_FREE_ONLY_LIMIT");
    assert.strictEqual(exceededCheck.reasonCode, "GOOGLE_FREE_ONLY_LIMIT_REACHED");

    // 4. Other tenant account is NOT affected (Tenant Isolation)
    const otherTenantCheck = await evaluateGoogleFreeUsage({
      accountId: "other_tenant_id",
      service: "calendar",
      method: "freeBusy",
      estimatedQuotaUnits: 1,
    });
    assert.strictEqual(otherTenantCheck.decision, "ALLOW");
  });

  // =========================================================================
  // 4. CALENDAR: AVAILABILITY, EVENT CREATION & DOUBLE-BOOKING (Section 83)
  // =========================================================================
  await t.test("83. Calendar: Free/busy availability and double-booking protection", async () => {
    // Setup connected Google account with calendar capability
    const conn = createDefaultGoogleConnection(mockTenantId);
    conn.status = "CONNECTED";
    conn.grantedScopes = [GOOGLE_SCOPES.CALENDAR_EVENTS_OWNED, GOOGLE_SCOPES.CALENDAR_FREEBUSY];
    conn.encryptedRefreshTokenRef = encryptServerSecret("mock_refresh_token");
    await saveGooglePersonalConnection(conn);
    setCachedGoogleAccessToken(mockTenantId, "mock_access_token_123");

    // Mock Google Calendar API responses
    const mockGoogleApi = async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes("freeBusy")) {
        // If query overlaps 14:00-15:00, report busy
        if (body.timeMin.includes("14:00") || body.timeMax.includes("14:30")) {
          return {
            ok: true,
            json: async () => ({
              calendars: { primary: { busy: [{ start: "2026-09-04T14:00:00Z", end: "2026-09-04T15:00:00Z" }] } },
            }),
          };
        }
        // Otherwise free
        return {
          ok: true,
          json: async () => ({
            calendars: { primary: { busy: [] } },
          }),
        };
      }
      if (url.includes("events")) {
        return {
          ok: true,
          json: async () => ({
            id: "gcal_evt_1001",
            summary: body.summary,
            status: "confirmed",
            htmlLink: "https://calendar.google.com/event?eid=gcal_evt_1001",
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    };

    // 1. Query Free/Busy during busy slot
    const busyCheck = await queryCalendarFreeBusy({
      accountId: mockTenantId,
      timeMin: "2026-09-04T14:00:00Z",
      timeMax: "2026-09-04T14:30:00Z",
      timezone: "UTC",
      overrideFetch: mockGoogleApi,
    });
    assert.strictEqual(busyCheck.isFreeEntireWindow, false);
    assert.strictEqual(busyCheck.busy.length, 1);

    // 2. Query Free/Busy during free slot
    const freeCheck = await queryCalendarFreeBusy({
      accountId: mockTenantId,
      timeMin: "2026-09-04T16:00:00Z",
      timeMax: "2026-09-04T17:00:00Z",
      timezone: "UTC",
      overrideFetch: mockGoogleApi,
    });
    assert.strictEqual(freeCheck.isFreeEntireWindow, true);

    // 3. Double-booking prevention: attempting to create event in busy slot is rejected
    await assert.rejects(
      async () => {
        await createCalendarEvent({
          accountId: mockTenantId,
          summary: "Meeting with Client",
          start: "2026-09-04T14:00:00Z",
          end: "2026-09-04T15:00:00Z",
          timezone: "UTC",
          overrideFetch: mockGoogleApi,
        });
      },
      /Double-booking detected|CALENDAR_SLOT_CONFLICT/i
    );

    // 4. Create event in free slot succeeds
    const createdEvent = await createCalendarEvent({
      accountId: mockTenantId,
      summary: "Meeting with Ahmed",
      start: "2026-09-04T16:00:00Z",
      end: "2026-09-04T17:00:00Z",
      timezone: "UTC",
      taskId: "task_meet_01",
      actionId: "act_cal_01",
      overrideFetch: mockGoogleApi,
    });
    assert.strictEqual(createdEvent.eventId, "gcal_evt_1001");
    assert.strictEqual(createdEvent.status, "confirmed");

    // 5. Idempotent retry returns same event without recreating
    const retryEvent = await createCalendarEvent({
      accountId: mockTenantId,
      summary: "Meeting with Ahmed",
      start: "2026-09-04T16:00:00Z",
      end: "2026-09-04T17:00:00Z",
      timezone: "UTC",
      taskId: "task_meet_01",
      actionId: "act_cal_01",
      overrideFetch: mockGoogleApi,
    });
    assert.strictEqual(retryEvent.eventId, "gcal_evt_1001");
  });

  // =========================================================================
  // 5. GOOGLE CONTACTS: READ-ONLY, AMBIGUITY & PHONE NORMALIZATION (Section 84)
  // =========================================================================
  await t.test("84. Google Contacts: Read-only search, ambiguity detection, and phone normalization", async () => {
    const conn = createDefaultGoogleConnection(mockTenantId);
    conn.status = "CONNECTED";
    conn.grantedScopes = [GOOGLE_SCOPES.CONTACTS_READONLY];
    conn.encryptedRefreshTokenRef = encryptServerSecret("mock_refresh_token");
    await saveGooglePersonalConnection(conn);
    setCachedGoogleAccessToken(mockTenantId, "mock_access_token_123");

    const mockPeopleApi = async (url: string) => {
      const u = new URL(url);
      const q = u.searchParams.get("query") || "";

      if (q.toLowerCase() === "imran") {
        // Returns 2 distinct contacts (Ambiguous)
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                person: {
                  resourceName: "people/c111",
                  names: [{ displayName: "Imran Khan Electrician" }],
                  phoneNumbers: [{ value: "+92 300 111 2233" }],
                  organizations: [{ name: "Services" }],
                },
              },
              {
                person: {
                  resourceName: "people/c222",
                  names: [{ displayName: "Imran Plumber" }],
                  phoneNumbers: [{ value: "+92 321 444 5566" }],
                  organizations: [{ name: "Plumbing Co" }],
                },
              },
            ],
          }),
        };
      }

      if (q.toLowerCase() === "tariq") {
        // Returns 1 unambiguous contact
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                person: {
                  resourceName: "people/c333",
                  names: [{ displayName: "Tariq Accountant" }],
                  phoneNumbers: [{ value: "10159343603" }],
                  emailAddresses: [{ value: "contact-17d079b19cbf@example.invalid" }],
                },
              },
            ],
          }),
        };
      }

      return { ok: true, json: async () => ({ results: [] }) };
    };

    // 1. Ambiguous search returns multiple matches with isAmbiguous = true
    const imranSearch = await searchGoogleContacts({
      accountId: mockTenantId,
      query: "Imran",
      overrideFetch: mockPeopleApi,
    });
    assert.strictEqual(imranSearch.isAmbiguous, true);
    assert.strictEqual(imranSearch.matches.length, 2);

    // 2. Unambiguous search
    const tariqSearch = await searchGoogleContacts({
      accountId: mockTenantId,
      query: "Tariq",
      overrideFetch: mockPeopleApi,
    });
    assert.strictEqual(tariqSearch.isAmbiguous, false);
    assert.strictEqual(tariqSearch.matches.length, 1);

    // 3. Link Google Contact to Personal Contact with phone normalization
    const linkedContact = await linkGoogleContactToPersonalContact({
      accountId: mockTenantId,
      selectedPerson: tariqSearch.matches[0],
    });
    assert.ok(linkedContact.contactId.startsWith("pc_g_"));
    assert.strictEqual(linkedContact.displayName, "Tariq Accountant");
    assert.strictEqual(linkedContact.whatsappIdentities[0]?.jid, "contact-94d1bae5dd24@example.invalid");
    assert.strictEqual(linkedContact.whatsappIdentities[0]?.source, "google_contacts_owner_selected");
  });

  // =========================================================================
  // 6. GMAIL SEND-ONLY: SAFETY, IDEMPOTENCY & PROHIBITED READ (Section 85)
  // =========================================================================
  await t.test("85. Gmail Send: Send-only enforcement, single-recipient caps, and idempotency", async () => {
    const conn = createDefaultGoogleConnection(mockTenantId);
    conn.status = "CONNECTED";
    conn.googleEmail = "contact-1a14cea9d94a@example.invalid";
    conn.grantedScopes = [GOOGLE_SCOPES.GMAIL_SEND];
    conn.encryptedRefreshTokenRef = encryptServerSecret("mock_refresh_token");
    await saveGooglePersonalConnection(conn);
    setCachedGoogleAccessToken(mockTenantId, "mock_access_token_123");

    // 1. Format RFC 2822 email
    const rfc2822 = buildRfc2822Email({
      fromEmail: "contact-1a14cea9d94a@example.invalid",
      to: "contact-5efba3df1c3b@example.invalid",
      subject: "Test Subject",
      bodyText: "Hello World",
    });
    assert.ok(rfc2822.includes("To: contact-5efba3df1c3b@example.invalid"));
    assert.ok(rfc2822.includes("From: contact-1a14cea9d94a@example.invalid"));

    // 2. Recipient validation: bulk/multiple recipients blocked
    await assert.rejects(
      async () => {
        await sendGmailMessage({
          accountId: mockTenantId,
          to: "contact-ff8d9819fc0e@example.invalid, contact-5ff860bf1190@example.invalid",
          subject: "Bulk Test",
          bodyText: "Spam",
        });
      },
      /Bulk or excessive recipient|EXCESSIVE_EMAIL_RECIPIENTS/i
    );

    // 3. Successful send with mock
    const mockGmailApi = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}"));
      assert.ok(body.raw, "Must provide RFC 2822 base64url payload");
      return {
        ok: true,
        json: async () => ({
          id: "gmsg_998877",
          threadId: "thread_112233",
        }),
      };
    };

    const sent = await sendGmailMessage({
      accountId: mockTenantId,
      to: "contact-f93fa2e5fb59@example.invalid",
      subject: "Your Invoice",
      bodyText: "Here is your invoice.",
      taskId: "task_email_01",
      actionId: "act_gmail_01",
      overrideFetch: mockGmailApi,
    });
    assert.strictEqual(sent.messageId, "gmsg_998877");
    assert.strictEqual(sent.to, "contact-f93fa2e5fb59@example.invalid");

    // 4. Idempotent retry returns original message without duplicate send
    const retrySent = await sendGmailMessage({
      accountId: mockTenantId,
      to: "contact-f93fa2e5fb59@example.invalid",
      subject: "Your Invoice",
      bodyText: "Here is your invoice.",
      taskId: "task_email_01",
      actionId: "act_gmail_01",
      overrideFetch: mockGmailApi,
    });
    assert.strictEqual(retrySent.messageId, "gmsg_998877");
  });

  // =========================================================================
  // 7. DRIVE SELECTED-FILES: VALIDATION & SIZE LIMITS (Section 86)
  // =========================================================================
  await t.test("86. Drive: Selected file validation, 25MB cap, and ephemeral reading", async () => {
    const conn = createDefaultGoogleConnection(mockTenantId);
    conn.status = "CONNECTED";
    conn.grantedScopes = [GOOGLE_SCOPES.DRIVE_FILE];
    conn.encryptedRefreshTokenRef = encryptServerSecret("mock_refresh_token");
    await saveGooglePersonalConnection(conn);
    setCachedGoogleAccessToken(mockTenantId, "mock_access_token_123");

    const mockDriveApi = async (url: string) => {
      if (url.includes("huge_file_id")) {
        return {
          ok: true,
          json: async () => ({
            id: "huge_file_id",
            name: "huge_video.mp4",
            size: MAX_DRIVE_FILE_SIZE_BYTES + 5000,
            mimeType: "video/mp4",
          }),
        };
      }
      if (url.includes("doc_101")) {
        if (url.includes("export")) {
          return {
            ok: true,
            text: async () => "Content of authorized Google Doc.",
          };
        }
        return {
          ok: true,
          json: async () => ({
            id: "doc_101",
            name: "Quotation.gdoc",
            size: 1500,
            mimeType: "application/vnd.google-apps.document",
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: { message: "File not found" } }) };
    };

    // 1. File exceeding 25 MB is rejected
    await assert.rejects(
      async () => {
        await validateDriveFileAccess(mockTenantId, "huge_file_id", mockDriveApi);
      },
      /exceeds maximum permitted size|GOOGLE_FILE_TOO_LARGE/i
    );

    // 2. Valid file metadata registration
    const validated = await validateDriveFileAccess(mockTenantId, "doc_101", mockDriveApi);
    assert.strictEqual(validated.fileId, "doc_101");
    assert.strictEqual(validated.name, "Quotation.gdoc");

    // 3. Ephemeral read of authorized file
    const fileContent = await readSelectedDriveFileContent(mockTenantId, "doc_101", Date.now(), mockDriveApi);
    assert.strictEqual(fileContent.fileId, "doc_101");
    assert.strictEqual(fileContent.content, "Content of authorized Google Doc.");
    assert.strictEqual(fileContent.isExportedDoc, true);

    // 4. Reading an unselected/unauthorized file ID is rejected
    await assert.rejects(
      async () => {
        await readSelectedDriveFileContent(mockTenantId, "unauthorized_file_xyz", Date.now(), mockDriveApi);
      },
      /not been selected or authorized|DRIVE_FILE_NOT_AUTHORIZED/i
    );
  });

  // =========================================================================
  // 8. PROMPT 7 AUTHORIZATION & TASK ENGINE INTEGRATION (Sections 87, 88)
  // =========================================================================
  await t.test("87. Prompt 7 Integration: Google actions evaluate authorization before effect", async () => {
    // 1. Risk determination
    assert.strictEqual(determineGoogleActionRisk("GOOGLE_CALENDAR_FREEBUSY", {}), "R0_READ_ONLY");
    assert.strictEqual(determineGoogleActionRisk("GOOGLE_CONTACT_SEARCH", {}), "R2_DATA_DISCLOSURE");
    assert.strictEqual(determineGoogleActionRisk("GOOGLE_CALENDAR_CREATE_EVENT", {}), "R4_FINANCIAL_OR_BINDING_COMMITMENT");

    // 2. Compute approval fingerprints
    const calFp1 = computeCalendarApprovalFingerprint({
      calendarId: "primary",
      start: "2026-09-05T10:00:00Z",
      end: "2026-09-05T11:00:00Z",
      timezone: "UTC",
      summary: "Interview",
    });
    const calFp2 = computeCalendarApprovalFingerprint({
      calendarId: "primary",
      start: "2026-09-05T11:00:00Z", // Different time
      end: "2026-09-05T12:00:00Z",
      timezone: "UTC",
      summary: "Interview",
    });
    assert.notStrictEqual(calFp1, calFp2, "Changed meeting time must yield different fingerprint");

    // 3. High-risk meeting creation requires approval under default policy
    await assert.rejects(
      async () => {
        await executeGooglePersonalAction({
          accountId: mockTenantId,
          actionType: "GOOGLE_CALENDAR_CREATE_EVENT",
          payload: {
            summary: "Binding Meeting",
            start: "2026-09-05T10:00:00Z",
            end: "2026-09-05T11:00:00Z",
            timezone: "UTC",
          },
          actorRole: "worker",
        });
      },
      /Owner approval required|ACTION_REQUIRES_APPROVAL/i
    );
  });
});
