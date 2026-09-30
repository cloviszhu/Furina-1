import test from 'node:test';
import assert from 'node:assert/strict';
import { motionFrame } from '../src/motion.js';
import { softenStageFrame } from '../src/stage.js';

test('secondary rest movement stays bounded and preserves facial/audio channels and feet', () => {
  for (const expression of ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised']) {
    for (let time = 0; time <= 180; time += .125) {
      const options = { time, expression, mouth: .7, mode: 'idle' };
      const original = motionFrame(options), frame = softenStageFrame(motionFrame(options), options);
      assert.deepEqual(frame.morphs, original.morphs);
      assert.deepEqual(Object.keys(frame.bones), Object.keys(original.bones));
      for (const [name, angles] of Object.entries(frame.bones)) {
        assert(angles.every(Number.isFinite));
        const delta = Math.hypot(...angles.map((a, i) => a - original.bones[name][i]));
        assert(delta <= (name === '左腕' ? .069 : .026), `${name}: ${delta}`);
      }
    }
  }
});

test('greeting fully owns the active right arm, with smooth secondary release', () => {
  for (const elapsed of [0, .85, 1.4, 2.4, 3.6]) {
    const options = {time: 6 + elapsed, action: 'greet', elapsed, expression: 'neutral', mode: 'idle'};
    const original = motionFrame(options), frame = softenStageFrame(motionFrame(options), options);
    if (elapsed >= .85 && elapsed <= 2.4) {
      for (const name of ['右腕', '右ひじ', '右手首']) assert.deepEqual(frame.bones[name], original.bones[name]);
    }
  }
  const options = {time: 6, expression: 'neutral', mode: 'idle'};
  const a = softenStageFrame(motionFrame(options), options);
  const b = softenStageFrame(motionFrame({...options,time:6.001}), {...options,time:6.001});
  for (const name of Object.keys(a.bones)) assert(Math.hypot(...a.bones[name].map((v,i)=>v-b.bones[name][i])) < .001);
});
