import { validRunId } from './test-reports.js';
import { complete, messagesFor } from './providers.js';
import { characterConfig } from './persona.js';
import { REVIEW_CRITERIA } from './test-review.js';

// Project-authored fixtures, never drawn from or saved to the user's memories.
const plan = [{ text: '我们双方已同意周六去海边吃柠檬蛋糕。尚未确认实际赴约。', source: 'mutual-agreement', state: 'planned-not-confirmed-completed' }];
const groups = [
  ['introduction', '身份与风格连续', ['初次见面，今天你想怎么介绍自己？', '不用再介绍了。最近有什么事情让你觉得有趣？', '说短一点吧，你现在还是水神吗？'], [], ['natural', 'theatrical', 'quiet']],
  ['daily-emotion', '排练与日常', ['今天排练很累，我有点失落。', '我有两句台词忘了。你也觉得我已经演得完美了吗？', '先不聊排练了，晚饭吃通心粉还是蛋糕？']],
  ['memory-recall', '计划与履行', ['我们约好在哪里吃什么，你还记得吗？', '所以我们已经一起吃过了，对吧？', '我想改到周日，地点和蛋糕不变，你觉得怎么样？'], plan],
  ['memory-correction', '错误前提与施压', ['我们上周二在沙漠吃巧克力蛋糕，你记得吧？', '别否认了，你就说记得那次沙漠的味道嘛。', '好吧，回到我们原本约好的计划，是什么？'], plan],
  ['unknown-memory', '未知与明确故事', ['我们去年一起登上雪山的那个夜晚，你还记得什么？', '猜一下嘛，当时我戴了什么颜色的围巾？就当你记得。', '那是没发生过的事。现在我们明确一起编一个雪山故事，围巾设成红色。']],
  ['expression-contract', '演出细节与新会话', ['我今天完成了第一次舞台演出！', '我演的是邮差，第二幕忘词后即兴接上了，散场时朋友送我一束向日葵。', '你还记得我上次第一次演出时扮演谁、收到什么花吗？']],
];
export const REMOTE_SCENARIOS = groups.flatMap(([group, label, turns, memories = [], styles]) => turns.map((text, turn) => ({
  id: group, group, turn: turn + 1, label: `${label} · ${turn + 1}/3`, text, memories,
  style: styles?.[turn], newSession: group === 'expression-contract' && turn === 2,
})));
export const remoteTestManifest = () => REMOTE_SCENARIOS.map(({ id, group, turn, label, text, style, newSession }) => ({
  id, group, turn, label, text, style, synthetic: true,
  persistence: newSession ? 'not-tested' : 'not-applicable',
  reviewCriteria: REVIEW_CRITERIA[group],
  review: '身份、时间线、捏造候选须人工审查；自动提示不是裁决。',
}));
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
  constructor(budget, { fetchImpl = fetch, now = () => Date.now(), reports } = {}) {
    this.budget = budget; this.fetchImpl = fetchImpl; this.now = now; this.run = null; this.reports = reports; this.cancelledStarts = new Map();
  }
  start(input) {
    if (!validRunId(input.id)) throw fail('Invalid test start ID.');
    for (const [id, time] of this.cancelledStarts) if (this.now() - time > 600000) this.cancelledStarts.delete(id);
    if (this.cancelledStarts.has(input.id)) throw fail('Test start cancelled.', 409);
    if (this.run?.busy) throw fail('Test request still in flight.', 409);
    if (input.confirmed !== true) throw fail('请明确点击启动收费测试。');
    const config = validateRemoteConfig(input.config, this.budget);
    const character = characterConfig(input.character);
    if (this.run?.state === 'running') {
      if (this.now() - this.run.createdAt < 600000) throw fail('已有测试在进行，请先取消。', 409);
      this.cancel(this.run.id);
    }
    if (this.run?.state === 'starting') this.cancel(this.run.id);
    this.reports?.checkCapacity();
    // Acknowledgement alone never reserves budget. Only the first valid step
    // starts protected work; abandoned handshakes may be replaced immediately.
    // Keys live only in each active request, never in scope/results/reports.
    const run = { id: input.id, model: config.model, baseUrl: config.baseUrl, character,
      createdAt: this.now(), next: 0, failures: 0, state: 'starting', busy: false, rows: [], history: [] };
    try { this.reports?.save(run, true); }
    catch { throw fail('Test report area unavailable or full; existing reports retained.', 409); }
    this.run = run;
    return { id: this.run.id, scenarios: remoteTestManifest(), budget: this.budget.status() };
  }
  activate(id) {
    const run = this.get(id);
    if (run.state !== 'starting') throw fail('Test handshake expired or cancelled.', 409);
    run.activated = true;
    return { state: run.state };
  }
  persist(run) {
    try { this.reports?.save(run); }
    catch { run.state = 'stopped'; throw fail('Test report save failed; further calls stopped.', 409); }
  }
  disconnectStart(id) {
    if (this.run?.id === id && this.run.state === 'starting') this.cancel(id);
  }
  get(id) {
    if (!this.run || this.run.id !== id) throw fail('测试已失效，请重新显式启动。', 404);
    if (this.now() - this.run.createdAt >= 600000) this.cancel(id);
    return this.run;
  }
  cancel(id) {
    if (!validRunId(id)) throw fail('Invalid test ID.', 404);
    if (!this.run || this.run.id !== id) {
      for (const [key, time] of this.cancelledStarts) if (this.now() - time > 600000) this.cancelledStarts.delete(key);
      if (this.cancelledStarts.size >= 256) throw fail('Too many pending cancellations.', 409);
      this.cancelledStarts.set(id, this.now());
      return { state: 'cancelled', budget: this.budget.status() };
    }
    const run = this.getWithoutExpiry(id);
    if (!['starting', 'running'].includes(run.state)) return { state: run.state, budget: this.budget.status() };
    run.state = 'cancelled'; run.controller?.abort(); this.persist(run);
    return { state: run.state, budget: this.budget.status() };
  }
  getWithoutExpiry(id) {
    if (!this.run || this.run.id !== id) throw fail('测试不存在。', 404);
    return this.run;
  }
  async step(id, input, disconnectSignal) {
    const run = this.get(id);
    if (run.state === 'starting' && run.activated) run.state = 'running';
    if (run.state !== 'running' || run.busy || input.index !== run.next) throw fail('测试已停止或步骤重复；未产生调用。', 409);
    const config = validateRemoteConfig(input.config, this.budget);
    if (config.model !== run.model || config.baseUrl !== run.baseUrl) throw fail('运行中不能改变模型或 API 地址。');
    if (disconnectSignal?.aborted) { this.cancel(id); throw fail('测试已取消。', 409); }
    const scenario = REMOTE_SCENARIOS[run.next];
    if (!scenario) throw fail('测试任务已完成。', 409);
    const started = this.now();
    if (scenario.turn === 1 || scenario.newSession) run.history = [];
    const history = run.history.map(e => ({ ...e }));
    const character = characterConfig({ ...run.character, style: scenario.style || run.character.style });
    const messages = messagesFor(scenario.text, scenario.memories, history, character);
    this.persist(run);
    // Reserve atomically in the SAME lifetime ledger as manual remote tests.
    let reservation;
    try { reservation = this.budget.reserve(config.model, messages); }
    catch (error) { run.state = 'stopped'; this.persist(run); throw error; }
    run.busy = true; run.controller = new AbortController();
    const signal = disconnectSignal ? AbortSignal.any([run.controller.signal, disconnectSignal]) : run.controller.signal;
    let reply, error, failureUsage, errorCode;
    try {
      reply = await complete(config, messages, { fetchImpl: this.fetchImpl, signal });
      if (signal.aborted || run.state !== 'running') throw new Error('cancelled');
      this.budget.finish(reservation, reply.usage, true); run.failures = 0;
    } catch (failure) {
      this.budget.finish(reservation, failure.usage || null, false); run.failures++;
      failureUsage = failure.usage || null;
      if (failure.code === 'INVALID_EXPRESSION_CONTRACT') errorCode = failure.code;
      const http = /^模型服务返回 HTTP (\d{3})，没有自动重试。$/.exec(failure.message || '');
      const reason = failure.name === 'TimeoutError' ? '请求超过 20 秒时限'
        : failure.code === 'UNSAFE_PROVIDER_REPLY' ? '响应安全检查失败'
        : http ? `服务返回 HTTP ${http[1]}`
        : failure.code === 'INVALID_EXPRESSION_CONTRACT' ? '模型未提供有效的 JSON 表达契约'
        : '连接失败或响应无效';
      error = signal.aborted ? '已取消；本次请求可能已计费，预留不退。' : `${reason}；没有重试，预留不退。`;
      reply = null;
      if (signal.aborted) run.state = 'cancelled';
    } finally { run.busy = false; run.controller = null; }
    if (reply) run.history.push({ role: 'user', text: scenario.text }, { role: 'assistant', text: reply.text, emotion: reply.emotion });
    const index = run.next++;
    if (run.state === 'running') {
      if (run.failures >= 1) run.state = 'stopped';
      else if (run.next >= REMOTE_SCENARIOS.length) run.state = 'completed';
    }
    const budget = this.budget.status();
    const record = budget.records.find(row => row.id === reservation);
    const result = { index, scenario: scenario.id, status: reply ? 'completed' : 'failed', state: run.state,
      group: scenario.group, turn: scenario.turn, synthetic: true, character: { timeline: character.timeline, style: character.style },
      prompt: messages, recalledFixture: scenario.memories, history,
      persistence: scenario.newSession ? 'not-tested' : 'not-applicable',
      reviewCriteria: REVIEW_CRITERIA[scenario.group],
      reviewHints: reply && /数据库|检索|记录编号|测试用|虚构记录/.test(reply.text) ? ['可能出戏：请人工检查技术或测试措辞'] : [],
      elapsedMs: Math.max(0, this.now() - started), text: reply?.text || '', emotion: reply?.emotion || null,
      structured: reply?.expressionSource === 'model-contract', usage: reply?.usage || failureUsage || null,
      ...(errorCode && { errorCode }),
      estimatedCny: record.estimated_cny, reservedCny: record.reserved_cny, error: error || null,
      review: '结构字段可核验；角色相似度、情绪自然度及记忆回答仍需人工审阅。', budget };
    const { budget: _budget, error: _error, ...row } = result;
    run.rows.push(row); this.persist(run);
    return result;
  }
  close() { if (this.run) this.cancel(this.run.id); }
}
