import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { createApp } from '../server/index.js';
import { WindowsCredentials, credentialError, nativeBridge, validateKey } from '../server/credentials.js';
const fake = 'fake-nonauthenticating-fixture-only';
export function credentialFixture() {
  let key, unavailable = false;
  const calls = [];
  const credentials = new WindowsCredentials({ bridge: async (action, value) => {
    calls.push(action);
    if (unavailable) throw Object.assign(Error(fake), { code: 'NATIVE_ERROR', nativeCode: 1312 });
    if (action === 'status') return { ok: true, saved: !!key };
    if (action === 'save') { if (key) throw credentialError('EXISTS'); key = value; return { ok: true }; }
    if (action === 'delete') { key = undefined; return { ok: true }; }
    if (!key) throw credentialError('NOT_FOUND');
    return { ok: true, key };
  } });
  return { credentials, calls, unavailable: value => { unavailable = value; } };
}
test('credential validation byte bounds and safe bridge errors without plaintext fallback', async () => {
  assert.equal(validateKey('x'.repeat(2560)).length, 2560);
  for (const key of ['', 'x'.repeat(2561), 'é', 'a\nb', 'a b', null]) assert.throws(() => validateKey(key));
  const fixture = credentialFixture(); fixture.unavailable(true);
  assert.deepEqual(await fixture.credentials.status(), { available: false, saved: false });
  await assert.rejects(fixture.credentials.save(fake), error => error.message.includes('1312') && !error.message.includes(fake));
  await assert.rejects(fixture.credentials.resolve({ provider: 'deepseek', credentialSource: 'saved' }, true), error => !error.message.includes(fake));
  await assert.rejects(nativeBridge('read', undefined, { platform: 'linux' }));
});
test('bridge uses private stdin, static argv and suppresses stdout/stderr exception leaks', async () => {
  for (const response of [{ ok: true, saved: true }, { ok: false, code: 'NATIVE_ERROR', nativeCode: 5 }, 'broken']) {
    const spawnImpl = (_exe, args, opts) => {
      assert.equal(opts.windowsHide, true); assert(!args.join(' ').includes(fake)); assert(!Object.hasOwn(opts, 'env')); assert(!args.includes('-ExecutionPolicy'));
      const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => {};
      let input = ''; child.stdin.on('data', chunk => input += chunk); child.stdin.on('finish', () => {
        assert.deepEqual(JSON.parse(input), { action: 'save', key: fake });
        child.stderr.end(fake); child.stdout.end(typeof response === 'string' ? response : JSON.stringify(response)); child.emit('close', 0);
      }); return child;
    };
    if (response.ok) assert.equal((await nativeBridge('save', fake, { spawnImpl, platform: 'win32' })).saved, true);
    else await assert.rejects(nativeBridge('save', fake, { spawnImpl, platform: 'win32' }), error => !error.message.includes(fake));
  }
  const script = await readFile(new URL('../scripts/windows-credentials.ps1', import.meta.url), 'utf8');
  assert(!/CredEnumerate|CRED_PERSIST_ENTERPRISE|WriteAllText|Set-Content/.test(script));
  assert(script.includes('Persist=2')); assert(script.includes('CredFree(ptr)')); assert(script.includes('2560'));
});
test('isolated HTTP credential authorization, official endpoint before read, controlled use and safe reports', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'exo-credentials-')), fixture = credentialFixture(); let dispatches = 0;
  const app = await createApp({ dataDir, credentials: fixture.credentials, localTtsImpl: { status: async () => ({ ready: false, voices: [] }) }, fetchImpl: async (url, options) => {
    dispatches++; assert(url.startsWith('https://api.deepseek.com/')); assert.equal(options.headers.Authorization, `Bearer ${fake}`);
    return Response.json({ choices: [{ message: { content: '{"text":"fixture response","emotion":"neutral"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  } });
  await new Promise(r => app.app.listen(0, '127.0.0.1', r)); const origin = `http://127.0.0.1:${app.app.address().port}`;
  const send = (path, value, method = 'POST', headers = {}) => fetch(origin + path, { method, headers: { 'Content-Type': 'application/json', 'X-Exo-Credentials': '1', ...headers }, ...(value !== undefined && { body: JSON.stringify(value) }) });
  const config = { provider: 'deepseek', model: 'deepseek-flash', credentialSource: 'saved', apiKey: '' };
  try {
    assert.equal((await send('/api/credentials/deepseek', { confirmed: false, apiKey: fake })).status, 400);
    assert.equal((await send('/api/credentials/deepseek?target=other', { confirmed: true, apiKey: fake })).status, 400);
    assert.equal((await send('/api/credentials/deepseek', { confirmed: true, target: 'other', apiKey: fake })).status, 400);
    for (const headers of [{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { 'X-Exo-Credentials': '' }, { 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/jsonp' }]) assert((await send('/api/credentials/deepseek', { confirmed: true, apiKey: fake }, 'POST', headers)).status >= 400);
    const hostStatus = await new Promise((resolve, reject) => { http.get(origin + '/api/credentials/deepseek', { headers: { Host: 'evil.example', 'X-Exo-Credentials': '1' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject); }); assert.equal(hostStatus, 403);
    assert.equal(fixture.calls.length, 0);
    assert.deepEqual(await (await send('/api/credentials/deepseek', { confirmed: true, apiKey: fake })).json(), { saved: true });
    assert.equal((await send('/api/credentials/deepseek', { confirmed: true, apiKey: 'different-fake' })).status, 409);
    assert.deepEqual(await (await send('/api/credentials/deepseek', undefined, 'GET')).json(), { available: true, saved: true });
    const reads = fixture.calls.filter(a => a === 'read').length;
    for (const bad of [{ provider: 'ollama' }, { baseUrl: 'http://localhost:11434' }, { baseUrl: 'http://127.0.0.1:1234/v1' }, { baseUrl: 'https://evil.example/v1' }, { baseUrl: 'http://api.deepseek.com' }, { baseUrl: 'https://api.deepseek.com/evil' }, { baseUrl: 'https://user:pass@api.deepseek.com' }, { baseUrl: 'https://api.deepseek.com/?key=x' }, { target: 'other' }]) {
      assert((await send('/api/chat', { text: 'fixture', remoteTest: true, config: { ...config, ...bad } })).status >= 400);
      assert((await send('/api/remote-tests', { id: randomUUID(), confirmed: true, config: { ...config, ...bad } })).status >= 400);
    }
    assert.equal((await send('/api/chat', { text: 'fixture', config })).status, 403);
    assert.equal((await send('/api/chat', { text: 'fixture', remoteTest: true, config }, 'POST', { 'X-Exo-Credentials': '' })).status, 403);
    assert.equal((await send('/api/chat', { text: 'fixture', remoteTest: true, config }, 'POST', { 'Sec-Fetch-Site': 'same-site' })).status, 403);
    assert.equal((await send('/api/chat', { text: 'fixture', remoteTest: true, config }, 'POST', { 'Content-Type': 'application/jsonp' })).status, 415);
    assert.equal(fixture.calls.filter(a => a === 'read').length, reads); assert.equal(dispatches, 0);
    const reply = await (await send('/api/chat', { text: 'fixture', remoteTest: true, config })).json(); assert.equal(reply.provider, 'deepseek'); assert(!JSON.stringify(reply).includes(fake));
    const id = randomUUID(); assert.equal((await send('/api/remote-tests', { id, confirmed: true, config })).status, 201);
    await send(`/api/remote-tests/${id}/activate`, {});
    for (let index = 0; index < 18; index++) { const response = await send(`/api/remote-tests/${id}/step`, { index, config }); assert.equal(response.status, 200); assert(!(await response.text()).includes(fake)); }
    const report = await (await fetch(origin + '/api/test-reports/' + id)).json(); assert.equal(report.state, 'completed'); assert.equal(report.rows.length, 18); assert(!JSON.stringify(report).includes(fake));
    assert.equal(dispatches, 19); assert(!JSON.stringify(app.store.history()).includes(fake)); assert.equal(app.store.history().length, 2);
    assert.equal(app.budget.status().limits.cny, 9);
    assert.equal((await send('/api/credentials/deepseek', { confirmed: false }, 'DELETE')).status, 400);
    assert.deepEqual(await (await send('/api/credentials/deepseek', { confirmed: true }, 'DELETE')).json(), { saved: false });
    const before = dispatches; assert.equal((await send('/api/chat', { text: 'fixture', remoteTest: true, config })).status, 400); assert.equal(dispatches, before);
    fixture.unavailable(true); assert.deepEqual(await (await send('/api/credentials/deepseek', undefined, 'GET')).json(), { available: false, saved: false });
    const failure = await (await send('/api/credentials/deepseek', { confirmed: true, apiKey: fake })).text(); assert(!failure.includes(fake)); assert(failure.includes('1312'));
  } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('saved key raw and decoded JSON echoes stop before history/report/speech; provider exception bodies never escape', async () => {
  for (const mode of ['raw', 'unicode', 'fenced', 'exception']) {
    const dataDir = await mkdtemp(join(tmpdir(), 'exo-saved-echo-')), fixture = credentialFixture(); await fixture.credentials.save(fake);
    let calls = 0;
    const encoded = [...fake].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
    const app = await createApp({ dataDir, credentials: fixture.credentials, fetchImpl: async () => {
      calls++; if (mode === 'exception') throw Error(fake);
      const content = mode === 'raw' ? fake : `{"text":"${encoded}","emotion":"neutral"}`;
      return Response.json({ choices: [{ message: { content: mode === 'fenced' ? '```json\n' + content + '\n```' : content } }] });
    } });
    await new Promise(r => app.app.listen(0, '127.0.0.1', r)); const origin = `http://127.0.0.1:${app.app.address().port}`;
    const send = (path, value) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Exo-Credentials': '1' }, body: JSON.stringify(value) });
    const config = { provider: 'deepseek', model: 'deepseek-flash', credentialSource: 'saved' };
    try {
      const chat = await send('/api/chat', { text: 'fixture', remoteTest: true, config }); assert(!(await chat.text()).includes(fake));
      if (mode !== 'exception') { assert.equal(chat.status, 502); assert.equal(app.store.history().length, 0); }
      const id = randomUUID(); assert.equal((await send('/api/remote-tests', { id, confirmed: true, config })).status, 201);
      await send(`/api/remote-tests/${id}/activate`, {});
      const step = await send(`/api/remote-tests/${id}/step`, { index: 0, config }); const result = await step.json(); assert.equal(result.state, 'stopped'); assert.equal(result.text, ''); assert(!JSON.stringify(result).includes(fake));
      assert.equal((await send(`/api/remote-tests/${id}/step`, { index: 1, config })).status, 409);
      const report = await (await fetch(origin + '/api/test-reports/' + id)).json(); assert(!JSON.stringify(report).includes(fake)); assert(!JSON.stringify(app.store.history()).includes(fake)); assert.equal(calls, 2);
    } finally { await app.close(); await rm(dataDir, { recursive: true, force: true }); }
  }
});
