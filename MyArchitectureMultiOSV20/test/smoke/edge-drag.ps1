# Real-mouse drag of a window's right edge by DX pixels (edge-drag-probe.mjs).
param([int]$ProcId, [int]$DX = -600, [int]$Steps = 30)
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W32 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, int dx, int dy, uint d, IntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[W32]::SetProcessDPIAware() | Out-Null
$h = (Get-Process -Id $ProcId).MainWindowHandle
$r = New-Object W32+RECT
[W32]::GetWindowRect($h, [ref]$r) | Out-Null
"before $($r.L) $($r.T) $($r.R) $($r.B)"
[W32]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 300
# Grab the right edge inside the invisible resize border, mid height.
$x = $r.R - 4; $y = [int](($r.T + $r.B) / 2)
[W32]::SetCursorPos($x, $y) | Out-Null
Start-Sleep -Milliseconds 150
[W32]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 100
for ($i = 1; $i -le $Steps; $i++) {
  [W32]::mouse_event(0x0001, [int]($DX / $Steps), 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 25
}
Start-Sleep -Milliseconds 300
[W32]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 400
[W32]::GetWindowRect($h, [ref]$r) | Out-Null
"after $($r.L) $($r.T) $($r.R) $($r.B)"
