import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';

test('original Windows PInvoke definitions compile and have native layout without executing credential calls', { skip: process.platform !== 'win32' }, async () => {
  const source = await readFile(new URL('../scripts/windows-credentials.ps1', import.meta.url), 'utf8');
  const command = source.slice(0, source.indexOf('$inputData =')) + `
[Console]::Out.Write([Runtime.InteropServices.Marshal]::SizeOf([type][ExoCredentials+Credential]))
} catch { [Console]::Out.Write('compile-failed') }
`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', data => output += data); child.stderr.resume(); child.on('error', reject); child.on('close', () => resolve(output.trim()));
  });
  assert.equal(result, process.arch === 'x64' ? '80' : '52');
});

test('Windows bridge compiles and exercises managed native-API replacement, never real credential APIs', { skip: process.platform !== 'win32' }, async () => {
  let source = await readFile(new URL('../scripts/windows-credentials.ps1', import.meta.url), 'utf8');
  const shim = `
  static Credential stored; static bool exists; static int fixtureNativeError=1168;
  public static void Fault(int code) { fixtureNativeError=code; }
  public static void Foreign() { stored.UserName="another-owner"; }
  static bool Read(string target, uint type, uint flags, out IntPtr pointer) {
    if(target!=Target || type!=1 || flags!=0) throw new Exception();
    pointer=IntPtr.Zero; if(!exists) return false;
    pointer=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(Credential)));
    Marshal.StructureToPtr(stored,pointer,false); return true;
  }
  static bool Write(ref Credential credential, uint flags) {
    if(credential.Persist!=2 || credential.TargetName!=Target || credential.Type!=1 || flags!=0) throw new Exception();
    stored=credential; stored.CredentialBlob=Marshal.AllocHGlobal((int)credential.CredentialBlobSize);
    var bytes=new byte[credential.CredentialBlobSize]; Marshal.Copy(credential.CredentialBlob,bytes,0,bytes.Length); Marshal.Copy(bytes,0,stored.CredentialBlob,bytes.Length);
    exists=true; return true;
  }
  static bool Delete(string target, uint type, uint flags) { if(target!=Target || type!=1 || flags!=0) throw new Exception(); Marshal.FreeHGlobal(stored.CredentialBlob); exists=false; return true; }
  static void CredFree(IntPtr pointer) { Marshal.DestroyStructure(pointer,typeof(Credential)); Marshal.FreeHGlobal(pointer); }
`;
  const imports = /  \[DllImport\("advapi32\.dll"[\s\S]*?static extern void CredFree\(IntPtr buffer\);/;
  assert(imports.test(source)); source = source.replace(imports, shim).replaceAll('Marshal.GetLastWin32Error()', 'fixtureNativeError');
  assert(!source.includes('DllImport')); // Fail closed before running the fixture process.
  source = source.slice(0, source.indexOf('$inputData =')) + `
$rows = @()
$rows += [ExoCredentials]::Execute('status', '')
$rows += [ExoCredentials]::Execute('read', '')
$rows += [ExoCredentials]::Execute('save', ('x' * 2561))
$rows += [ExoCredentials]::Execute('save', 'fake-only')
$rows += [ExoCredentials]::Execute('status', '')
$rows += [ExoCredentials]::Execute('save', 'other-fake')
$read = [ExoCredentials]::Execute('read', '')
$rows += @{ok=$read.ok; matches=($read.key -eq 'fake-only')}
$rows += [ExoCredentials]::Execute('delete', '')
[ExoCredentials]::Fault(1312)
$rows += [ExoCredentials]::Execute('status', '')
[ExoCredentials]::Fault(1168)
$rows += [ExoCredentials]::Execute('save', 'fake-only')
[ExoCredentials]::Foreign()
$rows += [ExoCredentials]::Execute('read', '')
$rows += [ExoCredentials]::Execute('delete', '')
$rows | ConvertTo-Json -Compress
} catch { @{compileFailed=$true; fixtureError=$_.Exception.Message} | ConvertTo-Json -Compress }
`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', source], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; const timeout = setTimeout(() => { child.kill(); reject(Error('fixture timeout')); }, 20000);
    child.stdout.on('data', data => output += data); child.stderr.resume(); child.on('error', reject);
    child.on('close', () => { clearTimeout(timeout); try { resolve(JSON.parse(output)); } catch { reject(Error('fixture output invalid')); } });
  });
  assert(Array.isArray(result), JSON.stringify(result));
  assert.deepEqual(result.map(row => row.code || (row.saved ?? row.matches ?? row.ok)), [false, 'NOT_FOUND', 'INVALID_KEY', true, true, 'EXISTS', true, false, 'NATIVE_ERROR', true, 'FOREIGN', 'FOREIGN']);
  assert.equal(result[8].nativeCode, 1312);
});
