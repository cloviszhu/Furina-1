import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSpeechOptions } from '../server/tts-contract.js';
test('system fallback rejects unimplemented identity/emotion/stream capabilities', () => {
  assert.equal(validateSpeechOptions({ emotion: 'neutral' }).pcm, true);
  assert.throws(() => validateSpeechOptions({ emotion: 'happy' }), /真实情绪/);
  assert.throws(() => validateSpeechOptions({ referenceId: 'unprovided' }), /参考录音/);
  assert.throws(() => validateSpeechOptions({ stream: true }), /流式/);
});
