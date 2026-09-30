import { randomUUID } from 'node:crypto';

// Official CNY peak/cache-miss prices verified 2026-09-30. No discount assumptions.
export const PRICING = {
  verifiedAt: '2026-09-30T07:35:00Z',
  source: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',
  models: { 'deepseek-flash': { input: 2, output: 8 }, 'deepseek-v4-pro': { input: 9, output: 27 } },
};
export const LIMITS = { cny: 9, calls: 3, outputTokens: 128, inputBytes: 16000, safetyMultiplier: 10 };

export class RemoteBudget {
  constructor(db, { pricing = PRICING, limits = LIMITS, now = () => Date.now() } = {}) {
    this.db = db; this.pricing = pricing; this.limits = limits; this.now = now;
  }
  status() {
    const rows = this.db.prepare('SELECT * FROM remote_usage ORDER BY created_at').all();
    const reserved = rows.reduce((n, row) => n + row.reserved_cny, 0);
    return { limits: this.limits, usedCalls: rows.length, reservedCny: reserved,
      remainingCny: Math.max(0, this.limits.cny - reserved), pricing: this.pricing,
      pricingCurrent: this.now() >= Date.parse(this.pricing.verifiedAt) && this.now() - Date.parse(this.pricing.verifiedAt) < 86400000,
      records: rows };
  }
  reserve(model, messages, outputTokens = 128) {
    if (!Number.isInteger(outputTokens) || outputTokens < 1 || outputTokens > this.limits.outputTokens) throw new Error('输出 token 超出单次上限。');
    const rate = this.pricing.models[model];
    if (!rate || !this.status().pricingCurrent) throw new Error('模型价格未核实或超过 24 小时，请先核对官方价格。');
    const bytes = Buffer.byteLength(JSON.stringify(messages), 'utf8');
    if (bytes > this.limits.inputBytes) throw new Error('上下文过大，已在调用前阻止；请减少记忆或对话长度。');
    const inputBound = bytes + 1024;
    const reserved = ((inputBound * rate.input + outputTokens * rate.output) / 1e6) * this.limits.safetyMultiplier;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const status = this.status();
      if (status.usedCalls >= this.limits.calls || status.reservedCny + reserved > this.limits.cny) throw new Error('本轮调用数或费用预算已用尽。');
      const id = randomUUID();
      this.db.prepare(`INSERT INTO remote_usage (id,model,reserved_cny,input_bound,output_limit,status,created_at)
        VALUES (?,?,?,?,?,'reserved',?)`).run(id, model, reserved, inputBound, outputTokens, new Date(this.now()).toISOString());
      this.db.exec('COMMIT');
      return id;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  finish(id, usage, success) {
    const row = this.db.prepare('SELECT * FROM remote_usage WHERE id=?').get(id);
    const rate = this.pricing.models[row.model];
    const input = Number.isFinite(usage?.prompt_tokens) ? usage.prompt_tokens : null;
    const output = Number.isFinite(usage?.completion_tokens) ? usage.completion_tokens : null;
    const estimated = input !== null && output !== null ? (input * rate.input + output * rate.output) / 1e6 : null;
    // Failed/uncertain requests retain their reserve and count across restarts.
    this.db.prepare('UPDATE remote_usage SET prompt_tokens=?,completion_tokens=?,estimated_cny=?,status=? WHERE id=?')
      .run(input, output, estimated, success ? 'completed' : 'failed', id);
  }
}
