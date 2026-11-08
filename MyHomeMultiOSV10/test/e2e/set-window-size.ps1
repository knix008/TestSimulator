# Resizes the main window of a process with the OS (SetWindowPos), the way Windows Snap or another
# program does: Tauri's own minimum size is not applied to this path, so the app must keep it itself.
# Usage: powershell -NoProfile -File set-window-size.ps1 -ProcessId 1234 -Width 700 -Height 600
param([int]$ProcessId, [int]$Width, [int]$Height)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
$p = Get-Process -Id $ProcessId -ErrorAction Stop
$h = $p.MainWindowHandle
if ($h -eq [IntPtr]::Zero) { Write-Output "no window"; exit 1 }
# SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE
[Win]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, $Width, $Height, 0x0002 -bor 0x0004 -bor 0x0010) | Out-Null
Start-Sleep -Milliseconds 600
$r = New-Object Win+RECT
[Win]::GetWindowRect($h, [ref]$r) | Out-Null
Write-Output ("{0}x{1}" -f ($r.Right - $r.Left), ($r.Bottom - $r.Top))
