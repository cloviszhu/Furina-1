import test from 'node:test';
import assert from 'node:assert/strict';
import pack from '../server/data/furina-canon-4.2.v1.json' with { type: 'json' };
import { createCharacterContextResolver, resolveCharacterContext, CHARACTER_CONTEXT_LIMITS } from '../server/character-context.js';

// SYNTHETIC mechanics-only evidence. Never an assertion that a game event/source was verified.
const source = { id: 'synthetic', url: 'https://example.invalid/synthetic-test',
  sourceStatus: 'primary-verified', authorship: 'synthetic-test-only', locator: 'SYNTHETIC boundary fixture', publication: '2099-01-01' };
function row(id, overrides = {}) {
  return { id, kind: 'canonicalfact', enabled: true, sourceStatus: 'primary-verified', sourceRefs: ['synthetic'],
    canonEdition: '4.2', eventAt: 'aftermath', visibility: 'private',
    knowledge: [{ owner: 'furina', knownFrom: 'aftermath', basis: 'SYNTHETIC test evidence' }],
    topics: ['topic'], entities: ['entity'], aliases: ['alias'], text: `SYNTHETIC ${id}`, ...overrides };
}
function resolver(records, sources = [source]) {
  return createCharacterContextResolver({ schemaVersion: 1, packVersion: 'synthetic-test-only', canonEdition: '4.2', sources, records });
}
const allIds = r => [...r.canonicalfact, ...r.characterinterpretation, ...r.userinteraction].map(x => x.id);
const future = id => row(id, { text: `SYNTHETIC-${id}`, eventAt: 'performer', knowledge: [{ owner: 'furina', knownFrom: 'performer', basis: 'SYNTHETIC future self-event' }] });

test('real pack audit: 12 records, 11 qualified references/transcriptions, 1 pending, zero direct primary', () => {
  assert.equal(pack.records.length, 12);
  assert.equal(pack.records.filter(x => x.enabled).length, 11);
  assert.equal(pack.records.filter(x => !x.enabled && x.sourceStatus === 'pending').length, 1);
  assert.equal(pack.records.filter(x => x.sourceStatus === 'primary-verified').length, 0);
  for (const r of pack.records.filter(x => x.enabled && x.sourceStatus === 'reference-transcript-checked')) {
    assert.equal(r.sourceStatus, 'reference-transcript-checked');
    for (const ref of r.sourceRefs) {
      const s = pack.sources.find(x => x.id === ref);
      assert.equal(s.authorship, 'community-or-unverified');
      assert.match(s.locator, /About Navia/);
    }
  }
  assert.equal(pack.records.filter(x => x.enabled && x.kind === 'canonicalfact').length, 9);
  assert.equal(pack.records.filter(x => x.enabled && x.kind === 'characterinterpretation').length, 2);
});

test('actual reference dessert facts and interpretation stay separate; pending texts never leave resolver', () => {
  const r = resolveCharacterContext({ query: '马卡龙', maxRecords: 12 });
  assert.deepEqual(r.canonicalfact.map(x => x.id), ['navia-desserts']);
  const both = resolveCharacterContext({ topics: ['desserts'], maxRecords: 12 });
  assert.equal(both.characterinterpretation[0].id, 'navia-desserts-feeling');
  for (const timeline of ['aftermath', 'performer']) {
    const text = JSON.stringify(resolveCharacterContext({ timeline, maxRecords: 12 }));
    for (const pending of pack.records.filter(x => !x.enabled)) {
      assert.equal(text.includes(pending.id), false);
      assert.equal(text.includes(pending.text), false);
    }
  }
});

test('real qualified Vision/Clio/return exact text is forbidden in aftermath and allowed in performer', () => {
  for (const id of ['vision-received', 'clio-performance', 'performance-return']) {
    const record = pack.records.find(x => x.id === id);
    const earlier = resolveCharacterContext({ timeline: 'aftermath', query: record.text, maxRecords: 12, maxBytes: 4096 });
    assert.equal(allIds(earlier).includes(id), false);
    assert.equal(earlier.modelPrompt.includes(record.text), false);
    assert.ok(allIds(resolveCharacterContext({ timeline: 'performer', query: record.text, maxRecords: 12, maxBytes: 4096 })).includes(id));
  }
});

test('SYNTHETIC verified future Vision and performance: exact query cannot bypass aftermath', () => {
  const rows = [future('future-vision'), future('future-performance')];
  const resolve = resolver(rows);
  for (const r of rows) {
    assert.deepEqual(allIds(resolve({ timeline: 'aftermath', query: r.text })), []);
    assert.deepEqual(allIds(resolve({ timeline: 'performer', query: r.text })), [r.id]);
    assert.equal(JSON.stringify(resolve({ query: r.text })).includes(r.text), false);
  }
});

test('SYNTHETIC past event acquired later is still unknown until knownFrom', () => {
  const resolve = resolver([row('late-knowledge', { knowledge: [{ owner: 'furina', knownFrom: 'performer', basis: 'SYNTHETIC later disclosure' }] })]);
  assert.deepEqual(allIds(resolve({ topics: ['topic'] })), []);
  assert.deepEqual(allIds(resolve({ timeline: 'performer', topics: ['topic'] })), ['late-knowledge']);
});

test('SYNTHETIC private Focalors/Neuvillette conversation and author knowledge do not reach Furina', () => {
  const r = row('private-conversation', { text: 'SYNTHETIC PRIVATE SPOILER', knowledge:
    ['focalors', 'neuvillette', 'author'].map(owner => ({ owner, knownFrom: 'aftermath', basis: 'SYNTHETIC participant or audience' })) });
  const resolve = resolver([r]);
  assert.deepEqual(allIds(resolve({ query: r.text })), []);
  assert.equal(JSON.stringify(resolve({ query: r.text })).includes('SPOILER'), false);
  for (const perspective of ['focalors', 'neuvillette', 'author']) assert.deepEqual(allIds(resolve({ perspective, query: r.text })), [r.id]);
});

test('SYNTHETIC public does not imply character knows; promotional interpretation stays with author', () => {
  const resolve = resolver([row('public-unknown', { visibility: 'public', knowledge: [{ owner: 'author', knownFrom: 'aftermath', basis: 'SYNTHETIC audience' }] }),
    row('promotion', { kind: 'characterinterpretation', sourceStatus: 'primary-promotion-checked', sourceRefs: ['promotion'],
      visibility: 'public', knowledge: [{ owner: 'author', knownFrom: 'aftermath', basis: 'SYNTHETIC promotion' }] })],
  [source, { ...source, id: 'promotion', sourceStatus: 'primary-promotion-checked' }]);
  assert.deepEqual(allIds(resolve({ topics: ['topic'] })), []);
  assert.equal(resolve({ perspective: 'author', topics: ['topic'] }).canonicalfact.length, 1);
  assert.equal(resolve({ perspective: 'author', topics: ['topic'] }).characterinterpretation.length, 1);
});

test('SYNTHETIC publication date never moves an old event into the future', () => {
  assert.deepEqual(allIds(resolver([row('old-event')])({ topics: ['topic'] })), ['old-event']);
});

test('edition uses exact match; invalid timeline and perspective fail explicitly', () => {
  assert.deepEqual(allIds(resolveCharacterContext({ canonEdition: '4.3' })), []);
  assert.deepEqual(allIds(resolveCharacterContext({ canonEdition: '4.20' })), []);
  for (const options of [{ timeline: 'future' }, { perspective: 'omniscient' }, { timeline: 'constructor' }, null]) {
    assert.throws(() => resolveCharacterContext(options), TypeError);
  }
});

test('topic outranks entity, entity outranks alias, alias outranks text; codepoint id tiebreak stable', () => {
  const rows = [row('text', { topics: [], entities: [], aliases: [], text: 'needle' }),
    row('alias', { topics: [], entities: [], aliases: ['needle'] }),
    row('entity', { topics: [], entities: ['needle'], aliases: [] }),
    row('topic-b', { topics: ['needle'], entities: [], aliases: [] }),
    row('topic-a', { topics: ['needle'], entities: [], aliases: [] })];
  const a = resolver(rows)({ query: 'ＮＥＥＤＬＥ' });
  assert.deepEqual(allIds(a), ['topic-a', 'topic-b', 'entity', 'alias', 'text']);
  assert.deepEqual(a, resolver([...rows].reverse())({ query: 'ＮＥＥＤＬＥ' }));
  assert.deepEqual(a, resolver(rows)({ query: 'ＮＥＥＤＬＥ' }));
  assert.deepEqual(allIds(resolver(rows)({ query: 'unrelated' })), []);
});

test('explicit topic/entity hints and Chinese aliases work', () => {
  assert.ok(allIds(resolveCharacterContext({ topics: ['决斗'] })).includes('callas-duel-witness'));
  assert.ok(allIds(resolveCharacterContext({ entities: ['娜维娅'] })).includes('navia-desserts'));
  assert.ok(allIds(resolveCharacterContext({ query: '你喜欢马卡龙吗？' })).includes('navia-desserts'));
});

test('user conflict, plan and character speculation remain typed; cannot override canon or leak extra fields', () => {
  const interactions = [
    { id: 'claim', type: 'userfact', speaker: 'user', timeline: 'aftermath', text: '用户声称她讨厌马卡龙', kind: 'canonicalfact', enabled: true, secretExtra: 'DO NOT INCLUDE' },
    { id: 'plan', type: 'plan', speaker: 'user', timeline: 'aftermath', text: '明天一起吃马卡龙' },
    { id: 'guess', type: 'characterspeculation', speaker: 'assistant', timeline: 'aftermath', text: '也许会喜欢马卡龙' }
  ];
  const before = resolveCharacterContext({ query: '马卡龙' });
  const after = resolveCharacterContext({ query: '马卡龙', interactions });
  assert.deepEqual(before.canonicalfact, after.canonicalfact);
  assert.equal(after.userinteraction.length, 3);
  assert.equal(after.userinteraction.find(x => x.id === 'plan').epistemicStatus, 'not-completed');
  assert.equal(after.userinteraction.find(x => x.id === 'guess').epistemicStatus, 'hypothesis');
  assert.equal(after.userinteraction.find(x => x.id === 'claim').epistemicStatus, 'user-reported');
  assert.equal(JSON.stringify(after).includes('DO NOT INCLUDE'), false);
  assert.deepEqual(after, resolveCharacterContext({ query: '马卡龙', interactions: [...interactions].reverse() }));
  assert.deepEqual(resolveCharacterContext({ query: '马卡龙' }), before);
});

test('interactions from other timeline never cross contexts; assistant claims cannot masquerade as user facts', () => {
  const i = { id: 'future-interaction', type: 'plan', speaker: 'user', timeline: 'performer', text: 'SYNTHETIC FUTURE INTERACTION' };
  assert.equal(resolveCharacterContext({ query: i.text, interactions: [i] }).userinteraction.length, 0);
  assert.equal(resolveCharacterContext({ query: i.text, timeline: 'performer', interactions: [i] }).userinteraction.length, 1);
  assert.throws(() => resolveCharacterContext({ interactions: [{ ...i, type: 'userfact', speaker: 'assistant' }] }), TypeError);
  assert.throws(() => resolveCharacterContext({ interactions: [{ ...i, type: 'canonicalfact' }] }), TypeError);
});

test('canon record and complete UTF-16 character budget includes header/JSON labels/newlines', () => {
  const interactions = [{ id: 'i', type: 'userfact', speaker: 'user', timeline: 'aftermath', text: '😀用户报告' }];
  for (const maxRecords of [0, 1, 2, 12]) for (const maxChars of [0, 1, 100, 300, 700, 6000]) {
    const r = resolveCharacterContext({ query: '马卡龙', maxRecords, maxChars, interactions });
    assert.ok(r.canonicalfact.length + r.characterinterpretation.length <= maxRecords);
    assert.ok(r.modelPrompt.length <= maxChars);
    assert.equal(r.modelPrompt.endsWith('\n'), r.modelPrompt.length > 0);
    if (r.modelPrompt) for (const line of r.modelPrompt.split('\n').slice(1).filter(Boolean)) assert.doesNotThrow(() => JSON.parse(line));
  }
  const full = resolver([row('one')])({ topics: ['topic'] });
  assert.equal(resolver([row('one')])({ topics: ['topic'], maxChars: full.modelPrompt.length }).modelPrompt, full.modelPrompt);
  assert.equal(resolver([row('one')])({ topics: ['topic'], maxChars: full.modelPrompt.length - 1 }).modelPrompt, '');
});

test('oversize ranked row is skipped whole; later fitting row remains usable', () => {
  const resolve = resolver([row('a-long', { text: 'SYNTHETIC ' + 'x'.repeat(2000) }), row('b-short')]);
  assert.deepEqual(allIds(resolve({ topics: ['topic'], maxChars: 500 })), ['b-short']);
});

test('hard limits reject invalid values rather than rounding or coercing', () => {
  for (const key of ['maxRecords', 'maxChars', 'maxBytes']) for (const value of [-1, 0.5, NaN, Infinity, '1', CHARACTER_CONTEXT_LIMITS[key] + 1]) {
    assert.throws(() => resolveCharacterContext({ [key]: value }), TypeError);
    assert.throws(() => resolveCharacterContext({ interactionBudget: { [key]: value } }), TypeError);
  }
  assert.throws(() => resolveCharacterContext({ query: 'x'.repeat(4097) }), TypeError);
  assert.throws(() => resolveCharacterContext({ topics: 'desserts' }), TypeError);
});

test('trusted pack copied; caller input/result mutation cannot change subsequent selection', () => {
  const original = row('stable');
  const resolve = resolver([original]);
  original.text = 'MUTATED'; original.knowledge[0].owner = 'author';
  const result = resolve({ topics: ['topic'] });
  result.canonicalfact[0].sourceRefs.push('MUTATED'); result.canonicalfact[0].text = 'MUTATED';
  assert.equal(resolve({ topics: ['topic'] }).canonicalfact[0].text, 'SYNTHETIC stable');
  assert.deepEqual(resolve({ topics: ['topic'] }).canonicalfact[0].sourceRefs, ['synthetic']);
});

test('pack rejects fake checked status, unknown sources, promotion-as-canon, unknown chronology and duplicates', () => {
  for (const r of [row('bad', { sourceStatus: 'pending' }), row('bad', { sourceRefs: ['missing'] }),
    row('bad', { sourceStatus: 'primary-promotion-checked' }), row('bad', { eventAt: 'later' }),
    row('bad', { eventAt: 'performer' }), row('bad', { kind: 'userinteraction' }),
    row('bad', { knowledge: [{ owner: 'everyone', knownFrom: 'aftermath', basis: 'unknown' }] })]) {
    assert.throws(() => resolver([r]), TypeError);
  }
  assert.throws(() => resolver([row('duplicate'), row('duplicate')]), TypeError);
  assert.throws(() => resolver([row('bad')], [{ ...source, sourceStatus: 'pending' }]), TypeError);
  assert.throws(() => resolver([row('promotion-self', { kind: 'characterinterpretation', sourceStatus: 'primary-promotion-checked' })],
    [{ ...source, sourceStatus: 'primary-promotion-checked' }]), TypeError);
});

test('excluded content, source notes, exclusion reasons and query echo are absent from every output field', () => {
  const resolve = resolver([row('allowed'), row('disabled', { enabled: false, sourceStatus: 'pending',
    text: 'EXCLUDED FACT', verificationTodo: 'EXCLUDED SPOILER REASON' }), future('future-event')],
  [{ ...source, evidence: 'SOURCE SPOILER NOTE' }]);
  const output = JSON.stringify(resolve({ topics: ['topic'] }));
  for (const sentinel of ['EXCLUDED FACT', 'EXCLUDED SPOILER REASON', 'SOURCE SPOILER NOTE', 'future-event']) assert.equal(output.includes(sentinel), false);
  assert.equal(JSON.stringify(resolve({ query: 'DO NOT ECHO QUERY' })).includes('DO NOT ECHO QUERY'), false);
});

test('empty input, short noise, partial names/words and unrelated chatter inject nothing', () => {
  for (const query of ['', ' ', 'a', 'Ａ', 'na', '娜', '芙', '甜', '你好', '今天很累', '今天天气不错', 'macaron', 'nav', 'navigation', 'dessertsx']) {
    const result = resolveCharacterContext({ query });
    assert.deepEqual(allIds(result), [], query);
    assert.equal(result.modelPrompt, '', query);
    assert.equal(result.interactionPrompt, '', query);
  }
  for (const options of [{ topics: ['a', '甜'] }, { entities: ['娜', 'na'] }]) assert.equal(resolveCharacterContext(options).modelPrompt, '');
  const memory = { id: 'unqueried', type: 'userfact', speaker: 'user', timeline: 'aftermath', text: '马卡龙报告' };
  assert.equal(resolveCharacterContext({ interactions: [memory] }).interactionPrompt, '');
  assert.ok(resolveCharacterContext({ query: 'Tell me about Navia.' }).canonicalfact.length);
  assert.ok(resolveCharacterContext({ query: 'Do you like macarons?' }).canonicalfact.length);
});

test('UTF-8 byte boundary includes Chinese/emoji, headers, labels and newlines in both projections', () => {
  const resolve = resolver([row('unicode', { text: 'SYNTHETIC 中文😀' })]);
  const options = { topics: ['topic'], maxChars: 6000, maxBytes: 4096 };
  const full = resolve(options);
  const bytes = Buffer.byteLength(full.modelPrompt, 'utf8');
  assert.ok(bytes > full.modelPrompt.length);
  assert.equal(resolve({ ...options, maxBytes: bytes }).modelPrompt, full.modelPrompt);
  assert.equal(resolve({ ...options, maxBytes: bytes - 1 }).modelPrompt, '');
  const i = { id: 'unicode', type: 'userfact', speaker: 'user', timeline: 'aftermath', text: '中文😀用户报告' };
  const memory = resolveCharacterContext({ query: '用户报告', interactions: [i] });
  const memoryBytes = Buffer.byteLength(memory.interactionPrompt, 'utf8');
  assert.ok(memoryBytes > memory.interactionPrompt.length);
  assert.equal(resolveCharacterContext({ query: '用户报告', interactions: [i], interactionBudget: { maxBytes: memoryBytes } }).interactionPrompt, memory.interactionPrompt);
  assert.equal(resolveCharacterContext({ query: '用户报告', interactions: [i], interactionBudget: { maxBytes: memoryBytes - 1 } }).interactionPrompt, '');
});

test('canon cannot consume interaction memory record/char/byte budget and vice versa', () => {
  const options = { query: '马卡龙', interactions: [{ id: 'memory', type: 'plan', speaker: 'user', timeline: 'aftermath', text: '一起吃马卡龙' }] };
  const full = resolveCharacterContext(options);
  assert.ok(full.modelPrompt && full.interactionPrompt);
  assert.equal(full.modelPrompt.includes('一起吃马卡龙'), false);
  assert.equal(full.interactionPrompt.includes('canonicalfact'), false);
  for (const limits of [{ maxRecords: 0 }, { maxChars: 0 }, { maxBytes: 0 }]) {
    const r = resolveCharacterContext({ ...options, ...limits });
    assert.equal(r.modelPrompt, '');
    assert.deepEqual(r.userinteraction, full.userinteraction);
    assert.equal(r.interactionPrompt, full.interactionPrompt);
    const inverse = resolveCharacterContext({ ...options, interactionBudget: limits });
    assert.equal(inverse.interactionPrompt, '');
    assert.equal(inverse.modelPrompt, full.modelPrompt);
  }
});

test('SYNTHETIC private discussion requires a checked learning record; reported knowledge is not eyewitness', () => {
  const participants = [{ owner: 'neuvillette', knownFrom: 'before-aftermath', mode: 'eyewitness', basis: 'SYNTHETIC participant' }];
  const conversation = row('private-plan', { eventAt: 'before-aftermath', knowledge: participants });
  const options = { query: conversation.text };
  assert.deepEqual(allIds(resolver([conversation])(options)), []);
  const learning = { owner: 'furina', knownFrom: 'aftermath', mode: 'reported', basis: 'SYNTHETIC full truthful report',
    sourceStatus: 'primary-verified', sourceRefs: ['synthetic'] };
  const learned = row('private-plan', { eventAt: 'before-aftermath', knowledge: [...participants, learning] });
  const result = resolver([learned])(options);
  assert.deepEqual(allIds(result), ['private-plan']);
  assert.equal(result.canonicalfact[0].knowledgeMode, 'reported');
  assert.equal(result.canonicalfact[0].knowledgeSourceStatus, 'primary-verified');
  assert.deepEqual(result.canonicalfact[0].knowledgeSourceRefs, ['synthetic']);
  assert.equal(JSON.parse(result.modelPrompt.split('\n')[1]).knowledgeMode, 'reported');
  const secondaryLearning = { ...learning, sourceStatus: 'secondary_game_dialogue_transcription', sourceRefs: ['learning'] };
  const secondaryResult = resolver([row('private-plan', { eventAt: 'before-aftermath', knowledge: [...participants, secondaryLearning] })],
    [source, { ...source, id: 'learning', sourceStatus: 'secondary_game_dialogue_transcription' }])(options);
  assert.equal(secondaryResult.canonicalfact[0].sourceStatus, 'primary-verified');
  assert.equal(secondaryResult.canonicalfact[0].knowledgeSourceStatus, 'secondary_game_dialogue_transcription');
  assert.deepEqual(secondaryResult.canonicalfact[0].knowledgeSourceRefs, ['learning']);
  assert.deepEqual(allIds(resolver([row('private-plan', { eventAt: 'before-aftermath', knowledge: [...participants, { ...learning, sourceStatus: 'pending' }] })])(options)), []);
  assert.deepEqual(allIds(resolver([row('private-plan', { eventAt: 'before-aftermath', knowledge: [...participants, { ...learning, knownFrom: 'performer' }] })])(options)), []);
  assert.throws(() => resolver([row('invalid-learning', { knowledge: [{ ...learning, sourceRefs: ['missing'] }] })]), TypeError);
});

test('qualified real evidence: role/move/daily diet and earlier reluctance versus later unlocked voice-over', () => {
  for (const timeline of ['aftermath', 'performer']) for (const id of ['archon-role-ended', 'moved-out', 'macaroni-daily-life', 'earlier-performance-reluctance']) {
    const record = pack.records.find(x => x.id === id);
    assert.ok(allIds(resolveCharacterContext({ timeline, query: record.text })).includes(id));
  }
  const vision = pack.records.find(x => x.id === 'vision-received');
  assert.deepEqual(vision.sourceRefs, ['song-dialogue']); // Wiki Vision section ??? is not evidence.
  const learned = resolveCharacterContext({ query: '芙卡洛斯' });
  assert.equal(learned.canonicalfact.find(x => x.id === 'focalors-neuvillette-private').knowledgeMode, 'reported');
  assert.match(learned.modelPrompt, /不能自称亲眼/);
  assert.equal(pack.records.find(x => x.id === 'teaser-stage-choice').enabled, false);
});
