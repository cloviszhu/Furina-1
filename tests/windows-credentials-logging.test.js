import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const executable = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const invocation = '[ExoCredentials]::Run()';
const imports = /  \[DllImport\("advapi32\.dll"[\s\S]*?static extern void CredFree\(IntPtr buffer\);/;

// All Cred APIs are replaced before this fixture can start. The random sentinel
// is created inside managed code (read) or sent only over stdin (save), never argv.
function fixtureSource(source, action) {
  const shim = `
  static string fixtureSentinel;
  static int fixtureNativeError=1168;
  static bool Read(string target, uint type, uint flags, out IntPtr pointer) {
    if (target!=Target || type!=1 || flags!=0) throw new Exception();
    pointer=IntPtr.Zero;
    if (String.Equals("${action}","save")) return false;
    fixtureSentinel="FAKE-NOT-A-KEY-"+Guid.NewGuid().ToString("N");
    byte[] bytes=Encoding.UTF8.GetBytes(fixtureSentinel);
    IntPtr blob=Marshal.AllocHGlobal(bytes.Length); Marshal.Copy(bytes,0,blob,bytes.Length);
    var credential=new Credential { Type=1, TargetName=Target, Comment=Owner, UserName=Owner, Persist=2, CredentialBlobSize=(uint)bytes.Length, CredentialBlob=blob };
    pointer=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Credential))); Marshal.StructureToPtr(credential,pointer,false); return true;
  }
  static bool Write(ref Credential credential, uint flags) {
    var bytes=new byte[credential.CredentialBlobSize]; Marshal.Copy(credential.CredentialBlob,bytes,0,bytes.Length);
    fixtureSentinel=Encoding.UTF8.GetString(bytes); Array.Clear(bytes,0,bytes.Length); return true;
  }
  static bool Delete(string target, uint type, uint flags) { return true; }
  static void CredFree(IntPtr pointer) {
    var credential=(Credential)Marshal.PtrToStructure(pointer,typeof(Credential));
    Marshal.FreeHGlobal(credential.CredentialBlob); Marshal.DestroyStructure(pointer,typeof(Credential)); Marshal.FreeHGlobal(pointer);
  }
  public static void LoggingProbe() {
    var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(new StreamReader(Console.OpenStandardInput()).ReadToEnd());
    int targetPid=Convert.ToInt32(data["pid"]);
    string sentinel=(string)data["sentinel"];
    bool readable=false, found=false, control=false; int count=0;
    string query="*[System[((EventID=800) or (EventID=4103)) and Execution[@ProcessID='"+targetPid+"'] and TimeCreated[@SystemTime >= '"+data["from"]+"' and @SystemTime <= '"+data["to"]+"']]]";
    foreach (string log in new string[] { "Windows PowerShell", "Microsoft-Windows-PowerShell/Operational" }) {
      try {
        using (var reader=new System.Diagnostics.Eventing.Reader.EventLogReader(new System.Diagnostics.Eventing.Reader.EventLogQuery(log,System.Diagnostics.Eventing.Reader.PathType.LogName,query))) {
          readable=true;
          System.Diagnostics.Eventing.Reader.EventRecord record;
          while ((record=reader.ReadEvent())!=null) {
            using(record) {
              // Query restricts both PID and time; never read other applications' logs.
              if(record.ProcessId!=targetPid) throw new Exception();
              string xml=record.ToXml(); count++;
              if(xml.Contains("EXO-LOGGING-CONTROL")) control=true;
              if(xml.Contains(sentinel)) found=true;
            }
          }
        }
      } catch { /* Report evidence availability, never broaden log query. */ }
    }
    string summary=new JavaScriptSerializer().Serialize(new { readable, found, control, count });
    byte[] output=Encoding.UTF8.GetBytes(summary);
    using(Stream pipe=Console.OpenStandardOutput()) { pipe.Write(output,0,output.Length); pipe.Flush(); }
  }
`;
  assert(imports.test(source));
  const result = source.replace(imports, shim).replaceAll('Marshal.GetLastWin32Error()', 'fixtureNativeError')
    .replace('Local\\ProjectExo-Furina1-DeepSeek-v1', 'Local\\Exo-logging-fixture-' + randomUUID());
  assert(!result.includes('DllImport')); // No real native credential calls possible.
  return result;
}

async function launch(command, request) {
  return await new Promise((resolve, reject) => {
    const from = new Date().toISOString();
    const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = ''; const timeout = setTimeout(() => { child.kill(); reject(Error('fake logging fixture timeout')); }, 20000);
    child.stdout.on('data', data => output += data.toString('utf8')); child.stderr.resume(); child.on('error', reject);
    child.on('close', code => { clearTimeout(timeout); code === 0 ? resolve({ output, pid: child.pid, from, to: new Date().toISOString() }) : reject(Error('fake fixture failed')); });
    child.stdin.end(typeof request === 'string' ? request : JSON.stringify(request));
  });
}

async function runFixture(source, request, { transcript, legacy = false, expectedSentinel } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'exo-credential-logging-'));
  const path = join(directory, 'own-fake-transcript.txt');
  try {
    const collector = source.slice(0, source.indexOf(invocation)) + `[ExoCredentials]::LoggingProbe()
} catch { [Console]::Out.Write('{"readable":false,"found":false,"control":false,"count":0}') }`;
    if (legacy) source = source.replace('  static object Execute(', '  public static object Execute(').replace(invocation, `$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
$result = [ExoCredentials]::Execute([string]$inputData.action, [string]$inputData.key)
$result | ConvertTo-Json -Compress`);
    const command = transcript ? `Import-Module Microsoft.PowerShell.Utility
(Get-Module Microsoft.PowerShell.Utility).LogPipelineExecutionDetails = $true
[void](Start-Transcript -LiteralPath '${path.replaceAll("'", "''")}' -Force)
Write-Output 'EXO-LOGGING-CONTROL'
${source}
Write-Output 'EXO-LOGGING-CONTROL'
[void](Stop-Transcript)` : source;
    const result = await launch(command, request);
    if (!transcript) return { response: JSON.parse(result.output) };
    const response = JSON.parse(result.output.replaceAll('EXO-LOGGING-CONTROL', '').trim());
    const text = await readFile(path, 'utf8');
    assert(text.includes('EXO-LOGGING-CONTROL'), 'transcription positive control absent');
    const sentinel = expectedSentinel || (request.action === 'read' ? response.key : request.key);
    const probe = await launch(collector, { pid: result.pid, from: result.from, to: result.to, sentinel });
    return { response, transcript: text, module: JSON.parse(probe.output) };
  } finally { await rm(directory, { recursive: true, force: true }); }
}

test('secret handling stays entirely inside no-argument void C# entry and private OS pipes', async () => {
  const source = await readFile(new URL('../scripts/windows-credentials.ps1', import.meta.url), 'utf8');
  assert(!/ConvertFrom-Json|ConvertTo-Json|\$inputData|\$result/.test(source));
  assert(source.includes('public static void Run()'));
  assert(!source.includes('public static object Execute('));
  assert(source.includes('Console.OpenStandardInput()')); assert(source.includes('Console.OpenStandardOutput()'));
  assert.equal(source.split(invocation).length, 2);
  assert(!/Set-ExecutionPolicy|Set-ItemProperty|Stop-Transcript|LogPipelineExecutionDetails/.test(source));
});

test('fake bridge protocol validates bounded JSON and serializes read/save without PowerShell data objects', { skip: process.platform !== 'win32' }, async () => {
  const source = await readFile(new URL('../scripts/windows-credentials.ps1', import.meta.url), 'utf8');
  const read = fixtureSource(source, 'read'), save = fixtureSource(source, 'save');
  assert.equal((await runFixture(read, { action: 'read' })).response.ok, true);
  for (const key of ['fake-only', 'x'.repeat(2560), 'quote"backslash\\']) assert.deepEqual((await runFixture(save, { action: 'save', key })).response, { ok: true, saved: true });
  for (const key of ['', 'x'.repeat(2561), 'é', 'space key', 'a\nb']) assert.equal((await runFixture(save, { action: 'save', key })).response.code, 'INVALID_KEY');
  for (const request of ['{', 'x'.repeat(8193), { action: 'read', key: 'fake-only' }, { action: 'read', target: 'other' }, { action: 1 }, null]) assert.equal((await runFixture(read, request)).response.code, 'UNAVAILABLE');
});

test('isolated transcription and session-only module logging expose legacy fake output but exclude repaired secret path', { skip: process.platform !== 'win32' }, async t => {
  const source = await readFile(new URL('../scripts/windows-credentials.ps1', import.meta.url), 'utf8');
  const evidence = [];
  for (const action of ['read', 'save']) {
    const request = { action, ...(action === 'save' && { key: 'FAKE-NOT-A-KEY-' + randomUUID() }) };
    const legacy = await runFixture(fixtureSource(source, action), request, { transcript: true, legacy: true });
    const repaired = await runFixture(fixtureSource(source, action), request, { transcript: true });
    const oldSentinel = action === 'read' ? legacy.response.key : request.key;
    const newSentinel = action === 'read' ? repaired.response.key : request.key;
    assert.equal(legacy.response.ok, true); assert.equal(repaired.response.ok, true);
    if (action === 'read') assert(legacy.transcript.includes(oldSentinel), 'legacy read transcription must reproduce leakage');
    assert(!repaired.transcript.includes(newSentinel), 'repaired private pipe must exclude sentinel from transcript');
    if (repaired.module.control && legacy.module.control) { assert.equal(legacy.module.found, true); assert.equal(repaired.module.found, false); }
    else t.diagnostic(`${action}: module-log positive control unavailable in this environment; transcription assertions ran, module evidence is explicitly incomplete.`);
    evidence.push({ action, legacyTranscriptContainsSentinel: legacy.transcript.includes(oldSentinel), repairedTranscriptContainsSentinel: repaired.transcript.includes(newSentinel), legacyModule: legacy.module, repairedModule: repaired.module });
  }
  const sentinel = 'FAKE-NOT-A-KEY-' + randomUUID();
  const malformed = await runFixture(fixtureSource(source, 'save'), `{"action":"save","key":"${sentinel}" bad-json}`, { transcript: true, expectedSentinel: sentinel });
  assert.equal(malformed.response.code, 'UNAVAILABLE'); assert(!malformed.transcript.includes(sentinel)); assert.equal(malformed.module.found, false);
  evidence.push({ action: 'malformed-json', repairedTranscriptContainsSentinel: false, repairedModule: malformed.module });
  await mkdir('artifacts/settings-persistence', { recursive: true });
  await writeFile('artifacts/settings-persistence/logging-fixture-evidence.json', JSON.stringify({ fakeOnly: true, nativeApisReplaced: true, persistentPoliciesChanged: false, evidence }, null, 2));
});
