import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readdirSync, writeFileSync, readFileSync, symlinkSync, unlinkSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestReports, REPORT_LIMIT, REPORT_BYTES } from '../server/test-reports.js';
import { RemoteTests } from '../server/remote-tests.js';
import { MemoryStore } from '../server/memory.js';
import { RemoteBudget, PRICING } from '../server/budget.js';
import { BoundedTestRunner } from '../src/remote-tests.js';
import { createApp } from '../server/index.js';
const config = { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'fake-qa-key-only' };
const response = () => Response.json({ choices: [{ message: { content: '{"text":"fixture safe reply","emotion":"calm"}' } }], usage: { prompt_tokens: 10, completion_tokens: 8 } });
function fixture(fetchImpl = async () => response()) {
  const directory = mkdtempSync(join(tmpdir(), 'exo-reports-'));
  const store = new MemoryStore(':memory:');
  const budget = new RemoteBudget(store.db, { now: () => Date.parse(PRICING.verifiedAt) + 1000 });
  const reports = new TestReports(join(directory, 'test-reports'));
  const tests = new RemoteTests(budget, { reports, fetchImpl });
  return { directory, store, budget, reports, tests, close() { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}
const start = tests => tests.start({ id: randomUUID(), confirmed: true, config });

test('lost start/activation response, disconnected start, and cancel-before-create allow safe reopening with zero calls', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return response(); });
  try {
    const a = start(f.tests); f.tests.disconnectStart(a.id);
    const b = start(f.tests); // delivered at HTTP layer but lost by client
    const c = start(f.tests); // unacknowledged placeholder is replaceable
    assert.throws(() => f.tests.activate(b.id));
    f.tests.activate(c.id); // activation response can also be lost
    const d = start(f.tests); assert.notEqual(d.id, c.id);
    const cancelledId = randomUUID(); f.tests.cancel(cancelledId);
    assert.throws(() => f.tests.start({ id: cancelledId, confirmed: true, config }));
    await assert.rejects(f.tests.step(d.id, { index: 0, config }));
    assert.equal(calls, 0); assert.equal(f.budget.status().usedCalls, 0);
  } finally { f.close(); }
});

test('cancelled real in-flight request blocks replacement until settlement and isolates late reply', async () => {
  let resolve, calls = 0; const f = fixture(() => { calls++; return new Promise(r => { resolve = r; }); });
  try {
    const a = start(f.tests); f.tests.activate(a.id);
    const pending = f.tests.step(a.id, { index: 0, config }); f.tests.cancel(a.id);
    f.tests.run.createdAt -= 700000;
    assert.throws(() => start(f.tests), /in flight/);
    resolve(response()); const result = await pending;
    assert.equal(result.status, 'failed'); assert.equal(result.text, '');
    const b = start(f.tests); assert.notEqual(b.id, a.id);
    assert.equal(calls, 1); assert.equal(f.budget.status().usedCalls, 1);
    assert.equal(f.reports.read(a.id).rows[0].text, '');
  } finally { f.close(); }
});

test('UI cancellation during unknown start ID sends known client ID and never dispatches steps', async () => {
  let resolve, id, cancelled, steps = 0;
  const runner = new BoundedTestRunner({ request: async (path, options) => {
    if (path === '/api/remote-tests') { id = JSON.parse(options.body).id; return new Promise(r => { resolve = r; }); }
    if (path.endsWith('/cancel')) { cancelled = path; return {}; }
    steps++; return {};
  } });
  const pending = runner.start(config, {}); runner.stop();
  resolve({ id, scenarios: [], budget: {} }); await pending;
  assert.equal(cancelled, `/api/remote-tests/${id}/cancel`); assert.equal(steps, 0);
});

test('reports persist six allowlisted results, re-read after restart, never store config/errors/key or formal data', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return response(); });
  try {
    const a = start(f.tests); f.tests.activate(a.id);
    for (let index = 0; index < 6; index++) await f.tests.step(a.id, { index, config });
    const reports = new TestReports(join(f.directory, 'test-reports'));
    const report = reports.read(a.id); assert.equal(report.rows.length, 6); assert.equal(report.state, 'completed');
    assert.equal(report.rows[0].text, 'fixture safe reply'); assert.equal(report.rows[0].structured, true);
    const contents = readFileSync(join(f.directory, 'test-reports', `${a.id}.json`), 'utf8');
    assert(!contents.includes(config.apiKey)); assert(!contents.includes('config')); assert(!contents.includes('headers')); assert(!contents.includes('error'));
    assert.deepEqual(f.store.history(), []); assert.deepEqual(f.store.list(), []); assert.equal(calls, 6);
    assert.throws(() => reports.read('../exo.sqlite'));
    assert.throws(() => reports.read(randomUUID()));
    const file = join(f.directory, 'test-reports', `${a.id}.json`);
    writeFileSync(file, 'x'.repeat(REPORT_BYTES + 1)); assert.throws(() => reports.read(a.id));
  } finally { f.close(); }
});

test('full reports refuse new run without deleting old files or dispatching provider', () => {
  const f = fixture();
  try {
    f.reports.root(); for (let n = 0; n < REPORT_LIMIT; n++) writeFileSync(join(f.reports.directory, `${n}.keep`), 'preserve');
    assert.throws(() => start(f.tests)); assert.equal(readdirSync(f.reports.directory).length, REPORT_LIMIT);
    assert.equal(f.budget.status().usedCalls, 0);
  } finally { f.close(); }
});

test('report directory junction cannot read or write outside the managed report area', () => {
  const f = fixture(), outside = join(f.directory, 'outside');
  const target = new TestReports(outside); target.root();
  const link = join(f.directory, 'test-reports');
  try {
    symlinkSync(outside, link, 'junction');
    assert.throws(() => f.reports.list()); assert.throws(() => start(f.tests));
    assert.deepEqual(readdirSync(outside), []); assert.equal(f.budget.status().usedCalls, 0);
  } finally { unlinkSync(link); f.close(); }
});

test('HTTP read-only report API uses isolated DB/loopback and rejects hostile origin, Host, paths; echoed key rejected', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-report-http-')); let calls = 0;
  const context = await createApp({ dataDir: directory, fetchImpl: async () => { calls++; return Response.json({ choices: [{ message: { content: JSON.stringify({ text: config.apiKey, emotion: 'calm' }) } }] }); } });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${context.app.address().port}`;
  const post = (path, body) => fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const id = randomUUID(); const run = await (await post('/api/remote-tests', { id, confirmed: true, config })).json(); assert.equal(run.id, id);
    // Client abandons response without activation: replacement costs zero calls.
    const next = randomUUID(); assert.equal((await post('/api/remote-tests', { id: next, confirmed: true, config })).status, 201); assert.equal(calls, 0);
    await post(`/api/remote-tests/${next}/activate`, {}); await post(`/api/remote-tests/${next}/step`, { index: 0, config });
    const report = await (await fetch(`${url}/api/test-reports/${next}`)).json();
    assert.equal(report.rows[0].status, 'failed'); assert(!JSON.stringify(report).includes(config.apiKey));
    assert.equal((await (await fetch(url + '/api/test-reports')).json()).reports.length, 2);
    assert.equal((await fetch(url + '/api/test-reports', { headers: { Origin: 'https://evil.example' } })).status, 403);
    const badHost = await new Promise((resolve, reject) => {
      http.get(url + '/api/test-reports', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject);
    });
    assert.equal(badHost, 403);
    assert.equal((await fetch(url + '/api/test-reports/%2e%2e%2fexo.sqlite')).status, 404);
    assert.deepEqual(context.store.history(), []); assert.equal(calls, 1);
  } finally { await context.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('HTTP start response socket interruption frees placeholder without provider calls', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'exo-start-disconnect-')); let calls = 0;
  const context = await createApp({ dataDir: directory, fetchImpl: async () => { calls++; return response(); } });
  let cut = true;
  context.app.prependListener('request', (req, res) => {
    if (cut && req.url === '/api/remote-tests' && req.method === 'POST') {
      cut = false; res.end = () => { res.destroy(); return res; };
    }
  });
  await new Promise(r => context.app.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${context.app.address().port}`;
  const post = id => fetch(url + '/api/remote-tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, confirmed: true, config }) });
  try {
    await assert.rejects(post(randomUUID()));
    assert.equal((await post(randomUUID())).status, 201);
    assert.equal(calls, 0); assert.equal(context.budget.status().usedCalls, 0);
  } finally { await context.close(); rmSync(directory, { recursive: true, force: true }); }
});
