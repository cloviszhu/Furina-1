import { mkdirSync, readdirSync, lstatSync, realpathSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REVIEW_CRITERIA } from './test-review.js';

export const REPORT_LIMIT = 100;
export const REPORT_BYTES = 512 * 1024;
export const validRunId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const fail = (status = 409) => Object.assign(new Error('测试报告区不可用或已满；已有报告保留，请先人工整理。'), { status });
const number = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
const states = new Set(['starting', 'running', 'completed', 'stopped', 'cancelled']);
const scenarios = new Set(['introduction', 'daily-emotion', 'memory-recall', 'memory-correction', 'unknown-memory', 'expression-contract']);
const emotions = new Set(['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised']);
const string = value => { if (typeof value !== 'string' || value.length > 6000) throw fail(); return value; };
const messages = value => (Array.isArray(value) ? value : []).slice(0, 6)
  .filter(e => ['system', 'user', 'assistant'].includes(e.role)).map(e => ({ role: e.role, content: string(e.content) }));
const history = value => (Array.isArray(value) ? value : []).slice(0, 4)
  .filter(e => ['user', 'assistant'].includes(e.role)).map(e => ({ role: e.role, text: string(e.text) }));
const fixtures = value => (Array.isArray(value) ? value : []).slice(0, 5).map(e => ({
  text: string(e.text), source: ['user-statement', 'mutual-agreement', 'shared-experience', 'imagined-story'].includes(e.source) ? e.source : 'user-statement',
  ...(e.state === 'planned-not-confirmed-completed' && { state: e.state }),
}));

// Reconstruct every record: never serialize a config, header, key or provider error.
export function safeReport(run) {
  if (!validRunId(run.id) || !states.has(run.state) || !['deepseek-flash', 'deepseek-v4-pro'].includes(run.model)) throw fail();
  const version = run.version === 1 ? 1 : 2;
  return { version, total: version === 1 ? 6 : 18, id: run.id, provider: 'deepseek', endpoint: 'https://api.deepseek.com', model: run.model,
    createdAt: number(run.createdAt), state: run.state, review: '人工审查待完成；请求成功不代表角色质量通过',
    rows: (run.rows || []).slice(0, version === 1 ? 6 : 18).filter(row => scenarios.has(row.scenario)).map(row => ({
      scenario: row.scenario, status: ['completed', 'failed'].includes(row.status) ? row.status : 'failed',
      ...(version === 2 && {
        group: row.scenario, turn: [1, 2, 3].includes(row.turn) ? row.turn : null, synthetic: true,
        reviewCriteria: REVIEW_CRITERIA[row.scenario],
        character: { timeline: ['aftermath', 'performer'].includes(row.character?.timeline) ? row.character.timeline : null,
          style: ['natural', 'theatrical', 'quiet'].includes(row.character?.style) ? row.character.style : null },
        prompt: messages(row.prompt), recalledFixture: fixtures(row.recalledFixture), history: history(row.history),
        persistence: row.persistence === 'not-tested' ? 'not-tested' : 'not-applicable',
        reviewHints: row.reviewHints?.includes('可能出戏：请人工检查技术或测试措辞') ? ['可能出戏：请人工检查技术或测试措辞'] : [],
      }),
      text: typeof row.text === 'string' ? row.text.slice(0, 6000) : '', emotion: emotions.has(row.emotion) ? row.emotion : null,
      structured: row.structured === true, elapsedMs: number(row.elapsedMs),
      usage: { prompt_tokens: number(row.usage?.prompt_tokens), completion_tokens: number(row.usage?.completion_tokens) },
      estimatedCny: number(row.estimatedCny), reservedCny: number(row.reservedCny), review: '人工审查待完成',
    })) };
}

export class TestReports {
  constructor(directory) { this.directory = resolve(directory); }
  root() {
    mkdirSync(this.directory, { recursive: true });
    if (lstatSync(this.directory).isSymbolicLink() || realpathSync(this.directory).toLowerCase() !== this.directory.toLowerCase()) throw fail();
  }
  files() {
    this.root();
    // Unknown files count towards capacity too. Never remove anything automatically.
    return readdirSync(this.directory);
  }
  checkCapacity() { if (this.files().length >= REPORT_LIMIT) throw fail(); }
  path(id) { if (!validRunId(id)) throw fail(404); this.root(); return join(this.directory, `${id}.json`); }
  save(run, initial = false) {
    const report = safeReport(run), file = this.path(report.id), data = JSON.stringify(report, null, 2);
    if (Buffer.byteLength(data) > REPORT_BYTES) throw fail();
    if (initial) { this.checkCapacity(); writeFileSync(file, data, { flag: 'wx' }); }
    else {
      if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) throw fail();
      const temporary = `${file}.pending`;
      writeFileSync(temporary, data, { flag: 'wx' }); renameSync(temporary, file);
    }
    return report;
  }
  read(id) {
    try {
      const file = this.path(id), stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > REPORT_BYTES) throw fail();
      const report = safeReport(JSON.parse(readFileSync(file, 'utf8')));
      if (report.id !== id) throw fail();
      return report;
    } catch { throw fail(404); }
  }
  list() {
    return this.files().filter(name => name.endsWith('.json') && validRunId(name.slice(0, -5))).slice(0, REPORT_LIMIT)
      .flatMap(name => { try { const r = this.read(name.slice(0, -5)); return [{ id: r.id, createdAt: r.createdAt, state: r.state, model: r.model, count: r.rows.length, total: r.total }]; } catch { return []; } });
  }
}
