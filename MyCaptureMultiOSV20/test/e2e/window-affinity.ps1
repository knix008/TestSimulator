# Lists the visible top-level windows of a process with their display affinity
# (0 = WDA_NONE, capturable by any program; 0x11 = WDA_EXCLUDEFROMCAPTURE).
# Output: JSON array of { width, height, affinity }. Used by the E2E suite.
param([int]$ProcessId)
Add-Type -Namespace MyCaptureTest -Name Win -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr hwnd, System.IntPtr lparam);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc, System.IntPtr lparam);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hwnd, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr hwnd);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetWindowDisplayAffinity(System.IntPtr hwnd, out uint affinity);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr hwnd, out RECT rect);
[System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
'@
$found = New-Object System.Collections.ArrayList
$callback = [MyCaptureTest.Win+EnumProc]{
  param($hwnd, $lparam)
  $owner = [uint32]0
  [void][MyCaptureTest.Win]::GetWindowThreadProcessId($hwnd, [ref]$owner)
  if ($owner -eq $ProcessId -and [MyCaptureTest.Win]::IsWindowVisible($hwnd)) {
    $affinity = [uint32]0
    [void][MyCaptureTest.Win]::GetWindowDisplayAffinity($hwnd, [ref]$affinity)
    $rect = New-Object MyCaptureTest.Win+RECT
    [void][MyCaptureTest.Win]::GetWindowRect($hwnd, [ref]$rect)
    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    if ($width -gt 40 -and $height -gt 40) { [void]$found.Add([pscustomobject]@{ width = $width; height = $height; affinity = $affinity }) }
  }
  return $true
}
[void][MyCaptureTest.Win]::EnumWindows($callback, [System.IntPtr]::Zero)
ConvertTo-Json -InputObject @($found) -Compress
