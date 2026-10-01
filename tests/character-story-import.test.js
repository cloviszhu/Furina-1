import test from 'node:test';
import assert from 'node:assert/strict';
import pack from '../server/data/furina-canon-4.2.v2.json' with { type: 'json' };
import coverage from '../server/data/furina-coverage-4.2.v2.json' with { type: 'json' };
import { resolveCharacterContext as resolve } from '../server/character-context.js';
import { messagesFor } from '../server/providers.js';

const rows = r => [...r.canonicalfact, ...r.characterinterpretation];
const ids = r => rows(r).map(r => r.id);
const wide = { maxRecords: 12, maxBytes: 4096, maxChars: 6000 };

test('expanded real pack has qualified evidence and a complete coverage inventory', () => {
  assert.equal(pack.records.length, 60);
  assert.equal(pack.records.filter(r => r.enabled).length, 56);
  assert.equal(pack.records.filter(r => !r.enabled).length, 4);
  assert.equal(pack.records.filter(r => r.sourceStatus === 'primary-verified').length, 0);
  const sources = new Map(pack.sources.map(s => [s.id, s]));
  for (const r of pack.records) {
    assert.equal(r.canonEdition, '4.2');
    assert.equal(r.validFrom, r.eventAt);
    assert.equal(r.knownFrom, r.knowledge[0].knownFrom);
    assert(r.evidence.length > 0);
    for (const e of r.evidence) {
      assert(sources.has(e.sourceRef));
      assert(e.section.length > 0);
      assert(sources.get(e.sourceRef).attributionUrl.startsWith('https://'));
    }
    for (const id of r.causalLinks ?? []) assert(pack.records.some(x => x.id === id));
  }
  const covered = coverage.coverage.flatMap(c => c.recordIds);
  assert.equal(new Set(covered).size, covered.length);
  assert.deepEqual([...covered, 'teaser-stage-choice'].sort(), pack.records.map(r => r.id).sort());
  assert.deepEqual(coverage.pendingRecordIds.sort(), pack.records.filter(r => !r.enabled).map(r => r.id).sort());
});

test('trial alternative source does not retroactively verify the wrong route or missing indexed passages', () => {
  const s = pack.sources.find(s => s.id === 'aq5-trial-search');
  assert.equal(s.sourceStatus, 'secondary_game_dialogue_transcription');
  assert.equal(s.verificationMethod, 'search_index_inspected');
  assert.equal(s.directPageVerified, false);
  assert.equal(s.audioVerified, false);
  assert.equal(pack.sources.find(s => s.id === 'aq5-trial-pending').sourceStatus, 'pending');
  for (const timeline of ['aftermath', 'performer']) {
    for (const [query, id] of [['审判舞台', 'act5-trial-stage'], ['接受审判', 'act5-trial-acceptance'],
      ['审判水测试', 'act5-trial-water-test'], ['测试水浓度', 'act5-trial-dilution-report'], ['审判双重判决', 'act5-trial-verdicts']]) {
      const r = rows(resolve({ ...wide, query, timeline })).find(r => r.id === id);
      assert(r, query);
      assert.deepEqual(r.sourceRefs, ['aq5-trial-search']);
      assert.equal(r.sourceStatus, 'secondary_game_dialogue_transcription');
      assert.equal(r.knowledgeMode, id.endsWith('report') ? 'reported' : 'experienced');
    }
    const claim = rows(resolve({ query: '审判水测试', timeline }))[0];
    assert.match(claim.text, /声称.*当庭说法/);
    const learned = rows(resolve({ query: '测试水浓度', timeline }))[0];
    assert.equal(learned.knowledgeMode, 'reported');
    assert.deepEqual(learned.knowledgeSourceRefs, ['aq5-trial-search']);
    assert.match(learned.text, /事前未获知/);
    const verdict = resolve({ query: '审判双重判决', timeline });
    assert(!verdict.modelPrompt.includes('毁掉水神神座'));
    assert(!verdict.modelPrompt.includes('假扮控诉'));
    assert(!verdict.modelPrompt.includes('verificationTodo'));
  }
});

test('each main act and personal arc retrieves its own scenes rather than dessert defaults', () => {
  for (const [query, id] of [
    ['海露港', 'act1-arrival-challenge'], ['林尼审判', 'act1-prosecution'],
    ['公子判决', 'act2-tartaglia-verdict'], ['首次茶会', 'act3-first-diplomacy'],
    ['第二次茶会', 'act4-second-tea-pressure'], ['秘密调查', 'act5-secret-investigation'],
    ['水文监测', 'act5-hydrology-monitoring'], ['救援计划', 'act5-plan-reported'],
    ['白淞回访', 'sq-navia-poisson-help'], ['面对白淞', 'sq-face-poisson'], ['终曲选择', 'sq-final-song-choice'],
  ]) {
    const r = resolve({ ...wide, query, timeline: 'performer' });
    assert(ids(r).includes(id), `${query}: ${ids(r)}`);
    assert(!ids(r).includes('navia-desserts'));
    assert.deepEqual(r, resolve({ ...wide, query, timeline: 'performer' }));
  }
});

test('exact future record text cannot bypass time and knowledge gates', () => {
  for (const r of pack.records.filter(r => r.enabled && r.eventAt === 'performer')) {
    assert(!ids(resolve({ ...wide, query: r.text, timeline: 'aftermath' })).includes(r.id), r.id);
    assert(ids(resolve({ ...wide, query: r.text, timeline: 'performer' })).includes(r.id), r.id);
  }
  for (const id of ['act4-attacker-motive-author', 'act5-origin-author']) {
    const r = pack.records.find(r => r.id === id);
    assert(!ids(resolve({ ...wide, query: r.text })).includes(id));
    assert(ids(resolve({ ...wide, query: r.text, perspective: 'author' })).includes(id));
  }
  const reported = rows(resolve({ query: '救援计划', ...wide })).find(r => r.id === 'act5-plan-reported');
  assert.equal(reported.knowledgeMode, 'reported');
  assert.equal(reported.knowledgeSourceStatus, 'secondary_game_dialogue_transcription');
  assert.deepEqual(reported.knowledgeSourceRefs, ['finale-dialogue']);
});

test('expanded pack preserves zero noise injection and never exposes pending evidence', () => {
  for (const query of ['', 'a', '娜', '你好', '今天有点累']) assert.equal(resolve({ query }).modelPrompt, '');
  for (const r of pack.records.filter(r => !r.enabled)) {
    const result = resolve({ ...wide, query: r.text, timeline: 'performer', perspective: 'author' });
    assert(!ids(result).includes(r.id));
    assert(!result.modelPrompt.includes(r.text));
    assert(!result.modelPrompt.includes('verificationTodo'));
  }
});

test('UTF8 canon budgets stay independent of interaction evidence and adapter history', () => {
  const interactions = [{ id: 'user-plan', type: 'plan', speaker: 'user', timeline: 'aftermath', text: '明天一起调查预言😀', topics: ['prophecy'] }];
  const expected = resolve({ query: '预言', interactions, maxBytes: 0 }).interactionPrompt;
  assert(expected.length > 0);
  for (const maxBytes of [0, 500, 1024, 4096]) {
    const r = resolve({ query: '预言', interactions, maxBytes, maxRecords: 12 });
    assert(Buffer.byteLength(r.modelPrompt) <= maxBytes);
    assert.equal(r.interactionPrompt, expected);
    assert(!r.modelPrompt.includes('明天一起调查'));
  }
  const history = [{ role: 'user', text: '保留我的话😀' }];
  const evidence = [{ sourceId: 'user-proof', sourceRole: 'user', text: '我的计划', epistemic: 'user_reported' }];
  const messages = messagesFor('秘密调查', [{ text: '保留用户记忆' }], history, undefined, { interactionEvidence: evidence });
  assert(messages[0].content.includes('保留用户记忆'));
  assert(messages[0].content.includes(JSON.stringify(evidence)));
  assert.deepEqual(messages.slice(1), [{ role: 'user', content: '保留我的话😀' }, { role: 'user', content: '秘密调查' }]);
});
