# Lists the visible top-level windows of a process (title and size) - used by tests
# to check that dialog windows really close. ASCII only (PowerShell 5.1).
param([int]$ProcessId)
Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class TopWindows {
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr lParam);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  public static List<string> Of(uint processId) {
    var list = new List<string>();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == processId && IsWindowVisible(h)) {
        var sb = new StringBuilder(512); GetWindowText(h, sb, 512);
        RECT r; GetWindowRect(h, out r);
        list.Add(sb.ToString() + " | " + (r.Right - r.Left) + "x" + (r.Bottom - r.Top));
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@
[TopWindows]::Of([uint32]$ProcessId) | ForEach-Object { $_ }
