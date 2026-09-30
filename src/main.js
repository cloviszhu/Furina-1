import './style.css';
import { CharacterStage } from './stage.js';
import { SpeechController } from './speech.js';

const $ = id => document.getElementById(id);
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
let stage;
try { stage = new CharacterStage($('viewport'), text => { $('model-state').textContent = text; }); }
catch { $('model-state').textContent = '三维渲染不可用，请检查浏览器 WebGL。'; }
const speech = new SpeechController({ onState: text => { $('speech-state').textContent = text; }, onMouth: value => { if (stage) stage.mouth = value; } });
let status, memorySourceId, providers = [], busy = false;
let contextGeneration = 0;
function resetMemorySource(clearText = false) {
  memorySourceId = null;
  if (clearText) $('memory-text').value = '';
  $('memory-source').textContent = '来源：你的手动记录';
}
function invalidateConversation() {
  ++contextGeneration;
  speech.stop();
  resetMemorySource(true);
  $('messages').replaceChildren();
}
const config = () => ({ provider: $('provider').value, model: $('model-name').value.trim(), baseUrl: $('base-url').value.trim(), apiKey: $('api-key').value });
const speechOptions = () => ({ emotion: $('voice-emotion').value, speed: Number($('voice-speed').value) });
const fail = error => { $('app-error').textContent = error.message || String(error); };

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || '本机请求失败。'); return data;
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
  const rows = await api('/api/history');
  if (generation !== contextGeneration) return;
  $('messages').replaceChildren(); rows.forEach(row => message(row));
  if (memorySourceId && !rows.some(row => row.id === memorySourceId && row.role === 'user')) resetMemorySource(true);
  if (!rows.length) $('messages').append(element('div', 'empty', '今天的故事还没有开始。她会听见你的声音，也会记住你选择留下的片段。'));
}
function updateBudget(budget) {
  $('budget-state').textContent = `人民币 ${budget.limits.cny} 元上限 · 已用 ${budget.usedCalls}/${budget.limits.calls} 次 · 保守预留 ¥${budget.reservedCny.toFixed(4)}。每次最多 ${budget.limits.outputTokens} 输出 token。${budget.pricingCurrent ? '' : '价格核实已过期，远程调用禁用。'}`;
}
async function send(text, remoteTest = false) {
  if (busy || !text.trim()) return;
  busy = true; $('send').disabled = true; $('remote-test').disabled = true; $('app-error').textContent = '';
  speech.stop();
  const generation = contextGeneration;
  try {
    const chosen = config();
    // Ordinary chat never spends remote credit, regardless of settings selection.
    const actual = remoteTest || ['offline', 'ollama'].includes(chosen.provider) || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(chosen.baseUrl)
      ? chosen : { provider: 'offline' };
    if (remoteTest && chosen.provider !== 'deepseek') throw new Error('本輪远程预算只允许 DeepSeek 一次短测试。');
    const result = await api('/api/chat', { method: 'POST', body: JSON.stringify({ text, config: actual, remoteTest }) });
    if (generation !== contextGeneration) return;
    $('messages').querySelector('.empty')?.remove();
    message(result.user); message(result.assistant, result.recalled);
    $('chat-input').value = '';
    $('mode-status').textContent = result.provider === 'offline' ? '本机 · 演示模式' : `本次回复 · ${result.provider}`;
    $('provider-note').textContent = result.provider === 'offline' ? '当前为有限规则演示，尚未接入大模型。' : `此条回复来自 ${result.provider} · ${chosen.model}`;
    if (result.error) fail(result.error);
    updateBudget(result.budget);
    stage?.trigger(result.recalled.length ? 'nod' : 'greet');
    if ($('auto-speak').checked) await speech.speak(result.assistant.text, $('voice-select').value, speechOptions());
    showTab('chat');
  } catch (error) { fail(error); }
  finally { busy = false; $('send').disabled = false; $('remote-test').disabled = false; }
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
  const preferred = list.find(v => v.value === previous && v.localService) || list.find(v => v.engine === 'gpt-sovits') || list.find(v => v.engine === 'windows-sapi' && v.language === '804') || list.find(v => v.engine === 'browser' && v.localService && /zh/i.test(v.language)) || list.find(v => v.localService);
  if (preferred) $('voice-select').value = preferred.value;
  else { $('voice-select').append(element('option', '', '未发现本机声音')); }
  voiceDetails();
}
function voiceDetails() {
  const voice = speech.voices.find(v => v.value === $('voice-select').value);
  const labels = { neutral: '参考原表达', happy: '开心', sad: '难过', angry: '生气', calm: '平静', surprised: '惊讶' };
  $('voice-emotion').replaceChildren();
  for (const emotion of voice?.emotions || ['neutral']) { const option = element('option', '', labels[emotion]); option.value = emotion; $('voice-emotion').append(option); }
  $('voice-emotion').disabled = voice?.engine !== 'gpt-sovits';
  $('voice-speed').disabled = voice?.engine !== 'gpt-sovits';
  $('voice-details').textContent = voice?.engine === 'gpt-sovits'
    ? `本地测试参考：${voice.source} · ${voice.license}。角色相似度待验收；表达来自登记录音。`
    : `${speech.localStatus?.error || '成熟 TTS 可在声音列表选择。'} 当前为系统临时备用声。`;
}
$('voice-select').onchange = () => { speech.stop(); voiceDetails(); };
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
        try { await api(`/api/memories/${row.id}`, { method: 'PATCH', body: JSON.stringify({ text: text.value }) }); await memories(); await refreshHistory(); }
        catch (error) { fail(error); await refreshHistory().catch(fail); }
      };
      card.append(text, save);
    };
    remove.onclick = async () => {
      if (!confirm('删除这条经历及旧聊天上下文？这将防止它被再次引用。')) return;
      invalidateConversation();
      try { await api(`/api/memories/${row.id}`, { method: 'DELETE' }); await memories(); await refreshHistory(); }
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
      const rows = await api('/api/history');
      if (!rows.some(row => row.id === memorySourceId && row.role === 'user')) {
        resetMemorySource(true);
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
