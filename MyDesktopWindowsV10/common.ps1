# Shared helpers for build.ps1 and run.ps1.
# ASCII only on purpose: Windows PowerShell 5.1 garbles BOM-less UTF-8 scripts that hold non-ASCII text.

$script:ProjectFile = Join-Path $PSScriptRoot 'MyDesktop.csproj'

function Add-ShellIconType {
    if ('MyDesktopShell' -as [type]) { return }

    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class MyDesktopShell {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowExW(IntPtr p, IntPtr c, string cls, string win);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern IntPtr SendMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);

  public static IntPtr DefView() {
    IntPtr view = FindWindowExW(GetShellWindow(), IntPtr.Zero, "SHELLDLL_DefView", null);
    if (view != IntPtr.Zero) return view;
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      IntPtr c = FindWindowExW(h, IntPtr.Zero, "SHELLDLL_DefView", null);
      if (c != IntPtr.Zero) { found = c; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  // Explorer destroys the icon view when icons are switched off, so a missing list means hidden.
  public static bool IconsVisible() {
    IntPtr view = DefView();
    if (view == IntPtr.Zero) return true;
    IntPtr list = FindWindowExW(view, IntPtr.Zero, "SysListView32", null);
    return list != IntPtr.Zero && IsWindowVisible(list);
  }

  public static void ToggleIcons() {
    IntPtr view = DefView();
    if (view != IntPtr.Zero) SendMessageW(view, 0x0111, new IntPtr(0x7402), IntPtr.Zero);
  }

  public static int CountVisibleWindows(int processId, string title) {
    int total = 0;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint owner;
      GetWindowThreadProcessId(h, out owner);
      if (owner != (uint)processId || !IsWindowVisible(h)) return true;
      StringBuilder sb = new StringBuilder(256);
      GetWindowTextW(h, sb, 256);
      if (sb.ToString() == title) total++;
      return true;
    }, IntPtr.Zero);
    return total;
  }
}
'@
}

function Get-MyDesktopExe {
    param([string] $Configuration = 'Debug')

    $folder = Join-Path $PSScriptRoot "bin\$Configuration"
    if (-not (Test-Path $folder)) { return $null }

    $exe = Get-ChildItem $folder -Recurse -Filter 'MyDesktop.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if ($exe) { return $exe.FullName }
    return $null
}

function Restore-DesktopIcons {
    Add-ShellIconType
    if ([MyDesktopShell]::IconsVisible()) { return }

    Write-Host '  desktop icons were hidden, switching them back on'
    [MyDesktopShell]::ToggleIcons()
    Start-Sleep -Milliseconds 1200

    if ([MyDesktopShell]::IconsVisible()) {
        Write-Host '  desktop icons restored'
    } else {
        Write-Warning 'Desktop icons are still hidden. Right-click the desktop > View > Show desktop icons.'
    }
}

function Stop-MyDesktop {
    $running = Get-Process MyDesktop -ErrorAction SilentlyContinue
    if (-not $running) { return $false }

    Write-Host ('stopping MyDesktop (pid ' + (($running | ForEach-Object { $_.Id }) -join ', ') + ')')
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500

    # A forced stop skips the app's own cleanup, so never leave the desktop without its icons.
    Restore-DesktopIcons
    return $true
}

function Invoke-MyDesktopBuild {
    param(
        [string] $Configuration = 'Debug',
        [switch] $Clean
    )

    if ($Clean) {
        Write-Host "cleaning $Configuration"
        $null = & dotnet clean $script:ProjectFile -c $Configuration -v q --nologo
    }

    Write-Host "building $Configuration"
    $output = & dotnet build $script:ProjectFile -c $Configuration -v q --nologo
    $exitCode = $LASTEXITCODE

    $problems = @($output | Where-Object { $_ -match ':\s+(error|warning)\s' })
    foreach ($line in $problems) { Write-Host "  $line" }

    if ($exitCode -ne 0) {
        foreach ($line in $output) { Write-Host $line }
        throw "build failed (exit code $exitCode)"
    }

    if ($problems.Count -eq 0) { Write-Host '  0 errors, 0 warnings' }
    Write-Host 'build ok'
}
