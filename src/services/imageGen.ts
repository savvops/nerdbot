import { uid } from './storage';
import type { Attachment, Settings } from './types';

export interface ImageGenResult {
  text?: string;
  attachments: Attachment[];
}

// Removed GEMINI_IMAGE_MODELS, model is now taken from settings.

export async function generateImage(opts: {
  prompt: string;
  settings: Settings;
  signal: AbortSignal;
  /** Optional input images (base64) for editing / variation. */
  inputImages?: { mimeType: string; data: string }[];
  /** Optional model override (used for audio model or specific image model) */
  modelOverride?: string | null;
}): Promise<ImageGenResult> {
  const { settings, prompt, signal, inputImages, modelOverride } = opts;
  const cfg = settings.providers.gemini;
  if (!cfg.apiKey) {
    throw new Error('Image/Audio generation requires a Gemini API key in Settings.');
  }

  const defaultFast = cfg.fastImageModel || 'gemini-2.0-flash';
  const defaultQuality = cfg.qualityImageModel || 'imagen-3.0-generate-002';
  const selectedModel = modelOverride || (settings.speed === 'quality' ? defaultQuality : defaultFast);

  // If editing (input images present), force the gemini model — Imagen doesn't accept input.
  const useImagen = selectedModel.toLowerCase().includes('imagen') && (!inputImages || inputImages.length === 0);
  
  if (useImagen) return generateWithImagen(prompt, cfg.apiKey, signal, selectedModel);
  return generateWithGeminiFlash(prompt, cfg.apiKey, signal, selectedModel, inputImages);
}

async function generateWithGeminiFlash(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
  model: string,
  inputImages?: { mimeType: string; data: string }[]
): Promise<ImageGenResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const parts: unknown[] = [{ text: prompt }];
  if (inputImages?.length) {
    for (const img of inputImages) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE', 'AUDIO'],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Gemini image API (${res.status}): ${err || res.statusText}`);
  }

  const data = await res.json();
  const candParts = data?.candidates?.[0]?.content?.parts ?? [];
  const attachments: Attachment[] = [];
  let text = '';
  for (const p of candParts) {
    if (typeof p?.text === 'string') text += p.text;
    if (p?.inlineData?.data) {
      const mime = p.inlineData.mimeType || '';
      if (mime.startsWith('audio/')) {
        attachments.push({
          id: uid(),
          kind: 'audio',
          name: `generated-${Date.now()}.wav`,
          mimeType: mime,
          data: p.inlineData.data,
        });
      } else {
        attachments.push({
          id: uid(),
          kind: 'image',
          name: `generated-${Date.now()}.png`,
          mimeType: mime || 'image/png',
          data: p.inlineData.data,
        });
      }
    }
  }
  if (attachments.length === 0) {
    throw new Error('No media returned. Try rephrasing the prompt or check if the model supports the requested modality.');
  }
  return { text: text.trim() || undefined, attachments };
}

async function generateWithImagen(
  prompt: string,
  apiKey: string,
  signal: AbortSignal,
  model: string
): Promise<ImageGenResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:predict?key=${encodeURIComponent(apiKey)}`;
  const body = {
    instances: [{ prompt }],
    parameters: { sampleCount: 1, aspectRatio: '1:1' },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Imagen API (${res.status}): ${err || res.statusText}`);
  }
  const data = await res.json();
  const preds = data?.predictions ?? [];
  const attachments: Attachment[] = [];
  for (const p of preds) {
    const b64 = p?.bytesBase64Encoded;
    if (b64) {
      attachments.push({
        id: uid(),
        kind: 'image',
        name: `imagen-${Date.now()}.png`,
        mimeType: 'image/png',
        data: b64,
      });
    }
  }
  if (attachments.length === 0) {
    throw new Error('Imagen returned no images. Check API access — Imagen requires a paid Gemini tier.');
  }
  return { attachments };
}

export const IMAGE_SKILL_ID = 'builtin-imagegen';
