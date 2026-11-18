import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GetObjectResult, ObjectInfo, ObjectStorage, PutObjectInput } from "../types.js";

const repoStorageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../.data/storage",
);

export class LocalFsObjectStorage implements ObjectStorage {
  private readonly root: string;
  private readonly bucket: string;

  constructor(
    root = process.env.STORAGE_FS_ROOT ?? repoStorageRoot,
    bucket = process.env.S3_BUCKET ?? "studio-assets",
  ) {
    this.root = path.isAbsolute(root) ? root : path.resolve(process.cwd(), root);
    this.bucket = bucket;
  }


  private bucketPath(bucket = this.bucket): string {
    return path.join(this.root, bucket);
  }

  async ensureBucket(bucket = this.bucket): Promise<void> {
    await fs.mkdir(this.bucketPath(bucket), { recursive: true });
  }

  async putObject(input: PutObjectInput): Promise<ObjectInfo> {
    const bucket = input.bucket ?? this.bucket;
    await this.ensureBucket(bucket);
    const fullPath = path.join(this.bucketPath(bucket), input.key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, input.body);
    return {
      bucket,
      key: input.key,
      url: `file://${fullPath}`,
    };
  }

  async getObject(key: string, bucket = this.bucket): Promise<GetObjectResult> {
    const body = await fs.readFile(path.join(this.bucketPath(bucket), key));
    return { body };
  }

  async getSignedUrl(key: string, _expiresInSeconds = 3600, bucket = this.bucket): Promise<string> {
    return `file://${path.join(this.bucketPath(bucket), key)}`;
  }


  async exists(key: string, bucket = this.bucket): Promise<boolean> {
    try {
      await fs.access(path.join(this.bucketPath(bucket), key));
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.ensureBucket();
      const probe = `.health/${Date.now()}.txt`;
      await this.putObject({ key: probe, body: "ok", contentType: "text/plain" });
      return { ok: true, message: `local fs storage ready at ${this.bucketPath()}` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "fs storage failed",
      };
    }
  }
}
