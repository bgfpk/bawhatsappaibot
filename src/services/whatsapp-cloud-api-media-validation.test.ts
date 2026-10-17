import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCloudMediaBuffer,
  validateFileSignature,
  sanitizeMediaFilename,
  normalizeMimeType,
} from "./whatsapp-cloud-api-media-validation.ts";

test("normalizeMimeType standardizes MIME types and preserves codec info for opus", () => {
  assert.equal(normalizeMimeType("IMAGE/JPEG; charset=utf-8"), "image/jpeg");
  assert.equal(normalizeMimeType("audio/ogg; codecs=opus"), "audio/ogg; codecs=opus");
  assert.equal(normalizeMimeType("application/pdf"), "application/pdf");
  assert.equal(normalizeMimeType(""), "");
});

test("validateFileSignature validates JPEG, PNG, PDF, WebP and OGG signatures", () => {
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const validPdf = Buffer.from("%PDF-1.4 header contents");
  const validWebp = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x20, 0x00, 0x00, 0x00, // size
    0x57, 0x45, 0x42, 0x50, // WEBP
    0x00, 0x00,
  ]);
  const validOgg = Buffer.from("OggS\x00\x02\x00\x00");

  assert.equal(validateFileSignature(validJpeg, "image/jpeg"), true);
  assert.equal(validateFileSignature(validPng, "image/png"), true);
  assert.equal(validateFileSignature(validPdf, "application/pdf"), true);
  assert.equal(validateFileSignature(validWebp, "image/webp"), true);
  assert.equal(validateFileSignature(validOgg, "audio/ogg; codecs=opus"), true);

  // Mismatch
  const fakePng = Buffer.from("Hello this is plain text, not a PNG");
  assert.equal(validateFileSignature(fakePng, "image/png"), false);
  assert.equal(validateFileSignature(fakePng, "image/jpeg"), false);
  assert.equal(validateFileSignature(fakePng, "application/pdf"), false);
});

test("validateCloudMediaBuffer accepts valid JPEG image within limit", () => {
  const validJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(1000, 0),
  ]);

  const res = validateCloudMediaBuffer(validJpeg, "image/jpeg");
  assert.equal(res.valid, true);
  assert.equal(res.kind, "image");
  assert.equal(res.normalizedMime, "image/jpeg");
});

test("validateCloudMediaBuffer rejects oversize image (> 5 MB)", () => {
  const oversizeJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(6 * 1024 * 1024, 0),
  ]);

  const res = validateCloudMediaBuffer(oversizeJpeg, "image/jpeg");
  assert.equal(res.valid, false);
  assert.match(res.error || "", /media_too_large/);
});

test("validateCloudMediaBuffer rejects oversize sticker (> 100 KB)", () => {
  const oversizeWebp = Buffer.concat([
    Buffer.from("RIFF1234WEBP"),
    Buffer.alloc(150 * 1024, 0),
  ]);

  const res = validateCloudMediaBuffer(oversizeWebp, "image/webp", "sticker");
  assert.equal(res.valid, false);
  assert.match(res.error || "", /media_too_large/);
});

test("validateCloudMediaBuffer rejects signature mismatch", () => {
  const fakeImage = Buffer.from("executable binary or script text");
  const res = validateCloudMediaBuffer(fakeImage, "image/png");
  assert.equal(res.valid, false);
  assert.match(res.error || "", /media_signature_mismatch/);
});

test("validateCloudMediaBuffer rejects unsupported MIME types", () => {
  const buf = Buffer.from("some content");
  const res = validateCloudMediaBuffer(buf, "application/x-executable");
  assert.equal(res.valid, false);
  assert.match(res.error || "", /unsupported_media_type/);
});

test("validateCloudMediaBuffer rejects empty buffer", () => {
  const res = validateCloudMediaBuffer(Buffer.alloc(0), "image/jpeg");
  assert.equal(res.valid, false);
  assert.match(res.error || "", /empty_media_buffer/);
});

test("sanitizeMediaFilename prevents directory traversal and sanitizes characters", () => {
  assert.equal(sanitizeMediaFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeMediaFilename("C:\\Users\\Secret\\invoice.pdf"), "invoice.pdf");
  assert.equal(sanitizeMediaFilename("my photo (1) <test>.jpg"), "my_photo__1___test_.jpg");
  assert.equal(sanitizeMediaFilename(""), "file");
  assert.equal(sanitizeMediaFilename(".."), "file");
});
