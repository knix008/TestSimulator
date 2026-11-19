param([string]$Exe, [int]$Lang = 0, [string]$Capture = '')
# Drives the installation-language window of a stub installer (test/e2e/installer.mjs): reports its title and icons,
# optionally saves a picture of it (PrintWindow: the window is not brought forward), then chooses $Lang and presses
# OK through the task dialog's own messages, or presses Cancel when $Lang is 0. Nothing is clicked; only the stub's
# own process is touched. ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI).
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class InstallerWindow {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  public struct RECT { public int L, T, R, B; }
}
"@
$p = Start-Process -FilePath $Exe -PassThru
$script:found = [IntPtr]::Zero
for ($i = 0; $i -lt 80 -and $script:found -eq [IntPtr]::Zero; $i++) {
  Start-Sleep -Milliseconds 150
  if ($p.HasExited) { break }
  [InstallerWindow]::EnumWindows({ param($h, $l)
    $procId = 0; [void][InstallerWindow]::GetWindowThreadProcessId($h, [ref]$procId)
    if ($procId -eq $p.Id -and [InstallerWindow]::IsWindowVisible($h)) { $script:found = $h; return $false }
    return $true }, [IntPtr]::Zero) | Out-Null
}
if ($script:found -eq [IntPtr]::Zero) {
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  Write-Output '{"window":false}'
  exit 0
}
Start-Sleep -Milliseconds 300
$sb = New-Object System.Text.StringBuilder 256
[void][InstallerWindow]::GetWindowText($script:found, $sb, 256)
# WM_GETICON: ICON_SMALL (title bar) and ICON_BIG.
$small = [InstallerWindow]::SendMessage($script:found, 0x7F, [IntPtr]0, [IntPtr]0)
$big = [InstallerWindow]::SendMessage($script:found, 0x7F, [IntPtr]1, [IntPtr]0)
if ($Capture) {
  $r = New-Object InstallerWindow+RECT; [void][InstallerWindow]::GetWindowRect($script:found, [ref]$r)
  $bmp = New-Object System.Drawing.Bitmap ($r.R - $r.L), ($r.B - $r.T)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $dc = $g.GetHdc(); [void][InstallerWindow]::PrintWindow($script:found, $dc, 2); $g.ReleaseHdc($dc); $g.Dispose()
  $bmp.Save($Capture); $bmp.Dispose()
}
# TDM_CLICK_RADIO_BUTTON = WM_USER + 110; TDM_CLICK_BUTTON = WM_USER + 102 (IDOK = 1, IDCANCEL = 2).
if ($Lang -gt 0) {
  [void][InstallerWindow]::SendMessage($script:found, 0x400 + 110, [IntPtr]$Lang, [IntPtr]0)
  [void][InstallerWindow]::SendMessage($script:found, 0x400 + 102, [IntPtr]1, [IntPtr]0)
} else {
  [void][InstallerWindow]::SendMessage($script:found, 0x400 + 102, [IntPtr]2, [IntPtr]0)
}
$closed = $p.WaitForExit(8000)
if (-not $closed) { Stop-Process -Id $p.Id -Force }
$title = $sb.ToString().Replace('\', '\\').Replace('"', '\"')
Write-Output ('{"window":true,"title":"' + $title + '","small":' + [int64]$small + ',"big":' + [int64]$big + ',"closed":' + $closed.ToString().ToLower() + '}')
