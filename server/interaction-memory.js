import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { contextKeys } from './persona.js';

// This module retains evidence, not verified autobiographical truth. No LLM calls.
const MAX_TEXT = 6000;
const MAX_TERMS = 6000;
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const normalized = text => text.normalize('NFKC').toLowerCase();
function string(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw error(`Invalid ${name}`);
  return value.trim();
}
function integer(value, fallback, min, max) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < min || value > max) throw error('Invalid memory bound');
  return value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw error('Invalid timestamp');
  return new Date(value).toISOString();
}

export function containsPrivateMaterial(text) {
  const clean = normalized(text).replace(/\\u([0-9a-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return /(?:sk-[a-z0-9_-]{8,}|aiza[a-z0-9_-]{15,}|gh[pousr]_[a-z0-9]{12,}|github_pat_[a-z0-9_]{12,}|bearer\s+\S{8,}|-----begin[\s\w]*private key-----)/i.test(clean)
    || /\b(?:akia|asia)[a-z0-9]{16}\b|\b(?:token|authorization)\b\s*["'：:=]+\s*\S+/i.test(clean)
    || /(?:api[\s_-]*key|access[\s_-]*token|refresh[\s_-]*token|password|passwd|密码|口令|密钥|令牌|验证码)/i.test(clean)
    || /secret\s*["'：:=]+\s*\S+/i.test(clean)
    || /(?:不要|别|不许|不能)(?:保存|记住|记录|存储)|(?:这是|属于|是我的)(?:秘密|私密|隐私)|保密/.test(clean);
}

function terms(text) {
  const clean = normalized(text);
  const found = new Set(clean.match(/[\p{L}\p{N}_-]+/gu)?.filter(t => !/[\u3400-\u9fff]/.test(t)) || []);
  for (const run of clean.match(/[\u3400-\u9fff]+/g) || []) {
    if (run.length === 1) found.add(run);
    for (let i = 0; i < run.length - 1; i++) found.add(run.slice(i, i + 2));
  }
  return [...found].filter(t => t.length <= 80).slice(0, MAX_TERMS);
}

function domain(text) {
  if (/测试(?:数据|用例|夹具|回合)|这是(?:一个)?测试|[【\[]测试[】\]]|^(?:测试|test|mock|fixture)\s*[：:]|test fixture|mock data/i.test(text)) return 'test';
  if (/虚构|编个故事|写个故事|角色扮演|故事里|小说里|假装|^fiction\s*[：:]/i.test(text)) return 'fiction';
  if (/假如|假设|如果|要是|^hypothetical\s*[：:]/i.test(text)) return 'hypothetical';
  if (/可能|也许|大概|似乎|不确定|记不清|好像|听说|据说|别人说|他说|她说|开玩笑|才怪|[“”「」『』"]/.test(text)) return 'uncertain';
  return 'reality';
}

// Deliberately narrow, sentence-anchored grammar. Unmatched clauses stay episodes.
// Confidence describes extraction only; every claim remains a user report.
function extract(text, episodeDomain) {
  if (episodeDomain !== 'reality') return [];
  const claims = [];
  for (const clause of text.split(/[。！？!?；;\n，,]/).map(s => s.trim()).filter(Boolean)) {
    if (/[吗么呢吧]$/.test(clause) || /[？?]/.test(text)) continue;
    let match;
    const add = (type, predicate, value, { polarity = 1, subject = 'user', exclusive = false } = {}) => {
      if (!value || value.length > 120 || /可能|也许|好像|不确定|不是|没有|没去|不想|不喜欢|不要/.test(value)) return;
      claims.push({ type, predicate, value, polarity, subject, exclusive, sourceQuote: clause, extractConfidence: 'explicit-grammar', epistemic: 'user_reported' });
    };
    if ((match = clause.match(/^我的名字(?:是|叫)([^？?]+)$/))) add('fact', 'name', match[1], { exclusive: true });
    else if ((match = clause.match(/^我(?:现在)?住在([^？?]+)$/))) add('fact', 'residence', match[1], { exclusive: true });
    else if ((match = clause.match(/^我(?:现在)?最喜欢(?:的是)?([^？?]+)$/))) add('preference', 'favorite', match[1], { exclusive: true });
    else if ((match = clause.match(/^我(?:现在)?(?:喜欢|偏爱)([^？?]+)$/))) add('preference', 'likes', match[1]);
    else if ((match = clause.match(/^我(?:不再|不)(?:喜欢|偏爱)([^？?]+)$/))) add('negation', 'likes', match[1], { polarity: -1 });
    else if ((match = clause.match(/^我(?:从来)?(?:没去过|没有去过)([^？?]+)$/))) add('negation', 'visited', match[1], { polarity: -1 });
    else if ((match = clause.match(/^我(?:曾经)?去过([^？?]+)$/))) add('user_reported', 'visited', match[1]);
    else if ((match = clause.match(/^我(?:今天|昨天|前天|刚刚|已经)?(?:完成了|做完了)([^？?]+)$/))) add('completed', 'completed', match[1]);
    else if ((match = clause.match(/^我(?:原来|之前)?(?:计划|打算|准备)([^？?]+)$/))) add('plan', 'intends', match[1]);
    else if ((match = clause.match(/^我们(?:约好|约定)([^？?]+)$/))) add('plan', 'intends', match[1], { subject: 'user_reported_relationship' });
    else if ((match = clause.match(/^我(?:取消了|取消)(?:原来|之前)?(?:的)?(?:计划)?([^？?]+)$/))) add('negation', 'intends', match[1], { polarity: -1 });
    else if ((match = clause.match(/^我(?:不再|不)(?:打算|计划)([^？?]+)$/))) add('negation', 'intends', match[1], { polarity: -1 });
  }
  return claims;
}
function actionValue(value) {
  // Only explicit relative-time prefixes are ignored; never infer elapsed execution.
  return normalized(value).replace(/^(?:今天|明天|后天|昨天|下周|本周|周末|下个月|明年)/, '').replace(/的计划$/, '').trim();
}
function recallIntent(query) {
  return /^(?:你还|你|我们|我)?(?:记得什么|还记得什么|记得吗|还记得吗|刚才聊(?:了)?(?:什么|啥|哪)|之前聊(?:了)?(?:什么|啥)|最近聊(?:了)?(?:什么|啥)|回顾(?:一下)?|有什么(?:共同)?回忆)[？?。！!\s]*$/.test(query);
}
function excerpt(text, queryTerms, max) {
  if (text.length <= max) return { text, truncated: false };
  let at = -1;
  for (const term of queryTerms) {
    const found = normalized(text).indexOf(term);
    if (found >= 0 && (at < 0 || found < at)) at = found;
  }
  const start = Math.max(0, at - Math.floor(max / 3));
  return { text: `${start ? '…' : ''}${text.slice(start, start + max)}${start + max < text.length ? '…' : ''}`, truncated: true };
}

export class InteractionMemoryStore {
  constructor(file, { confirmedMemoryStore = null, maxEpisodes = 20000 } = {}) {
    this.maxEpisodes = integer(maxEpisodes, 20000, 1, 100000);
    this.confirmedMemoryStore = confirmedMemoryStore;
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    try {
      this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;`);
      this.transaction(() => {
        this.db.exec(`CREATE TABLE IF NOT EXISTS im_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
          INSERT OR IGNORE INTO im_meta VALUES ('schema_version',1),('generation',0);
          CREATE TABLE IF NOT EXISTS im_episodes (
            id TEXT PRIMARY KEY, event_id TEXT NOT NULL UNIQUE, turn_id TEXT NOT NULL,
            text TEXT NOT NULL, context_key TEXT NOT NULL, created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL, revision INTEGER NOT NULL, domain TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS im_episode_context ON im_episodes(context_key,created_at);
          CREATE TABLE IF NOT EXISTS im_claims (
            id TEXT PRIMARY KEY, episode_id TEXT NOT NULL REFERENCES im_episodes(id) ON DELETE CASCADE,
            type TEXT NOT NULL, predicate TEXT NOT NULL, value TEXT NOT NULL, polarity INTEGER NOT NULL,
            subject TEXT NOT NULL, exclusive_slot INTEGER NOT NULL, quote TEXT NOT NULL);
          CREATE INDEX IF NOT EXISTS im_claim_episode ON im_claims(episode_id);
          CREATE INDEX IF NOT EXISTS im_claim_predicate ON im_claims(predicate,subject);
          CREATE TABLE IF NOT EXISTS im_terms (
            term TEXT NOT NULL, episode_id TEXT NOT NULL REFERENCES im_episodes(id) ON DELETE CASCADE,
            PRIMARY KEY(term,episode_id));`);
        if (this.db.prepare("SELECT value FROM im_meta WHERE key='schema_version'").get().value !== 1) throw error('Unsupported interaction memory schema', 409);
      });
    } catch (e) { this.db.close(); throw e; }
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get generation() { return this.db.prepare("SELECT value FROM im_meta WHERE key='generation'").get().value; }
  bump() { this.db.prepare("UPDATE im_meta SET value=value+1 WHERE key='generation'").run(); }
  derive(episode) {
    const insert = this.db.prepare('INSERT INTO im_terms(term,episode_id) VALUES (?,?)');
    for (const term of terms(episode.text)) insert.run(term, episode.id);
    const claim = this.db.prepare('INSERT INTO im_claims VALUES (?,?,?,?,?,?,?,?,?)');
    for (const c of extract(episode.text, episode.domain)) claim.run(randomUUID(), episode.id, c.type, c.predicate, c.value, c.polarity, c.subject, Number(c.exclusive), c.sourceQuote);
  }

  ingestUserTurn({ turnId, eventId, text, contextKey, createdAt = new Date().toISOString(), status = 'completed', role = 'user', kind = 'conversation' } = {}) {
    if (status !== 'completed' || role !== 'user' || kind !== 'conversation') return { retained: false, reason: 'ineligible-source' };
    text = string(text, 'text', MAX_TEXT);
    if (containsPrivateMaterial(text)) return { retained: false, reason: 'private-material' };
    turnId = string(turnId, 'turnId', 200); eventId = string(eventId, 'eventId', 200);
    contextKey = string(contextKey, 'contextKey', 100); createdAt = timestamp(createdAt);
    if ([turnId, eventId, contextKey].some(containsPrivateMaterial)) return { retained: false, reason: 'private-material' };
    const episodeDomain = domain(text);
    if (episodeDomain === 'test') return { retained: false, reason: 'test-source' };
    return this.transaction(() => {
      const prior = this.db.prepare('SELECT * FROM im_episodes WHERE event_id=?').get(eventId);
      if (prior) {
        if (prior.text !== text || prior.turn_id !== turnId || prior.context_key !== contextKey) throw error('Source already retained; use revise', 409);
        return { retained: true, duplicate: true, episodeId: prior.id, generation: this.generation };
      }
      if (this.db.prepare('SELECT COUNT(*) AS n FROM im_episodes').get().n >= this.maxEpisodes) return { retained: false, reason: 'capacity' };
      const episode = { id: randomUUID(), text, domain: episodeDomain };
      this.db.prepare('INSERT INTO im_episodes VALUES (?,?,?,?,?,?,?,1,?)').run(episode.id, eventId, turnId, text, contextKey, createdAt, createdAt, episodeDomain);
      this.derive(episode); this.bump();
      return { retained: true, episodeId: episode.id, generation: this.generation };
    });
  }

  revise(eventId, text, { updatedAt = new Date().toISOString() } = {}) {
    eventId = string(eventId, 'eventId', 200); text = string(text, 'text', MAX_TEXT); updatedAt = timestamp(updatedAt);
    // A correction containing a secret removes the old source, and retains nothing new.
    if (containsPrivateMaterial(text) || domain(text) === 'test') {
      const result = this.delete(eventId);
      return { ...result, retained: false, reason: 'private-or-test-revision' };
    }
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM im_episodes WHERE event_id=?').get(eventId);
      if (!row) throw error('Unknown source', 404);
      if (updatedAt < row.created_at) throw error('Revision cannot predate source');
      this.db.prepare('DELETE FROM im_claims WHERE episode_id=?').run(row.id);
      this.db.prepare('DELETE FROM im_terms WHERE episode_id=?').run(row.id);
      this.db.prepare('UPDATE im_episodes SET text=?,domain=?,updated_at=?,revision=revision+1 WHERE id=?').run(text, domain(text), updatedAt, row.id);
      this.derive({ id: row.id, text, domain: domain(text) }); this.bump();
      return { retained: true, episodeId: row.id, revision: row.revision + 1, generation: this.generation };
    });
  }

  delete(eventId) {
    eventId = string(eventId, 'eventId', 200);
    return this.transaction(() => {
      const result = this.db.prepare('DELETE FROM im_episodes WHERE event_id=?').run(eventId);
      if (result.changes) this.bump();
      return { deleted: Boolean(result.changes), generation: this.generation };
    });
  }

  claimsFor(episode, keys, now) {
    const own = this.db.prepare('SELECT * FROM im_claims WHERE episode_id=?').all(episode.id);
    return own.map(c => {
      const peers = this.db.prepare(`SELECT c.*, e.created_at FROM im_claims c JOIN im_episodes e ON e.id=c.episode_id
        WHERE e.context_key IN (${keys.map(() => '?').join(',')}) AND e.created_at<=? AND e.updated_at<=? AND c.predicate=? AND c.subject=? AND c.id<>?`).all(...keys, now, now, c.predicate, c.subject, c.id);
      const conflicts = peers.filter(p => (c.exclusive_slot && normalized(p.value) !== normalized(c.value)) || (normalized(p.value) === normalized(c.value) && p.polarity !== c.polarity));
      const cancellations = c.type === 'plan' ? peers.filter(p => p.polarity === -1 && p.created_at >= episode.created_at && actionValue(p.value) === actionValue(c.value)) : [];
      const cancelled = cancellations.length > 0;
      return { type: c.type, subject: c.subject, predicate: c.predicate, value: c.value, polarity: c.polarity,
        epistemic: 'user_reported', extractConfidence: 'explicit-grammar', sourceQuote: c.quote,
        conflictStatus: cancelled ? 'cancelled' : conflicts.length ? 'unresolved' : 'none', conflictSourceIds: [...new Set([...conflicts, ...cancellations].map(p => p.episode_id))].slice(0, 20) };
    });
  }

  confirmed(queryTerms, generic, now) {
    if (!this.confirmedMemoryStore) return [];
    return this.confirmedMemoryStore.list().filter(m => m.sourceRole === 'user' && !containsPrivateMaterial(m.text) && !containsPrivateMaterial(m.sourceText || '') && m.createdAt <= now && m.updatedAt <= now)
      .map(m => ({ ...m, score: generic ? 1 : queryTerms.filter(t => normalized(`${m.text} ${m.sourceText}`).includes(t)).length }))
      .filter(m => m.score > 0).sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt));
  }

  retrieve({ query, contextKey, now = new Date().toISOString(), budget = {}, includeFiction = false } = {}) {
    query = string(query, 'query', 512); contextKey = string(contextKey, 'contextKey', 100); now = timestamp(now);
    if (typeof budget === 'number') budget = { tokens: budget };
    if (!budget || typeof budget !== 'object' || Array.isArray(budget)) throw error('Invalid budget');
    const tokenBudget = integer(budget.tokens, 2400, 0, 16000);
    const limit = integer(budget.limit, 6, 1, 20);
    const candidateLimit = integer(budget.candidates, 300, 1, 1000);
    const excerptChars = integer(budget.excerptChars, 600, 80, 2000);
    const keys = contextKeys(contextKey), generic = recallIntent(query), queryTerms = terms(query).slice(0, 200);
    const eligible = `e.context_key IN (${keys.map(() => '?').join(',')}) AND e.created_at<=? AND e.updated_at<=? AND e.domain IN (${includeFiction ? "'reality','uncertain','fiction','hypothetical'" : "'reality','uncertain'"})`;
    let episodes;
    if (generic) episodes = this.db.prepare(`SELECT e.*,1 AS score FROM im_episodes e WHERE ${eligible} ORDER BY e.created_at DESC,e.rowid DESC LIMIT ?`).all(...keys, now, now, candidateLimit);
    else if (!queryTerms.length) episodes = [];
    else episodes = this.db.prepare(`WITH frequencies AS (
        SELECT t.term,COUNT(*) AS n FROM im_terms t JOIN im_episodes e ON e.id=t.episode_id
        WHERE t.term IN (${queryTerms.map(() => '?').join(',')}) AND ${eligible} GROUP BY t.term)
      SELECT e.*,SUM(1.0/f.n) AS score FROM im_terms t JOIN frequencies f ON f.term=t.term
        JOIN im_episodes e ON e.id=t.episode_id WHERE ${eligible}
        GROUP BY e.id ORDER BY score DESC,e.created_at DESC,e.rowid DESC LIMIT ?`).all(...queryTerms, ...keys, now, now, ...keys, now, now, candidateLimit);
    const items = []; let hasMore = false;
    const push = item => {
      if (items.length >= limit || Buffer.byteLength(JSON.stringify([...items, item]), 'utf8') > tokenBudget) { hasMore = true; return; }
      items.push(item);
    };
    for (const m of this.confirmed(queryTerms, generic, now).slice(0, candidateLimit)) {
      push({ id: m.id, type: 'confirmed', epistemic: 'user_confirmed', sourceRole: 'user', sourceId: m.sourceId,
        createdAt: m.createdAt, updatedAt: m.updatedAt, revision: m.revision,
        ...excerpt(m.text, queryTerms, excerptChars), sourceQuote: excerpt(m.sourceText || m.text, queryTerms, excerptChars).text,
        conflictStatus: 'not-assessed', priority: 'confirmed', match: generic ? 'recent' : 'lexical-related' });
    }
    for (const e of episodes) {
      // Capsules are generated from live rows only; no stale summary/cache copies.
      const claims = this.claimsFor(e, keys, now);
      push({ id: e.id, type: 'episode', epistemic: 'user_reported', sourceRole: 'user', sourceId: e.event_id, turnId: e.turn_id,
        contextKey: e.context_key, createdAt: e.created_at, updatedAt: e.updated_at, revision: e.revision, domain: e.domain,
        ...excerpt(e.text, queryTerms, excerptChars), claims,
        conflictStatus: claims.some(c => c.conflictStatus === 'unresolved') ? 'unresolved' : claims.some(c => c.conflictStatus === 'cancelled') ? 'cancelled' : 'none',
        priority: 'automatic', match: generic ? 'recent' : 'lexical-related' });
    }
    return { items, tokenUpperBound: items.length ? Buffer.byteLength(JSON.stringify(items), 'utf8') : 0, tokenBudget,
      generation: this.generation, hasMore: hasMore || episodes.length === candidateLimit,
      limitations: 'Lexical evidence retrieval; user reports are not verified truth. Plans are not completed events. Token bound covers serialized items in UTF-8 bytes.' };
  }

  close() { this.db.close(); }
}
