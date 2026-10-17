import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  uploadMedia,
  retrieveMediaMetadata,
  downloadMedia,
} from "./whatsapp-cloud-api-media-client.ts";

test("uploadMedia sends multipart request with messaging_product and returns real media ID", async () => {
  const validJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("mock jpeg image contents"),
  ]);

  let capturedUrl = "";
  let capturedHeaders: any = null;
  let capturedBody: any = null;

  const mockFetch = async (url: any, init: any) => {
    capturedUrl = String(url);
    capturedHeaders = init?.headers;
    capturedBody = init?.body;

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "media_meta_upload_888" }),
    } as any;
  };

  const result = await uploadMedia({
    phoneNumberId: "phone_123",
    accessToken: "test_access_token_abc",
    buffer: validJpeg,
    mimeType: "image/jpeg",
    filename: "product.jpg",
    fetchImpl: mockFetch as any,
  });

  assert.equal(result.success, true);
  assert.equal(result.mediaId, "media_meta_upload_888");
  assert.match(capturedUrl, /\/phone_123\/media/);
  assert.equal(capturedHeaders.Authorization, "Bearer test_access_token_abc");
  assert.ok(capturedBody instanceof FormData);
  assert.equal(capturedBody.get("messaging_product"), "whatsapp");
  assert.equal(capturedBody.get("type"), "image/jpeg");
});

test("uploadMedia throws descriptive error on missing returned ID", async () => {
  const validJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("mock jpeg image contents"),
  ]);

  const mockFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true }), // Missing 'id'
  });

  await assert.rejects(
    async () => {
      await uploadMedia({
        phoneNumberId: "phone_123",
        accessToken: "test_token",
        buffer: validJpeg,
        mimeType: "image/jpeg",
        fetchImpl: mockFetch as any,
      });
    },
    /missing_media_id_in_response/
  );
});

test("uploadMedia classifies 429 and 500 errors as retryable", async () => {
  const validJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("mock jpeg"),
  ]);

  const mockFetch429 = async () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({ error: { message: "Rate limit reached" } }),
  });

  await assert.rejects(
    async () => {
      await uploadMedia({
        phoneNumberId: "phone_123",
        accessToken: "test_token",
        buffer: validJpeg,
        mimeType: "image/jpeg",
        fetchImpl: mockFetch429 as any,
      });
    },
    /retryable: true/
  );
});

test("retrieveMediaMetadata queries Meta endpoint and parses ephemeral URL", async () => {
  let capturedUrl = "";

  const mockFetch = async (url: any) => {
    capturedUrl = String(url);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/temp123",
          mime_type: "image/jpeg",
          sha256: "aabbccdd1122",
          file_size: 1024,
          id: "media_req_456",
        }),
    } as any;
  };

  const metadata = await retrieveMediaMetadata({
    mediaId: "media_req_456",
    phoneNumberId: "phone_777",
    accessToken: "test_token",
    fetchImpl: mockFetch as any,
  });

  assert.equal(metadata.id, "media_req_456");
  assert.equal(metadata.url, "https://lookaside.fbsbx.com/whatsapp_business/attachments/temp123");
  assert.equal(metadata.mimeType, "image/jpeg");
  assert.equal(metadata.sha256, "aabbccdd1122");
  assert.equal(metadata.fileSize, 1024);
  assert.match(capturedUrl, /\/media_req_456\?phone_number_id=phone_777/);
});

test("downloadMedia downloads binary media and validates sha256 checksum", async () => {
  const binaryPayload = Buffer.from("authoritative media content binary data");
  const expectedSha = crypto.createHash("sha256").update(binaryPayload).digest("hex");

  const mockFetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes("graph.facebook.com")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/valid_url",
            mime_type: "application/pdf",
            sha256: expectedSha,
            id: "media_doc_111",
          }),
      } as any;
    }

    // Binary download
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: async () => binaryPayload.buffer.slice(binaryPayload.byteOffset, binaryPayload.byteOffset + binaryPayload.byteLength),
    } as any;
  };

  const downloaded = await downloadMedia({
    mediaId: "media_doc_111",
    phoneNumberId: "phone_123",
    accessToken: "test_token",
    fetchImpl: mockFetch as any,
  });

  assert.equal(downloaded.buffer.toString(), "authoritative media content binary data");
  assert.equal(downloaded.mimeType, "application/pdf");
  assert.equal(downloaded.sha256, expectedSha);
});

test("downloadMedia fails closed when sha256 checksum does not match", async () => {
  const corruptPayload = Buffer.from("tampered binary data");

  const mockFetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes("graph.facebook.com")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/valid_url",
            sha256: "0000000000000000000000000000000000000000000000000000000000000000",
            id: "media_doc_corrupt",
          }),
      } as any;
    }

    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => corruptPayload.buffer.slice(corruptPayload.byteOffset, corruptPayload.byteOffset + corruptPayload.byteLength),
    } as any;
  };

  await assert.rejects(
    async () => {
      await downloadMedia({
        mediaId: "media_doc_corrupt",
        phoneNumberId: "phone_123",
        accessToken: "test_token",
        fetchImpl: mockFetch as any,
      });
    },
    /media_integrity_failed: sha256 checksum mismatch/
  );
});

test("downloadMedia retries once on 404 expired URL and succeeds on fresh URL", async () => {
  const binaryPayload = Buffer.from("media data after fresh url");
  let metadataFetchCount = 0;
  let downloadAttemptCount = 0;

  const mockFetch = async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes("graph.facebook.com")) {
      metadataFetchCount++;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            url: `https://lookaside.fbsbx.com/whatsapp_business/attachments/url_attempt_${metadataFetchCount}`,
            id: "media_expired_test",
          }),
      } as any;
    }

    downloadAttemptCount++;
    if (downloadAttemptCount === 1) {
      // First attempt returns 404 expired
      return {
        ok: false,
        status: 404,
      } as any;
    }

    // Second attempt returns 200 OK
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "image/png" }),
      arrayBuffer: async () => binaryPayload.buffer.slice(binaryPayload.byteOffset, binaryPayload.byteOffset + binaryPayload.byteLength),
    } as any;
  };

  const result = await downloadMedia({
    mediaId: "media_expired_test",
    phoneNumberId: "phone_123",
    accessToken: "test_token",
    fetchImpl: mockFetch as any,
  });

  assert.equal(metadataFetchCount, 2);
  assert.equal(downloadAttemptCount, 2);
  assert.equal(result.buffer.toString(), "media data after fresh url");
});

test("downloadMedia rejects insecure or private SSRF URLs", async () => {
  const mockFetchHttp = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        url: "http://example.com/media.jpg", // Insecure HTTP
        id: "media_insecure_test",
      }),
  });

  await assert.rejects(
    async () => {
      await downloadMedia({
        mediaId: "media_insecure_test",
        phoneNumberId: "phone_123",
        accessToken: "test_token",
        fetchImpl: mockFetchHttp as any,
      });
    },
    /must use HTTPS/
  );

  const mockFetchPrivate = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        url: "https://127.0.0.1:8080/private/secret.jpg", // Private IP
        id: "media_private_test",
      }),
  });

  await assert.rejects(
    async () => {
      await downloadMedia({
        mediaId: "media_private_test",
        phoneNumberId: "phone_123",
        accessToken: "test_token",
        fetchImpl: mockFetchPrivate as any,
      });
    },
    /cannot use localhost, private/
  );
});
