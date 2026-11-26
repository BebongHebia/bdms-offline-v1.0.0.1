import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const PHOTOS_DIR = path.resolve(DATA_DIR, 'uploads', 'residents');
export const OFFICIAL_PHOTOS_DIR = path.resolve(DATA_DIR, 'uploads', 'officials');

if (
  !PHOTOS_DIR.startsWith(DATA_DIR + path.sep) ||
  !OFFICIAL_PHOTOS_DIR.startsWith(DATA_DIR + path.sep)
) {
  throw new Error('Invalid photos directory path confinement');
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

function savePhotoToDir(
  dir: string,
  urlPrefix: string,
  code: string,
  dataUrl: string,
): string {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('Invalid image format. Only JPEG, PNG, or WebP images are allowed.');
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) {
    throw new Error('Photo must be under 2 MB.');
  }

  // Basic magic byte verification
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isJpeg && !isPng && !isWebp) {
    throw new Error('Uploaded file content is not a valid JPEG, PNG, or WebP image.');
  }

  ensureDir(dir);
  const safeCode = code.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${safeCode}_${Date.now()}.${ext}`;
  const targetPath = path.resolve(dir, filename);

  if (!targetPath.startsWith(dir + path.sep)) {
    throw new Error('Invalid photo target path');
  }

  fs.writeFileSync(targetPath, buffer);
  return `${urlPrefix}${filename}`;
}

function resolvePhotoInDir(dir: string, filename: string): string | null {
  if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(filename)) {
    return null;
  }
  const targetPath = path.resolve(dir, filename);
  if (!targetPath.startsWith(dir + path.sep)) {
    return null;
  }
  if (!fs.existsSync(targetPath)) {
    return null;
  }
  return targetPath;
}

function deletePhotoInDir(dir: string, urlPrefix: string, photoUrl?: string): void {
  if (!photoUrl || !photoUrl.startsWith(urlPrefix)) return;
  const filename = photoUrl.slice(urlPrefix.length);
  const safePath = resolvePhotoInDir(dir, filename);
  if (safePath) {
    try {
      fs.unlinkSync(safePath);
    } catch {
      // Ignore missing/unlinked file
    }
  }
}

export function saveResidentPhotoFromDataUrl(residentCode: string, dataUrl: string): string {
  return savePhotoToDir(PHOTOS_DIR, '/api/residents/photos/', residentCode, dataUrl);
}

export function resolveSafePhotoPath(filename: string): string | null {
  return resolvePhotoInDir(PHOTOS_DIR, filename);
}

export function deleteResidentPhotoByUrl(photoUrl?: string): void {
  deletePhotoInDir(PHOTOS_DIR, '/api/residents/photos/', photoUrl);
}

export function saveOfficialPhotoFromDataUrl(officialCode: string, dataUrl: string): string {
  return savePhotoToDir(OFFICIAL_PHOTOS_DIR, '/api/staff/photos/', officialCode, dataUrl);
}

export function resolveSafeOfficialPhotoPath(filename: string): string | null {
  return resolvePhotoInDir(OFFICIAL_PHOTOS_DIR, filename);
}

export function deleteOfficialPhotoByUrl(photoUrl?: string): void {
  deletePhotoInDir(OFFICIAL_PHOTOS_DIR, '/api/staff/photos/', photoUrl);
}
