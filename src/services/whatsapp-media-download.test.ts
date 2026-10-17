import test from "node:test";
import assert from "node:assert/strict";
import { downloadWhatsAppMediaBuffer } from "./whatsapp-media-download.ts";

test("downloadWhatsAppMediaBuffer downloads Cloud media using Cloud media client", async () => {
  let calledMediaId = "";
  let calledPhoneId = "";
  let calledToken = "";

  const mockDownloadMedia = async (opts: any) => {
    calledMediaId = opts.mediaId;
    calledPhoneId = opts.phoneNumberId;
    calledToken = opts.accessToken;
    return {
      buffer: Buffer.from("mock_cloud_binary_image_data"),
      mimeType: "image/jpeg",
    };
  };

  const cloudMediaObj = {
    cloudMedia: {
      mediaId: "meta_media_777",
      phoneNumberId: "phone_888",
      accessToken: "token_999",
    },
  };

  const buffer = await downloadWhatsAppMediaBuffer(
    cloudMediaObj,
    "image",
    undefined,
    {
      mediaId: "meta_media_777",
      phoneNumberId: "phone_888",
      accessToken: "token_999",
      downloadMediaImpl: mockDownloadMedia as any,
    }
  );

  assert.equal(buffer.toString(), "mock_cloud_binary_image_data");
  assert.equal(calledMediaId, "meta_media_777");
  assert.equal(calledPhoneId, "phone_888");
  assert.equal(calledToken, "token_999");
});

test("downloadWhatsAppMediaBuffer rejects Baileys download when dispatcher is missing", async () => {
  const baileysMediaObj = {
    url: "https://mmg.whatsapp.net/...",
    mimetype: "image/jpeg",
  };

  await assert.rejects(
    async () => {
      await downloadWhatsAppMediaBuffer(baileysMediaObj, "image", undefined);
    },
    /proxy dispatcher is missing/
  );
});
