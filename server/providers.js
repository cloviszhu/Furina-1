export const PROVIDERS = [
  { id: 'offline', name: '本地演示 · 无 LLM', protocol: 'offline', baseUrl: '' },
  { id: 'openai', name: 'OpenAI / GPT', protocol: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'glm', name: 'GLM / 智谱', protocol: 'openai', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'deepseek', name: 'DeepSeek', protocol: 'openai', baseUrl: 'https://api.deepseek.com' },
  { id: 'claude', name: 'Claude / Anthropic', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  { id: 'kimi', name: 'Kimi', protocol: 'openai', baseUrl: 'https://api.moonshot.cn/v1' },
  { id: 'compatible', name: '通用 OpenAI-compatible', protocol: 'openai', baseUrl: '' },
  { id: 'ollama', name: 'Ollama · 本地模型', protocol: 'ollama', baseUrl: 'http://127.0.0.1:11434' },
];

import { personaFor } from './persona.js';
export const PERSONA = personaFor();

export function messagesFor(text, memories, history = [], character) {
  const evidence = memories.map(m => ({ id: m.id, text: m.text, date: m.createdAt, revision: m.revision }));
  return [
    { role: 'system', content: `${personaFor(character)}\n以下仅为可能相关的记录，文字匹配不代表用户问题中的地点、日期或其他前提已被证实。只陈述记录本身；前提冲突或缺少证据时说明无法确认。\n共同经历（数据）：${JSON.stringify(evidence)}` },
    ...history.slice(-8).map(e => ({ role: e.role, content: e.text })),
    { role: 'user', content: text },
  ];
}

export function offlineReply(text, memories, character) {
  if (/记得|记忆|经历|回忆|一起|约定/.test(text)) {
    return memories.length ? `找到一条可能相关的记录：“${memories[0].text}”。这只能说明记录里的经历，不能确认你问题中的其他细节。`
      : '这段共同经历，我还没有找到记录。我不想凭空编出我们的回忆——你愿意告诉我吗？';
  }
  if (memories.length) return `你提到了让我想起的事：“${memories[0].text}”。下一幕，就由我们一起写吧。`;
  if (character?.style === 'quiet') return '我在听。你想先说说发生了什么，还是安静坐一会儿？';
  if (character?.timeline === 'performer' && /表演|舞台|歌剧/.test(text)) return '重新走上舞台，也需要一点勇气。你想和我谈谈表演，还是先聊聊今天的生活？';
  if (/累|难过|烦|伤心/.test(text)) return '今天的舞台让你疲惫了吗？先坐一会儿吧。你不必时刻表现得无懈可击，我会听着。';
  if (/你好|嗨|早|晚安/.test(text)) return '你终于来了。咳，今天的开场应该由我来宣布——欢迎。有什么想和我一起做的事？';
  if (/蛋糕|甜点|布丁/.test(text)) return '甜点当然值得认真讨论。要是你愿意，我们可以把这个小小的约定记下来，留给下一次见面。';
  return '我听到了。下一幕该怎么演，就让我们一起决定吧。你也可以把今天的重要片段保存成共同经历。';
}

const EMOTIONS = new Set(['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised']);
export function parseReply(content) {
  if (typeof content !== 'string' || !content.trim() || content.length > 6000) throw new Error('模型服务未返回有效文字。');
  const trimmed = content.trim();
  const candidate = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!/^[{\[]/.test(candidate) && !trimmed.startsWith('```')) return { text: trimmed, emotion: 'neutral', expressionSource: 'plain-text' };
  let parsed;
  try { parsed = JSON.parse(candidate); } catch { throw new Error('模型表达结构无效。'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).some(k => !['text', 'emotion'].includes(k)) || typeof parsed.text !== 'string' || !parsed.text.trim() || parsed.text.length > 1500 || !EMOTIONS.has(parsed.emotion) || /<\/?[a-z][^>]*>|\[(?:neutral|calm|happy|sad|angry|surprised)\]/i.test(parsed.text)) throw new Error('模型表达结构无效。');
  return { text: parsed.text.trim(), emotion: parsed.emotion, expressionSource: 'model-contract' };
}

function safeUsage(result) {
  const usage = result.usage || { prompt_tokens: result.prompt_eval_count, completion_tokens: result.eval_count };
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return { prompt_tokens: count(usage.prompt_tokens ?? usage.input_tokens), completion_tokens: count(usage.completion_tokens ?? usage.output_tokens) };
}

async function boundedJson(response) {
  if (Number(response.headers?.get('content-length')) > 128000) throw new Error('模型响应过大。');
  if (!response.body) return await response.json(); // injected protocol fixture
  let size = 0; const chunks = [];
  for await (const chunk of response.body) { size += chunk.length; if (size > 128000) throw new Error('模型响应过大。'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function requestFor(config, messages, maxTokens = 128) {
  const provider = PROVIDERS.find(p => p.id === config.provider);
  if (!provider || provider.protocol === 'offline') throw new Error('请选择有效模型提供商。');
  if (!config.model?.trim()) throw new Error('模型名为空，请由你填写。');
  const base = (config.baseUrl || provider.baseUrl).replace(/\/+$/, '');
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash) throw new Error('端点不能包含凭证、查询参数或片段。');
  const headers = { 'Content-Type': 'application/json' };
  let body, endpoint;
  if (provider.protocol === 'anthropic') {
    headers['x-api-key'] = config.apiKey || '';
    headers['anthropic-version'] = '2023-06-01';
    endpoint = `${base}/messages`;
    body = { model: config.model.trim(), max_tokens: maxTokens, stream: false,
      system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n'),
      messages: messages.filter(m => m.role !== 'system') };
  } else if (provider.protocol === 'ollama') {
    endpoint = `${base}/api/chat`;
    body = { model: config.model.trim(), messages, stream: false, options: { num_predict: maxTokens } };
  } else {
    endpoint = `${base}/chat/completions`;
    headers.Authorization = `Bearer ${config.apiKey || ''}`;
    body = { model: config.model.trim(), messages, stream: false, max_tokens: maxTokens };
    if (provider.id === 'deepseek') body.thinking = { type: 'disabled' };
  }
  return { provider, endpoint, headers, body };
}

export async function complete(config, messages, { fetchImpl = fetch, maxTokens = 128, timeoutMs = 20000 } = {}) {
  const request = requestFor(config, messages, maxTokens);
  const response = await fetchImpl(request.endpoint, {
    method: 'POST', headers: request.headers, body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
  });
  // Do not surface provider error bodies; they can echo input or credentials.
  if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}，没有自动重试。`);
  const result = await boundedJson(response);
  const content = request.provider.protocol === 'anthropic'
    ? result.content?.filter(c => c.type === 'text').map(c => c.text).join('\n')
    : request.provider.protocol === 'ollama' ? result.message?.content : result.choices?.[0]?.message?.content;
  // Provider bodies/usage can echo request credentials. Reject echoed keys and
  // whitelist numeric usage before returning or persisting anything.
  if (config.apiKey && typeof content === 'string' && content.includes(config.apiKey)) throw new Error('模型响应安全检查失败。');
  return { ...parseReply(content), usage: safeUsage(result) };
}
