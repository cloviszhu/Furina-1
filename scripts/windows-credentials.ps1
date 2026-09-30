# No credential targets or provider choices are accepted from stdin.
# Advapi32 only; no enumeration, files, environment keys or plaintext fallback.
$ErrorActionPreference = 'Stop'
try {
Add-Type -ReferencedAssemblies 'System.dll', 'System.Core.dll', 'System.Web.Extensions.dll' -TypeDefinition @'
using System;
using System.Text;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using System.Runtime.InteropServices;
using System.Threading;
public static class ExoCredentials {
  const string Target = "ProjectExo/Furina-1/DeepSeek/APIKey/v1";
  const string Owner = "ProjectExo:Furina-1:DeepSeek:v1";
  // Secrets never enter PowerShell variables, cmdlet arguments or its output
  // pipeline. This no-argument void entry owns both OS pipe streams end to end.
  public static void Run() {
    byte[] bytes = new byte[8193];
    object result;
    var serializer = new JavaScriptSerializer { MaxJsonLength=8192, RecursionLimit=4 };
    try {
      using (Stream input = Console.OpenStandardInput()) {
        int size=0, count;
        while (size<bytes.Length && (count=input.Read(bytes,size,bytes.Length-size))>0) size+=count;
        if (size>8192) throw new InvalidDataException();
        var data = serializer.Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(bytes,0,size));
        if (data==null || !data.ContainsKey("action") || !(data["action"] is string)) throw new InvalidDataException();
        string action=(string)data["action"];
        foreach (string field in data.Keys) if (field!="action" && field!="key") throw new InvalidDataException();
        string key=null;
        if (data.ContainsKey("key")) {
          if (action!="save" || !(data["key"] is string)) throw new InvalidDataException();
          key=(string)data["key"];
        }
        if (action=="save" && !Valid(key)) result=new { ok=false, code="INVALID_KEY" };
        else result=Execute(action,key);
      }
    } catch {
      // Catch inside C#: PowerShell must never create a secret-bearing ErrorRecord.
      result=new { ok=false, code="UNAVAILABLE" };
    } finally { Array.Clear(bytes,0,bytes.Length); }
    byte[] output;
    try { output=Encoding.UTF8.GetBytes(serializer.Serialize(result)); }
    catch { output=Encoding.UTF8.GetBytes("{\"ok\":false,\"code\":\"UNAVAILABLE\"}"); }
    try {
      using (Stream pipe=Console.OpenStandardOutput()) { pipe.Write(output,0,output.Length); pipe.Flush(); }
    } catch { /* Broken private pipe: do not surface content to PowerShell. */ }
    finally { Array.Clear(output,0,output.Length); }
  }
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
  static object Execute(string action, string key) {
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
[ExoCredentials]::Run()
} catch {
  # Never return exception text or user input.
  [Console]::Out.Write('{"ok":false,"code":"UNAVAILABLE"}')
}
