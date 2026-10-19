import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

// Backblaze B2 speaks the S3 API, so the AWS SDK works unmodified against
// it — just point it at B2's endpoint instead of AWS's, and force
// path-style URLs (B2, like most non-AWS S3-compatible providers,
// doesn't support virtual-hosted-style bucket addressing).
export const s3 = new S3Client({
  endpoint: `https://${requireEnv('S3_ENDPOINT')}`,
  region: requireEnv('S3_REGION'),
  forcePathStyle: true,
  credentials: {
    accessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
  },
})

const BUCKET = () => requireEnv('S3_BUCKET_NAME')
const DEFAULT_EXPIRES_IN = 5 * 60 // 5 minutes

// downloadName: the file name the browser saves it as (storage keys are not readable names). Optional.
export function getDownloadUrl(key: string, expiresIn = DEFAULT_EXPIRES_IN, downloadName?: string): Promise<string> {
  const ascii = downloadName?.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  const command = new GetObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ...(downloadName && {
      ResponseContentDisposition: `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
    }),
  })
  return getSignedUrl(s3, command, { expiresIn })
}

export function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn = DEFAULT_EXPIRES_IN,
): Promise<string> {
  const command = new PutObjectCommand({ Bucket: BUCKET(), Key: key, ContentType: contentType })
  return getSignedUrl(s3, command, { expiresIn })
}

export function deleteObject(key: string) {
  return s3.send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }))
}

export function putObject(key: string, body: string | Buffer, contentType: string) {
  return s3.send(
    new PutObjectCommand({ Bucket: BUCKET(), Key: key, Body: body, ContentType: contentType }),
  )
}
