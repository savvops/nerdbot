import http from 'node:http';
import os from 'node:os';
import { WebSocketServer, WebSocket } from 'ws';
import { mobileRoutes } from './mobile-routes.mjs';
import { randomUUID } from 'node:crypto';

const PORT = 3030;

// Get preferred LAN IP address (prioritizing Wi-Fi / 192.168.40.x)
function getLocalIp() {
  const nets = os.networkInterfaces();
  let fallback = 'localhost';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wlan')) {
          return net.address;
        }
        if (net.address.startsWith('192.168.') && !net.address.startsWith('192.168.56.')) {
          return net.address;
        }
        fallback = net.address;
      }
    }
  }
  return fallback;
}

const localIp = getLocalIp();

// State
let braveSocket = null;
let braveActiveTab = null;
let braveSettings = null;
const mobileSockets = new Set();
const pendingRequests = new Map();
function requestExtension(type, payload) {
  return new Promise((resolve, reject) => {
    if (!braveSocket || braveSocket.readyState !== WebSocket.OPEN) return reject(new Error('PC extension is disconnected. Open Nerdbot in Brave.'));
    const requestId = randomUUID();
    const timeout = setTimeout(() => { pendingRequests.delete(requestId); reject(new Error('PC extension did not reply. Reload the updated Nerdbot extension in Brave.')); }, 12000);
    pendingRequests.set(requestId, (data) => { clearTimeout(timeout); resolve(data); });
    braveSocket.send(JSON.stringify({ type, payload, requestId }));
  });
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  if (await mobileRoutes(req, res, braveSettings, requestExtension)) return;
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        braveConnected: !!braveSocket && braveSocket.readyState === WebSocket.OPEN,
        activeTab: braveActiveTab,
        localIp,
        hasSettings: !!braveSettings,
        activeProvider: braveSettings?.activeProvider || braveSettings?.activeProviderId || null,
      })
    );
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket Server
const wss = new WebSocketServer({ server });

// MV3 workers suspend after 30 seconds without activity. Application messages
// (not protocol ping frames) keep the existing browser connection alive.
const heartbeat = setInterval(() => {
  if (braveSocket?.readyState === WebSocket.OPEN) braveSocket.send(JSON.stringify({ type: 'KEEPALIVE' }));
}, 20000);
heartbeat.unref();
wss.on('close', () => clearInterval(heartbeat));

function broadcastToMobiles(msg) {
  const data = typeof msg === 'string' ? msg : JSON.stringify(msg);
  for (const client of mobileSockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws, req) => {
  let clientRole = 'unknown';

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Handshake
      if (msg.type === 'IDENTIFY') {
        clientRole = msg.role;
        if (clientRole === 'brave') {
          braveSocket = ws;
          if (msg.settings) braveSettings = msg.settings;
          if (msg.activeTab) braveActiveTab = msg.activeTab;
          console.log('✅ [Bridge] Brave extension connected');
          broadcastToMobiles({
            type: 'BRAVE_STATUS',
            connected: true,
            activeTab: braveActiveTab,
            settingsSummary: braveSettings
              ? {
                  activeProviderId: braveSettings.activeProvider || braveSettings.activeProviderId,
                  mode: braveSettings.speed || braveSettings.mode,
                }
              : null,
          });
        } else if (clientRole === 'mobile') {
          mobileSockets.add(ws);
          console.log('📱 [Bridge] Mobile client connected');
          ws.send(
            JSON.stringify({
              type: 'BRAVE_STATUS',
              connected: !!braveSocket && braveSocket.readyState === WebSocket.OPEN,
              activeTab: braveActiveTab,
              settingsSummary: braveSettings
                ? {
                    activeProviderId: braveSettings.activeProvider || braveSettings.activeProviderId,
                    mode: braveSettings.speed || braveSettings.mode,
                  }
                : null,
            })
          );
        }
        return;
      }

      // Messages from Brave
      if (clientRole === 'brave') {
        if (['BROWSER_REPLY', 'PAGE_CONTEXT_REPLY'].includes(msg.type) && pendingRequests.has(msg.requestId)) {
          pendingRequests.get(msg.requestId)(msg.type === 'BROWSER_REPLY' ? msg.result : msg.data);
          pendingRequests.delete(msg.requestId);
          return;
        }
        if (msg.type === 'TAB_CHANGED') {
          braveActiveTab = msg.tab;
          broadcastToMobiles({
            type: 'TAB_CHANGED',
            tab: braveActiveTab,
          });
        } else if (msg.type === 'SETTINGS_UPDATED') {
          braveSettings = msg.settings;
          broadcastToMobiles({
            type: 'SETTINGS_UPDATED',
            settingsSummary: {
              activeProviderId: braveSettings.activeProvider || braveSettings.activeProviderId,
              mode: braveSettings.speed || braveSettings.mode,
            },
          });
        } else if (msg.type === 'PAGE_CONTEXT_REPLY') {
          // Forward response to the mobile client that asked
          broadcastToMobiles({
            type: 'PAGE_CONTEXT_REPLY',
            requestId: msg.requestId,
            data: msg.data,
          });
        }
        return;
      }

      // Messages from Mobile
      if (clientRole === 'mobile') {
        if (msg.type === 'REQUEST_PAGE_CONTEXT') {
          if (braveSocket && braveSocket.readyState === WebSocket.OPEN) {
            braveSocket.send(
              JSON.stringify({
                type: 'GET_PAGE_CONTEXT',
                requestId: msg.requestId,
              })
            );
          } else {
            ws.send(
              JSON.stringify({
                type: 'PAGE_CONTEXT_REPLY',
                requestId: msg.requestId,
                data: { error: 'Brave is not currently connected to bridge' },
              })
            );
          }
        } else if (msg.type === 'CHAT_STREAM') {
          // Stream chat through the PC's provider!
          handleChatStream(ws, msg);
        }
      }
    } catch (e) {
      console.error('[Bridge] Error handling message:', e);
    }
  });

  ws.on('close', () => {
    if (ws === braveSocket) {
      console.log('❌ [Bridge] Brave extension disconnected');
      braveSocket = null;
      braveActiveTab = null;
      broadcastToMobiles({
        type: 'BRAVE_STATUS',
        connected: false,
        activeTab: null,
      });
    }
    mobileSockets.delete(ws);
  });
});

// AI Chat Completion Handler on the PC (uses Brave's configured keys/Ollama)
async function handleChatStream(mobileWs, req) {
  const { requestId, messages, systemPrompt, customSettings } = req;
  const settings = customSettings || braveSettings;

  if (!settings) {
    mobileWs.send(
      JSON.stringify({
        type: 'CHAT_ERROR',
        requestId,
        error: 'No AI settings found. Open Nerdbot in Brave first or configure keys.',
      })
    );
    return;
  }

  const providerId = settings.activeProvider || settings.activeProviderId || 'gemini';
  const providerConfig = settings.providers?.[providerId];

  if (!providerConfig) {
    mobileWs.send(
      JSON.stringify({
        type: 'CHAT_ERROR',
        requestId,
        error: `Provider "${providerId}" is not configured.`,
      })
    );
    return;
  }

  const isQuality = (settings.speed || settings.mode) === 'quality';
  const model = isQuality ? providerConfig.qualityModel : providerConfig.fastModel;

  try {
    if (providerId === 'gemini') {
      await streamGemini(mobileWs, requestId, providerConfig, model, systemPrompt, messages);
    } else if (providerId === 'anthropic') {
      await streamAnthropic(mobileWs, requestId, providerConfig, model, systemPrompt, messages);
    } else {
      // OpenAI / OpenRouter / Ollama / LM Studio (OpenAI-compatible)
      await streamOpenAICompatible(mobileWs, requestId, providerConfig, model, systemPrompt, messages);
    }
    mobileWs.send(JSON.stringify({ type: 'CHAT_DONE', requestId }));
  } catch (err) {
    mobileWs.send(JSON.stringify({ type: 'CHAT_ERROR', requestId, error: err.message }));
  }
}

async function streamGemini(ws, requestId, cfg, model, systemPrompt, messages) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/models/${encodeURIComponent(
    model
  )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cfg.apiKey)}`;

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };
  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini error (${resp.status}): ${errText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const json = JSON.parse(dataStr);
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          ws.send(JSON.stringify({ type: 'CHAT_DELTA', requestId, text }));
        }
      } catch {
        /* skip */
      }
    }
  }
}

async function streamOpenAICompatible(ws, requestId, cfg, model, systemPrompt, messages) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const formattedMsgs = [];
  if (systemPrompt) {
    formattedMsgs.push({ role: 'system', content: systemPrompt });
  }
  for (const m of messages) {
    formattedMsgs.push({ role: m.role, content: m.content });
  }

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.apiKey) {
    headers['Authorization'] = `Bearer ${cfg.apiKey}`;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: formattedMsgs,
      stream: true,
      temperature: 0.7,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI error (${resp.status}): ${errText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      if (!dataStr || dataStr === '[DONE]') continue;
      try {
        const json = JSON.parse(dataStr);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          ws.send(JSON.stringify({ type: 'CHAT_DELTA', requestId, text: delta }));
        }
      } catch {
        /* skip */
      }
    }
  }
}

async function streamAnthropic(ws, requestId, cfg, model, systemPrompt, messages) {
  const url = `${cfg.baseUrl.replace(/\/$/, '')}/messages`;
  const formattedMsgs = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: formattedMsgs,
      stream: true,
      max_tokens: 2048,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic error (${resp.status}): ${err}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const dataStr = line.slice(6).trim();
      try {
        const json = JSON.parse(dataStr);
        if (json.type === 'content_block_delta' && json.delta?.text) {
          ws.send(JSON.stringify({ type: 'CHAT_DELTA', requestId, text: json.delta.text }));
        }
      } catch {
        /* skip */
      }
    }
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
============================================================
🤖 NERDBOT PC BRIDGE RUNNING!
------------------------------------------------------------
• Local:   http://localhost:${PORT}
• Network: http://${localIp}:${PORT}
• WS URL:  ws://${localIp}:${PORT}

📱 On your phone in Nerdbot Mobile:
Connect to: ${localIp}:${PORT}
============================================================
`);
});
