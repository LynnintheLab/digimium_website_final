import { logoExists, putLogo, readLogo } from "../runtime/storage";
import { LOGO_FILE_PATTERN, MAX_LOGO_BYTES, MAX_LOGO_DIMENSION, logoObjectKey } from "./logo-path";

type ImageType = { mime: "image/png" | "image/jpeg" | "image/webp"; extension: "png" | "jpg" | "webp" };

export class LogoInputError extends Error {
  constructor(message: string, public readonly status: 400 | 413 | 415 = 400) {
    super(message);
  }
}

function textAt(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function dimensions(width: number, height: number) {
  if (!width || !height || width > MAX_LOGO_DIMENSION || height > MAX_LOGO_DIMENSION) {
    throw new LogoInputError(`Choose an image no larger than ${MAX_LOGO_DIMENSION} × ${MAX_LOGO_DIMENSION} pixels.`);
  }
}

/** Check image containers and dimensions; never serve browser-active formats. */
export function identifyLogo(bytes: Uint8Array): ImageType {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 45 && bytes[0] === 137 && textAt(bytes, 1, 3) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) {
    if (view.getUint32(8) !== 13 || textAt(bytes, 12, 4) !== "IHDR") throw new LogoInputError("This PNG file is damaged. Choose another image.");
    dimensions(view.getUint32(16), view.getUint32(20));
    let position = 8;
    let hasImageData = false;
    while (position + 12 <= bytes.length) {
      const length = view.getUint32(position);
      const next = position + 12 + length;
      if (next > bytes.length) break;
      const kind = textAt(bytes, position + 4, 4);
      if (kind === "IDAT" && length) hasImageData = true;
      if (kind === "IEND" && length === 0 && next === bytes.length && hasImageData) return { mime: "image/png", extension: "png" };
      position = next;
    }
    throw new LogoInputError("This PNG file is incomplete. Choose another image.");
  }

  if (bytes.length >= 12 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    let position = 2;
    let hasFrame = false;
    while (position + 3 < bytes.length) {
      if (bytes[position++] !== 255) break;
      while (bytes[position] === 255) position++;
      const marker = bytes[position++];
      if (marker === 218) {
        if (hasFrame && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) return { mime: "image/jpeg", extension: "jpg" };
        break;
      }
      if (marker === 217 || marker === 216 || position + 2 > bytes.length) break;
      const length = view.getUint16(position);
      if (length < 2 || position + length > bytes.length) break;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        if (length < 8) break;
        dimensions(view.getUint16(position + 5), view.getUint16(position + 3));
        hasFrame = true;
      }
      position += length;
    }
    throw new LogoInputError("This JPEG file is incomplete. Choose another image.");
  }

  if (bytes.length >= 30 && textAt(bytes, 0, 4) === "RIFF" && textAt(bytes, 8, 4) === "WEBP") {
    if (view.getUint32(4, true) !== bytes.length - 8) throw new LogoInputError("This WebP file is incomplete. Choose another image.");
    let position = 12;
    let hasImageData = false;
    while (position + 8 <= bytes.length) {
      const kind = textAt(bytes, position, 4);
      const length = view.getUint32(position + 4, true);
      const data = position + 8;
      const next = data + length + (length % 2);
      if (next > bytes.length) break;
      if (kind === "VP8X" && length >= 10) {
        if (bytes[data] & 2) throw new LogoInputError("Choose a still image for the product logo.");
        const width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
        const height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16);
        dimensions(width, height);
      } else if (kind === "VP8 " && length >= 10 && bytes[data + 3] === 157 && bytes[data + 4] === 1 && bytes[data + 5] === 42) {
        dimensions(view.getUint16(data + 6, true) & 16383, view.getUint16(data + 8, true) & 16383);
        hasImageData = true;
      } else if (kind === "VP8L" && length >= 5 && bytes[data] === 47) {
        const bits = view.getUint32(data + 1, true);
        dimensions(1 + (bits & 16383), 1 + ((bits >>> 14) & 16383));
        hasImageData = true;
      }
      position = next;
    }
    if (position === bytes.length && hasImageData) return { mime: "image/webp", extension: "webp" };
    throw new LogoInputError("This WebP file is incomplete. Choose another image.");
  }

  throw new LogoInputError("Choose a PNG, JPEG, or WebP image. SVG and other file types are not supported.", 415);
}

export async function readLogoBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length")) > MAX_LOGO_BYTES) throw new LogoInputError("Choose a logo smaller than 2 MB.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new LogoInputError("Choose an image to upload.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_LOGO_BYTES) {
        await reader.cancel();
        throw new LogoInputError("Choose a logo smaller than 2 MB.", 413);
      }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  if (!length) throw new LogoInputError("The image file is empty.");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

export async function storeLogo(bytes: Uint8Array<ArrayBuffer>, declaredMime: string): Promise<string> {
  const image = identifyLogo(bytes);
  if (image.mime !== declaredMime) throw new LogoInputError("The file contents do not match its image type. Choose another image.", 415);
  const file = `${crypto.randomUUID()}.${image.extension}`;
  await putLogo(`logos/${file}`, bytes, image.mime);
  return `/media/logos/${file}`;
}

export async function validateLogoReferences(products: { logoPath?: string }[]) {
  const paths = [...new Set(products.map(product => product.logoPath).filter((path): path is string => Boolean(path)))];
  if (!paths.length) return;
  // Bound concurrent reads while checking every referenced file before saving.
  for (let index = 0; index < paths.length; index += 8) {
    await Promise.all(paths.slice(index, index + 8).map(async path => {
      const key = logoObjectKey(path);
      if (!key || !await logoExists(key)) throw new LogoInputError("A selected logo could not be found. Upload it again before saving.");
    }));
  }
}

export async function getLogo(file: string) {
  if (!LOGO_FILE_PATTERN.test(file)) return null;
  return readLogo(`logos/${file}`);
}

export function logoContentType(file: string): ImageType["mime"] {
  return file.endsWith(".png") ? "image/png" : file.endsWith(".jpg") ? "image/jpeg" : "image/webp";
}
