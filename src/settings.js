export const SETTINGS_KEY = 'project-exo.settings';
export const SETTINGS_VERSION = 2;
const providers = ['offline', 'openai', 'glm', 'deepseek', 'claude', 'kimi', 'compatible', 'ollama'];
const emotions = ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'];
const defaults = { provider: 'offline', credentialSource: 'input', model: '', baseUrl: '', voice: '', emotion: 'neutral', speed: 1, timeline: 'aftermath', style: 'natural', expressionMode: 'manual' };
const member = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const secretLike = value => /(?:sk[-_]|api[-_]?key|bearer|password|token=)/i.test(value);
export function cleanSettings(value, secret = '') {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const safeText = text => typeof text === 'string' && !secretLike(text) && !(secret && text.includes(secret));
  let baseUrl = '';
  if (safeText(input.baseUrl) && input.baseUrl.length <= 500) {
    try {
      const url = new URL(input.baseUrl);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && ['/', '/v1', '/v1/', '/api', '/api/', '/api/paas/v4'].includes(url.pathname)) baseUrl = url.href;
    } catch { /* Invalid or credential-bearing endpoints are never persisted. */ }
  }
  return {
    provider: member(input.provider, providers, defaults.provider),
    credentialSource: member(input.credentialSource, ['input', 'saved'], 'input'),
    model: safeText(input.model) && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,99}$/.test(input.model) ? input.model : '',
    baseUrl,
    // Stable project profile ids only. Browser numeric indexes are not identities.
    voice: safeText(input.voice) && /^neural:[a-z0-9][a-z0-9_-]{0,39}$/.test(input.voice) ? input.voice : '',
    emotion: member(input.emotion, emotions, defaults.emotion),
    speed: typeof input.speed === 'number' && Number.isFinite(input.speed) && input.speed >= 0.7 && input.speed <= 1.3 ? input.speed : 1,
    timeline: member(input.timeline, ['aftermath', 'performer'], defaults.timeline),
    style: member(input.style, ['natural', 'theatrical', 'quiet'], defaults.style),
    expressionMode: member(input.expressionMode, ['manual', 'reply'], defaults.expressionMode),
  };
}
export function loadSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...defaults };
    if (raw.length > 8000) throw Error();
    const data = JSON.parse(raw);
    if (![1, SETTINGS_VERSION].includes(data?.version)) throw Error();
    const settings = cleanSettings(data.settings); // v1 migrates only recognized fields
    storage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings }));
    return settings;
  } catch {
    try { storage.removeItem(SETTINGS_KEY); } catch { /* Storage disabled. */ }
    return { ...defaults };
  }
}
export function saveSettings(storage, value, secret = '') {
  const settings = cleanSettings(value, secret);
  try { storage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings })); return true; }
  catch { return false; }
}
