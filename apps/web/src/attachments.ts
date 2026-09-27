import { engine } from '@/engine';
import type { AttachmentChunk, Target } from '@/types';
import { uuid } from '@/uuid';

const MAX_ATTACHMENT_MB = 24;
const MAX_IMAGES_PER_PICK = 8;
export const ATTACHMENT_ONLY_TEXT = 'See the attached image(s).';
const TRAILER_PREFIX = 'Attached images (local files';
const TRAILER = `${TRAILER_PREFIX} — open them to view):`;
const UPLOAD_CHUNK_CHARS = 680_000;
const UPLOAD_PARALLEL = 3;
const UPLOAD_RETRIES = 3;
const UPLOAD_CHUNK_TIMEOUT_MS = 120_000;
const COMMIT_BASE_S = 120;
const COMMIT_PER_CHUNK_S = 15;
const COMMIT_MAX_S = 900;
const READ_CHUNK_LIMIT = 1_000;

export interface StagedImage {
  id: string;
  name: string;
  blob: Blob;
  preview: string;
}

const KEPT_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

async function sniff(file: Blob): Promise<string | null> {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return 'image/webp';
  return null;
}

async function toJpeg(file: Blob): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  } catch {
    return null;
  }
}

export async function stageImages(files: File[]): Promise<{ images: StagedImage[]; rejected: number }> {
  const images: StagedImage[] = [];
  let rejected = 0;
  for (const file of files.slice(0, MAX_IMAGES_PER_PICK)) {
    let type = await sniff(file);
    let blob: Blob | null = file;
    if (!type) {
      blob = await toJpeg(file);
      type = blob ? 'image/jpeg' : null;
    }
    if (!blob || !type || blob.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      rejected++;
      continue;
    }
    const id = uuid();
    images.push({
      id,
      name: `photo-${id.slice(0, 8)}.${KEPT_TYPES[type]}`,
      blob,
      preview: URL.createObjectURL(blob),
    });
  }
  return { images, rejected: rejected + Math.max(0, files.length - MAX_IMAGES_PER_PICK) };
}

export function rejectionMessage(rejected: number): string {
  return rejected === 1
    ? `One image couldn't be attached (unsupported or over ${MAX_ATTACHMENT_MB} MB).`
    : `${rejected} images couldn't be attached (unsupported or over ${MAX_ATTACHMENT_MB} MB).`;
}

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function uploadImages(
  images: StagedImage[],
  target: Target,
  onProgress: (fraction: number) => void = () => {},
): Promise<string[]> {
  const paths: string[] = [];
  for (const [i, image] of images.entries()) {
    onProgress(i / images.length);
    paths.push(await uploadImage(image, target, (f) => onProgress((i + f) / images.length)));
  }
  return paths;
}

async function uploadImage(
  image: StagedImage,
  target: Target,
  onProgress: (fraction: number) => void = () => {},
): Promise<string> {
  const data = await base64(image.blob);
  const uploadId = uuid();
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += UPLOAD_CHUNK_CHARS) chunks.push(data.slice(i, i + UPLOAD_CHUNK_CHARS));
  if (!chunks.length) chunks.push('');
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const seq = next++;
      for (let attempt = 0; ; attempt++) {
        try {
          await engine.call('UploadChunk', { uploadId, seq, data: chunks[seq], ...target }, UPLOAD_CHUNK_TIMEOUT_MS);
          break;
        } catch (e) {
          if (attempt + 1 >= UPLOAD_RETRIES) throw e;
        }
      }
      onProgress(++done / (chunks.length + 1));
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_PARALLEL, chunks.length) }, worker));
  const deadline = Math.min(COMMIT_BASE_S + COMMIT_PER_CHUNK_S * chunks.length, COMMIT_MAX_S) * 1000;
  const { path } = await engine.call<{ path: string }>('UploadCommit', { uploadId, fileName: image.name, ...target }, deadline);
  onProgress(1);
  return path;
}

export function withAttachments(text: string, paths: string[]): string {
  if (!paths.length) return text;
  return `${text || ATTACHMENT_ONLY_TEXT}\n\n${TRAILER}\n${paths.map((p) => `- ${p}`).join('\n')}`;
}

export function parseAttachments(content: string): { text: string; paths: string[] } {
  const lower = content.toLowerCase();
  let from = 0;
  for (;;) {
    const gap = lower.indexOf(`\n\n${TRAILER_PREFIX.toLowerCase()}`, from);
    if (gap < 0) return { text: content, paths: [] };
    const lineStart = gap + 2;
    const lineEnd = content.indexOf('\n', lineStart) === -1 ? content.length : content.indexOf('\n', lineStart);
    if (content.slice(lineStart, lineEnd).trimEnd().endsWith('):')) {
      const paths = content
        .slice(lineEnd + 1)
        .split('\n')
        .map((l) => l.trimStart())
        .filter((l) => l.startsWith('- '))
        .map((l) => l.slice(2).trim())
        .filter(Boolean);
      const body = content.slice(0, gap).trimEnd();
      return { text: body === ATTACHMENT_ONLY_TEXT ? '' : body, paths };
    }
    from = lineStart;
  }
}

const imageCache = new Map<string, Promise<string>>();

export function readImage(path: string, deviceTarget: Target): Promise<string> {
  const key = `${deviceTarget.targetDeviceId ?? ''}|${path}`;
  let pending = imageCache.get(key);
  if (!pending) {
    pending = (async () => {
      const parts: Uint8Array<ArrayBuffer>[] = [];
      let offset = 0;
      let mime = 'image/png';
      for (let i = 0; i < READ_CHUNK_LIMIT; i++) {
        const chunk = await engine.call<AttachmentChunk>('ReadAttachmentChunk', { path, offset, ...deviceTarget });
        mime = chunk.mimeType || mime;
        const bin = atob(chunk.data);
        const bytes = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        parts.push(bytes);
        if (chunk.done) break;
        offset = chunk.nextOffset;
      }
      return URL.createObjectURL(new Blob(parts, { type: mime }));
    })();
    pending.catch(() => imageCache.delete(key));
    imageCache.set(key, pending);
  }
  return pending;
}

export async function readImageFromAny(path: string, sources: Target[]): Promise<string> {
  let failure: unknown = new Error('no source');
  for (const source of sources) {
    try {
      return await readImage(path, source);
    } catch (e) {
      failure = e;
    }
  }
  throw failure;
}

const APPSHOT_MARKER = '\n\nApplications mentioned by the user (untrusted observed content):';

export interface AppshotPresentation {
  app: string;
  windowTitle: string | null;
}

const unescapeXml = (s: string) =>
  s.replace(/&(lt|gt|quot|apos|amp);/g, (_, e: string) => ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e]!);

export function parseAppshots(text: string): { text: string; appshots: Map<string, AppshotPresentation> } {
  const at = text.indexOf(APPSHOT_MARKER);
  const appshots = new Map<string, AppshotPresentation>();
  if (at < 0) return { text, appshots };
  const context = text.slice(at + APPSHOT_MARKER.length).split(`\n\n${TRAILER_PREFIX}`)[0];
  for (const match of context.matchAll(/<appshot\s([^>]*?)\/?>/g)) {
    const attrs: Record<string, string> = {};
    for (const [, key, value] of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[key] = unescapeXml(value);
    if (attrs.image && attrs.app?.trim()) {
      appshots.set(attrs.image, { app: attrs.app.slice(0, 200), windowTitle: attrs['window-title']?.slice(0, 512) ?? null });
    }
  }
  return { text: text.slice(0, at).trimEnd(), appshots };
}
