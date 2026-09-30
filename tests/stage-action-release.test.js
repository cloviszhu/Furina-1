import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Euler } from 'three';
import { CharacterStage, settlePoseOffset } from '../src/stage.js';

test('cancelled raised elbow settles without a large frame step at different frame rates', () => {
  for (const hz of [30, 60, 120]) {
    const target = new Quaternion(), current = new Quaternion().setFromEuler(new Euler(0, .15, -2.4));
    const first = current.clone(); let last = current.clone();
    for (let frame = 0; frame < hz * 2; frame++) {
      settlePoseOffset(current, target, 1 / hz, true);
      assert(current.angleTo(last) <= 4.5 / hz + 1e-8);
      assert(current.angleTo(target) <= last.angleTo(target) + 1e-8);
      last.copy(current);
    }
    assert(first.angleTo(current) > 2); assert(current.angleTo(target) < .00001);
  }
});

test('small idle offsets keep exponential settling and zero time does not move a pose', () => {
  const target = new Quaternion().setFromEuler(new Euler(.02, .01, 0)), current = new Quaternion();
  const expected = current.clone().slerp(target, 1 - Math.exp(-8 / 60));
  settlePoseOffset(current, target, 1 / 60);
  assert(current.angleTo(expected) < 1e-7);
  const previous = current.clone(); settlePoseOffset(current, target, 0, true);
  assert(current.angleTo(previous) < 1e-7);
});

test('explicit cancellation remains idempotent and repeated gestures cannot seize an active action', () => {
  const stage = Object.create(CharacterStage.prototype); stage.action = null;
  assert(stage.trigger('greet')); const original = stage.action;
  assert.equal(stage.trigger('greet'), false); assert.equal(stage.trigger('nod'), false);
  assert.equal(stage.action, original);
  assert(stage.cancelAction()); assert.equal(stage.cancelAction(), false);
  assert(stage.trigger('nod')); assert.equal(stage.action.name, 'nod');
});
