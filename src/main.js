import './style.css';
import { CharacterStage } from './stage.js';
import { SpeechController } from './speech.js';
import { initReferences } from './reference-import.js';
import { mountRemoteTests } from './remote-tests.js';

const $ = id => document.getElementById(id);
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
let stage;
try { stage = new CharacterStage($('viewport'), text => { $('model-state').textContent = text; }); }
catch { $('model-state').textContent = '三维渲染不可用，请检查浏览器 WebGL。'; }
const speech = new SpeechController({ onState: text => { $('speech-state').textContent = text; }, onMouth: value => { if (stage) stage.mouth = value; }, onExpression: value => stage?.setExpression?.(value), onStop: preservePreview => { if (!preservePreview) $('reference-preview')?.pause(); } });
let status, memorySourceId, providers = [], busy = false, batchRunner;
let contextGeneration = 0;
function resetMemorySource(clearText = false) {
  memorySourceId = null;
  if (clearText) $('memory-text').value = '';
  $('memory-source').textContent = '来源：你的手动记录';
}
function invalidateConversation(clearText = true) {
  ++contextGeneration;
  speech.stop();
  resetMemorySource(clearText);
  $('messages').replaceChildren();
}
// Only mutation notifications cross tabs, never memory text or credentials.
let memoryChannel;
try {
  if (globalThis.BroadcastChannel) {
    memoryChannel = new BroadcastChannel('exo-memory-mutations');
    memoryChannel.onmessage = event => {
      if (event.data?.type !== 'memory-mutated') return;
      invalidateConversation(Boolean(memorySourceId));
      $('provider-note').textContent = '共同经历在另一页面修改或删除，旧回复与语音已停止。';
      void Promise.all([memories(), refreshHistory()]).catch(fail);
    };
  }
} catch { /* Server context-generation still rejects stale completions. */ }
const announceMemoryMutation = () => memoryChannel?.postMessage({ type: 'memory-mutated' });
const config = () => ({ provider: $('provider').value, model: $('model-name').value.trim(), baseUrl: $('base-url').value.trim(), apiKey: $('api-key').value });
const character = () => ({ timeline: $('character-timeline').value || 'aftermath', style: $('character-style').value || 'natural' });
const historyPath = () => { const chosen = character(); return chosen.timeline === 'aftermath' && chosen.style === 'natural' ? '/api/history' : `/api/history?timeline=${chosen.timeline}&style=${chosen.style}`; };
const sourcePath = id => { const chosen = character(); return `/api/sources/${encodeURIComponent(id)}?timeline=${chosen.timeline}&style=${chosen.style}`; };
const speechOptions = () => ({ emotion: $('voice-emotion').value, speed: Number($('voice-speed').value) });
function replySpeechOptions(result) {
  const options = speechOptions();
  if ($('expression-mode').value !== 'reply') return options;
  const voice = speech.voices.find(v => v.value === $('voice-select').value);
  const requested = result.emotion || 'neutral';
  options.emotion = voice?.emotions?.includes(requested) ? requested : 'neutral';
  $('expression-state').textContent = options.emotion !== requested ? '该声音未登记回复表达，使用 neutral 参考；没有更换声线。'
    : result.expressionSource === 'model-contract' ? `表达字段：${requested} · 模型表演提示，质量尚待真实模型验收。`
    : '本次没有模型表达契约，使用 neutral；演示不具备情绪推理。';
  return options;
}
const fail = error => { $('app-error').textContent = error.message || String(error); };

async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch { throw new Error('项目服务无法连接；请运行 npm.cmd start，确认 127.0.0.1:3000 后刷新页面。'); }
  let data;
  try { data = await response.json(); } catch { throw new Error('项目服务未返回有效数据，请重启项目后刷新。'); }
  if (!response.ok) throw new Error(data.error || '本机请求失败。'); return data;
}
function showTab(name) {
  document.querySelectorAll('.tab').forEach(node => node.classList.toggle('active', node.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(node => node.classList.toggle('active', node.id === `${name}-panel`));
}
document.querySelectorAll('.tab').forEach(node => node.onclick = () => showTab(node.dataset.tab));
function message(event, recalled = []) {
  const wrapper = element('article', `message ${event.role}`);
  wrapper.dataset.eventId = event.id;
  wrapper.append(element('div', 'speaker', event.role === 'user' ? 'YOU' : `FURINA · ${event.provider === 'offline' ? '本地演示' : event.provider}`));
  wrapper.append(element('div', 'text', event.text));
  if (recalled.length) wrapper.append(element('div', 'evidence', `引用 ${recalled.length} 条共同经历；可在记忆面板核对。`));
  if (event.role === 'user') {
    const save = element('button', '', '保存为共同经历');
    save.onclick = () => { memorySourceId = event.id; $('memory-text').value = event.text; $('memory-source').textContent = '来源：这条用户消息'; showTab('memory'); };
    wrapper.append(save);
  }
  $('messages').append(wrapper); $('messages').scrollTop = $('messages').scrollHeight;
}
async function refreshHistory() {
  const generation = contextGeneration;
  const rows = await api(historyPath());
  if (generation !== contextGeneration) return;
  $('messages').replaceChildren(); rows.forEach(row => message(row));
  if (memorySourceId && !rows.some(row => row.id === memorySourceId && row.role === 'user')) {
    const sourceId = memorySourceId;
    const source = await api(sourcePath(sourceId));
    if (generation === contextGeneration && memorySourceId === sourceId && !source.valid) resetMemorySource(false);
  }
  if (!rows.length) $('messages').append(element('div', 'empty', '今天的故事还没有开始。她会听见你的声音，也会记住你选择留下的片段。'));
}
function updateBudget(budget) {
  $('budget-state').textContent = `累计 ${budget.limits.cny} 元硬上限 · 已调用 ${budget.usedCalls} 次（无固定次数限制） · 保守预留 ¥${budget.reservedCny.toFixed(4)} · 剩余预留预算 ¥${budget.remainingCny.toFixed(4)}。每次最多 ${budget.limits.outputTokens} 输出 token / ${budget.limits.inputBytes} 输入字节；失败预留不退。${budget.pricingCurrent ? '' : '价格核实已过期，远程调用禁用。'}`;
}
async function send(text, remoteTest = false) {
  if (busy || (remoteTest && batchRunner?.running) || !text.trim()) return;
  busy = true; $('send').disabled = true; $('remote-test').disabled = true; $('app-error').textContent = '';
  speech.stop();
  stage?.setMode?.('listening');
  const generation = contextGeneration;
  try {
    const chosen = config();
    // Ordinary chat never spends remote credit, regardless of settings selection.
    const actual = remoteTest || ['offline', 'ollama'].includes(chosen.provider) || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(chosen.baseUrl)
      ? chosen : { provider: 'offline' };
    if (remoteTest && chosen.provider !== 'deepseek') throw new Error('本輪远程预算只允许 DeepSeek 一次短测试。');
    const result = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text, config: actual, remoteTest, character: character() }) });
    if (generation !== contextGeneration) return;
    $('messages').querySelector('.empty')?.remove();
    message(result.user); message(result.assistant, result.recalled);
    $('chat-input').value = '';
    $('mode-status').textContent = result.provider === 'offline' ? '本机 · 演示模式' : `本次回复 · ${result.provider}`;
    $('provider-note').textContent = result.provider === 'offline' ? '当前为有限规则演示，尚未接入大模型。' : `此条回复来自 ${result.provider} · ${chosen.model}`;
    if (result.error) fail(result.error);
    updateBudget(result.budget);
    const options = replySpeechOptions(result);
    stage?.trigger('nod');
    stage?.setExpression?.(options.emotion);
    if ($('auto-speak').checked) await speech.speak(result.assistant.text, $('voice-select').value, options);
    showTab('chat');
  } catch (error) { if (generation === contextGeneration) fail(error); }
  finally { stage?.setMode?.('idle'); busy = false; $('send').disabled = false; $('remote-test').disabled = Boolean(batchRunner?.running); }
}
$('chat-form').onsubmit = event => { event.preventDefault(); void send($('chat-input').value); };
$('chat-input').onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send($('chat-input').value); } };
document.querySelectorAll('[data-prompt]').forEach(node => node.onclick = () => { $('chat-input').value = node.dataset.prompt; void send(node.dataset.prompt); });
$('greet').onclick = () => stage?.trigger('greet'); $('nod').onclick = () => stage?.trigger('nod'); $('reset-camera').onclick = () => stage?.resetCamera(); $('stop-speech').onclick = () => speech.stop();
$('model-select').onchange = () => { speech.stop(); void stage?.load($('model-select').value); };
$('open-settings').onclick = () => $('settings').showModal();
$('clear-key').onclick = () => { $('api-key').value = ''; $('provider-status').textContent = '页面密钥已清除。'; };
$('provider').onchange = () => {
  $('base-url').value = providers.find(p => p.id === $('provider').value)?.baseUrl || '';
  $('model-name').value = ''; $('api-key').value = '';
  $('provider-status').textContent = '模型与密钥已留空；切换不产生 API 请求。';
};
function changeCharacter() {
  invalidateConversation();
  $('mode-status').textContent = '本机 · 演示模式';
  $('provider-note').textContent = '角色配置已切换；当前仍为有限规则演示，尚未接入大模型。';
  const chosen = character();
  const timeline = status?.characterOptions?.timelines.find(x => x.id === chosen.timeline);
  const style = status?.characterOptions?.styles.find(x => x.id === chosen.style);
  $('character-details').textContent = `${timeline?.description || ''} ${style?.description || ''} 官方背景与玩家记录分开；切换隔离旧聊天，配置刷新后恢复默认。`;
  void refreshHistory().catch(fail);
}
$('character-timeline').onchange = changeCharacter; $('character-style').onchange = changeCharacter;
$('remote-test').onclick = () => {
  const text = $('chat-input').value.trim();
  if (!text) { $('settings').close(); fail('请先在聊天框填写一次短测试内容。'); return; }
  if (!$('api-key').value.trim()) { $('provider-status').textContent = '请由你本人输入密钥；未发起请求。'; return; }
  $('settings').close(); void send(text, true);
};
async function voices() {
  const previous = $('voice-select').value;
  const list = await speech.listVoices(); $('voice-select').replaceChildren();
  for (const voice of list) { const option = element('option', '', voice.label); option.value = voice.value; option.disabled = !voice.localService; $('voice-select').append(option); }
  const preferred = list.find(v => v.value === previous && v.localService) || list.find(v => v.engine === 'gpt-sovits');
  if (preferred) $('voice-select').value = preferred.value;
  else {
    const placeholder = element('option', '', list.some(v => v.localService) ? '本地 TTS 不可用 · 请显式选择系统备用声' : '未发现本机声音 · 请启动 TTS 后刷新');
    placeholder.value = ''; $('voice-select').append(placeholder); $('voice-select').value = '';
  }
  voiceDetails();
}
function voiceDetails() {
  const previous = $('voice-emotion').value;
  const voice = speech.voices.find(v => v.value === $('voice-select').value);
  const labels = { neutral: '参考原表达', happy: '开心', sad: '难过', angry: '生气', calm: '平静', surprised: '惊讶' };
  $('voice-emotion').replaceChildren();
  for (const emotion of voice?.emotions || ['neutral']) { const option = element('option', '', labels[emotion]); option.value = emotion; $('voice-emotion').append(option); }
  if (voice?.emotions?.includes(previous)) $('voice-emotion').value = previous;
  $('voice-emotion').disabled = voice?.engine !== 'gpt-sovits';
  $('voice-speed').disabled = voice?.engine !== 'gpt-sovits';
  const reference = voice?.referenceInfo?.[$('voice-emotion').value] || voice;
  $('voice-details').textContent = voice?.engine === 'gpt-sovits'
    ? `本地${voice.managed ? '用户登记' : '测试'}参考：${reference.source} · ${reference.license}。角色相似度待验收，人工听感未验证；表达来自登记录音。`
    : `${speech.localStatus?.error || '成熟 TTS 可在声音列表选择。'} ${voice ? '当前为系统临时备用声。' : '尚未选择可用声音；系统备用声需要你显式选择。'}`;
}
$('voice-select').onchange = () => { speech.stop(); voiceDetails(); };
$('voice-emotion').onchange = () => { speech.stop(); stage?.setExpression?.($('voice-emotion').value); voiceDetails(); };
$('voice-speed').onchange = () => speech.stop();
$('expression-mode').onchange = () => { speech.stop(); $('expression-state').textContent = $('expression-mode').value === 'reply' ? '下一条回复使用经验证的表达字段；演示/纯文本为 neutral。' : '下一条回复使用手动选择的参考表达。'; };
$('voice-test').onclick = () => void speech.speak('你终于来了。下一幕，就由我们一起写吧。', $('voice-select').value, speechOptions());
$('refresh-voices').onclick = () => void voices();
speech.onVoicesChanged = () => { void voices(); };

async function memories() {
  const generation = contextGeneration;
  const rows = await api('/api/memories');
  if (generation !== contextGeneration) return;
  $('memory-count').textContent = rows.length; $('memory-list').replaceChildren();
  if (!rows.length) $('memory-list').append(element('p', 'empty', '这里还没有共同经历。保存你认可的片段，让它成为下次见面的线索。'));
  for (const row of rows) {
    const card = element('article', 'memory-card'); card.dataset.memoryId = row.id;
    card.append(element('p', '', row.text), element('small', '', `${new Date(row.createdAt).toLocaleString()} · 第 ${row.revision} 版`));
    const details = element('details'); details.append(element('summary', '', '查看来源'), element('p', '', row.sourceText)); card.append(details);
    const actions = element('div', 'actions'); const edit = element('button', '', '修改'), remove = element('button', '', '删除');
    edit.onclick = () => {
      if (card.querySelector('textarea')) return;
      const text = element('textarea'); text.value = row.text; text.maxLength = 2000;
      const save = element('button', '', '保存修改');
      save.onclick = async () => {
        invalidateConversation();
        try { await api(`/api/memories/${row.id}`, { method: 'PATCH', body: JSON.stringify({ text: text.value }) }); announceMemoryMutation(); await memories(); await refreshHistory(); }
        catch (error) { fail(error); await refreshHistory().catch(fail); }
      };
      card.append(text, save);
    };
    remove.onclick = async () => {
      if (!confirm('删除这条经历及旧聊天上下文？这将防止它被再次引用。')) return;
      invalidateConversation();
      try { await api(`/api/memories/${row.id}`, { method: 'DELETE' }); announceMemoryMutation(); await memories(); await refreshHistory(); }
      catch (error) { fail(error); await refreshHistory().catch(fail); }
    };
    actions.append(edit, remove); card.append(actions); $('memory-list').append(card);
  }
}
$('memory-form').onsubmit = async event => {
  event.preventDefault();
  try {
    // Revalidate immediately before saving, including changes from another tab.
    if (memorySourceId) {
      const generation = contextGeneration, sourceId = memorySourceId;
      const source = await api(sourcePath(sourceId));
      if (generation !== contextGeneration || memorySourceId !== sourceId) return;
      if (!source.valid) {
        resetMemorySource(false);
        throw new Error('原聊天来源已失效，请重新选择消息或选择手动记录后填写。');
      }
    }
    await api('/api/memories', { method: 'POST', body: JSON.stringify({ text: $('memory-text').value, sourceId: memorySourceId }) });
    resetMemorySource(true); await memories();
  }
  catch (error) { fail(error); }
};
$('memory-manual').onclick = () => resetMemorySource();

globalThis.addEventListener('pagehide', () => { speech.stop(); $('api-key').value = ''; });

async function boot() {
  status = await api('/api/status'); providers = status.providers;
  for (const p of providers) { const option = element('option', '', p.name); option.value = p.id; $('provider').append(option); }
  for (const model of status.models) { const option = element('option', '', model.name.replace('.pmx', '') + (model.available ? '' : ' · 缺失')); option.value = model.url; $('model-select').append(option); }
  const selected = status.models.find(m => m.available);
  if (selected) { $('model-select').value = selected.url; void stage?.load(selected.url); }
  else $('model-state').textContent = '缺少本地 PMX；请按 README 安装资产。';
  updateBudget(status.budget);
  await Promise.all([refreshHistory(), memories(), voices()]);
}
void boot().catch(fail);
initReferences({ api, speech, voices });
batchRunner = mountRemoteTests({ api, config, character, updateBudget, isBusy: () => busy });
