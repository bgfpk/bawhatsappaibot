import test from "node:test";
import assert from "node:assert/strict";
import {
  saveCloudMediaAsset,
  listCloudMediaAssets,
  deleteCloudMediaAsset,
} from "./cloud-media-asset-service.ts";

test("saveCloudMediaAsset creates tenant-isolated media asset", async () => {
  const asset1 = await saveCloudMediaAsset({
    userId: "user_tenant_1",
    botId: "bot_cloud_1",
    name: "Product Catalog",
    mediaKind: "document",
    mimeType: "application/pdf",
    fileSizeBytes: 1024 * 50,
    fileName: "catalog.pdf",
    caption: "Latest summer catalog",
  });

  assert.ok(asset1.id.startsWith("cma_"));
  assert.equal(asset1.userId, "user_tenant_1");
  assert.equal(asset1.botId, "bot_cloud_1");
  assert.equal(asset1.name, "Product Catalog");
  assert.equal(asset1.fileName, "catalog.pdf");

  const asset2 = await saveCloudMediaAsset({
    userId: "user_tenant_2",
    botId: "bot_cloud_2",
    name: "User 2 Image",
    mediaKind: "image",
    mimeType: "image/jpeg",
    fileSizeBytes: 2048,
    fileName: "photo.jpg",
  });

  const tenant1Assets = await listCloudMediaAssets("user_tenant_1", "bot_cloud_1");
  assert.equal(tenant1Assets.length, 1);
  assert.equal(tenant1Assets[0].id, asset1.id);

  const tenant2Assets = await listCloudMediaAssets("user_tenant_2", "bot_cloud_2");
  assert.equal(tenant2Assets.length, 1);
  assert.equal(tenant2Assets[0].id, asset2.id);

  // Cross-tenant list must return empty
  const crossAssets = await listCloudMediaAssets("user_tenant_1", "bot_cloud_2");
  assert.equal(crossAssets.length, 0);

  // Delete
  const deleted = await deleteCloudMediaAsset("user_tenant_1", "bot_cloud_1", asset1.id);
  assert.equal(deleted, true);

  const afterDelete = await listCloudMediaAssets("user_tenant_1", "bot_cloud_1");
  assert.equal(afterDelete.length, 0);
});
