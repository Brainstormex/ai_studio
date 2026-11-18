export * from "./types.js";
export * from "./stubs.js";
export * from "./resolve.js";
export * from "./storage/s3.js";
export * from "./storage/fs.js";
export * from "./llm/gemini.js";
export * from "./llm/mock.js";
export * from "./llm/factory.js";
export * from "./image/gemini.js";
export * from "./image/mock.js";
export * from "./image/factory.js";
export * from "./video/omni.js";
export * from "./video/mock.js";
export * from "./video/factory.js";
export * from "./audio/cloud-tts.js";
export * from "./audio/mock.js";
export * from "./audio/factory.js";

import type { ObjectStorage } from "./types.js";
import { LocalFsObjectStorage } from "./storage/fs.js";
import { createS3StorageFromEnv } from "./storage/s3.js";

export function createStorageFromEnv(): ObjectStorage {
  if (process.env.STORAGE_DRIVER === "fs") {
    return new LocalFsObjectStorage(
      process.env.STORAGE_FS_ROOT,
      process.env.S3_BUCKET ?? "studio-assets",
    );
  }
  return createS3StorageFromEnv();
}

