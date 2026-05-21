export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface Attachment {
  id: string;
  kind: 'image' | 'pdf' | 'screenshot' | 'audio';
  name: string;
  mimeType: string;
  /** base64-encoded data (no `data:` prefix) */
  data: string;
  /** rendered text for PDFs (so we can prepend it to the user message) */
  extractedText?: string;
  size?: number;
  /** Hide from the chat UI (e.g. auto-captured screenshots) */
  hidden?: boolean;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  createdAt: number;
  pending?: boolean;
  pinned?: boolean;
  /** stamp when streaming finishes — used for stable React keys & ordering */
  finishedAt?: number;
  modelUsed?: string;
  tokensIn?: number;
  tokensOut?: number;
  /** Tool calls issued by the assistant */
  toolCalls?: any[];
  /** The ID of the tool call this message is responding to (if role is 'tool') */
  toolCallId?: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  /** Optional — when set, this chat lives inside a Project (= KB folder). */
  projectId?: string;
  /** Active persona soul for this chat. */
  soulId?: string;
}

export interface Soul {
  id: string;
  name: string;
  emoji: string;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
}

export type ProviderId = 'gemini' | 'openai' | 'openrouter' | 'lmstudio' | 'ollama' | 'anthropic';
export type SpeedMode = 'fast' | 'quality';

export interface ProviderConfig {
  id: ProviderId;
  apiKey: string;
  baseUrl: string;
  fastModel: string;
  qualityModel: string;
  fastImageModel?: string;
  qualityImageModel?: string;
  fastAudioModel?: string;
  qualityAudioModel?: string;
  embeddingModel?: string;
  /** Local providers only: opt-in to image/screenshot attachments when a multimodal model is loaded. */
  visionEnabled?: boolean;
}

export interface Settings {
  activeProvider: ProviderId;
  speed: SpeedMode;
  temperature: number;
  maxTokens: number;
  shareTab: boolean;
  webSearch: boolean;
  theme: 'dark' | 'light' | 'system';
  providers: Record<ProviderId, ProviderConfig>;
  /** Number of RAG chunks to retrieve per query (1-10, default 5). */
  ragChunks: number;
  /** Max context tokens before auto-compressing old messages. 0 = no limit. */
  maxContextTokens: number;
  /** Active persona soul ID — applied globally to all chats. */
  activeSoulId?: string;
}

export interface SkillArgument {
  key: string;
  label: string;
  placeholder?: string;
  remembered?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  emoji?: string;
  description?: string;
  instructions: string;
  builtin?: boolean;
  args?: SkillArgument[];
  /** last-used arg values, persisted */
  lastArgs?: Record<string, string>;
  createdAt: number;
}

export interface PageContext {
  url: string;
  title: string;
  selection?: string;
  text?: string;
  /** YouTube transcript if URL is youtube.com/watch */
  transcript?: string;
}

export interface SharedTab {
  tabId: number;
  url: string;
  title: string;
  text?: string;
  transcript?: string;
}
