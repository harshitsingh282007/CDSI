// Single allowlist for uploaded documents. Both extension AND mimetype must match -
// either check alone is attacker-controlled (client sets both) and easy to spoof.
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const ALLOWED_EXTENSIONS = new Set([
  "pdf", "jpg", "jpeg", "png", "tiff", "bmp", "webp", "heic", "heif", "docx",
]);

export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function isAllowedUpload(originalName: string, mimetype: string): boolean {
  const ext = originalName.toLowerCase().split(".").pop() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) return false;

  // HEIC/HEIF MIME detection is unreliable on iOS/Safari, which sometimes reports
  // application/octet-stream instead of image/heic. Scoped narrowly to this extension
  // only - NOT a blanket allowance - so it can't be used to smuggle other file types.
  if ((ext === "heic" || ext === "heif") && mimetype === "application/octet-stream") return true;

  return ALLOWED_MIME_TYPES.has(mimetype);
}
