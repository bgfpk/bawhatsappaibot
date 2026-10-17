import dotenv from "dotenv";
dotenv.config();
import { ensureCampaignAndContactsSchema } from "../src/services/campaign-contact-schema-provisioning.ts";
import { ensureWorkspaceSchema } from "../src/services/workspace-schema-provisioning.ts";
import { ensureAppwriteStorageBuckets } from "../src/services/appwrite-storage-service.ts";

export async function ensureAllAppwriteSchemas() {
  console.log("==> Ensuring Appwrite schemas & storage buckets idempotently for Phase 2 & Phase 3...");

  // 1. Campaign & Contacts collections
  const campaignRes = await ensureCampaignAndContactsSchema();
  console.log(`[Schema:Campaigns/Contacts] created=${campaignRes.created.length}, existing=${campaignRes.existing.length}, errors=${campaignRes.errors.length}`);
  if (campaignRes.errors.length > 0) {
    console.warn("  Campaigns/Contacts warnings:", campaignRes.errors);
  }

  // 2. Workspace collections
  const workspaceRes = await ensureWorkspaceSchema();
  console.log(`[Schema:Workspaces] created=${workspaceRes.created.length}, existing=${workspaceRes.existing.length}, errors=${workspaceRes.errors.length}`);
  if (workspaceRes.errors.length > 0) {
    console.warn("  Workspace warnings:", workspaceRes.errors);
  }

  // 3. Private Appwrite Storage Buckets (Contact CSV & Workspace Files)
  const storageRes = await ensureAppwriteStorageBuckets();
  console.log(`[Storage:Buckets] created=${storageRes.created.length}, existing=${storageRes.existing.length}, errors=${storageRes.errors.length}`);
  if (storageRes.errors.length > 0) {
    console.error("  Storage bucket provisioning failed:", storageRes.errors);
    throw new Error(`Storage bucket provisioning failed: ${storageRes.errors.join("; ")}`);
  }

  console.log("==> Appwrite schema and storage bucket verification complete.");
  return { campaignRes, workspaceRes, storageRes };
}

// Run directly if called as a script
if (process.argv[1] && process.argv[1].includes("ensure-appwrite-schemas")) {
  ensureAllAppwriteSchemas()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("FATAL: Appwrite schema or storage bucket initialization failed:", err?.message || err);
      process.exit(1);
    });
}
