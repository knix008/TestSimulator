param([int]$ProcessId, [switch]$Close)
# Prints the visible top-level windows of one process as JSON (class, title,
# topmost, foreground). -Close sends WM_CLOSE to its dialog boxes (#32770).
# ASCII only: Windows PowerShell 5.1 misreads a BOM-less UTF-8 script.
Add-Type @'
using System; using System.Text; using System.Collections.Generic; using System.Runtime.InteropServices;
public static class DialogProbe {
  delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  public static List<object[]> Windows(int id, bool close) {
    var list = new List<object[]>(); var fg = GetForegroundWindow();
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if ((int)pid == id && IsWindowVisible(h)) {
        var t = new StringBuilder(512); GetWindowText(h, t, 512); var c = new StringBuilder(64); GetClassName(h, c, 64);
        list.Add(new object[] { c.ToString(), t.ToString(), (GetWindowLong(h, -20) & 8) != 0, h == fg });
        if (close && c.ToString() == "#32770") PostMessage(h, 0x0010, IntPtr.Zero, IntPtr.Zero);
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
'@
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$rows = [DialogProbe]::Windows($ProcessId, [bool]$Close) | ForEach-Object { [ordered]@{ class = $_[0]; title = $_[1]; topmost = $_[2]; foreground = $_[3] } }
ConvertTo-Json -InputObject @($rows) -Compress
