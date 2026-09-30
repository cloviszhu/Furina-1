import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export function validText(value, limit = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) {
    const error = new Error(`文字不能为空，最多 ${limit} 字。`);
    error.status = 400;
    throw error;
  }
  return value.trim();
}

export class MemoryStore {
  constructor(file) {
    this.contextGeneration = 0;
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY, turn_id TEXT NOT NULL, role TEXT NOT NULL,
        text TEXT NOT NULL, kind TEXT NOT NULL, provider TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, text TEXT NOT NULL, source_id TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS remote_usage (
        id TEXT PRIMARY KEY, model TEXT NOT NULL, reserved_cny REAL NOT NULL,
        input_bound INTEGER NOT NULL, output_limit INTEGER NOT NULL,
        prompt_tokens INTEGER, completion_tokens INTEGER, estimated_cny REAL,
        status TEXT NOT NULL, created_at TEXT NOT NULL
      );`);
    if (!this.db.prepare('PRAGMA table_info(events)').all().some(c => c.name === 'context_key')) this.db.exec("ALTER TABLE events ADD COLUMN context_key TEXT NOT NULL DEFAULT 'aftermath:natural'");
  }

  event(role, text, { turnId = randomUUID(), kind = 'conversation', provider = 'offline', contextKey = 'aftermath:natural' } = {}) {
    const event = { id: randomUUID(), turnId, role, text: validText(text, 6000), kind, provider, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO events (id,turn_id,role,text,kind,provider,created_at,context_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      event.id, turnId, role, event.text, kind, provider, event.createdAt, contextKey,
    );
    return event;
  }

  history(limit = 16, contextKey = null) {
    return this.db.prepare(`SELECT id, turn_id AS turnId, role, text, provider, created_at AS createdAt
      FROM events WHERE kind='conversation' AND (? IS NULL OR context_key=?) ORDER BY rowid DESC LIMIT ?`).all(contextKey, contextKey, limit).reverse();
  }

  list() {
    return this.db.prepare(`SELECT m.id, m.text, m.source_id AS sourceId, m.created_at AS createdAt,
      m.updated_at AS updatedAt, m.revision, e.text AS sourceText, e.role AS sourceRole
      FROM memories m JOIN events e ON e.id=m.source_id ORDER BY m.updated_at DESC, m.rowid DESC`).all();
  }

  sourceExists(id, contextKey) {
    return Boolean(this.db.prepare("SELECT 1 FROM events WHERE id=? AND role='user' AND kind='conversation' AND context_key=?").get(id, contextKey));
  }

  save(text, sourceId) {
    text = validText(text);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      let source = sourceId && this.db.prepare('SELECT * FROM events WHERE id=?').get(sourceId);
      if (sourceId && (!source || source.role !== 'user')) throw Object.assign(new Error('来源必须是已存在的用户记录。'), { status: 400 });
      if (!source) source = this.event('user', text, { kind: 'memory' });
      const now = new Date().toISOString();
      this.db.prepare('INSERT INTO memories VALUES (?, ?, ?, ?, ?, 1)').run(randomUUID(), text, source.id, now, now);
      this.db.exec('COMMIT');
      return this.list();
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  edit(id, text) {
    text = validText(text);
    const memory = this.db.prepare('SELECT * FROM memories WHERE id=?').get(id);
    if (!memory) throw Object.assign(new Error('记忆不存在。'), { status: 404 });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      // Remove stale conversation evidence; preserve a revised, explicit source.
      this.clearSourceConversation(memory.source_id, id);
      const source = this.event('user', text, { kind: 'memory' });
      this.db.prepare('UPDATE memories SET text=?, source_id=?, updated_at=?, revision=revision+1 WHERE id=?')
        .run(text, source.id, new Date().toISOString(), id);
      this.db.exec('COMMIT');
      ++this.contextGeneration;
      return this.list();
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  clearSourceConversation(sourceId, exceptMemoryId) {
    // Other confirmed memories survive history cleanup, even if they shared
    // the corrected/deleted conversation. Give them their own explicit source.
    const survivors = this.db.prepare(`SELECT m.id,m.text FROM memories m JOIN events e ON e.id=m.source_id
      WHERE (e.kind='conversation' OR e.id=?) AND m.id<>?`).all(sourceId, exceptMemoryId);
    for (const memory of survivors) {
      const source = this.event('user', memory.text, { kind: 'memory' });
      this.db.prepare('UPDATE memories SET source_id=? WHERE id=?').run(source.id, memory.id);
    }
    const source = this.db.prepare('SELECT turn_id FROM events WHERE id=?').get(sourceId);
    if (source) this.db.prepare('DELETE FROM events WHERE turn_id=?').run(source.turn_id);
    // Derived replies might quote a memory on later turns. Clear conversational
    // context on corrections/deletions so stale copies cannot leak back to an LLM.
    this.db.prepare("DELETE FROM events WHERE kind='conversation'").run();
  }

  delete(id) {
    const memory = this.db.prepare('SELECT * FROM memories WHERE id=?').get(id);
    if (!memory) throw Object.assign(new Error('记忆不存在。'), { status: 404 });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.clearSourceConversation(memory.source_id, id);
      this.db.prepare('DELETE FROM memories WHERE id=?').run(id);
      // Keep other explicitly saved memories alive if they shared the source.
      for (const row of this.db.prepare(`SELECT id, text FROM memories WHERE source_id=?`).all(memory.source_id)) {
        const newSource = this.event('user', row.text, { kind: 'memory' });
        this.db.prepare('UPDATE memories SET source_id=? WHERE id=?').run(newSource.id, row.id);
      }
      this.db.exec('COMMIT');
      ++this.contextGeneration;
      return this.list();
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  recall(query, limit = 5) {
    const memories = this.list();
    const recallIntent = /记得|记忆|经历|回忆|约定/.test(query);
    // Generic recall asks for recent evidence; a specific unrecorded place or
    // event must not receive an unrelated memory as if it had happened.
    const clean = query.replace(/共同经历|一起做的事|共同的经历|我们的|我们|你还|你|是否|记得|记忆|经历|回忆|一起|约定|还|吗|呢/g, '')
      .replace(/[\s\p{P}]/gu, '').toLowerCase();
    if (recallIntent && clean.length < 2) return memories.slice(0, limit);
    const terms = new Set(clean.match(/[a-z0-9]{2,}|[\u4e00-\u9fff]{2}/g) || []);
    // Sliding Chinese pairs also work when word boundaries differ.
    for (let i = 0; i < clean.length - 1; i++) terms.add(clean.slice(i, i + 2));
    // Lexical similarity does not establish the query's premise.
    return memories.map(m => ({ ...m, match: 'related', score: [...terms].filter(t => m.text.toLowerCase().includes(t)).length }))
      .filter(m => m.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  close() { this.db.close(); }
}
