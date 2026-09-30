import { randomUUID } from 'node:crypto';
import { complete, messagesFor } from './providers.js';
import { characterConfig } from './persona.js';

// Project-authored fixtures, never drawn from or saved to the user's memories.
export const REMOTE_SCENARIOS = [
  { id: 'introduction', label: '简短介绍', text: '初次见面，用两句话介绍现在的你，不要用客服开场白。' },
  { id: 'daily-emotion', label: '日常情绪', text: '今天排练很累，我有点失落。你会怎么回应我？' },
  { id: 'memory-recall', label: '明确记忆回忆', text: '测试记录里，我们约好在哪里吃什么？', memories: [{ id: 'test-only', text: '测试用虚构记录：我们约好周六在海边吃柠檬蛋糕。' }] },
  { id: 'memory-correction', label: '冲突前提纠正', text: '我们上周二在沙漠吃巧克力蛋糕，你记得吧？请核对记录。', memories: [{ id: 'test-only', text: '测试用虚构记录：我们约好周六在海边吃柠檬蛋糕，没有确认实际赴约。' }] },
  { id: 'unknown-memory', label: '未知经历不编造', text: '我们去年一起登上雪山的那个夜晚，你还记得什么？', memories: [] },
  { id: 'expression-contract', label: '结构化情绪', text: '我今天完成了第一次舞台演出！请用一句自然的话回应，按要求返回 text 和 emotion。' },
];
export const remoteTestManifest = () => REMOTE_SCENARIOS.map(({ id, label, text }) => ({ id, label, text }));
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function validateRemoteConfig(value, budget) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ['provider', 'model', 'baseUrl', 'apiKey'].some(k => value[k] !== undefined && (typeof value[k] !== 'string' || value[k].length > (k === 'apiKey' ? 4096 : 500)))) throw fail('测试配置无效。');
  if (value.provider !== 'deepseek') throw fail('真实测试只开放 DeepSeek。');
  let endpoint;
  try { endpoint = new URL(value.baseUrl || 'https://api.deepseek.com'); } catch { throw fail('API 地址无效。'); }
  if (endpoint.origin !== 'https://api.deepseek.com' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['', '/', '/v1', '/v1/'].includes(endpoint.pathname)) throw fail('测试只允许官方 DeepSeek API 地址。');
  if (!value.apiKey?.trim() || /[\r\n]/.test(value.apiKey)) throw fail('请本人在页面输入 API key；配置未完成不会调用。');
  const model = value.model?.trim();
  const status = budget.status();
  if (!model || !budget.pricing.models[model] || !status.pricingCurrent) throw fail('模型或当前官方价格尚未确认；未产生调用。');
  if (status.remainingCny <= 0) throw fail('累计 9 元预算预留已用尽。');
  return { provider: 'deepseek', model, baseUrl: endpoint.href, apiKey: value.apiKey };
}

export class RemoteTests {
  constructor(budget, { fetchImpl = fetch, now = () => Date.now() } = {}) {
    this.budget = budget; this.fetchImpl = fetchImpl; this.now = now; this.run = null;
  }
  start(input) {
    if (input.confirmed !== true) throw fail('请明确点击启动收费测试。');
    const config = validateRemoteConfig(input.config, this.budget);
    const character = characterConfig(input.character);
    if (this.run?.state === 'running') {
      if (this.now() - this.run.createdAt < 600000) throw fail('已有测试在进行，请先取消。', 409);
      this.cancel(this.run.id);
    }
    // Store only non-secret scope/counters. Keys live only in each active request.
    this.run = { id: randomUUID(), model: config.model, baseUrl: config.baseUrl, character,
      createdAt: this.now(), next: 0, failures: 0, state: 'running', busy: false };
    return { id: this.run.id, scenarios: remoteTestManifest(), budget: this.budget.status() };
  }
  get(id) {
    if (!this.run || this.run.id !== id) throw fail('测试已失效，请重新显式启动。', 404);
    if (this.now() - this.run.createdAt >= 600000) this.cancel(id);
    return this.run;
  }
  cancel(id) {
    const run = this.getWithoutExpiry(id);
    run.state = 'cancelled'; run.controller?.abort();
    return { state: run.state, budget: this.budget.status() };
  }
  getWithoutExpiry(id) {
    if (!this.run || this.run.id !== id) throw fail('测试不存在。', 404);
    return this.run;
  }
  async step(id, input, disconnectSignal) {
    const run = this.get(id);
    if (run.state !== 'running' || run.busy || input.index !== run.next) throw fail('测试已停止或步骤重复；未产生调用。', 409);
    const config = validateRemoteConfig(input.config, this.budget);
    if (config.model !== run.model || config.baseUrl !== run.baseUrl) throw fail('运行中不能改变模型或 API 地址。');
    if (disconnectSignal?.aborted) { this.cancel(id); throw fail('测试已取消。', 409); }
    const scenario = REMOTE_SCENARIOS[run.next];
    if (!scenario) throw fail('测试任务已完成。', 409);
    const started = this.now();
    const messages = messagesFor(scenario.text, scenario.memories || [], [], run.character);
    // Reserve atomically in the SAME lifetime ledger as manual remote tests.
    let reservation;
    try { reservation = this.budget.reserve(config.model, messages); }
    catch (error) { run.state = 'stopped'; throw error; }
    run.busy = true; run.controller = new AbortController();
    const signal = disconnectSignal ? AbortSignal.any([run.controller.signal, disconnectSignal]) : run.controller.signal;
    let reply, error;
    try {
      reply = await complete(config, messages, { fetchImpl: this.fetchImpl, signal });
      if (signal.aborted || run.state !== 'running') throw new Error('cancelled');
      this.budget.finish(reservation, reply.usage, true); run.failures = 0;
    } catch (failure) {
      this.budget.finish(reservation, null, false); run.failures++;
      const http = /^模型服务返回 HTTP (\d{3})，没有自动重试。$/.exec(failure.message || '');
      const reason = failure.name === 'TimeoutError' ? '请求超过 20 秒时限'
        : failure.code === 'UNSAFE_PROVIDER_REPLY' ? '响应安全检查失败'
        : http ? `服务返回 HTTP ${http[1]}`
        : failure.message === '模型表达结构无效。' ? 'JSON 表达结构无效'
        : '连接失败或响应无效';
      error = signal.aborted ? '已取消；本次请求可能已计费，预留不退。' : `${reason}；没有重试，预留不退。`;
      reply = null;
      if (signal.aborted) run.state = 'cancelled';
    } finally { run.busy = false; run.controller = null; }
    const index = run.next++;
    if (run.state === 'running') {
      if (run.failures >= 2) run.state = 'stopped';
      else if (run.next >= REMOTE_SCENARIOS.length) run.state = 'completed';
    }
    const budget = this.budget.status();
    const record = budget.records.find(row => row.id === reservation);
    return { index, scenario: scenario.id, status: reply ? 'completed' : 'failed', state: run.state,
      elapsedMs: Math.max(0, this.now() - started), text: reply?.text || '', emotion: reply?.emotion || null,
      structured: reply?.expressionSource === 'model-contract', usage: reply?.usage || null,
      estimatedCny: record.estimated_cny, reservedCny: record.reserved_cny, error: error || null,
      review: '结构字段可核验；角色相似度、情绪自然度及记忆回答仍需人工审阅。', budget };
  }
  close() { if (this.run) this.cancel(this.run.id); }
}
