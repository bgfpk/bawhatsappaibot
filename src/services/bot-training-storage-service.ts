import crypto from "crypto";

export const TRAINING_CHUNK_SIZE = 50000; // 50,000 chars per raw chunk (generous safety margin under 100k Appwrite limit)
export const MAX_TRAINING_PAYLOAD_BYTES = 2 * 1024 * 1024; // 2MB technical API ceiling
export const DEFAULT_SYSTEM_CONFIGS_COLLECTION = process.env.APPWRITE_SYSTEM_CONFIGS_COLLECTION || "system_configs";

export interface CustomFieldTraining {
  id?: string;
  name?: string;
  key?: string;
  instructions?: string;
}

export interface BotTrainingPayload {
  prompt: string;
  learned_instructions: string;
  customFields?: CustomFieldTraining[];
  version: number;
}

export interface BotTrainingRef {
  generation: number;
  chunkCount: number;
  checksum: string;
  totalLength: number;
  updatedAt: number;
}

export interface BotTrainingManifest {
  botId: string;
  generation: number;
  chunkCount: number;
  totalLength: number;
  checksum: string;
  updatedAt: number;
}

export function getBotHash(botId: string): string {
  const cleanId = String(botId || "").trim();
  return crypto.createHash("sha256").update(cleanId).digest("hex").slice(0, 16);
}

export function getJidHash(jid: string): string {
  const cleanJid = String(jid || "").trim().toLowerCase();
  return crypto.createHash("sha256").update(cleanJid).digest("hex").slice(0, 16);
}

export function getManifestDocId(hash: string, generation?: number, prefix = "btm"): string {
  if (typeof generation === "number") {
    return `${prefix}_${hash}_g${generation}`;
  }
  return `${prefix}_${hash}`;
}

export function getChunkDocId(hash: string, generation: number, chunkIndex: number, prefix = "btc"): string {
  return `${prefix}_${hash}_g${generation}_${chunkIndex}`;
}

export function computeTrainingChecksum(trainingPayload: BotTrainingPayload): string {
  const serialized = JSON.stringify(trainingPayload);
  return crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
}

export function extractBotTraining(config: any): {
  trainingPayload: BotTrainingPayload;
  operationalConfig: any;
  trainingInputProvided: boolean;
  hasTrainingContent: boolean;
  checksum: string;
} {
  const operationalConfig = { ...(config || {}) };

  // Never trust client-supplied trainingRef
  delete operationalConfig.trainingRef;

  const hasPromptKey = Object.prototype.hasOwnProperty.call(operationalConfig, "prompt") ||
    Object.prototype.hasOwnProperty.call(operationalConfig, "prompt_raw");
  const hasLearnedKey = Object.prototype.hasOwnProperty.call(operationalConfig, "learned_instructions") ||
    Object.prototype.hasOwnProperty.call(operationalConfig, "learned_instructions_raw");

  const prompt = typeof operationalConfig.prompt === "string"
    ? operationalConfig.prompt
    : (typeof operationalConfig.prompt_raw === "string" ? operationalConfig.prompt_raw : "");
  const learned_instructions = typeof operationalConfig.learned_instructions === "string"
    ? operationalConfig.learned_instructions
    : (typeof operationalConfig.learned_instructions_raw === "string" ? operationalConfig.learned_instructions_raw : "");

  // Strip large training text from operational config
  delete operationalConfig.prompt;
  delete operationalConfig.prompt_raw;
  delete operationalConfig.learned_instructions;
  delete operationalConfig.learned_instructions_raw;

  let customFieldTrainings: CustomFieldTraining[] | undefined = undefined;
  let customFieldsHadInstructions = false;

  if (Array.isArray(operationalConfig.customFields)) {
    customFieldTrainings = [];
    const strippedFields: any[] = [];
    for (const field of operationalConfig.customFields) {
      if (field && typeof field === "object") {
        const fieldCopy = { ...field };
        const instructions = typeof fieldCopy.instructions === "string" ? fieldCopy.instructions : "";
        if (Object.prototype.hasOwnProperty.call(field, "instructions")) {
          customFieldsHadInstructions = true;
        }
        delete fieldCopy.instructions;
        strippedFields.push(fieldCopy);

        if (instructions.trim()) {
          customFieldTrainings.push({
            id: field.id || field._id || field.key,
            name: field.name,
            key: field.key,
            instructions,
          });
        }
      } else {
        strippedFields.push(field);
      }
    }
    operationalConfig.customFields = strippedFields;
    if (customFieldTrainings.length === 0) {
      customFieldTrainings = undefined;
    }
  }

  const trainingInputProvided = hasPromptKey || hasLearnedKey || customFieldsHadInstructions;
  const hasTrainingContent = Boolean(
    prompt.trim() ||
    learned_instructions.trim() ||
    (customFieldTrainings && customFieldTrainings.length > 0)
  );

  const trainingPayload: BotTrainingPayload = {
    prompt,
    learned_instructions,
    customFields: customFieldTrainings,
    version: 1,
  };

  const checksum = computeTrainingChecksum(trainingPayload);

  return {
    trainingPayload,
    operationalConfig,
    trainingInputProvided,
    hasTrainingContent,
    checksum,
  };
}

export function mergeTrainingIntoConfig(operationalConfig: any, trainingPayload: BotTrainingPayload | null): any {
  const result = { ...(operationalConfig || {}) };
  if (!trainingPayload) return result;

  if (typeof trainingPayload.prompt === "string") {
    result.prompt = trainingPayload.prompt;
  }
  if (typeof trainingPayload.learned_instructions === "string") {
    result.learned_instructions = trainingPayload.learned_instructions;
  }

  // Rehydrate custom fields instructions
  if (Array.isArray(trainingPayload.customFields) && trainingPayload.customFields.length > 0) {
    const trainingMap = new Map<string, string>();
    for (const tf of trainingPayload.customFields) {
      const idKey = tf.id || tf.key || tf.name;
      if (idKey && tf.instructions) {
        trainingMap.set(String(idKey), tf.instructions);
      }
    }

    if (Array.isArray(result.customFields)) {
      result.customFields = result.customFields.map((field: any, idx: number) => {
        if (!field || typeof field !== "object") return field;
        const idKey = field.id || field._id || field.key || field.name || String(idx);
        const instructions = trainingMap.get(String(idKey)) || trainingPayload.customFields?.[idx]?.instructions || "";
        return instructions ? { ...field, instructions } : field;
      });
    } else {
      result.customFields = trainingPayload.customFields;
    }
  }

  return result;
}

async function upsertSystemConfigDoc(
  databasesClient: any,
  databaseId: string,
  docId: string,
  data: any,
  collectionId: string = DEFAULT_SYSTEM_CONFIGS_COLLECTION
): Promise<void> {
  try {
    await databasesClient.updateDocument(databaseId, collectionId, docId, data);
  } catch (e: any) {
    if (e.code === 404 || String(e.message || "").toLowerCase().includes("not found")) {
      await databasesClient.createDocument(databaseId, collectionId, docId, data);
    } else {
      throw e;
    }
  }
}

let globalGenerationSeq = 0;

export function generateNextGeneration(oldGeneration?: number): number {
  const ts = Math.floor(Date.now() / 1000) % 1000000;
  globalGenerationSeq = (globalGenerationSeq + 1) % 1000;
  let nextGen = ts * 1000 + globalGenerationSeq;
  if (typeof oldGeneration === "number" && nextGen <= oldGeneration) {
    nextGen = oldGeneration + 1;
  }
  return nextGen;
}

export async function saveBotTrainingPayload(
  databaseId: string,
  botId: string,
  trainingPayload: BotTrainingPayload,
  databasesClient: any,
  activeGeneration?: number,
  collectionId: string = DEFAULT_SYSTEM_CONFIGS_COLLECTION,
  chunkPrefix = "btc",
  manifestPrefix = "btm"
): Promise<BotTrainingRef> {
  const serialized = JSON.stringify(trainingPayload);
  const payloadBytes = Buffer.byteLength(serialized, "utf8");
  if (payloadBytes > MAX_TRAINING_PAYLOAD_BYTES) {
    throw new Error(`Training payload size (${payloadBytes} bytes) exceeds maximum technical limit of ${MAX_TRAINING_PAYLOAD_BYTES} bytes (2MB).`);
  }

  const checksum = crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
  const targetHash = chunkPrefix === "jdc" ? getJidHash(botId) : getBotHash(botId);
  const nowTs = Math.floor(Date.now() / 1000);
  const generation = generateNextGeneration(activeGeneration);

  // Split payload into raw slices
  const chunks: string[] = [];
  for (let i = 0; i < serialized.length; i += TRAINING_CHUNK_SIZE) {
    chunks.push(serialized.slice(i, i + TRAINING_CHUNK_SIZE));
  }
  const chunkCount = chunks.length;

  // 1. Write all immutable chunk documents (storing raw chunk text directly in value)
  for (let i = 0; i < chunkCount; i++) {
    const chunkDocId = getChunkDocId(targetHash, generation, i, chunkPrefix);
    await upsertSystemConfigDoc(databasesClient, databaseId, chunkDocId, {
      value: chunks[i],
      updated_at: nowTs,
    }, collectionId);
  }

  // 2. Write generation manifest document
  const manifestData: BotTrainingManifest = {
    botId,
    generation,
    chunkCount,
    totalLength: serialized.length,
    checksum,
    updatedAt: nowTs,
  };

  const genManifestDocId = getManifestDocId(targetHash, generation, manifestPrefix);
  await upsertSystemConfigDoc(databasesClient, databaseId, genManifestDocId, {
    value: JSON.stringify(manifestData),
    updated_at: nowTs,
  }, collectionId);

  const trainingRef: BotTrainingRef = {
    generation,
    chunkCount,
    checksum,
    totalLength: serialized.length,
    updatedAt: nowTs,
  };

  // 3. Mandatory readback verification before returning authoritative trainingRef
  const readback = await loadBotTrainingPayload(
    databaseId,
    botId,
    databasesClient,
    trainingRef,
    collectionId,
    chunkPrefix
  );

  if (!readback) {
    throw new Error(`[TrainingStorage] Readback verification failed for newly written generation g${generation} of ${botId}.`);
  }

  const readbackChecksum = computeTrainingChecksum(readback);
  if (readbackChecksum !== checksum) {
    throw new Error(`[TrainingStorage] Integrity checksum mismatch on readback for ${botId}. Expected ${checksum}, got ${readbackChecksum}.`);
  }

  return trainingRef;
}

export async function loadBotTrainingPayload(
  databaseId: string,
  botId: string,
  databasesClient: any,
  trainingRef?: BotTrainingRef | null,
  collectionId: string = DEFAULT_SYSTEM_CONFIGS_COLLECTION,
  chunkPrefix = "btc"
): Promise<BotTrainingPayload | null> {
  const targetHash = chunkPrefix === "jdc" ? getJidHash(botId) : getBotHash(botId);

  // If trainingRef is supplied, load that exact authoritative generation
  const generation = trainingRef?.generation;
  if (!generation || typeof trainingRef?.chunkCount !== "number" || trainingRef.chunkCount <= 0) {
    return null;
  }

  const chunkCount = trainingRef.chunkCount;
  const chunkParts: string[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const chunkDocId = getChunkDocId(targetHash, generation, i, chunkPrefix);
    try {
      const chunkDoc = await databasesClient.getDocument(databaseId, collectionId, chunkDocId);
      if (!chunkDoc || typeof chunkDoc.value !== "string") {
        console.warn(`[TrainingStorage] Missing chunk ${i} (doc: ${chunkDocId}) for ${botId} generation g${generation}`);
        return null;
      }
      chunkParts.push(chunkDoc.value);
    } catch (e: any) {
      console.warn(`[TrainingStorage] Error fetching chunk ${i} for ${botId}:`, e?.message || e);
      return null;
    }
  }

  const assembledJson = chunkParts.join("");

  // Verify integrity checksum against the authoritative pointer
  const reconstructedChecksum = crypto.createHash("sha256").update(assembledJson, "utf8").digest("hex");
  if (trainingRef.checksum && reconstructedChecksum !== trainingRef.checksum) {
    console.warn(`[TrainingStorage] Integrity checksum mismatch for ${botId}. Expected ${trainingRef.checksum}, got ${reconstructedChecksum}`);
    return null;
  }

  try {
    return JSON.parse(assembledJson) as BotTrainingPayload;
  } catch (e: any) {
    console.warn(`[TrainingStorage] Failed to parse assembled JSON for ${botId}:`, e?.message || e);
    return null;
  }
}

export async function cleanupOldGenerationChunks(
  databasesClient: any,
  databaseId: string,
  botId: string,
  oldGeneration: number,
  oldChunkCount: number,
  collectionId: string = DEFAULT_SYSTEM_CONFIGS_COLLECTION,
  chunkPrefix = "btc",
  manifestPrefix = "btm"
): Promise<void> {
  if (!oldGeneration || oldGeneration <= 0) return;
  const targetHash = chunkPrefix === "jdc" ? getJidHash(botId) : getBotHash(botId);
  const count = Math.max(1, Math.min(oldChunkCount || 10, 100));

  for (let i = 0; i < count; i++) {
    const chunkDocId = getChunkDocId(targetHash, oldGeneration, i, chunkPrefix);
    try {
      if (typeof databasesClient.deleteDocument === "function") {
        await databasesClient.deleteDocument(databaseId, collectionId, chunkDocId);
      }
    } catch {
      // Ignored for deleted or non-existent chunks
    }
  }

  // Also delete the old generation manifest
  const oldGenManifestDocId = getManifestDocId(targetHash, oldGeneration, manifestPrefix);
  try {
    if (typeof databasesClient.deleteDocument === "function") {
      await databasesClient.deleteDocument(databaseId, collectionId, oldGenManifestDocId);
    }
  } catch {
    // Ignored
  }
}

// Dedicated helpers for JID-scoped permanent backup storage
export async function saveJidTrainingPayload(
  databaseId: string,
  jid: string,
  trainingPayload: BotTrainingPayload,
  databasesClient: any,
  activeGeneration?: number,
  collectionId: string = DEFAULT_SYSTEM_CONFIGS_COLLECTION
): Promise<BotTrainingRef> {
  return saveBotTrainingPayload(
    databaseId,
    jid,
    trainingPayload,
    databasesClient,
    activeGeneration,
    collectionId,
    "jdc",
    "jdm"
  );
}

export async function loadJidTrainingPayload(
  databaseId: string,
  jid: string,
  databasesClient: any,
  trainingRef?: BotTrainingRef | null,
  collectionId: string = DEFAULT_SYSTEM_CONFIGS_COLLECTION
): Promise<BotTrainingPayload | null> {
  return loadBotTrainingPayload(
    databaseId,
    jid,
    databasesClient,
    trainingRef,
    collectionId,
    "jdc"
  );
}

export async function cleanupOldJidGenerationChunks(
  databasesClient: any,
  databaseId: string,
  jid: string,
  oldGeneration: number,
  oldChunkCount: number,
  collectionId: string = DEFAULT_SYSTEM_CONFIGS_COLLECTION
): Promise<void> {
  return cleanupOldGenerationChunks(
    databasesClient,
    databaseId,
    jid,
    oldGeneration,
    oldChunkCount,
    collectionId,
    "jdc",
    "jdm"
  );
}
