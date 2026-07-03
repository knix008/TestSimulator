namespace PDFEditor.Core.Services;

public sealed class ExternalToolInfo
{
    public required string Name { get; init; }
    public required string Executable { get; init; }
    public string? ResolvedPath { get; init; }
    public bool IsAvailable => !string.IsNullOrWhiteSpace(ResolvedPath);
}

public static class ExternalToolLocator
{
    public static ExternalToolInfo LocateTesseract() => Locate("tesseract", "Tesseract OCR");

    public static ExternalToolInfo LocateQpdf() => Locate("qpdf", "QPDF");

    private static ExternalToolInfo Locate(string executable, string displayName)
    {
        var path = FindOnPath(executable);
        return new ExternalToolInfo
        {
            Name = displayName,
            Executable = executable,
            ResolvedPath = path
        };
    }

    private static string? FindOnPath(string executable)
    {
        var pathVariable = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(pathVariable))
        {
            return null;
        }

        var extensions = OperatingSystem.IsWindows()
            ? new[] { ".exe", ".cmd", ".bat", "" }
            : new[] { "" };

        foreach (var folder in pathVariable.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            foreach (var extension in extensions)
            {
                var candidate = Path.Combine(folder.Trim(), executable + extension);
                if (File.Exists(candidate))
                {
                    return candidate;
                }
            }
        }

        return null;
    }
}
