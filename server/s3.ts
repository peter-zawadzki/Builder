import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Falls back to the default AWS credential provider chain (shared config /
// IAM role) when AWS_ACCESS_KEY_ID isn't set explicitly.
export const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

export const BUCKET = process.env.AWS_S3_BUCKET ?? "yullr-builder-prod";

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}

export async function getSignedGetUrl(key: string, expiresInSeconds = 86400): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: expiresInSeconds });
}

export async function getSignedPutUrl(key: string, contentType: string, expiresInSeconds = 600): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: expiresInSeconds });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  // DeleteObjects caps at 1000 keys per call.
  for (let i = 0; i < keys.length; i += 1000) {
    await s3.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.slice(i, i + 1000).map(Key => ({ Key })) } }));
  }
}

/** Decodes a `data:<mime>;base64,<...>` URL into its MIME type + raw bytes. */
export function decodeDataUrl(dataUrl: string): { mime: string; bytes: Buffer } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error("Not a base64 data URL");
  return { mime: match[1], bytes: Buffer.from(match[2], "base64") };
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  };
  return map[mime] ?? mime.split("/")[1] ?? "bin";
}
