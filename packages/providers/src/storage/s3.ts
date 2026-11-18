import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { GetObjectResult, ObjectInfo, ObjectStorage, PutObjectInput } from "../types.js";


export type S3StorageConfig = {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
  publicBaseUrl?: string;
};

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly defaultBucket: string;
  private readonly publicBaseUrl?: string;

  constructor(config: S3StorageConfig) {
    this.defaultBucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async ensureBucket(bucket = this.defaultBucket): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  }

  async putObject(input: PutObjectInput): Promise<ObjectInfo> {
    const bucket = input.bucket ?? this.defaultBucket;
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return {
      bucket,
      key: input.key,
      url: this.publicUrl(bucket, input.key),
    };
  }

  async getObject(key: string, bucket = this.defaultBucket): Promise<GetObjectResult> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Empty object body for ${key}`);
    }
    return {
      body: Buffer.from(bytes),
      contentType: response.ContentType,
    };
  }

  async getSignedUrl(key: string, expiresInSeconds = 3600, bucket = this.defaultBucket): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }


  async exists(key: string, bucket = this.defaultBucket): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.ensureBucket();
      const probeKey = `.health/${Date.now()}.txt`;
      await this.putObject({
        key: probeKey,
        body: "ok",
        contentType: "text/plain",
      });
      return { ok: true, message: `bucket ${this.defaultBucket} reachable` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "storage health check failed",
      };
    }
  }

  private publicUrl(bucket: string, key: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, "")}/${bucket}/${key}`;
    }
    return `s3://${bucket}/${key}`;
  }
}

export function createS3StorageFromEnv(): S3ObjectStorage {
  return new S3ObjectStorage({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    bucket: process.env.S3_BUCKET ?? "studio-assets",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  });
}
