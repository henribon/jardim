const MAX_SIDE = 1600;
const QUALITY = 0.85;
const KEEP_ORIGINAL = new Set(['image/gif', 'image/svg+xml']);

export async function compressImage(file) {
  if (KEEP_ORIGINAL.has(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob ?? file), 'image/webp', QUALITY));
}
