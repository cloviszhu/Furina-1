import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_KEY, cleanSettings, loadSettings, saveSettings } from '../src/settings.js';
const storage = () => { const map = new Map(); return { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key), map }; };
test('ordinary config whitelist roundtrip, migration and safe corruption/default fallback', () => {
  const store = storage(), options = { provider: 'deepseek', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com/v1', voice: 'neural:furina-community-reference-test', emotion: 'calm', speed: 1.2, timeline: 'performer', style: 'quiet', expressionMode: 'reply', apiKey: 'fake-secret', chat: 'private chat', budget: 999, credentialSource: 'saved', remoteChat: true, realChat: true, confirmed: true };
  assert(saveSettings(store, options));
  assert.deepEqual(loadSettings(store), cleanSettings(options));
  for (const forbidden of ['fake-secret', 'private chat', 'apiKey', 'budget', 'remoteChat', 'realChat', 'confirmed']) assert(!store.getItem(SETTINGS_KEY).includes(forbidden));
  store.setItem(SETTINGS_KEY, JSON.stringify({ version: 1, settings: options }));
  assert.equal(loadSettings(store).timeline, 'performer'); assert.equal(JSON.parse(store.getItem(SETTINGS_KEY)).version, 2);
  for (const raw of ['{', JSON.stringify({ version: 900, settings: options }), 'x'.repeat(8001)]) {
    store.setItem(SETTINGS_KEY, raw); assert.equal(loadSettings(store).provider, 'offline'); assert.equal(store.getItem(SETTINGS_KEY), undefined);
  }
  assert.equal(loadSettings({ getItem() { throw Error(); }, removeItem() { throw Error(); } }).model, '');
  assert.equal(saveSettings({ setItem() { throw Error(); } }, options), false);
});
test('rejects secret-bearing endpoints, unsafe enums/numbers/model and unavailable identity types', () => {
  for (const baseUrl of ['https://user:fake@api.deepseek.com', 'https://api.deepseek.com?key=fake', 'https://api.deepseek.com/#fake', 'file:///v1', 'https://api.deepseek.com/sk-fake', 'https://api.deepseek.com/fake-fixture']) assert.equal(cleanSettings({ baseUrl }).baseUrl, '');
  for (const speed of [NaN, Infinity, 0.6, 1.4, '1']) assert.equal(cleanSettings({ speed }).speed, 1);
  assert.equal(cleanSettings({ provider: 'evil', emotion: 'evil', timeline: 'evil', style: 'evil', expressionMode: 'evil' }).provider, 'offline');
  assert.equal(cleanSettings({ model: 'private chat text' }).model, '');
  assert.equal(cleanSettings({ model: 'sk-fake', voice: 'browser:0' }).model, '');
  assert.equal(cleanSettings({ voice: 'windows:voice-id' }).voice, '');
  const store = storage(); saveSettings(store, { model: 'fake-key-only', baseUrl: 'https://fake-key-only.example/v1' }, 'fake-key-only');
  assert(!store.getItem(SETTINGS_KEY).includes('fake-key-only'));
});
