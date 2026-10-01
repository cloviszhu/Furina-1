import defaultPack from './data/furina-canon-4.2.v1.json' with { type: 'json' };

const STAGES = Object.freeze({ 'before-aftermath': 0, aftermath: 1, performer: 2 });
const OWNERS = ['furina', 'focalors', 'neuvillette', 'author'];
const KINDS = ['canonicalfact', 'characterinterpretation'];
const STATUSES = ['primary-verified', 'reference-transcript-checked', 'primary-promotion-checked',
  'official_hosted_game_text', 'secondary_game_dialogue_transcription', 'secondary-only', 'pending'];
const USABLE = new Set(STATUSES.slice(0, 5));
const HEADER = '来源资料：canonicalfact 为事实，characterinterpretation 为理解。reported 是转述，不能自称亲眼；unspecified 不推导亲历。缺少资料不代表事件未发生。\n';
export const CHARACTER_CONTEXT_LIMITS = Object.freeze({ maxRecords: 12, maxChars: 6000, maxBytes: 4096 });
const DEFAULT_BUDGET = Object.freeze({ maxRecords: 8, maxChars: 4000, maxBytes: 2048 });
const INTERACTION_HEADER = '互动资料：用户报告、未完成计划与角色推测，均不覆写 canon。\n';

const normalized = x => x.normalize('NFKC').toLowerCase().trim();
// Deliberately conservative: partial names/words and one-character chatter cannot retrieve canon.
function meaningful(x) {
  return /\p{Script=Han}{2}/u.test(x) || /[a-z0-9]{3}/u.test(x);
}
function mentions(query, label) {
  if (!meaningful(label)) return false;
  let start = query.indexOf(label);
  while (start !== -1) {
    const latin = /[a-z0-9]/u;
    const leftOK = !latin.test(label[0]) || start === 0 || !latin.test(query[start - 1]);
    const end = start + label.length;
    const rightOK = !latin.test(label.at(-1)) || end === query.length || !latin.test(query[end]);
    if (leftOK && rightOK) return true;
    start = query.indexOf(label, start + 1);
  }
  return false;
}
function budget(input) {
  if (!object(input)) fail('invalid budget');
  const result = { ...DEFAULT_BUDGET, ...input };
  for (const n of Object.keys(DEFAULT_BUDGET)) {
    const value = result[n];
    if (!Number.isSafeInteger(value) || value < 0 || value > CHARACTER_CONTEXT_LIMITS[n]) fail(`invalid ${n}`);
  }
  return result;
}

function fail(message) { throw new TypeError(`character-context: ${message}`); }
function object(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }
function string(x, label, max = 4096) {
  if (typeof x !== 'string' || !x.trim() || x.length > max) fail(`invalid ${label}`);
}
function identifier(x) {
  if (typeof x !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(x)) fail('invalid id');
}
function strings(xs, label) {
  if (!Array.isArray(xs) || xs.length > 64) fail(`invalid ${label}`);
  for (const x of xs) string(x, label, 128);
}
function stage(x) {
  if (!Object.hasOwn(STAGES, x)) fail('invalid stage');
  return STAGES[x];
}
function enumValue(x, values, label) { if (!values.includes(x)) fail(`invalid ${label}`); }
function freeze(x) {
  if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); }
  return x;
}

/** Validate trusted source pack once. Caller interactions cannot mutate this snapshot. */
export function createCharacterContextResolver(inputPack) {
  const pack = structuredClone(inputPack);
  if (!object(pack) || pack.schemaVersion !== 1 || !Array.isArray(pack.sources)
    || !Array.isArray(pack.records) || pack.sources.length > 1000 || pack.records.length > 1000) fail('invalid pack');
  string(pack.packVersion, 'packVersion', 128);
  string(pack.canonEdition, 'canonEdition', 32);
  const sources = new Map();
  for (const s of pack.sources) {
    if (!object(s)) fail('invalid source');
    identifier(s.id);
    if (sources.has(s.id)) fail('duplicate source id');
    enumValue(s.sourceStatus, STATUSES, 'sourceStatus');
    string(s.url, 'source url');
    let url;
    try { url = new URL(s.url); } catch { fail('invalid source url'); }
    if (url.protocol !== 'https:') fail('source must use https');
    string(s.locator, 'locator');
    string(s.authorship, 'authorship');
    sources.set(s.id, s);
  }
  const ids = new Set();
  for (const r of pack.records) {
    if (!object(r)) fail('invalid record');
    identifier(r.id);
    if (ids.has(r.id)) fail('duplicate record id');
    ids.add(r.id);
    enumValue(r.kind, KINDS, 'kind');
    enumValue(r.sourceStatus, STATUSES, 'sourceStatus');
    enumValue(r.visibility, ['public', 'private'], 'visibility');
    if (typeof r.enabled !== 'boolean' || r.canonEdition !== pack.canonEdition) fail('invalid record edition/enabled');
    stage(r.eventAt);
    string(r.text, 'record text');
    for (const key of ['topics', 'entities', 'aliases', 'sourceRefs']) strings(r[key], key);
    if (!r.sourceRefs.length || r.sourceRefs.some(id => !sources.has(id))) fail('unknown source reference');
    if (r.enabled && (!USABLE.has(r.sourceStatus)
      || !r.sourceRefs.some(id => sources.get(id).sourceStatus === r.sourceStatus))) fail('enabled record lacks matching checked source');
    if (r.kind === 'canonicalfact' && r.sourceStatus === 'primary-promotion-checked') fail('promotion cannot become canon');
    if (!Array.isArray(r.knowledge) || !r.knowledge.length || r.knowledge.length > OWNERS.length) fail('invalid knowledge');
    const owners = new Set();
    for (const k of r.knowledge) {
      if (!object(k)) fail('invalid knowledge');
      enumValue(k.owner, OWNERS, 'owner');
      enumValue(k.mode ?? 'unspecified', ['unspecified', 'experienced', 'eyewitness', 'self-report', 'reported', 'author'], 'knowledge mode');
      if (k.mode === 'reported') {
        enumValue(k.sourceStatus, STATUSES, 'learning sourceStatus');
        strings(k.sourceRefs, 'learning sourceRefs');
        if (!k.sourceRefs.length || k.sourceRefs.some(id => !sources.has(id))) fail('unknown learning source');
        if (USABLE.has(k.sourceStatus) && !k.sourceRefs.some(id => sources.get(id).sourceStatus === k.sourceStatus)) fail('learning lacks matching checked source');
      }
      if (owners.has(k.owner)) fail('duplicate knowledge owner');
      owners.add(k.owner);
      if (r.sourceStatus === 'primary-promotion-checked' && k.owner !== 'author') fail('promotion does not grant character knowledge');
      if (stage(k.knownFrom) < stage(r.eventAt)) fail('knowledge precedes event');
      string(k.basis, 'knowledge basis');
    }
  }
  freeze(pack);

  return function resolve(options = {}) {
    if (!object(options)) fail('invalid options');
    const { timeline = 'aftermath', canonEdition = '4.2', perspective = 'furina',
      query = '', topics = [], entities = [], interactions = [],
      maxRecords = 8, maxChars = 4000, maxBytes = 2048, interactionBudget = {} } = options;
    enumValue(timeline, ['aftermath', 'performer'], 'timeline');
    enumValue(perspective, OWNERS, 'perspective');
    string(canonEdition, 'canonEdition', 32);
    if (typeof query !== 'string' || query.length > 4096) fail('invalid query');
    strings(topics, 'topics'); strings(entities, 'entities');
    const canonBudget = budget({ maxRecords, maxChars, maxBytes });
    const memoryBudget = budget(interactionBudget);
    if (!Array.isArray(interactions) || interactions.length > 1000) fail('invalid interactions');
    const interactionIds = new Set();
    const interactionRows = interactions.map(r => {
      if (!object(r)) fail('invalid interaction');
      identifier(r.id);
      if (interactionIds.has(r.id)) fail('duplicate interaction id');
      interactionIds.add(r.id);
      string(r.text, 'interaction text');
      enumValue(r.type, ['userfact', 'plan', 'characterspeculation'], 'interaction type');
      enumValue(r.speaker, ['user', 'assistant'], 'speaker');
      if (r.type === 'userfact' && r.speaker !== 'user') fail('userfact must come from user');
      enumValue(r.timeline, ['aftermath', 'performer'], 'interaction timeline');
      for (const key of ['topics', 'entities', 'aliases']) strings(r[key] ?? [], key);
      // No input field can promote a user claim into canonicalfact.
      return { ...r, kind: 'userinteraction', topics: [...(r.topics ?? [])],
        entities: [...(r.entities ?? [])], aliases: [...(r.aliases ?? [])] };
    });

    const q = normalized(query);
    const hints = xs => xs.map(normalized).filter(meaningful);
    const topicHints = hints(topics), entityHints = hints(entities);
    const hits = (values, extra = []) => values.map(normalized).filter(v =>
      meaningful(v) && (extra.includes(v) || mentions(q, v))).length;
    const score = r => [hits(r.topics, topicHints), hits(r.entities, entityHints), hits(r.aliases),
      meaningful(q) && (r.kind === 'userinteraction' ? normalized(r.text).includes(q) : normalized(r.text) === q) ? 1 : 0];
    const eligible = canonEdition === pack.canonEdition ? pack.records.filter(r =>
      r.enabled && USABLE.has(r.sourceStatus) && r.canonEdition === canonEdition
      && stage(r.eventAt) <= stage(timeline)
      // Public availability never implies knowledge; private requires the same explicit owner evidence.
      && r.knowledge.some(k => k.owner === perspective && stage(k.knownFrom) <= stage(timeline)
        && (k.mode !== 'reported' || USABLE.has(k.sourceStatus)))) : [];
    const candidates = [...eligible, ...interactionRows.filter(r => r.timeline === timeline)]
      .map(r => ({ r, score: score(r), key: `${r.kind}:${r.id}` }))
      .filter(c => c.score.some(Boolean));
    candidates.sort((a, b) => {
      for (let i = 0; i < a.score.length; i++) if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });

    const result = { schemaVersion: 1, packVersion: pack.packVersion, timeline, canonEdition, perspective,
      canonicalfact: [], characterinterpretation: [], userinteraction: [], modelPrompt: '', interactionPrompt: '' };
    let canonCount = 0, memoryCount = 0;
    for (const { r } of candidates) {
      const isInteraction = r.kind === 'userinteraction';
      const limits = isInteraction ? memoryBudget : canonBudget;
      const count = isInteraction ? memoryCount : canonCount;
      if (count >= limits.maxRecords) continue;
      const field = isInteraction ? 'interactionPrompt' : 'modelPrompt';
      const knowledge = isInteraction ? null : r.knowledge.find(k => k.owner === perspective
        && stage(k.knownFrom) <= stage(timeline) && (k.mode !== 'reported' || USABLE.has(k.sourceStatus)));
      const modelRow = r.kind === 'userinteraction'
        ? { kind: r.kind, type: r.type, speaker: r.speaker,
          epistemicStatus: { userfact: 'user-reported', plan: 'not-completed', characterspeculation: 'hypothesis' }[r.type], text: r.text }
        : { kind: r.kind, sourceStatus: r.sourceStatus,
          knowledgeMode: knowledge.mode ?? 'unspecified',
          ...(knowledge.mode === 'reported' ? { knowledgeSourceStatus: knowledge.sourceStatus } : {}), text: r.text };
      const addition = `${count ? '' : isInteraction ? INTERACTION_HEADER : HEADER}${JSON.stringify(modelRow)}\n`;
      const next = result[field] + addition;
      if (next.length > limits.maxChars || Buffer.byteLength(next, 'utf8') > limits.maxBytes) continue;
      result[field] = next;
      result[r.kind].push(r.kind === 'userinteraction'
        ? { id: r.id, ...modelRow }
        : { id: r.id, ...modelRow, sourceRefs: [...r.sourceRefs], knowledgeSourceRefs: [...(knowledge.sourceRefs ?? r.sourceRefs)] });
      if (isInteraction) memoryCount++; else canonCount++;
    }
    return result;
  };
}

/** Separate bounded canon and interaction projections. Adapter must reserve interaction memory first. */
export const resolveCharacterContext = createCharacterContextResolver(defaultPack);
