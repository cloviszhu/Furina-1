import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVoicePreference } from '../src/voice-preference.js';
import { SpeechController } from '../src/speech.js';
const one = { value: 'neural:one', engine: 'gpt-sovits', localService: true };
const two = { value: 'neural:two', engine: 'gpt-sovits', localService: true };

test('temporary absence/failure preserves preference and recovers without persisting fallback', () => {
  let result = resolveVoicePreference(one.value, [two]);
  assert.equal(result.preferred, one.value); assert.equal(result.effective, two.value); assert.equal(result.reason, 'temporary');
  result = resolveVoicePreference(result.preferred, []);
  assert.equal(result.preferred, one.value); assert.equal(result.effective, '');
  result = resolveVoicePreference(result.preferred, [two, one]);
  assert.equal(result.effective, one.value); assert.equal(result.reason, 'ready');
  assert.equal(resolveVoicePreference(two.value, [one, two]).effective, two.value);
});

test('older delayed voice response cannot overwrite the newest playable list or status', async () => {
  const originalFetch = globalThis.fetch;
  let release;
  let calls = 0;
  globalThis.fetch = async () => {
    const request = ++calls;
    if (request === 1) await new Promise(r => { release = r; });
    return Response.json({ voices: [{ id: request === 1 ? 'old' : 'new', engine: 'gpt-sovits' }], localTts: { ready: request === 2 } });
  };
  try {
    const speech = new SpeechController({ onState() {}, onMouth() {} });
    const old = speech.listVoices(); await speech.listVoices(); release(); await old;
    assert.equal(speech.voices[0].value, 'neural:new'); assert.equal(speech.localStatus.ready, true);
  } finally { release?.(); globalThis.fetch = originalFetch; }
});

test('confirmed removal differs from temporary absence and restoration preserves later choice', () => {
  const removed = resolveVoicePreference(one.value, [one, two], [one.value]);
  assert.deepEqual(removed, { preferred: two.value, effective: two.value, reason: 'deleted' });
  assert.equal(resolveVoicePreference(removed.preferred, [one, two]).effective, two.value);
  const empty = resolveVoicePreference(one.value, [one], [one.value]);
  assert.equal(empty.preferred, ''); assert.equal(empty.effective, '');
  assert.equal(resolveVoicePreference(one.value, [one, two]).preferred, one.value); // Explicit new selection after restore.
});
