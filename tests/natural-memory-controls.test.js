import test from 'node:test';
import assert from 'node:assert/strict';
import { NaturalMemoryControls } from '../src/natural-memory-controls.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const row = { key: 'opaque', text: '一起看了演出。', evidence: [{ label: '来源', text: 'fixture conversation' }] };

test('unconnected controls never dispatch; duplicate or malformed presentation rows fail visibly', async () => {
  const empty = new NaturalMemoryControls(); await empty.load(); assert.equal(empty.state.phase, 'unconnected');
  const controls = new NaturalMemoryControls({ adapter: { list: async () => [row, row] } }); await controls.load();
  assert.equal(controls.state.phase, 'error'); assert.match(controls.state.error, /格式无效/);
});
test('latest list owns rendering while failed reload retains known rows and a draft', async () => {
  const first = deferred(); let calls = 0;
  const controls = new NaturalMemoryControls({ adapter: { list: async () => ++calls === 1 ? first.promise : [row] } });
  const old = controls.load(); await controls.load(); controls.edit(row.key); controls.draft('纠正草稿');
  first.resolve([{ key: 'old', text: 'late' }]); await old; assert.deepEqual(controls.state.rows, [row]);
  controls.adapter.list = async () => { throw Error('fixture offline'); }; await controls.load();
  assert.equal(controls.state.edit.draft, '纠正草稿'); assert.deepEqual(controls.state.rows, [row]); assert.equal(controls.state.phase, 'error');
});
test('correction is explicit, locks duplicate submit, preserves failed draft and refreshes after success', async () => {
  const save = deferred(); let writes = 0, before = 0, changed = 0;
  const controls = new NaturalMemoryControls({ onBeforeMutation: () => { before++; }, onMutation: () => { changed++; }, adapter: {
    list: async () => [row], revise: async (key, text) => { assert.equal(key, row.key); assert.equal(text, '改为周末的演出'); writes++; return save.promise; },
  } });
  await controls.load(); controls.edit(row.key); controls.draft('改为周末的演出'); assert.equal(writes, 0);
  const pending = controls.save(); await controls.save(); await Promise.resolve(); assert.equal(writes, 1);
  controls.cancel(); assert(controls.state.edit); save.reject(Error('fixture revision conflict')); await pending;
  assert.equal(controls.state.edit.draft, '改为周末的演出'); assert.equal(changed, 0); assert.equal(controls.state.pending, null);
  controls.adapter.revise = async () => { writes++; }; await controls.save(); assert.equal(changed, 1); assert.equal(before, 2); assert.equal(controls.state.edit, null);
});
test('delete requires inline confirmation; failed deletion leaves the row and cancelled confirmation does nothing', async () => {
  let deletes = 0; const controls = new NaturalMemoryControls({ adapter: { list: async () => [row], remove: async () => { deletes++; throw Error('fixture failure'); } } });
  await controls.load(); await controls.remove(); assert.equal(deletes, 0);
  controls.confirmDelete(row.key); controls.cancel(); await controls.remove(); assert.equal(deletes, 0);
  controls.confirmDelete(row.key); await controls.remove(); assert.equal(deletes, 1); assert.equal(controls.state.rows.length, 1); assert.equal(controls.state.deleting, row.key);
});
test('mutation supersedes old list; disposing aborts and rejects all late render changes', async () => {
  let reads = 0; const old = deferred(), mutation = deferred(); let mutationSignal;
  const controls = new NaturalMemoryControls({ adapter: {
    list: async () => ++reads === 1 ? [row] : old.promise,
    revise: async (_key, _text, { signal }) => { mutationSignal = signal; return mutation.promise; },
  } });
  await controls.load(); controls.edit(row.key); const read = controls.load(); const write = controls.save(); await Promise.resolve();
  old.resolve([{ key: 'stale', text: 'stale' }]); await read; assert.deepEqual(controls.state.rows, [row]);
  controls.dispose(); assert(mutationSignal.aborted); const state = controls.state;
  mutation.resolve(); await write; assert.equal(controls.state, state); assert.equal(reads, 2);
});
test('another card cannot silently discard an unsaved correction', async () => {
  const controls = new NaturalMemoryControls({ adapter: { list: async () => [row, { key: 'second', text: '第二条' }] } });
  await controls.load(); controls.edit(row.key); controls.draft('未保存的纠正'); controls.edit('second'); controls.confirmDelete('second');
  assert.deepEqual(controls.state.edit, { key: row.key, draft: '未保存的纠正' }); assert.equal(controls.state.deleting, null);
  controls.cancel(); controls.edit('second'); assert.equal(controls.state.edit.key, 'second');
});
test('pagination appends using visible offset and a context invalidation rejects late pages', async () => {
  const offsets = [], pending = deferred();
  const controls = new NaturalMemoryControls({ adapter: { list: async ({ offset }) => { offsets.push(offset); return offset ? pending.promise : { rows: [row], hasMore: true }; } } });
  await controls.load(); assert(controls.state.hasMore); const more = controls.load({ append: true }); controls.invalidate();
  pending.resolve({ rows: [{ key: 'old', text: 'old context' }], hasMore: false }); await more;
  assert.deepEqual(offsets, [0, 1]); assert.deepEqual(controls.state.rows, []); assert.equal(controls.state.hasMore, false);
});
test('successful retained:false result reaches the mutation callback without repeating the write', async () => {
  let received, writes = 0;
  const controls = new NaturalMemoryControls({ adapter: { list: async () => [row], revise: async () => { writes++; return { retained: false }; } }, onMutation: result => { received = result; } });
  await controls.load(); controls.edit(row.key); await controls.save(); assert.equal(received.retained, false); assert.equal(writes, 1); assert.equal(controls.state.edit, null);
});
