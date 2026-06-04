using System.Diagnostics;

namespace CodeAnalyzer.Services;

/// <summary>연결된 기본 편집기 또는 PATH의 VS Code/Cursor로 소스 파일을 엽니다.</summary>
public static class SourceFileOpener
{
    public static bool TryOpen(string? filePath, int lineNumber = 1)
    {
        if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
        {
            return false;
        }

        var fullPath = Path.GetFullPath(filePath);
        var line = Math.Max(1, lineNumber);

        if (TryOpenWithGoToCommand("cursor", fullPath, line)
            || TryOpenWithGoToCommand("code", fullPath, line)
            || TryOpenWithShell(fullPath))
        {
            return true;
        }

        return false;
    }

    private static bool TryOpenWithGoToCommand(string command, string fullPath, int line)
    {
        try
        {
            using var process = Process.Start(new ProcessStartInfo
            {
                FileName = command,
                Arguments = $"-g \"{fullPath}:{line}\"",
                UseShellExecute = false,
                CreateNoWindow = true
            });
            return process is not null;
        }
        catch
        {
            return false;
        }
    }

    private static bool TryOpenWithShell(string fullPath)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = fullPath,
                UseShellExecute = true
            });
            return true;
        }
        catch
        {
            return false;
        }
    }
}
