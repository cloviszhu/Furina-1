import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_OPTIONS } from '../server/persona.js';
import { messagesFor } from '../server/providers.js';

// Synthetic fixtures derived from the delegated scenario, not a private DB export.
// These check prompt construction only; no provider is called or reply scored.
const sharedMemory = '今天我们一起吃了蓝莓小蛋糕，约定明天一起去湖边散散步';
const fixtures = [
  { name: 'recalled meal without sensory detail', question: '今天我们一起吃了什么？',
    memories: [{ text: sharedMemory, source: 'user-statement' }] },
  { name: 'future plan without a history of absence', question: '明天我们做什么？',
    memories: [{ text: sharedMemory, source: 'user-statement' }] },
  { name: 'unknown experience is not a denial', question: '记得我们一起去雪山那晚吗？', memories: [] },
  { name: 'grounded repetition and taste remain usable', question: '还记得蛋糕和我的习惯吗？',
    memories: [{ text: '我们都觉得蓝莓小蛋糕酸甜适中。我说过每次散步都提前到。', source: 'user-statement' }] },
  { name: 'explicit fiction may invent details', question: '编一个我们吃蓝莓蛋糕、我又迟到的虚构故事。', memories: [] },
];

for (const { id: timeline } of CHARACTER_OPTIONS.timelines) {
  for (const { id: style } of CHARACTER_OPTIONS.styles) {
    test(`${timeline}/${style}: grounded recall policy survives empty-history fixture requests`, () => {
      for (const fixture of fixtures) {
        const messages = messagesFor(fixture.question, fixture.memories, [], { timeline, style });
        assert.deepEqual(messages.map(m => m.role), ['system', 'user'], fixture.name);
        assert.equal(messages[1].content, fixture.question, fixture.name);
        const prompt = messages[0].content;
        const evidence = JSON.parse(prompt.split('\n对话依据：')[1]);
        assert.deepEqual(evidence, fixture.memories, fixture.name);
        assert.match(prompt, /没有用户明确陈述或已确认记忆支持，不用“又／每次／一向”等暗示用户过往行为/);
        assert.match(prompt, /不补写共同经历当时的味道、触感或心情/);
        assert.match(prompt, /可以调侃当前约定、表达自己的当下期待/);
        assert.match(prompt, /有据的往事和明确虚构故事仍可自然展开/);
        // Preserve prior epistemic and role boundaries rather than tightening into denial.
        for (const rule of ['未确认发生不等于确认未发生', '缺少回忆也不证明事情从未发生',
          '约好了不等于已赴约', '用户单方面说起不等于你亲历', '不是独立事实证据',
          '可以自然进入故事并继续创作', '故事细节仍不等于共同经历', '有自己的品味，会挑剔',
          '不必每轮以问题结尾', '当前回复必须包含 text 和有效 emotion']) {
          assert(prompt.includes(rule), `${fixture.name}: ${rule}`);
        }
      }
    });
  }
}

test('prior assistant embellishment stays history, not independent recalled evidence', () => {
  const history = [{ role: 'assistant', text: '那味道挺不错的，你可别到时候又找借口缺席。', emotion: 'happy' }];
  const messages = messagesFor('我以前缺席过吗？', [{ text: sharedMemory, source: 'user-statement' }], history,
    { timeline: 'performer', style: 'natural' });
  assert.deepEqual(JSON.parse(messages[0].content.split('\n对话依据：')[1]),
    [{ text: sharedMemory, source: 'user-statement' }]);
  assert.deepEqual(JSON.parse(messages[1].content), { text: history[0].text, emotion: 'happy' });
  assert.match(messages[0].content, /历史中你自己说过的话可能有误，不是独立事实证据/);
});
