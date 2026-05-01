import { get, set, uid } from './storage';
import type { Skill } from './types';

const SKILLS_KEY = 'nerdbot.skills.v1';
const SKILL_ARGS_KEY = 'nerdbot.skillArgs.v1';
const OVERRIDES_KEY = 'nerdbot.skillOverrides.v1';

export const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'builtin-explain',
    name: 'Explain simply',
    emoji: '🧠',
    description: 'Break this down for a curious 12-year-old.',
    instructions:
      'Explain the topic the user provides as if to a curious 12-year-old. Use a short analogy, plain language, and no jargon. Keep it under 150 words.',
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-actions',
    name: 'Action items',
    emoji: '✅',
    description: 'Pull a clean checklist of next steps.',
    instructions:
      'From the input the user shares, extract a tight checklist of action items. Each item should be a single sentence starting with a verb. Group by owner if visible.',
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-translate',
    name: 'Translate text',
    emoji: '🌐',
    description: 'Translate into another language, naturally.',
    instructions:
      'Translate the user-provided text into {{language}}. Preserve tone and meaning. Return only the translation, no preamble.',
    args: [
      { key: 'language', label: 'Target language', placeholder: 'e.g. Spanish, Japanese, French', remembered: true },
    ],
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-summarize',
    name: 'Summarize page',
    emoji: '📄',
    description: 'A crisp TL;DR of the current page.',
    instructions:
      'Using the shared page context, produce a TL;DR (≤4 sentences), then 3–5 bullet highlights. Avoid fluff. End with one suggested follow-up question.',
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-rewrite',
    name: 'Polish writing',
    emoji: '✨',
    description: 'Clean up tone, grammar, and clarity.',
    instructions:
      'Polish the user-provided text in a {{tone}} tone. Fix grammar, tighten phrasing, and lift clarity without changing the voice. Return only the rewritten text.',
    args: [
      { key: 'tone', label: 'Tone', placeholder: 'e.g. friendly, professional, witty', remembered: true },
    ],
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-imagegen',
    name: 'Generate image',
    emoji: '🎨',
    description: 'Make an image with Gemini (Fast = Flash, Quality = Imagen 3).',
    instructions:
      'IMAGE_GENERATION: This skill routes the prompt to the Gemini image generation API. Describe the image you want to create.',
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-audiogen',
    name: 'Generate music',
    emoji: '🎵',
    description: 'Make a song or sound effect.',
    instructions:
      'AUDIO_GENERATION: This skill routes the prompt to the Gemini generation API to output an audio format. Describe the music or sound you want to create.',
    builtin: true,
    createdAt: 0,
  },
];

export async function loadSkills(): Promise<Skill[]> {
  const [custom, args, overrides] = await Promise.all([
    get<Skill[]>(SKILLS_KEY, []),
    get<Record<string, Record<string, string>>>(SKILL_ARGS_KEY, {}),
    get<Record<string, Partial<Skill>>>(OVERRIDES_KEY, {}),
  ]);
  // Merge overrides on top of built-ins
  const builtins = BUILTIN_SKILLS.map((s) => {
    const ov = overrides[s.id];
    return ov ? { ...s, ...ov, id: s.id, builtin: true } : s;
  });
  const all = [...builtins, ...custom];
  return all.map((s) => ({ ...s, lastArgs: args[s.id] }));
}

export async function loadCustomSkills(): Promise<Skill[]> {
  return get<Skill[]>(SKILLS_KEY, []);
}

export async function addSkill(input: {
  name: string;
  instructions: string;
  emoji?: string;
  description?: string;
}): Promise<Skill> {
  const custom = await loadCustomSkills();
  const skill: Skill = {
    id: uid(),
    name: input.name.trim(),
    instructions: input.instructions.trim(),
    emoji: input.emoji?.trim() || '⚡',
    description: input.description?.trim() || '',
    args: extractArgsFromInstructions(input.instructions),
    createdAt: Date.now(),
  };
  await set(SKILLS_KEY, [skill, ...custom]);
  return skill;
}

export async function deleteSkill(id: string): Promise<void> {
  const custom = await loadCustomSkills();
  await set(
    SKILLS_KEY,
    custom.filter((s) => s.id !== id)
  );
}

export async function updateSkill(
  id: string,
  updates: { name: string; emoji: string; description: string; instructions: string },
): Promise<void> {
  const isBuiltin = BUILTIN_SKILLS.some((s) => s.id === id);
  if (isBuiltin) {
    // Save as an override — preserves original so user can reset later
    const overrides = await get<Record<string, Partial<Skill>>>(OVERRIDES_KEY, {});
    overrides[id] = {
      name: updates.name.trim(),
      emoji: updates.emoji.trim() || '⚡',
      description: updates.description.trim(),
      instructions: updates.instructions.trim(),
      args: extractArgsFromInstructions(updates.instructions),
    };
    await set(OVERRIDES_KEY, overrides);
  } else {
    // Update custom skill in-place
    const custom = await loadCustomSkills();
    const idx = custom.findIndex((s) => s.id === id);
    if (idx >= 0) {
      custom[idx] = {
        ...custom[idx],
        name: updates.name.trim(),
        emoji: updates.emoji.trim() || '⚡',
        description: updates.description.trim(),
        instructions: updates.instructions.trim(),
        args: extractArgsFromInstructions(updates.instructions),
      };
      await set(SKILLS_KEY, custom);
    }
  }
}

export async function resetSkill(id: string): Promise<void> {
  const overrides = await get<Record<string, Partial<Skill>>>(OVERRIDES_KEY, {});
  delete overrides[id];
  await set(OVERRIDES_KEY, overrides);
}

export async function rememberSkillArgs(skillId: string, args: Record<string, string>): Promise<void> {
  const all = await get<Record<string, Record<string, string>>>(SKILL_ARGS_KEY, {});
  all[skillId] = { ...(all[skillId] ?? {}), ...args };
  await set(SKILL_ARGS_KEY, all);
}

export function extractArgsFromInstructions(instructions: string) {
  const matches = Array.from(instructions.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi));
  const seen = new Set<string>();
  const out: { key: string; label: string; remembered: boolean }[] = [];
  for (const m of matches) {
    const key = m[1].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      remembered: true,
    });
  }
  return out;
}

export function applySkillArgs(template: string, args: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gi, (_, k) => args[k.toLowerCase()] ?? `{{${k}}}`);
}

export const SUGGESTED_FOLLOWUP_SKILL_IDS = [
  'builtin-explain',
  'builtin-actions',
  'builtin-translate',
];
