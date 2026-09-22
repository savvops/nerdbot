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
    environments: ['nerdbot', 'master_control', 'sao'],
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
    environments: ['nerdbot', 'master_control', 'sao'],
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
    environments: ['nerdbot', 'master_control', 'sao'],
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
    environments: ['nerdbot'],
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-browse',
    name: 'Autonomous Web Task',
    emoji: '🤖',
    description: 'Execute a multi-step task on this webpage using browser actions.',
    instructions:
      'You are an autonomous browser agent. Scan the page using browser_scan_page, determine the actions needed (clicking, typing, selecting, scrolling), and achieve the user\'s goal step-by-step. Confirm high-risk actions before executing.',
    tools: ['browser'],
    environments: ['nerdbot'],
    builtin: true,
    createdAt: 0,
  },
  {
    id: 'builtin-cli-replay',
    name: 'Extract Session / cURL',
    emoji: '💻',
    description: 'Convert active browser tab session into executable cURL / CLI commands for terminal & Master Control.',
    instructions:
      'Analyze the active page URL and authenticated session context. Formulate a clean, ready-to-run cURL command or Python requests script that replicates this authenticated session, including relevant headers, cookies, and body format. Explain how to run it directly in Master Control or the terminal.',
    tools: ['browser', 'cli'],
    environments: ['nerdbot', 'master_control', 'sao'],
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
    environments: ['nerdbot', 'master_control', 'sao'],
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
    tools: ['imagegen'],
    environments: ['nerdbot'],
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
    tools: ['audiogen'],
    environments: ['nerdbot'],
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
  tools?: string[];
  environments?: ('nerdbot' | 'master_control' | 'sao')[];
  author?: string;
  version?: string;
}): Promise<Skill> {
  const custom = await loadCustomSkills();
  const skill: Skill = {
    id: uid(),
    name: input.name.trim(),
    instructions: input.instructions.trim(),
    emoji: input.emoji?.trim() || '⚡',
    description: input.description?.trim() || '',
    args: extractArgsFromInstructions(input.instructions),
    tools: input.tools,
    environments: input.environments,
    author: input.author,
    version: input.version,
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
  updates: {
    name: string;
    emoji: string;
    description: string;
    instructions: string;
    tools?: string[];
    environments?: ('nerdbot' | 'master_control' | 'sao')[];
  },
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
      tools: updates.tools,
      environments: updates.environments,
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
        tools: updates.tools ?? custom[idx].tools,
        environments: updates.environments ?? custom[idx].environments,
      };
      await set(SKILLS_KEY, custom);
    }
  }
}

/** Export a single skill as formatted JSON */
export function exportSkillAsJson(skill: Skill): string {
  return JSON.stringify(skill, null, 2);
}

/** Export all skills (built-ins + custom) as a JSON bundle */
export async function exportAllSkillsAsJson(): Promise<string> {
  const all = await loadSkills();
  return JSON.stringify(all, null, 2);
}

/** Export a skill as Antigravity / SAO SKILL.md format (YAML frontmatter + markdown) */
export function exportSkillAsMarkdown(skill: Skill): string {
  const lines: string[] = ['---'];
  lines.push(`name: "${skill.name.replace(/"/g, '\\"')}"`);
  if (skill.emoji) lines.push(`emoji: "${skill.emoji}"`);
  if (skill.description) lines.push(`description: "${skill.description.replace(/"/g, '\\"')}"`);
  if (skill.tools && skill.tools.length > 0) {
    lines.push(`tools: [${skill.tools.map((t) => `"${t}"`).join(', ')}]`);
  }
  if (skill.environments && skill.environments.length > 0) {
    lines.push(`environments: [${skill.environments.map((e) => `"${e}"`).join(', ')}]`);
  }
  if (skill.author) lines.push(`author: "${skill.author}"`);
  if (skill.version) lines.push(`version: "${skill.version}"`);
  lines.push('---');
  lines.push('');
  lines.push(skill.instructions);
  return lines.join('\n');
}

/** Parse and import a skill from either JSON or YAML frontmatter Markdown */
export async function importSkillFromString(raw: string): Promise<Skill> {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    const parsed = JSON.parse(trimmed);
    if (!parsed.name || !parsed.instructions) {
      throw new Error('Invalid skill JSON: missing "name" or "instructions".');
    }
    return addSkill({
      name: parsed.name,
      instructions: parsed.instructions,
      emoji: parsed.emoji,
      description: parsed.description,
      tools: parsed.tools,
      environments: parsed.environments,
      author: parsed.author,
      version: parsed.version,
    });
  }
  if (trimmed.startsWith('---')) {
    const parts = trimmed.split(/^---$/m);
    if (parts.length >= 3) {
      const frontmatter = parts[1];
      const instructions = parts.slice(2).join('---').trim();
      const meta: Record<string, any> = {};
      for (const line of frontmatter.split('\n')) {
        const match = line.match(/^([a-z_]+)\s*:\s*(.*)$/i);
        if (match) {
          let val: any = match[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith('[') && val.endsWith(']')) {
            try {
              val = JSON.parse(val.replace(/'/g, '"'));
            } catch {
              val = val
                .slice(1, -1)
                .split(',')
                .map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''))
                .filter(Boolean);
            }
          }
          meta[match[1].toLowerCase()] = val;
        }
      }
      return addSkill({
        name: meta.name || 'Imported Skill',
        instructions: instructions || meta.instructions || '',
        emoji: meta.emoji || '⚡',
        description: meta.description || '',
        tools: Array.isArray(meta.tools) ? meta.tools : undefined,
        environments: Array.isArray(meta.environments) ? meta.environments : undefined,
        author: meta.author,
        version: meta.version,
      });
    }
  }
  throw new Error('Unsupported skill format. Please paste JSON or Markdown with YAML frontmatter.');
}

/** Import a batch of skills from a JSON array or single item */
export async function importSkillsBundle(
  raw: string,
): Promise<{ imported: number; errors: string[] }> {
  const errors: string[] = [];
  let imported = 0;
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const list = JSON.parse(trimmed);
      if (Array.isArray(list)) {
        for (const item of list) {
          try {
            if (item.name && item.instructions) {
              await addSkill({
                name: item.name,
                instructions: item.instructions,
                emoji: item.emoji,
                description: item.description,
                tools: item.tools,
                environments: item.environments,
                author: item.author,
                version: item.version,
              });
              imported++;
            }
          } catch (e: any) {
            errors.push(`Failed to import "${item.name}": ${e.message}`);
          }
        }
        return { imported, errors };
      }
    } catch (e: any) {
      errors.push(`JSON error: ${e.message}`);
    }
  }
  try {
    await importSkillFromString(raw);
    return { imported: 1, errors: [] };
  } catch (e: any) {
    errors.push(e.message);
    return { imported: 0, errors };
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
