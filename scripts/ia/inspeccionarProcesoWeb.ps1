# Solo lectura del proceso que escucha en 3000. Nunca muestra su entorno completo.
$ErrorActionPreference = 'Stop'
$raizIA = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$escuchaIA = @(Get-NetTCPConnection -State Listen -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess -Unique)
if ($escuchaIA.Count -ne 1) { throw 'PROCESO_WEB_NO_IDENTIFICADO' }
$procesoIA = Get-CimInstance Win32_Process -Filter "ProcessId = $($escuchaIA[0])"
if ($procesoIA.Name -ne 'node.exe' -or $procesoIA.CommandLine -notmatch 'server\.js') { throw 'PROCESO_NO_ES_SERVIDOR_NODE' }
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class EntornoWebIA {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError=true)] static extern bool ReadProcessMemory(IntPtr h, IntPtr address, byte[] buffer, int size, out IntPtr read);
  [DllImport("ntdll.dll")] static extern int NtQueryInformationProcess(IntPtr h, int type, IntPtr data, int size, out int returned);
  static byte[] Read(IntPtr h, IntPtr p, int n) {
    var bytes = new byte[n]; IntPtr read;
    if (!ReadProcessMemory(h,p,bytes,n,out read) || read.ToInt64()!=n) throw new Exception("LECTURA_PROCESO_NO_DISPONIBLE");
    return bytes;
  }
  static IntPtr Pointer(IntPtr h, IntPtr p) { return new IntPtr(BitConverter.ToInt64(Read(h,p,8),0)); }
  public static Dictionary<string,object> Leer(int id, string directory) {
    if (!Environment.Is64BitProcess) throw new Exception("REQUIERE_PROCESO_64_BITS");
    var h=OpenProcess(0x410,false,id); if(h==IntPtr.Zero) throw new Exception("ACCESO_PROCESO_DENEGADO");
    var data=Marshal.AllocHGlobal(48);
    try {
      int returned; if(NtQueryInformationProcess(h,0,data,48,out returned)!=0) throw new Exception("PROCESO_NO_DISPONIBLE");
      var peb=Marshal.ReadIntPtr(data,8); var parameters=Pointer(h,IntPtr.Add(peb,0x20));
      var length=BitConverter.ToUInt16(Read(h,IntPtr.Add(parameters,0x38),2),0);
      var cwd=Encoding.Unicode.GetString(Read(h,Pointer(h,IntPtr.Add(parameters,0x40)),length)).TrimEnd('\\');
      if(!String.Equals(cwd,directory.TrimEnd('\\'),StringComparison.OrdinalIgnoreCase)) throw new Exception("DIRECTORIO_WEB_NO_COINCIDE");
      var env=Pointer(h,IntPtr.Add(parameters,0x80));
      var contenido=new StringBuilder(); bool terminado=false;
      for(int offset=0;offset<131072;offset+=2) {
        var value=BitConverter.ToUInt16(Read(h,IntPtr.Add(env,offset),2),0);
        if(value==0 && contenido.Length>0 && contenido[contenido.Length-1]=='\0') { terminado=true; break; }
        contenido.Append((char)value);
      }
      if(!terminado) throw new Exception("ENTORNO_NO_VALIDADO");
      var values=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
      foreach(var entry in contenido.ToString().Split('\0')) {
        var i=entry.IndexOf('='); if(i>0) values[entry.Substring(0,i)]=entry.Substring(i+1);
      }
      // Solo dos valores de vocabulario cerrado; jamás devolver claves/URI/cookies.
      string backend,mode; values.TryGetValue("AI_QUOTA_BACKEND",out backend); values.TryGetValue("NODE_ENV",out mode);
      return new Dictionary<string,object> {
        {"directorioCorrecto",true},
        {"backendHeredado",backend=="piloto_local"?"piloto_local":backend=="protected"?"protected":backend=="dev_fixture"?"dev_fixture":backend==null?"ausente":"otro"},
        {"entornoHeredado",mode=="development"?"development":mode=="production"?"production":mode=="test"?"test":mode==null?"ausente":"otro"}
      };
    } finally { Marshal.FreeHGlobal(data); CloseHandle(h); }
  }
}
'@
$resultadoIA = [EntornoWebIA]::Leer([int]$escuchaIA[0], $raizIA)
$resultadoIA['pid'] = [int]$escuchaIA[0]
$resultadoIA['codigoIACargadoTrasUltimoCambio'] = $procesoIA.CreationDate.ToUniversalTime() -ge (Get-Item -LiteralPath (Join-Path $raizIA 'services\iaService.js')).LastWriteTimeUtc
$resultadoIA | ConvertTo-Json
