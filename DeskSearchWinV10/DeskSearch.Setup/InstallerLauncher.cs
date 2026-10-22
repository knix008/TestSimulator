using System.Diagnostics;
using System.Reflection;
using Microsoft.Win32;

namespace DeskSearch.Setup;

internal static class InstallerLauncher
{
    private const string KoreanResourceName = "DeskSearchSetup.ko-KR.msi";
    private const string EnglishResourceName = "DeskSearchSetup.en-US.msi";
    private const string KoreanFileName = "DeskSearchSetup.msi";
    private const string EnglishFileName = "DeskSearchSetup.en-US.msi";

    public static int Run(InstallLanguage language)
    {
        var useEnglish = language == InstallLanguage.English;
        var resourceName = useEnglish ? EnglishResourceName : KoreanResourceName;
        var sideBySideName = useEnglish ? EnglishFileName : KoreanFileName;
        var appLanguage = useEnglish ? "en" : "ko";

        var msiPath = ResolveMsiPath(resourceName, sideBySideName, out var deleteAfter);
        try
        {
            var exitCode = LaunchMsiexec(msiPath);
            if (exitCode is 0 or 3010)
                WritePreferredAppLanguage(appLanguage);

            return exitCode;
        }
        finally
        {
            if (deleteAfter)
            {
                try
                {
                    var dir = Path.GetDirectoryName(msiPath);
                    if (!string.IsNullOrEmpty(dir))
                        Directory.Delete(dir, recursive: true);
                }
                catch
                {
                    // best effort
                }
            }
        }
    }

    private static string ResolveMsiPath(string resourceName, string sideBySideName, out bool deleteAfter)
    {
        var extracted = TryExtractEmbeddedMsi(resourceName);
        if (extracted is not null)
        {
            deleteAfter = true;
            return extracted;
        }

        var baseDir = AppContext.BaseDirectory;
        var sideBySide = Path.Combine(baseDir, sideBySideName);
        if (File.Exists(sideBySide))
        {
            deleteAfter = false;
            return sideBySide;
        }

        // When launched from the repo root after build.ps1.
        var parent = Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", ".."));
        var fromRoot = Path.Combine(parent, sideBySideName);
        if (File.Exists(fromRoot))
        {
            deleteAfter = false;
            return fromRoot;
        }

        throw new FileNotFoundException(
            $"Installer package not found ({sideBySideName} / embedded {resourceName}).");
    }

    private static string? TryExtractEmbeddedMsi(string resourceName)
    {
        var assembly = Assembly.GetExecutingAssembly();
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null)
            return null;

        var tempDir = Path.Combine(Path.GetTempPath(), "DeskSearchSetup", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);
        var path = Path.Combine(tempDir, resourceName);
        using (var file = File.Create(path))
            stream.CopyTo(file);

        return path;
    }

    private static int LaunchMsiexec(string msiPath)
    {
        var start = new ProcessStartInfo
        {
            FileName = "msiexec.exe",
            Arguments = $"/i \"{msiPath}\"",
            UseShellExecute = true
        };

        using var process = Process.Start(start)
            ?? throw new InvalidOperationException("Failed to start Windows Installer (msiexec).");

        process.WaitForExit();
        return process.ExitCode;
    }

    /// <summary>
    /// Lets DeskSearch pick the same UI language on first launch when settings.json is created.
    /// </summary>
    private static void WritePreferredAppLanguage(string language)
    {
        try
        {
            using var key = Registry.CurrentUser.CreateSubKey(@"Software\DeskSearch");
            key?.SetValue("InstallLanguage", language, RegistryValueKind.String);
        }
        catch
        {
            // optional preference only
        }
    }
}
