string installDir = args.Length > 0
    ? args[0]
    : @"C:\Program Files (x86)\HWP2Doc";

string samplePath = args.Length > 1
    ? args[1]
    : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "test-samples", "moel_04_instructor_education.hwp"));

if (!Directory.Exists(installDir))
{
    Console.Error.WriteLine($"Install dir not found: {installDir}");
    return 1;
}

if (!File.Exists(samplePath))
{
    Console.Error.WriteLine($"Sample not found: {samplePath}");
    return 1;
}

var engines = new (string Label, string RelativeExe, string? CliArgs)[]
{
    ("unhwp (내장)", string.Empty, null),
    ("rhwp", @"rhwp\rhwp.exe", $"export-markdown \"{samplePath}\" -o \"{Path.GetTempPath()}\""),
    ("hwp2md-roboco", @"hwp2md-roboco\hwp2md.exe", $"\"{samplePath}\" -o \"{Path.Combine(Path.GetTempPath(), "install-smoke-roboco.md")}\""),
    ("hwp2md-hephaex", @"hwp2md-hephaex\hwp2md.exe",
        $"to-md \"{samplePath}\" -o \"{Path.Combine(Path.GetTempPath(), "install-smoke-hephaex.md")}\" --assets-dir \"{Path.Combine(Path.GetTempPath(), "install-smoke-hephaex-assets")}\""),
};

var requiredDlls = new[]
{
    "HWP2DocWinV10.exe",
    "HWP2DocWinV10.dll",
    "Unhwp.Net.dll",
    @"runtimes\win-x64\native\unhwp.dll",
    @"runtimes\win-x64\native\WebView2Loader.dll",
};

Console.WriteLine($"InstallDir: {installDir}");
Console.WriteLine($"Sample: {samplePath}");
Console.WriteLine();

int failures = 0;

Console.WriteLine("=== Core payload ===");
foreach (string relative in requiredDlls)
{
    string path = Path.Combine(installDir, relative);
    bool ok = File.Exists(path);
    Console.WriteLine($"  {(ok ? "OK" : "MISSING")} {relative}");
    if (!ok) failures++;
}

Console.WriteLine();
Console.WriteLine("=== Engine binaries ===");
foreach ((string label, string relativeExe, string? cliArgs) in engines)
{
    if (string.IsNullOrEmpty(relativeExe))
    {
        Console.WriteLine($"[{label}] built-in (Unhwp.Net.dll required above)");
        continue;
    }

    string exePath = Path.Combine(installDir, "Tools", relativeExe);
    bool exists = File.Exists(exePath);
    Console.WriteLine($"[{label}] {(exists ? "OK" : "MISSING")} Tools\\{relativeExe}");
    if (!exists)
    {
        failures++;
        continue;
    }

    if (cliArgs is null)
        continue;

    try
    {
        var psi = new System.Diagnostics.ProcessStartInfo
        {
            FileName = exePath,
            Arguments = cliArgs,
            WorkingDirectory = installDir,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        using var process = System.Diagnostics.Process.Start(psi)
            ?? throw new InvalidOperationException("process start failed");
        process.WaitForExit();
        Console.WriteLine($"  CLI exit={process.ExitCode} {(process.ExitCode == 0 ? "OK" : "FAIL")}");
        if (process.ExitCode != 0)
        {
            failures++;
            string err = process.StandardError.ReadToEnd();
            if (!string.IsNullOrWhiteSpace(err))
                Console.WriteLine($"  {err.Trim().Replace('\n', ' ')}");
        }
    }
    catch (Exception ex)
    {
        failures++;
        Console.WriteLine($"  CLI FAIL: {ex.Message}");
    }
}

Console.WriteLine();
Console.WriteLine(failures == 0 ? "INSTALL SMOKE TEST PASSED" : $"FAILED: {failures}");
return failures == 0 ? 0 : 1;
