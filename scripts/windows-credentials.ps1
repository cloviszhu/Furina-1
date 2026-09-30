# No credential targets or provider choices are accepted from stdin.
# Advapi32 only; no enumeration, files, environment keys or plaintext fallback.
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading;
public static class ExoCredentials {
  const string Target = "ProjectExo/Furina-1/DeepSeek/APIKey/v1";
  const string Owner = "ProjectExo:Furina-1:DeepSeek:v1";
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential {
    public uint Flags, Type;
    public string TargetName, Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist, AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  static extern bool Read(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  static extern bool Write(ref Credential credential, uint flags);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, ExactSpelling=true, SetLastError=true)]
  static extern bool Delete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")] static extern void CredFree(IntPtr buffer);
  public static object Execute(string action, string key) {
    if (action != "status" && action != "save" && action != "read" && action != "delete") return new { ok=false, code="UNAVAILABLE" };
    using (var mutex = new Mutex(false, @"Local\ProjectExo-Furina1-DeepSeek-v1")) {
      bool locked = false;
      try {
        try { locked = mutex.WaitOne(5000); } catch (AbandonedMutexException) { locked = true; }
        if (!locked) return new { ok=false, code="BUSY" };
        IntPtr ptr;
        bool exists = Read(Target, 1, 0, out ptr);
        if (!exists) {
          int error = Marshal.GetLastWin32Error();
          if (error != 1168) return new { ok=false, code="NATIVE_ERROR", nativeCode=error };
        }
        if (exists) {
          try {
            var credential = (Credential)Marshal.PtrToStructure(ptr, typeof(Credential));
            if (credential.UserName != Owner || credential.Comment != Owner || credential.Persist != 2) return new { ok=false, code="FOREIGN" };
            if (action == "save") return new { ok=false, code="EXISTS" }; // never overwrite
            if (action == "status") return new { ok=true, saved=true }; // no blob decoding
            if (action == "read") {
              if (credential.CredentialBlobSize == 0 || credential.CredentialBlobSize > 2560) return new { ok=false, code="INVALID_KEY" };
              var bytes = new byte[credential.CredentialBlobSize];
              try {
                Marshal.Copy(credential.CredentialBlob, bytes, 0, bytes.Length);
                string value = new UTF8Encoding(false, true).GetString(bytes);
                if (!Valid(value)) return new { ok=false, code="INVALID_KEY" };
                return new { ok=true, key=value };
              } finally { Array.Clear(bytes, 0, bytes.Length); }
            }
          } finally { CredFree(ptr); }
        }
        if (action == "status") return new { ok=true, saved=false };
        if (action == "read") return new { ok=false, code="NOT_FOUND" };
        if (action == "delete") {
          if (!exists || Delete(Target, 1, 0)) return new { ok=true, saved=false };
          return new { ok=false, code="NATIVE_ERROR", nativeCode=Marshal.GetLastWin32Error() };
        }
        if (!Valid(key)) return new { ok=false, code="INVALID_KEY" };
        byte[] blob = Encoding.UTF8.GetBytes(key);
        IntPtr memory = Marshal.AllocHGlobal(blob.Length);
        try {
          Marshal.Copy(blob, 0, memory, blob.Length);
          var credential = new Credential { Type=1, TargetName=Target, Comment=Owner, UserName=Owner,
            Persist=2, CredentialBlobSize=(uint)blob.Length, CredentialBlob=memory };
          if (Write(ref credential, 0)) return new { ok=true, saved=true };
          return new { ok=false, code="NATIVE_ERROR", nativeCode=Marshal.GetLastWin32Error() };
        } finally {
          for (int i=0; i<blob.Length; i++) Marshal.WriteByte(memory, i, 0);
          Marshal.FreeHGlobal(memory); Array.Clear(blob, 0, blob.Length);
        }
      } finally { if (locked) mutex.ReleaseMutex(); }
    }
  }
  static bool Valid(string key) {
    if (String.IsNullOrEmpty(key) || Encoding.UTF8.GetByteCount(key) > 2560) return false;
    foreach (char c in key) if (c < 33 || c > 126) return false;
    return true;
  }
}
'@
$inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
$result = [ExoCredentials]::Execute([string]$inputData.action, [string]$inputData.key)
$result | ConvertTo-Json -Compress
} catch {
  # Never return exception text or user input.
  [Console]::Out.Write('{"ok":false,"code":"UNAVAILABLE"}')
}
