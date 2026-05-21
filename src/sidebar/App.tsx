import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import HeroEmpty from './components/HeroEmpty';
import MessageView from './components/MessageView';
import TypingIndicator from './components/TypingIndicator';
import InputBar from './components/InputBar';
import HistoryDrawer from './components/HistoryDrawer';
import SettingsPanel from './components/SettingsPanel';
import AddSkillModal from './components/AddSkillModal';
import BrowseSkillsModal from './components/BrowseSkillsModal';
import ErrorBanner from './components/ErrorBanner';
import SkillArgsModal from './components/SkillArgsModal';
import MultiTabModal from './components/MultiTabModal';
import EditMessageModal from './components/EditMessageModal';
import KnowledgePanel from './components/KnowledgePanel';
import ContextRing from './components/ContextRing';
import ProjectModal from './components/ProjectModal';

import { executeTool } from '../services/tools';
import {
  appendMessage,
  archiveCurrent,
  deleteFromHistory,
  emptyChat,
  exportToMarkdown,
  loadCurrent,
  loadHistory,
  loadPinned,
  pinMessage,
  restoreFromHistory,
  saveChatToHistory,
  saveCurrent,
  truncateAfter,
  unpinNote,
  updateMessage,
  type PinnedNote,
} from '../services/chatManager';
import {
  activeProvider,
  getMaxContext,
  hasNativeSearch,
  isSearchCapable,
  isVisionCapable,
  loadSettings,
  PROVIDER_COST,
  saveSettings,
} from '../services/config';
import { getPageContext, getPageText, getTabText } from '../services/pageContext';
import {
  addSkill,
  applySkillArgs,
  deleteSkill,
  loadSkills,
  rememberSkillArgs,
  updateSkill,
  resetSkill,
  SUGGESTED_FOLLOWUP_SKILL_IDS,
} from '../services/skills';
import { streamCompletion } from '../services/providers';
import { generateImage, IMAGE_SKILL_ID } from '../services/imageGen';
import { uid } from '../services/storage';
import { captureScreenshotAttachment, fileToAttachment } from '../services/attachments';
import { approxTokens, formatCost } from '../services/tokens';
import { makeStreamBuffer } from '../services/streamBuffer';
import { queryKnowledge, knowledgeStats, listFolders, deleteFolder, type KnowledgeFolder } from '../services/rag';
import { fetchUrlContent, extractUrl, searchWeb, extractSearchQuery } from '../services/scraper';
import { loadSouls, createSoul, updateSoul, deleteSoul } from '../services/souls';
import { memoryProvider } from '../services/memoryProvider';
import type { Attachment, Chat, Message, PageContext, Role, Settings, Skill, Soul } from '../services/types';

const SYSTEM_BASE = `You are Nerdbot, a friendly, sharp browser-side assistant.
Be concise and direct. Prefer markdown with headings, bullets, and code blocks where helpful.
If a page is shared, you may use it as context — quote sparingly, never invent content not present.
If the Page Content is empty, you must explicitly state that you cannot read the page rather than guessing its contents.
When web search results appear in your context, you have live internet access for this query. Always answer using those results and cite sources.
IMPORTANT: You HAVE the ability to generate images. If the user asks you to create, draw, or generate an image, DO NOT say you cannot. Instead, tell them to type "/Generate image" in the input bar or use the Skills menu to trigger the image generation skill.`;

interface SendOptions {
  /** Override user-message content (used by edit/regenerate). */
  userText?: string;
  /** Override attachments (used by edit). */
  attachments?: Attachment[];
  /** If true, don't push a new user message — reuse the last one. */
  reuseLastUser?: boolean;
  /** If true, skip adding user message and context, just resume generation (used for tool execution loop). */
  autoResume?: boolean;
  /** Pass the previously built system prompt when auto-resuming */
  autoResumeSysPrompt?: string;
  /** Pass the latest chat state to avoid stale closures */
  chatToResume?: Chat;
}

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [chat, setChat] = useState<Chat>(() => emptyChat());
  const [history, setHistory] = useState<Chat[]>([]);
  const [pinned, setPinned] = useState<PinnedNote[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [souls, setSouls] = useState<Soul[]>([]);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingLabel, setPendingLabel] = useState<'Thinking' | 'Reading page' | 'Reading link' | 'Streaming' | 'Searching' | 'Running tools...'>('Thinking');
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState<PageContext | null>(null);
  const [shareEnabled, setShareEnabled] = useState(true);
  const [extraTabIds, setExtraTabIds] = useState<number[]>([]);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [knowledgeEnabled, setKnowledgeEnabled] = useState(false);
  const [knowledgePanelOpen, setKnowledgePanelOpen] = useState(false);
  const [knowledgeCount, setKnowledgeCount] = useState(0);

  // Projects (= KB folders with optional system prompt)
  const [projects, setProjects] = useState<KnowledgeFolder[]>([]);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  /** When non-null, opens an existing project in the modal. When 'new', creates one. */
  const [projectModalTarget, setProjectModalTarget] = useState<string | 'new' | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addSkillOpen, setAddSkillOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [skillArgsFor, setSkillArgsFor] = useState<Skill | null>(null);
  const [multiTabOpen, setMultiTabOpen] = useState(false);
  const [editing, setEditing] = useState<Message | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Bootstrap
  useEffect(() => {
    (async () => {
      const [s, c, h, p, sk, so] = await Promise.all([
        loadSettings(),
        loadCurrent(),
        loadHistory(),
        loadPinned(),
        loadSkills(),
        loadSouls(),
      ]);
      setSettings(s);
      setChat(c);
      setHistory(h);
      setPinned(p);
      setSkills(sk);
      setSouls(so);
      // Check knowledge base stats
      const stats = await knowledgeStats();
      setKnowledgeCount(stats.chunks);
      const folders = await listFolders();
      setProjects(folders);
    })();
  }, []);

  const refreshProjects = useCallback(async () => {
    const [folders, stats] = await Promise.all([listFolders(), knowledgeStats()]);
    setProjects(folders);
    setKnowledgeCount(stats.chunks);
  }, []);

  // Drain quick-chat queue (text the overlay queued for this side panel)
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    chrome.storage.local.get(['nerdbot.quickQueue.v1'], (res) => {
      const q = res['nerdbot.quickQueue.v1'] as { text: string; createdAt: number } | undefined;
      if (q?.text && Date.now() - q.createdAt < 30_000) {
        setInput(q.text);
        chrome.storage.local.remove(['nerdbot.quickQueue.v1']);
      }
    });

    const listener = (message: any) => {
      if (message?.type === 'QUICK_CHAT_QUEUE' && message?.payload?.text) {
        setInput(message.payload.text);
        chrome.storage.local.remove(['nerdbot.quickQueue.v1']);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  // Refresh page context periodically
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const p = await getPageContext();
      if (!cancelled) setPage(p);
    };
    tick();
    const id = window.setInterval(tick, 4000);
    const onFocus = () => tick();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Persist chat
  useEffect(() => {
    if (chat) saveCurrent(chat);
  }, [chat]);

  // Auto-scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [chat.messages.length, busy]);

  const persistSettings = useCallback(async (next: Settings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  const handleNewChat = useCallback(
    async (opts: { projectId?: string; keepProject?: boolean } = {}) => {
      abortRef.current?.abort();
      const fresh = await archiveCurrent(chat, { keepProject: opts.keepProject ?? false });
      // If a specific projectId was passed, override
      if (opts.projectId !== undefined) {
        fresh.projectId = opts.projectId || undefined;
        await saveCurrent(fresh);
      }
      const h = await loadHistory();
      setChat(fresh);
      setHistory(h);
      setActiveSkill(null);
      setAttachments([]);
      setExtraTabIds([]);
      setError(null);
      setInput('');
    },
    [chat]
  );

  const handleNewChatInProject = useCallback(
    (projectId: string) => {
      handleNewChat({ projectId });
      setDrawerOpen(false);
    },
    [handleNewChat]
  );

  const handlePickFromHistory = useCallback(
    async (id: string) => {
      await saveChatToHistory(chat);
      const restored = await restoreFromHistory(id);
      if (restored) setChat(restored);
      setHistory(await loadHistory());
      setDrawerOpen(false);
    },
    [chat]
  );

  const handleDeleteHistory = useCallback(async (id: string) => {
    await deleteFromHistory(id);
    setHistory(await loadHistory());
  }, []);

  const handleAddSkill = useCallback(
    async (input: { name: string; emoji: string; description: string; instructions: string }) => {
      const created = await addSkill(input);
      setSkills(await loadSkills());
      setActiveSkill(created);
    },
    []
  );

  const handleDeleteSkill = useCallback(async (id: string) => {
    await deleteSkill(id);
    setSkills(await loadSkills());
  }, []);

  const handleAttach = useCallback(async (file: File) => {
    try {
      const att = await fileToAttachment(file);
      setAttachments((prev) => [...prev, att]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const handleScreenshot = useCallback(async () => {
    try {
      const att = await captureScreenshotAttachment();
      setAttachments((prev) => [...prev, att]);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const handleExport = useCallback(() => {
    const md = exportToMarkdown(chat);
    const blob = new Blob([md], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${chat.title.replace(/[^\w-]+/g, '-').toLowerCase()}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [chat]);

  const handlePin = useCallback(
    async (id: string) => {
      const m = chat.messages.find((x) => x.id === id);
      if (!m) return;
      const next = await pinMessage(chat, m);
      setPinned(next);
    },
    [chat]
  );

  const handleUnpin = useCallback(async (id: string) => {
    const next = await unpinNote(id);
    setPinned(next);
  }, []);

  const buildSystemPrompt = useCallback(
    (skill: Skill | null, includePages: PageContext[], soul: Soul | null, memorySection: string) => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
      const parts = [`Today is ${dateStr}, ${timeStr}.\n\n${SYSTEM_BASE}`];
      if (soul) {
        parts.push(`\n[Active persona: ${soul.name}]\n${soul.systemPrompt}`);
      }
      if (memorySection) {
        parts.push(`\n${memorySection}`);
      }
      if (skill) {
        const args = skill.lastArgs ?? {};
        const filled = applySkillArgs(skill.instructions, args);
        parts.push(`\n[Active skill: ${skill.name}]\n${filled}`);
      }
      includePages.forEach((p, idx) => {
        const label = includePages.length > 1 ? `Tab ${idx + 1}` : 'Shared tab';
        const meta = `${label} — ${p.title || 'Untitled'}\nURL: ${p.url}`;
        const sel = p.selection ? `\nSelected text:\n"""\n${p.selection}\n"""` : '';
        const tx = p.text ? `\nPage content:\n"""\n${p.text}\n"""` : '';
        const tr = p.transcript
          ? `\nVideo transcript:\n"""\n${p.transcript}\n"""`
          : '';
        parts.push(`\n[${label}]\n${meta}${sel}${tx}${tr}`);
      });
      return parts.join('\n');
    },
    []
  );

  const send = useCallback(
    async (opts: SendOptions = {}) => {
      if (!settings) return;
      const trimmed = (opts.userText ?? input).trim();
      const localAtts = [...(opts.attachments ?? attachments)];
      if (!trimmed && !activeSkill && localAtts.length === 0 && !opts.autoResume) return;

      setError(null);

      let next = opts.chatToResume || chat;
      let assistantId: string;
      let pdfText = '';
      let fullUserContent = '';

      if (!opts.autoResume) {
        // Auto-capture screenshot for Vision context
        if (shareEnabled && isVisionCapable(settings)) {
          try {
            const res = await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
            if (res?.dataUrl) {
              localAtts.push({
                id: uid(),
                kind: 'screenshot',
                name: 'Auto-captured Context',
                mimeType: 'image/jpeg',
                data: res.dataUrl.replace(/^data:image\/\w+;base64,/, ''),
                hidden: true,
              });
            }
          } catch (e) {
            console.warn('Auto-screenshot failed:', e);
          }
        }

        // PDF text gets prepended to the user message so non-vision providers can see it.
        pdfText = localAtts
          .filter((a) => a.kind === 'pdf' && a.extractedText)
          .map((a) => `--- ${a.name} ---\n${a.extractedText}`)
          .join('\n\n');
        const userText =
          trimmed || (activeSkill ? `(Apply “${activeSkill.name}”.)` : '(See attached.)');
        fullUserContent = pdfText ? `${userText}\n\n${pdfText}` : userText;

        if (opts.reuseLastUser) {
          // Used by regenerate — drop everything after the last user message and add a fresh assistant.
          const lastUser = [...chat.messages].reverse().find((m) => m.role === 'user');
          if (!lastUser) return;
          next = truncateAfter(chat, lastUser.id, false);
        } else {
          const userMsg: Message = {
            id: uid(),
            role: 'user',
            content: fullUserContent,
            attachments: localAtts.length > 0 ? localAtts : undefined,
            createdAt: Date.now(),
          };
          next = appendMessage(next, userMsg);
        }
      }

      const assistantMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: '',
        createdAt: Date.now(),
        pending: true,
      };
      assistantId = assistantMsg.id;
      next = appendMessage(next, assistantMsg);

      setChat(next);
      if (!opts.userText && !opts.autoResume) setInput('');
      if (!opts.attachments && !opts.autoResume) setAttachments([]);
      setBusy(true);
      setPendingLabel('Thinking');

      let sys = opts.autoResumeSysPrompt || '';
      
      if (!opts.autoResumeSysPrompt) {
        // Gather page context (current tab + extras)
        const includedPages: PageContext[] = [];
        if (shareEnabled) {
          setPendingLabel('Reading page');
          const cur = await getPageText();
          if (cur) includedPages.push(cur);
        }
        for (const tabId of extraTabIds) {
          const t = await getTabText(tabId);
          if (t) {
            includedPages.push({
              url: t.url,
              title: t.title,
              text: t.text,
              transcript: t.transcript,
            });
          }
        }

        // Detect URL in input and fetch content if needed
        let linkContent = '';
        const foundUrl = extractUrl(trimmed);
        if (foundUrl) {
          try {
            setPendingLabel('Reading link');
            const content = await fetchUrlContent(foundUrl);
            if (content) {
              linkContent = `\n\n[Link Content: ${foundUrl}]\n"""\n${content}\n"""`;
            }
          } catch (e) {
            console.warn('URL content fetch failed:', e);
          }
        }

        // RAG: project chats auto-query their project's KB; loose chats use the global toggle.
        let ragContext = '';
        const projectScope = chat.projectId;
        const useRag = projectScope || (knowledgeEnabled && knowledgeCount > 0);
        if (useRag) {
          try {
            setPendingLabel('Thinking');
            const geminiCfg = settings.providers.gemini;
            const embedCfg = geminiCfg.apiKey ? geminiCfg : settings.providers[settings.activeProvider];
            const ragResults = await queryKnowledge(trimmed, embedCfg.apiKey, {
              baseUrl: embedCfg.baseUrl,
              embeddingModel: embedCfg.embeddingModel,
              limit: settings.ragChunks ?? 5,
              folderId: projectScope,
            });
            if (ragResults.length > 0) {
              ragContext = '\n\n[Knowledge Base Context]\n' +
                ragResults.map((r) =>
                  `[Source: ${r.docName}]\n"""\n${r.text}\n"""`
                ).join('\n\n');
            }
          } catch (e) {
            console.warn('RAG query failed:', e);
          }
        }

        let projectPrompt = '';
        if (chat.projectId) {
          const proj = projects.find((p) => p.id === chat.projectId);
          if (proj?.systemPrompt) {
            projectPrompt = `\n\n[Project: ${proj.name}]\n${proj.systemPrompt}`;
          }
        }

        const activeSoul = settings.activeSoulId
          ? souls.find((s) => s.id === settings.activeSoulId) ?? null
          : null;
        const memorySection = await memoryProvider.buildSystemPromptSection();
        sys = buildSystemPrompt(activeSkill, includedPages, activeSoul, memorySection);
        if (projectPrompt) sys += projectPrompt;
        if (ragContext) sys += ragContext;
        if (linkContent) sys += linkContent;

        if (settings.webSearch && !hasNativeSearch(settings)) {
          try {
            setPendingLabel('Searching');
            const searchQuery = extractSearchQuery(trimmed);
            const results = await searchWeb(searchQuery);
            if (results) {
              sys +=
                `\n\nIMPORTANT: The following are LIVE web search results retrieved right now. ` +
                `You have internet access for this query. Do NOT say you cannot access real-time data or the internet. ` +
                `Answer based on these results and cite sources.\n` +
                `[Web Search Results for: "${searchQuery}"]\n"""\n${results.slice(0, 8000)}\n"""`;
            }
          } catch (e) {
            console.warn('Web search injection failed:', e);
          }
        }
      }

      if (settings.webSearch && hasNativeSearch(settings) && !opts.autoResume) setPendingLabel('Searching');
      else setPendingLabel('Streaming');

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      // Media-generation skill: route to Gemini media API instead of chat completion
      if (activeSkill?.id === IMAGE_SKILL_ID || activeSkill?.id === 'builtin-audiogen') {
        try {
          setPendingLabel('Streaming');
          const isAudio = activeSkill.id === 'builtin-audiogen';
          const geminiCfg = settings.providers.gemini;
          const defaultAudioModel = settings.speed === 'quality' ? (geminiCfg.qualityAudioModel || 'gemini-2.5-pro') : (geminiCfg.fastAudioModel || 'gemini-2.0-flash');
          const targetModel = isAudio ? defaultAudioModel : null;

          const inputImages = localAtts
            .filter((a) => a.kind === 'image' || a.kind === 'screenshot')
            .map((a) => ({ mimeType: a.mimeType, data: a.data }));
          const result = await generateImage({
            prompt: trimmed || 'Generate media based on the attached references.',
            settings,
            signal: ctrl.signal,
            inputImages: inputImages.length > 0 ? inputImages : undefined,
            modelOverride: targetModel,
          });
          setChat((curr) =>
            updateMessage(curr, assistantId, {
              content: result.text || `Here's what I generated:`,
              attachments: result.attachments,
              pending: false,
              finishedAt: Date.now(),
            })
          );
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          const aborted = (e as { name?: string })?.name === 'AbortError';
          setChat((curr) =>
            updateMessage(curr, assistantId, {
              pending: false,
              content: aborted ? '_(stopped)_' : `> ⚠️ ${message}`,
            })
          );
          if (!aborted) setError(message);
        } finally {
          abortRef.current = null;
          setBusy(false);
        }
        return;
      }

      try {
        let acc = '';
        const buffer = makeStreamBuffer({
          emit: (chunk) => {
            acc += chunk;
            setChat((curr) => updateMessage(curr, assistantId, { content: acc }));
          },
        });
        // Auto-compress: trim old messages if context would exceed the limit
        const maxCtx = getMaxContext(settings);
        let sendMessages = next.messages.filter((m) => m.role !== 'system' && !m.pending);
        const sysTokens = approxTokens(sys);
        let totalTokens = sysTokens;
        // Walk messages from newest to oldest, keep as many as fit
        const kept: typeof sendMessages = [];
        for (let i = sendMessages.length - 1; i >= 0; i--) {
          const msgTokens = approxTokens(sendMessages[i].content);
          if (totalTokens + msgTokens > maxCtx * 0.9 && kept.length >= 2) {
            // Stop — we'd exceed 90% of context. Keep at least the last 2 messages.
            break;
          }
          totalTokens += msgTokens;
          kept.unshift(sendMessages[i]);
        }
        sendMessages = kept;

        let toolCallsList: any[] = [];
        await streamCompletion({
          settings,
          systemPrompt: sys,
          messages: sendMessages,
          signal: ctrl.signal,
          webSearch: settings.webSearch,
          onDelta: (d) => buffer.push(d),
          onCitations: (cites) => {
            if (cites.length === 0) return;
            const lines = cites.map((c) => `- [${c.title || c.uri}](${c.uri})`).join('\n');
            buffer.push(`\n\n---\n**Sources**\n${lines}`);
          },
          onToolCall: (tc) => {
            toolCallsList.push(tc);
          }
        });
        buffer.flush();
        
        if (toolCallsList.length > 0) {
          setChat((curr) =>
            updateMessage(curr, assistantId, {
              content: acc,
              pending: false,
              toolCalls: toolCallsList,
              finishedAt: Date.now(),
            })
          );
          
          setPendingLabel('Running tools...');
          const geminiCfg = settings.providers.gemini;
          const embedCfg = geminiCfg.apiKey ? geminiCfg : settings.providers[settings.activeProvider];
          const toolResults = await Promise.all(toolCallsList.map(async (tc) => {
             const result = await executeTool(tc.name, tc.args, embedCfg.apiKey, embedCfg.baseUrl, embedCfg.embeddingModel);
             return {
                id: uid(),
                role: 'tool' as Role,
                content: result,
                toolCallId: tc.id,
                createdAt: Date.now(),
             };
          }));
          
          let nextChat: Chat | null = null;
          setChat((curr) => {
            let updated = curr;
            for (const r of toolResults) updated = appendMessage(updated, r);
            nextChat = updated;
            return updated;
          });
          
          setTimeout(() => {
            if (nextChat) {
              send({ autoResume: true, autoResumeSysPrompt: sys, chatToResume: nextChat });
            }
          }, 100);
          
          return;
        } else {
          setChat((curr) =>
            updateMessage(curr, assistantId, {
              content: acc,
              pending: false,
              finishedAt: Date.now(),
              tokensOut: approxTokens(acc),
            })
          );
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const aborted = (e as { name?: string })?.name === 'AbortError';
        setChat((curr) =>
          updateMessage(curr, assistantId, {
            pending: false,
            content: aborted ? '_(stopped)_' : `> ⚠️ ${message}`,
          })
        );
        if (!aborted) setError(message);
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [activeSkill, attachments, buildSystemPrompt, chat, extraTabIds, input, settings, shareEnabled, knowledgeEnabled, knowledgeCount, projects, souls]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleRewind = useCallback(
    (id: string) => {
      const idx = chat.messages.findIndex((m) => m.id === id);
      if (idx < 0) return;
      const dropping = chat.messages.length - (idx + 1);
      if (dropping === 0) return; // nothing after this message
      if (!window.confirm(`Rewind here? ${dropping} message${dropping !== 1 ? 's' : ''} after this point will be discarded.`)) return;
      const rewound = truncateAfter(chat, id, false);
      setChat(rewound);
    },
    [chat]
  );

  const handleRegenerate = useCallback(
    async (assistantId: string) => {
      // Drop the assistant message and re-send the last user message
      const idx = chat.messages.findIndex((m) => m.id === assistantId);
      if (idx < 0) return;
      const truncated: Chat = {
        ...chat,
        messages: chat.messages.slice(0, idx),
      };
      setChat(truncated);
      // small tick so state updates land before send reads it
      requestAnimationFrame(() => {
        // We can't `await` chat state; build send-args manually
        send({ reuseLastUser: true });
      });
    },
    [chat, send]
  );

  const handleEditAndResend = useCallback(
    (newText: string) => {
      if (!editing) return;
      const idx = chat.messages.findIndex((m) => m.id === editing.id);
      if (idx < 0) return;
      const truncated: Chat = {
        ...chat,
        messages: chat.messages.slice(0, idx),
      };
      setChat(truncated);
      const oldAtts = editing.attachments ?? [];
      setEditing(null);
      requestAnimationFrame(() => {
        send({ userText: newText, attachments: oldAtts });
      });
    },
    [chat, editing, send]
  );

  const onPickSkill = useCallback((s: Skill | null) => {
    setActiveSkill(s);
    if (s?.args && s.args.length > 0) {
      const missing = s.args.some((a) => !s.lastArgs?.[a.key]);
      if (missing) setSkillArgsFor(s);
    }
  }, []);

  const handleSkillArgsConfirm = useCallback(
    async (args: Record<string, string>) => {
      if (!skillArgsFor) return;
      await rememberSkillArgs(skillArgsFor.id, args);
      const refreshed = await loadSkills();
      setSkills(refreshed);
      const updated = refreshed.find((x) => x.id === skillArgsFor.id);
      if (updated) setActiveSkill(updated);
      setSkillArgsFor(null);
    },
    [skillArgsFor]
  );

  const suggestionSkills = useMemo(
    () => skills.filter((s) => SUGGESTED_FOLLOWUP_SKILL_IDS.includes(s.id)),
    [skills]
  );

  const lastAssistantId = useMemo(() => {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
      const m = chat.messages[i];
      if (m.role === 'assistant' && !m.pending) return m.id;
    }
    return null;
  }, [chat.messages]);

  const tokensIn = useMemo(() => {
    if (!settings) return 0;
    const skillTokens = activeSkill ? approxTokens(activeSkill.instructions) : 0;
    const inputTokens = approxTokens(input);
    const histTokens = chat.messages.reduce((acc, m) => acc + approxTokens(m.content), 0);
    return skillTokens + inputTokens + histTokens;
  }, [settings, activeSkill, input, chat.messages]);

  const costHint = useMemo(() => {
    if (!settings) return 'free';
    const cost = PROVIDER_COST[settings.activeProvider];
    const rate = settings.speed === 'fast' ? cost.fastIn : cost.qualityIn;
    return formatCost((tokensIn / 1_000_000) * rate);
  }, [settings, tokensIn]);

  if (!settings) {
    return <div className="h-full grid place-items-center text-muted text-sm">Loading…</div>;
  }

  const hasMessages = chat.messages.length > 0;
  const visionCapable = isVisionCapable(settings);
  const searchCapable = isSearchCapable(settings);
  const cfg = activeProvider(settings);
  // Embedding provider: prefer Gemini (768-dim, always compatible); fall back to active provider.
  const embedProviderCfg = settings.providers.gemini.apiKey
    ? settings.providers.gemini
    : settings.providers[settings.activeProvider];

  return (
    <div className="flex flex-col h-full bg-bg">
      <Header
        title={chat.title}
        hasMessages={hasMessages}
        onToggleDrawer={() => setDrawerOpen(true)}
        onNewChat={() => handleNewChat({ keepProject: true })}
        onOpenSettings={() => setSettingsOpen(true)}
        onCaptureScreenshot={handleScreenshot}
        visionCapable={visionCapable}
        activeProject={
          chat.projectId
            ? (() => {
                const p = projects.find((x) => x.id === chat.projectId);
                return p ? { name: p.name, emoji: p.emoji } : null;
              })()
            : null
        }
        onOpenActiveProject={() => {
          if (chat.projectId) {
            setProjectModalTarget(chat.projectId);
            setProjectModalOpen(true);
          }
        }}
      />

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <HeroEmpty onSuggest={(t) => setInput(t)} />
        ) : (
          <div className="px-3 pt-4 pb-6 space-y-5">
            {chat.messages.map((m) => (
              <MessageView
                key={m.id}
                message={m}
                showSuggestions={m.id === lastAssistantId && !busy}
                suggestions={suggestionSkills}
                onSuggest={(s) => {
                  onPickSkill(s);
                  setInput('');
                }}
                onEdit={(id) => {
                  const msg = chat.messages.find((x) => x.id === id);
                  if (msg) setEditing(msg);
                }}
                onRewind={handleRewind}
                onRegenerate={handleRegenerate}
                onPin={handlePin}
                isLastAssistant={m.id === lastAssistantId}
              />
            ))}
            {busy && chat.messages[chat.messages.length - 1]?.content === '' && (
              <TypingIndicator label={pendingLabel} />
            )}
          </div>
        )}
      </div>

      {error && (
        <ErrorBanner
          message={error}
          onDismiss={() => setError(null)}
          onSettings={() => {
            setError(null);
            setSettingsOpen(true);
          }}
        />
      )}

      <InputBar
        value={input}
        onChange={setInput}
        onSubmit={() => send()}
        onCancel={cancel}
        busy={busy}
        page={page}
        shareEnabled={shareEnabled}
        onToggleShare={() => setShareEnabled((v) => !v)}
        speed={settings.speed}
        onSpeedChange={(s) => persistSettings({ ...settings, speed: s })}
        skills={skills}
        activeSkill={activeSkill}
        onPickSkill={onPickSkill}
        onAddSkill={() => setAddSkillOpen(true)}
        onBrowseSkills={() => setBrowseOpen(true)}
        attachments={attachments}
        onAttach={handleAttach}
        onRemoveAttachment={(id) =>
          setAttachments((prev) => prev.filter((a) => a.id !== id))
        }
        visionCapable={visionCapable}
        webSearch={settings.webSearch}
        onToggleSearch={() => persistSettings({ ...settings, webSearch: !settings.webSearch })}
        searchCapable={searchCapable}
        onMultiTabClick={() => setMultiTabOpen(true)}
        knowledgeEnabled={knowledgeEnabled}
        onToggleKnowledge={() => setKnowledgeEnabled((v) => !v)}
        onOpenKnowledge={() => setKnowledgePanelOpen(true)}
        knowledgeCount={knowledgeCount}
        tokensIn={tokensIn}
        costHint={costHint}
      />

      <HistoryDrawer
        open={drawerOpen}
        history={history}
        pinned={pinned}
        projects={projects}
        currentId={chat.id}
        activeProjectId={chat.projectId ?? null}
        onClose={() => setDrawerOpen(false)}
        onNewChat={() => {
          setDrawerOpen(false);
          handleNewChat({ projectId: '' });
        }}
        onNewProject={() => {
          setDrawerOpen(false);
          setProjectModalTarget('new');
          setProjectModalOpen(true);
        }}
        onOpenProject={(id) => {
          setProjectModalTarget(id);
          setProjectModalOpen(true);
        }}
        onNewChatInProject={handleNewChatInProject}
        onDeleteProject={async (id) => {
          await deleteFolder(id);
          // If the current chat was in this project, unlink it
          if (chat.projectId === id) {
            const next = { ...chat, projectId: undefined };
            setChat(next);
            await saveCurrent(next);
          }
          await refreshProjects();
        }}
        onPick={handlePickFromHistory}
        onDelete={handleDeleteHistory}
        onUnpin={handleUnpin}
        onExport={handleExport}
      />

      <ProjectModal
        open={projectModalOpen}
        projectId={projectModalTarget === 'new' ? null : projectModalTarget}
        history={history}
        apiKey={embedProviderCfg.apiKey}
        baseUrl={embedProviderCfg.baseUrl}
        embeddingModel={embedProviderCfg.embeddingModel}
        onClose={async (created) => {
          setProjectModalOpen(false);
          setProjectModalTarget(null);
          if (created) {
            await refreshProjects();
            // Auto-open the new project in modal so user can add files
            setProjectModalTarget(created.id);
            setProjectModalOpen(true);
          } else {
            await refreshProjects();
          }
        }}
        onOpenChat={async (id) => {
          const restored = await restoreFromHistory(id);
          if (restored) setChat(restored);
        }}
        onNewChatInProject={(pid) => handleNewChat({ projectId: pid })}
        onProjectsChanged={refreshProjects}
      />

      <SettingsPanel
        open={settingsOpen}
        settings={settings}
        onChange={persistSettings}
        onClose={() => setSettingsOpen(false)}
        souls={souls}
        onSoulsChange={setSouls}
        onCreateSoul={async (input) => {
          const soul = await createSoul(input);
          setSouls(await loadSouls());
          return soul;
        }}
        onUpdateSoul={async (id, patch) => {
          await updateSoul(id, patch);
          setSouls(await loadSouls());
        }}
        onDeleteSoul={async (id) => {
          await deleteSoul(id);
          setSouls(await loadSouls());
        }}
      />

      <AddSkillModal
        open={addSkillOpen || !!editingSkill}
        onClose={() => {
          setAddSkillOpen(false);
          setEditingSkill(null);
        }}
        onSave={handleAddSkill}
        editingSkill={editingSkill}
        onUpdate={async (id, updates) => {
          await updateSkill(id, updates);
          setSkills(await loadSkills());
        }}
      />

      <BrowseSkillsModal
        open={browseOpen}
        skills={skills}
        onClose={() => setBrowseOpen(false)}
        onPick={(s) => {
          onPickSkill(s);
          setBrowseOpen(false);
        }}
        onAdd={() => {
          setBrowseOpen(false);
          setAddSkillOpen(true);
        }}
        onDelete={handleDeleteSkill}
        onEdit={(s) => {
          setBrowseOpen(false);
          setEditingSkill(s);
        }}
        onReset={async (id) => {
          await resetSkill(id);
          setSkills(await loadSkills());
        }}
      />

      <SkillArgsModal
        skill={skillArgsFor}
        onClose={() => setSkillArgsFor(null)}
        onConfirm={handleSkillArgsConfirm}
      />

      <MultiTabModal
        open={multiTabOpen}
        selected={extraTabIds}
        onClose={() => setMultiTabOpen(false)}
        onConfirm={(ids) => {
          setExtraTabIds(ids);
          setMultiTabOpen(false);
        }}
      />

      <EditMessageModal
        open={!!editing}
        initial={editing?.content ?? ''}
        onClose={() => setEditing(null)}
        onSave={handleEditAndResend}
      />

      <KnowledgePanel
        open={knowledgePanelOpen}
        onClose={async () => {
          setKnowledgePanelOpen(false);
          const stats = await knowledgeStats();
          setKnowledgeCount(stats.chunks);
          if (stats.chunks > 0) setKnowledgeEnabled(true);
        }}
        apiKey={cfg.apiKey}
        baseUrl={cfg.id === 'gemini' ? cfg.baseUrl : undefined}
      />

      {/* Footer — context ring + provider + cost */}
      <div className="px-3 py-1 text-[10px] text-soft border-t border-border/60 flex items-center justify-between gap-2">
        <ContextRing used={tokensIn} max={getMaxContext(settings)} />
        <span className="truncate opacity-70">
          {cfg.id} · {settings.speed === 'fast' ? cfg.fastModel : cfg.qualityModel}
        </span>
        <span className="tabular-nums shrink-0">{costHint}</span>
      </div>
    </div>
  );
}
