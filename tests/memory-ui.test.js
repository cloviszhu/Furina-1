import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadSettings, saveSettings } from '../src/settings.js';

// Execute the real main.js event handlers with a tiny DOM and stubbed rendering,
// speech and HTTP. No WebGL, character assets, browser or external service needed.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag; this.children = []; this.dataset = {}; this.value = '';
    this.textContent = ''; this.className = ''; this.checked = false;
    this.classList = { toggle() {} };
  }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  addEventListener() {}
  get options() { return this.children; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  querySelector(selector) { return walk(this).find(n => selector[0] === '.' ? n.className.split(' ').includes(selector.slice(1)) : n.tagName === selector); }
}
function walk(node) { return node.children.flatMap(child => [child, ...walk(child)]); }
function button(node, label) { return walk(node).find(n => n.tagName === 'button' && n.textContent === label); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const event = { id: 'source-1', role: 'user', text: '我们在枫丹吃了蛋糕', provider: 'offline' };
const memory = { id: 'memory-1', text: event.text, sourceText: event.text, revision: 1, createdAt: '2026-09-30' };
const budget = { limits: { cny: 9, calls: null, outputTokens: 128, inputBytes: 16000 }, usedCalls: 0, reservedCny: 0, remainingCny: 9, pricingCurrent: false };

async function ui() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const nodes = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  let history = [{ ...event }], memories = [{ ...memory }];
  const posts = [], spoken = []; let stops = 0;
  const pending = deferred();
  const document = { getElementById: id => nodes[id], createElement: tag => new Element(tag), querySelectorAll: () => [] };
  const context = vm.createContext({
    loadSettings, saveSettings,
    document, console, confirm: () => true, addEventListener() {},
    initReferences() {},
    mountRemoteTests() {},
    CharacterStage: class { trigger() {} resetCamera() {} },
    SpeechController: class { constructor() { this.voices = []; } stop() { ++stops; } async listVoices() { return []; } async speak(text) { spoken.push(text); } },
    fetch: async (path, options = {}) => {
      let data;
      if (path === '/api/status') data = { providers: [], models: [], budget };
      else if (path === '/api/history') data = history.map(e => ({ ...e }));
      else if (path.startsWith('/api/sources/')) data = { valid: history.some(e => path.includes(e.id)) };
      else if (path === '/api/memories' && options.method === 'POST') { posts.push(JSON.parse(options.body)); data = memories; }
      else if (path === '/api/memories') data = memories.map(m => ({ ...m }));
      else if (path === '/api/chat') return await pending.promise;
      else if (path === '/api/memories/memory-1') {
        history = [];
        memories = options.method === 'DELETE' ? [] : [{ ...memory, text: JSON.parse(options.body).text }];
        data = memories;
      } else throw Error(`Unexpected mock path ${path}`);
      return { ok: true, json: async () => data };
    },
  });
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace('void boot().catch(fail);', 'globalThis.bootPromise = boot().catch(fail);');
  vm.runInContext(source, context, { filename: 'src/main.js' });
  await context.bootPromise;
  nodes.provider.value = 'offline'; nodes['auto-speak'].checked = true;
  return { nodes, context, posts, spoken, pending, stops: () => stops, clearHistory: () => { history = []; } };
}

for (const mutation of ['PATCH', 'DELETE']) {
  test(`UI ${mutation} clears selected source and blocks late chat display/speech; manual save recovers`, async () => {
    const app = await ui(); const { nodes, context } = app;
    button(nodes.messages, '保存为共同经历').onclick();
    assert.equal(nodes['memory-text'].value, event.text);
    nodes['chat-input'].value = '还记得蛋糕吗';
    const sending = vm.runInContext("send($('chat-input').value)", context);
    const card = nodes['memory-list'].children[0];
    const previousStops = app.stops();
    if (mutation === 'PATCH') {
      button(card, '修改').onclick(); card.querySelector('textarea').value = '我们吃了布丁';
      await button(card, '保存修改').onclick();
    } else await button(card, '删除').onclick();
    assert(app.stops() > previousStops);
    assert.equal(nodes['memory-text'].value, '');
    assert.equal(nodes['memory-source'].textContent, '来源：你的手动记录');
    // Even an old 200 already produced before the mutation must not reach UI/TTS.
    app.pending.resolve({ ok: true, json: async () => ({ user: event, assistant: { ...event, id: 'old-assistant', role: 'assistant' }, provider: 'offline', recalled: [memory], budget }) });
    await sending;
    assert(!walk(nodes.messages).some(n => n.dataset.eventId === 'old-assistant'));
    assert.deepEqual(app.spoken, []);
    assert.equal(nodes.send.disabled, false);
    nodes['memory-manual'].onclick(); nodes['memory-text'].value = '新的手动记录';
    await nodes['memory-form'].onsubmit({ preventDefault() {} });
    assert.deepEqual(app.posts, [{ text: '新的手动记录', sourceId: null }]);
  });
}

test('UI revalidates vanished source before POST and allows explicit manual recovery', async () => {
  const app = await ui(); const { nodes } = app;
  button(nodes.messages, '保存为共同经历').onclick(); app.clearHistory();
  await nodes['memory-form'].onsubmit({ preventDefault() {} });
  assert.deepEqual(app.posts, []);
  assert(nodes['app-error'].textContent.includes('来源已失效'));
  assert.equal(nodes['memory-text'].value, event.text);
  nodes['memory-text'].value = '我确认的手动记录'; nodes['memory-manual'].onclick();
  await nodes['memory-form'].onsubmit({ preventDefault() {} });
  assert.deepEqual(app.posts, [{ text: '我确认的手动记录', sourceId: null }]);
});

test('UI preserves valid conversation source and manual option detaches explicitly', async () => {
  const app = await ui(); const { nodes } = app;
  button(nodes.messages, '保存为共同经历').onclick();
  await nodes['memory-form'].onsubmit({ preventDefault() {} });
  assert.deepEqual(app.posts, [{ text: event.text, sourceId: event.id }]);
  button(nodes.messages, '保存为共同经历').onclick(); nodes['memory-manual'].onclick();
  assert.equal(nodes['memory-text'].value, event.text);
  await nodes['memory-form'].onsubmit({ preventDefault() {} });
  assert.equal(app.posts[1].sourceId, null);
});

test('UI history refresh drops a source removed in another tab', async () => {
  const app = await ui(); const { nodes } = app;
  button(nodes.messages, '保存为共同经历').onclick(); app.clearHistory();
  await vm.runInContext('refreshHistory()', app.context);
  assert.equal(nodes['memory-text'].value, event.text);
  nodes['memory-text'].value = '新记录';
  await nodes['memory-form'].onsubmit({ preventDefault() {} });
  assert.equal(app.posts[0].sourceId, null);
});

test('UI validates early selected source outside the latest history window and preserves draft on lookup failure', async () => {
  const app = await ui(), { nodes, context } = app;
  button(nodes.messages, '保存为共同经历').onclick();
  const fetch = context.fetch;
  context.fetch = async (path, options) => path === '/api/history'
    ? { ok: true, json: async () => Array.from({ length: 16 }, (_, i) => ({ id: `later-${i}`, role: 'user', text: 'later' })) }
    : fetch(path, options);
  await vm.runInContext('refreshHistory()', context);
  assert.equal(nodes['memory-source'].textContent, '来源：这条用户消息');
  await nodes['memory-form'].onsubmit({ preventDefault() {} });
  assert.deepEqual(app.posts, [{ text: event.text, sourceId: event.id }]);
  vm.runInContext(`memorySourceId = '${event.id}'`, context); nodes['memory-text'].value = '保留这份编辑草稿';
  context.fetch = async path => { throw new Error('offline'); };
  await nodes['memory-form'].onsubmit({ preventDefault() {} });
  assert.equal(nodes['memory-text'].value, '保留这份编辑草稿');
});

for (const path of ['/api/history', '/api/memories']) {
  test(`UI discards a late ${path} snapshot after deletion`, async () => {
    const app = await ui(); const { context, nodes } = app;
    const delayed = deferred(); const fetch = context.fetch;
    let first = true;
    context.fetch = async (url, options) => {
      if (first && url === path) { first = false; return await delayed.promise; }
      return fetch(url, options);
    };
    const refresh = vm.runInContext(path === '/api/history' ? 'refreshHistory()' : 'memories()', context);
    await button(nodes['memory-list'].children[0], '删除').onclick();
    delayed.resolve({ ok: true, json: async () => path === '/api/history' ? [event] : [memory] });
    await refresh;
    assert(!walk(nodes.messages).some(n => n.dataset.eventId === event.id));
    assert(!walk(nodes['memory-list']).some(n => n.dataset.memoryId === memory.id));
    assert.equal(nodes['memory-count'].textContent, 0);
  });
}
