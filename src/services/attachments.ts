import { uid } from './storage';
import type { Attachment } from './types';

const MAX_BYTES = 8 * 1024 * 1024; // 8MB cap per attachment

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.size > MAX_BYTES) {
    throw new Error(`File too large (max 8MB): ${file.name}`);
  }
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  if (!isImage && !isPdf) {
    throw new Error(`Unsupported file type: ${file.type || file.name}`);
  }

  const data = await fileToBase64(file);
  const att: Attachment = {
    id: uid(),
    kind: isPdf ? 'pdf' : 'image',
    name: file.name,
    mimeType: file.type || (isPdf ? 'application/pdf' : 'image/png'),
    data,
    size: file.size,
  };

  if (isPdf) {
    try {
      att.extractedText = await extractPdfText(file);
    } catch (e) {
      att.extractedText = `(failed to parse PDF: ${(e as Error).message})`;
    }
  }
  return att;
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function dataUrl(att: Attachment): string {
  return `data:${att.mimeType};base64,${att.data}`;
}

export async function extractPdfText(file: File | Blob): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // @ts-ignore — Vite worker import
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pieces: string[] = [];
  const pages = Math.min(doc.numPages, 100);
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const text = await page.getTextContent();
    const str = text.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ');
    pieces.push(`--- Page ${i} ---\n${str.trim()}`);
  }
  if (doc.numPages > pages) pieces.push(`(…and ${doc.numPages - pages} more pages)`);
  return pieces.join('\n\n');
}

export async function captureScreenshotAttachment(): Promise<Attachment> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    throw new Error('Screenshot only available in the extension.');
  }
  const res = await new Promise<{ ok: boolean; data?: string; error?: string }>((resolve) => {
    chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, (r) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(r);
    });
  });
  if (!res.ok || !res.data) throw new Error(res.error || 'Screenshot failed');
  // strip the data URL prefix
  const idx = res.data.indexOf(',');
  const data = idx >= 0 ? res.data.slice(idx + 1) : res.data;
  return {
    id: uid(),
    kind: 'screenshot',
    name: `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`,
    mimeType: 'image/png',
    data,
  };
}
