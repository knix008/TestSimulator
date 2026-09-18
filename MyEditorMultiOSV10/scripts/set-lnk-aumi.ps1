# Stamp System.AppUserModel.ID onto a .lnk so the Windows taskbar can
# match a running process (app.setAppUserModelId) to its shortcut icon.
param(
  [Parameter(Mandatory = $true)][string]$AppId,
  [Parameter(Mandatory = $false)][string]$ExePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
public interface ILnkPropertyStore {
  void GetCount(out uint cProps);
  void GetAt(uint iProp, out PROPERTYKEY pkey);
  void GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
  void SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
  void Commit();
}

[StructLayout(LayoutKind.Sequential, Pack = 4)]
public struct PROPERTYKEY {
  public Guid fmtid;
  public uint pid;
}

[StructLayout(LayoutKind.Explicit)]
public struct PROPVARIANT {
  [FieldOffset(0)] public ushort vt;
  [FieldOffset(8)] public IntPtr pointerValue;
}

public static class LnkAumi {
  const uint GPS_READWRITE = 2;
  const ushort VT_LPWSTR = 31;

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  static extern void SHGetPropertyStoreFromParsingName(
    [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
    IntPtr pbc,
    uint flags,
    ref Guid riid,
    out ILnkPropertyStore ppv);

  public static string Get(string lnk) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    ILnkPropertyStore ps;
    SHGetPropertyStoreFromParsingName(lnk, IntPtr.Zero, 0, ref iid, out ps);
    PROPERTYKEY pk = new PROPERTYKEY();
    pk.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    pk.pid = 5;
    PROPVARIANT pv;
    ps.GetValue(ref pk, out pv);
    if (pv.vt != VT_LPWSTR || pv.pointerValue == IntPtr.Zero) return "";
    return Marshal.PtrToStringUni(pv.pointerValue) ?? "";
  }

  public static void Set(string lnk, string appId) {
    Guid iid = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    ILnkPropertyStore ps;
    SHGetPropertyStoreFromParsingName(lnk, IntPtr.Zero, GPS_READWRITE, ref iid, out ps);
    PROPERTYKEY pk = new PROPERTYKEY();
    pk.fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    pk.pid = 5;
    PROPVARIANT pv = new PROPVARIANT();
    pv.vt = VT_LPWSTR;
    pv.pointerValue = Marshal.StringToCoTaskMemUni(appId);
    try {
      ps.SetValue(ref pk, ref pv);
      ps.Commit();
    } finally {
      Marshal.FreeCoTaskMem(pv.pointerValue);
    }
  }
}
"@

function Set-One($lnk) {
  if (-not (Test-Path -LiteralPath $lnk)) { return }
  # WScript.Shell.Save() strips AppUserModelId — only write the property store.
  [LnkAumi]::Set($lnk, $AppId)
  $got = ''
  try { $got = [LnkAumi]::Get($lnk) } catch { $got = '(unread)' }
  Write-Output ("OK " + $lnk + " aumi=" + $got)
}

Set-One (Join-Path $env:USERPROFILE "Desktop\My Editor.lnk")
Set-One (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\My Editor.lnk")
foreach ($a in $args) { Set-One $a }

$ie4 = Join-Path $env:SystemRoot "System32\ie4uinit.exe"
if (Test-Path -LiteralPath $ie4) {
  Start-Process -FilePath $ie4 -ArgumentList "-show" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
}
