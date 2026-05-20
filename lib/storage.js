/**
 * Vedafácil — Cloudflare R2 Storage Module
 * Compatible with AWS S3 SDK (R2 is S3-compatible)
 *
 * Usage:
 *   import { uploadPhoto, getPhotoUrl, deletePhoto } from './lib/storage.js'
 *
 *   // Upload (buffer or base64 string)
 *   const key = await uploadPhoto(base64orBuffer, { folder: 'medicoes' })
 *
 *   // Get presigned URL (1h expiry by default)
 *   const url = await getPhotoUrl(key)
 *
 *   // Delete
 *   await deletePhoto(key)
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { v4 as uuidv4 } from 'uuid'

// ── Client singleton ──────────────────────────────────────────────────────────
let _client = null
function getClient () {
  if (_client) return _client
  const endpoint = (process.env.R2_ENDPOINT || '').trim()
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || '').trim()
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || '').trim()

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 não configurado: faltam R2_ENDPOINT, R2_ACCESS_KEY_ID ou R2_SECRET_ACCESS_KEY')
  }

  _client = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey }
  })
  return _client
}

const getBucket = () => (process.env.R2_BUCKET_NAME || 'vedafacil').trim()

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts base64 string (with or without data URI prefix) to Buffer.
 * If already a Buffer, returns as-is.
 */
function toBuffer (input) {
  if (Buffer.isBuffer(input)) return input
  if (typeof input === 'string') {
    const b64 = input.includes(',') ? input.split(',')[1] : input
    return Buffer.from(b64, 'base64')
  }
  throw new Error('uploadPhoto: input deve ser string base64 ou Buffer')
}

/** Detect MIME type from base64 string or Buffer. */
function detectMime (input) {
  if (typeof input === 'string' && input.startsWith('data:')) {
    const m = input.match(/^data:([^;]+);/)
    if (m) return m[1]
  }
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(
    (typeof input === 'string' && input.includes(',') ? input.split(',')[1] : input) || '', 'base64'
  )
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg'
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png'
  if (buf[0] === 0x47 && buf[1] === 0x49) return 'image/gif'
  return 'image/jpeg' // default
}

function mimeToExt (mime) {
  const map = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
    'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov'
  }
  return map[mime] || 'jpg'
}

/** Check if a string looks like an R2 key (not base64) */
export function isR2Key (str) {
  if (typeof str !== 'string') return false
  if (str.startsWith('data:')) return false
  // R2 keys are short paths like "medicoes/abc123.jpg" or "os/xxx/pontos/0/abc.jpg"
  // Base64 strings are very long
  if (str.length > 500) return false
  return str.includes('/') || str.includes('.')
}

/** Check if R2 is configured (env vars present). */
export function isR2Configured () {
  return !!(
    (process.env.R2_ENDPOINT || '').trim() &&
    (process.env.R2_ACCESS_KEY_ID || '').trim() &&
    (process.env.R2_SECRET_ACCESS_KEY || '').trim()
  )
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload a photo to R2.
 *
 * @param {string|Buffer} data  Base64 string (with or without data URI) or Buffer
 * @param {object} opts
 *   @param {string} opts.folder   Folder prefix, e.g. 'medicoes' or 'os/abc123/pontos/0'
 *   @param {string} [opts.ext]    File extension override (auto-detected if omitted)
 * @returns {Promise<string>}  The R2 object key (store this in MongoDB instead of base64)
 */
export async function uploadPhoto (data, { folder = 'uploads', ext } = {}) {
  const buf = toBuffer(data)
  const mime = detectMime(data)
  const extension = ext || mimeToExt(mime)
  const fileId = `${Date.now()}-${uuidv4().slice(0, 8)}`
  const key = `${folder}/${fileId}.${extension}`

  await getClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: buf,
    ContentType: mime
  }))

  return key
}

/**
 * Upload multiple photos at once (parallel).
 * @param {string[]} base64Array  Array of base64 strings
 * @param {object}   opts         Same as uploadPhoto opts
 * @returns {Promise<string[]>}   Array of R2 keys
 */
export async function uploadPhotos (base64Array, opts = {}) {
  if (!Array.isArray(base64Array) || base64Array.length === 0) return []
  return Promise.all(base64Array.map(data => uploadPhoto(data, opts)))
}

/**
 * Get a presigned URL to serve a photo (default: 1 hour expiry).
 *
 * @param {string} key       R2 object key returned by uploadPhoto
 * @param {number} [expiresIn]  Seconds (default: 3600)
 * @returns {Promise<string|null>}  HTTPS URL or null if no key
 */
export async function getPhotoUrl (key, expiresIn = 3600) {
  if (!key) return null
  const command = new GetObjectCommand({ Bucket: getBucket(), Key: key })
  return getSignedUrl(getClient(), command, { expiresIn })
}

/**
 * Resolve multiple keys to presigned URLs.
 * @param {string[]} keys
 * @param {number}   [expiresIn]
 * @returns {Promise<string[]>}
 */
export async function getPhotoUrls (keys, expiresIn = 3600) {
  if (!Array.isArray(keys)) return []
  return Promise.all(keys.map(k => getPhotoUrl(k, expiresIn)))
}

/**
 * Fetch photo from R2 and return as base64 data URI (for PDF inline embedding).
 * @param {string} key
 * @returns {Promise<string|null>}  data:image/jpeg;base64,...
 */
export async function getPhotoAsBase64 (key) {
  if (!key) return null
  try {
    const command = new GetObjectCommand({ Bucket: getBucket(), Key: key })
    const response = await getClient().send(command)
    const chunks = []
    for await (const chunk of response.Body) {
      chunks.push(chunk)
    }
    const buf = Buffer.concat(chunks)
    const mime = response.ContentType || 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch (err) {
    console.error(`[R2] Erro ao buscar ${key}:`, err.message)
    return null
  }
}

/**
 * Resolve a foto entry to a base64 data URI (for PDF generation with Puppeteer).
 * Handles both old base64 strings and new R2 keys.
 * @param {string} foto  Either a base64 string or an R2 key
 * @returns {Promise<string|null>}
 */
export async function resolvePhotoForPdf (foto) {
  if (!foto) return null
  if (typeof foto !== 'string') return null
  // Already base64 data URI
  if (foto.startsWith('data:')) return foto
  // R2 key
  if (isR2Key(foto)) return getPhotoAsBase64(foto)
  // Raw base64 without prefix
  return `data:image/jpeg;base64,${foto}`
}

/**
 * Resolve array of fotos to base64 data URIs for PDF.
 * @param {string[]} fotos
 * @returns {Promise<string[]>}
 */
export async function resolvePhotosForPdf (fotos) {
  if (!Array.isArray(fotos)) return []
  const resolved = await Promise.all(fotos.map(resolvePhotoForPdf))
  return resolved.filter(Boolean)
}

/**
 * Delete a photo from R2.
 * @param {string} key  R2 object key
 */
export async function deletePhoto (key) {
  if (!key) return
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }))
}

/**
 * Process locais array: upload all base64 fotos to R2, replace with keys.
 * Safe to call even if locais don't have fotos.
 * Falls back gracefully if R2 is not configured.
 *
 * @param {Array} locais  Array of location objects with optional fotos[] array
 * @param {string} folder R2 folder prefix
 * @returns {Promise<Array>}  locais with base64 replaced by R2 keys
 */
export async function processLocaisPhotos (locais, folder = 'medicoes') {
  if (!Array.isArray(locais)) return locais
  if (!isR2Configured()) return locais // fallback: keep base64 if R2 not configured

  return Promise.all(locais.map(async (local, i) => {
    if (!local.fotos || local.fotos.length === 0) return local
    const newFotos = await Promise.all(local.fotos.map(async (f) => {
      if (!f) return f
      // Already an R2 key — don't re-upload
      if (isR2Key(f)) return f
      try {
        return await uploadPhoto(f, { folder: `${folder}/${i}` })
      } catch (err) {
        console.error(`[R2] Falha ao fazer upload da foto (local ${i}):`, err.message)
        return f // keep base64 on failure
      }
    }))
    return { ...local, fotos: newFotos }
  }))
}
