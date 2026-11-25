import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
export const PHOTOS_DIR = path.resolve(DATA_DIR, 'uploads', 'residents');

if (!PHOTOS_DIR.startsWith(DATA_DIR + path.sep)) {
  throw new Error('Invalid resident photos directory path confinement');
}

function ensurePhotosDir(): void {
  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, {recursive: true});
  }
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

export function saveResidentPhotoFromDataUrl(
  residentCode: string,
  dataUrl: string,
): string {
  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('Invalid image format. Only JPEG, PNG, or WebP images are allowed.');
  }

  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) {
    throw new Error('Resident photo must be under 2 MB.');
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

  ensurePhotosDir();
  const safeCode = residentCode.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${safeCode}_${Date.now()}.${ext}`;
  const targetPath = path.resolve(PHOTOS_DIR, filename);

  if (!targetPath.startsWith(PHOTOS_DIR + path.sep)) {
    throw new Error('Invalid resident photo target path');
  }

  fs.writeFileSync(targetPath, buffer);
  return `/api/residents/photos/${filename}`;
}

export function resolveSafePhotoPath(filename: string): string | null {
  if (!/^[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(filename)) {
    return null;
  }
  const targetPath = path.resolve(PHOTOS_DIR, filename);
  if (!targetPath.startsWith(PHOTOS_DIR + path.sep)) {
    return null;
  }
  if (!fs.existsSync(targetPath)) {
    return null;
  }
  return targetPath;
}

export function deleteResidentPhotoByUrl(photoUrl?: string): void {
  if (!photoUrl || !photoUrl.startsWith('/api/residents/photos/')) return;
  const filename = photoUrl.slice('/api/residents/photos/'.length);
  const safePath = resolveSafePhotoPath(filename);
  if (safePath) {
    try {
      fs.unlinkSync(safePath);
    } catch {
      // Ignore missing/unlinked file
    }
  }
}
