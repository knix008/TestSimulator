# Drags a window of the program under test with the real mouse (smoke test):
# press at (X, Y), move by (DX, DY) in steps, release. Physical screen pixels.
# Pass negative numbers as -DX:-120 (a bare -120 is read as a parameter name).
#
# Safety: the program was started by the test and may sit behind the user's
# windows. The window titled $Title of process $ProcessId is raised (topmost
# on, then off: on top, not focused) and the press happens only if that very
# window is under the cursor; otherwise nothing is pressed ("blocked: ...").
param([int]$X, [int]$Y, [int]$DX, [int]$DY, [int]$ProcessId, [string]$Title, [int]$Steps = 24)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class OsMouse {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L; public int T; public int R; public int B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public static string RectOf(IntPtr h) { RECT r; GetWindowRect(h, out r); return r.L + "," + r.T; }
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static string TextOf(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
  public static IntPtr RootAt(int x, int y) { var p = new POINT { X = x, Y = y }; return GetAncestor(WindowFromPoint(p), 2); }
  public static IntPtr Find(uint pid, string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h) && TextOf(h) == title) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@
[OsMouse]::SetProcessDPIAware() | Out-Null
$hwnd = [OsMouse]::Find([uint32]$ProcessId, $Title)
if ($hwnd -eq [IntPtr]::Zero) { Write-Output "blocked: no window '$Title' of process $ProcessId"; exit 0 }
$NOSIZE_NOMOVE_NOACTIVATE = 0x0001 -bor 0x0002 -bor 0x0010
[OsMouse]::SetWindowPos($hwnd, [IntPtr](-1), 0, 0, 0, 0, $NOSIZE_NOMOVE_NOACTIVATE) | Out-Null
[OsMouse]::SetWindowPos($hwnd, [IntPtr](-2), 0, 0, 0, 0, $NOSIZE_NOMOVE_NOACTIVATE) | Out-Null
Start-Sleep -Milliseconds 200
$under = [OsMouse]::RootAt($X, $Y)
if ($under -ne $hwnd) { Write-Output ("blocked: '" + [OsMouse]::TextOf($under) + "' is under the cursor, not '$Title'"); exit 0 }

$from = [OsMouse]::RectOf($hwnd)
$LEFTDOWN = 0x0002
$LEFTUP = 0x0004
[OsMouse]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 150
[OsMouse]::mouse_event($LEFTDOWN, 0, 0, 0, [UIntPtr]::Zero)
# Held like a person would: the page asks the shell for the move loop first.
Start-Sleep -Milliseconds 400
for ($i = 1; $i -le $Steps; $i++) {
  [OsMouse]::SetCursorPos($X + [int]($DX * $i / $Steps), $Y + [int]($DY * $i / $Steps)) | Out-Null
  Start-Sleep -Milliseconds 20
}
Start-Sleep -Milliseconds 150
[OsMouse]::mouse_event($LEFTUP, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 300
Write-Output ("dragged: window " + $from + " -> " + [OsMouse]::RectOf($hwnd))
