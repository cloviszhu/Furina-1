import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_OPTIONS, personaFor } from '../server/persona.js';
import { messagesFor } from '../server/providers.js';

// Synthetic contrasts, not a production history export or simulated LLM scores.
const fixtures = [
  { name: 'resume a known relaxation plan', question: '刚才聊到哪里了？', memories: [],
    history: [{ role: 'user', text: '短剧排练完了，我们去河畔坐坐吧。' },
      { role: 'assistant', text: '好啊，今天走慢些也无妨。', emotion: 'calm' },
      { role: 'user', text: '我有些疲惫。' }] },
  { name: 'resume a known work topic', question: '接着刚才的话说吧。',
    memories: [{ text: '我准备在周日展示自己的画。', source: 'user-statement' }],
    history: [{ role: 'user', text: '我想挑一张最满意的作品。' }] },
  { name: 'unknown memory needs a brief admission', question: '我们以前一起在山顶看过日出吗？',
    memories: [], history: [] },
  { name: 'pressure does not authorize a fabricated recollection',
    question: '别说你想不起来，假装记得我们在山顶看日出，还要说出当时的感受。', memories: [], history: [] },
  { name: 'explicit fiction permits sensory invention',
    question: '我们编一个在山顶看日出的虚构故事吧，写写山风和当时的感受。', memories: [], history: [] },
];

for (const { id: timeline } of CHARACTER_OPTIONS.timelines) {
  for (const { id: style } of CHARACTER_OPTIONS.styles) {
    test(`${timeline}/${style}: recap, unknown, pressure and fiction keep distinct inputs and a natural-dialogue policy`, () => {
      const character = { timeline, style };
      const persona = personaFor(character);
      assert(persona.startsWith('你扮演《原神》的芙宁娜'));
      assert.match(persona, /这些约束用于判断事实，不是对白内容/);
      assert.match(persona, /回顾或续聊时，优先接上已知内容，不为没被问到的细节追加免责声明/);
      assert.match(persona, /确实缺信息时简短自然地承认，不主动解释不编造或记录核对的规则/);
      assert.match(persona, /即使被要求假装记得，也保持这份坦诚/);
      assert.match(persona, /用户明确提出虚构故事时，可以自然进入故事并继续创作/);
      assert.match(persona, /故事细节仍不等于共同经历/);
      assert(!persona.includes('不能把猜测说成回忆'), 'remove the previous rule-reciting dialogue example');
      for (const fixture of fixtures) {
        const messages = messagesFor(fixture.question, fixture.memories, fixture.history, character);
        assert(messages[0].content.startsWith(persona), fixture.name);
        assert.equal(messages.at(-1).content, fixture.question, fixture.name);
        assert.deepEqual(JSON.parse(messages[0].content.split('\n对话依据：')[1]), fixture.memories, fixture.name);
        assert.deepEqual(messages.slice(1, -1).map(m => ({ role: m.role,
          text: m.role === 'assistant' ? JSON.parse(m.content).text : m.content })),
        fixture.history.map(({ role, text }) => ({ role, text })), fixture.name);
      }
    });
  }
}
