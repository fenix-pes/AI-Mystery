import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const storageRoot = fileURLToPath(new URL("../../../../uploads/", import.meta.url));
const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const maxBytes = 8 * 1024 * 1024;

function safePath(key: string): string {
  if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) throw new Error("INVALID_ASSET_KEY");
  const resolved = path.resolve(storageRoot, key);
  if (!resolved.startsWith(path.resolve(storageRoot) + path.sep)) throw new Error("INVALID_ASSET_KEY");
  return resolved;
}

export async function saveImage(data: Buffer, mimeType: string): Promise<string> {
  const extension = extensions[mimeType];
  if (!extension || data.length === 0 || data.length > maxBytes) throw new Error("INVALID_IMAGE_ASSET");
  await mkdir(storageRoot, { recursive: true });
  const key = `${randomUUID()}.${extension}`;
  await writeFile(safePath(key), data, { flag: "wx" });
  return key;
}

export async function readImage(key: string): Promise<Buffer> {
  return readFile(safePath(key));
}

export async function deleteImage(key: string): Promise<void> {
  try { await unlink(safePath(key)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

export async function deleteImages(keys: string[]): Promise<void> {
  await Promise.all(keys.map(deleteImage));
}
