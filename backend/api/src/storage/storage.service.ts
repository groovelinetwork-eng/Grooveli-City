import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppService } from '../app.service';
import { env } from '../config/env';

const DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

/**
 * Private object storage (any S3-compatible service). Objects are never
 * public; clients get short-lived signed download URLs.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger('Storage');
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly app: AppService) {
    const e = env();
    this.bucket = e.S3_BUCKET;
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
  }

  async onModuleInit() {
    this.app.registerReadinessCheck('storage', async () => {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    });
    // Development convenience only; production buckets are provisioned by infrastructure.
    if (!env().isProd) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        try {
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Created bucket ${this.bucket}`);
        } catch (err) {
          this.logger.warn(`Storage not reachable: ${(err as Error).message}`);
        }
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(env().S3_SSE ? { ServerSideEncryption: 'AES256' as const } : {}),
      }),
    );
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  /** Short-lived URL that downloads the object as an attachment named `filename`. */
  async downloadUrl(key: string, filename: string): Promise<{ url: string; expiresAt: Date }> {
    const safeName = filename.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'download';
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safeName}"`,
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
    return { url, expiresAt: new Date(Date.now() + DOWNLOAD_URL_TTL_SECONDS * 1000) };
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}

// ── Upload content checks ────────────────────────────────────────────────────

export const PDF = 'application/pdf';
export const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const PNG = 'image/png';
export const JPEG = 'image/jpeg';

/** Detects the real type from file contents (never trusts the extension or the browser's claim). */
export function sniffType(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return PDF;
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return PNG;
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return JPEG;
  // DOCX is a ZIP whose entries include word/document.xml (entry names are stored uncompressed).
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50 && buf.includes('word/document.xml')) return DOCX;
  return null;
}
