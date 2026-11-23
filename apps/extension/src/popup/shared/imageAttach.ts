import { WRITE_IMAGE_MAX_BASE64_LENGTH, type WriteImage } from '@verba/shared';

/** Longest side sent to the AI. Large enough to read small text in a screenshot, small enough to upload fast. */
const MAX_SIDE = 1568;
/** Tried in order until the picture fits the server limit. */
const ATTEMPTS: ReadonlyArray<{ scale: number; quality: number }> = [
  { scale: 1, quality: 0.85 },
  { scale: 0.75, quality: 0.75 },
  { scale: 0.5, quality: 0.7 },
];

export interface AttachedImage {
  /** Stable id for list keys and for "the same pictures" checks. */
  id: string;
  image: WriteImage;
  /** Small data: URL for the thumbnail. */
  preview: string;
}

let counter = 0;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the picture.'));
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      const comma = url.indexOf(',');
      if (comma < 0) reject(new Error('Could not read the picture.'));
      else resolve(url.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Shrinks a pasted picture to a JPEG that fits the upload limit. Resolves null when the clipboard item is
 * not a readable image.
 */
export async function prepareImage(file: Blob): Promise<AttachedImage | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const fit = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    for (const { scale, quality } of ATTEMPTS) {
      const width = Math.max(1, Math.round(bitmap.width * fit * scale));
      const height = Math.max(1, Math.round(bitmap.height * fit * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // JPEG has no transparency: paint white first so see-through screenshots do not turn black.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, quality);
      if (!blob) return null;
      const data = await blobToBase64(blob);
      if (data.length <= WRITE_IMAGE_MAX_BASE64_LENGTH) {
        counter += 1;
        return { id: `img-${counter}`, image: { mimeType: 'image/jpeg', data }, preview: `data:image/jpeg;base64,${data}` };
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

/** Image files on a paste event, if any. */
export function imagesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}
