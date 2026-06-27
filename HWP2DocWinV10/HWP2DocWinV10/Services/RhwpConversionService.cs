using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;

namespace HWP2DocWinV10.Services;

internal static class RhwpConversionService
{
    private static readonly Regex PageMarkdownFileRegex = new(
        @"_\d{3}\.md$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static async Task<string> ExportMarkdownAsync(
        string inputPath,
        string outputDirectory,
        CancellationToken cancellationToken = default)
    {
        string baseName = Path.GetFileNameWithoutExtension(inputPath);
        string arguments = $"export-markdown \"{inputPath}\" -o \"{outputDirectory}\"";
        await RunRhwpAsync(arguments, outputDirectory, baseName, cancellationToken).ConfigureAwait(false);
        return await ReadCombinedMarkdownAsync(outputDirectory, baseName, cancellationToken).ConfigureAwait(false);
    }

    private static async Task RunRhwpAsync(
        string arguments,
        string outputDirectory,
        string baseName,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = RhwpLocator.GetExecutablePath(),
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetDirectoryName(RhwpLocator.GetExecutablePath()) ?? outputDirectory,
        };

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("rhwp 변환 프로세스를 시작하지 못했습니다.");

        Task<string> outputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        Task<string> errorTask = process.StandardError.ReadToEndAsync(cancellationToken);
        await Task.WhenAll(
            process.WaitForExitAsync(cancellationToken),
            outputTask,
            errorTask).ConfigureAwait(false);

        string output = await outputTask.ConfigureAwait(false);
        string error = await errorTask.ConfigureAwait(false);

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"rhwp 변환에 실패했습니다. (코드 {process.ExitCode})\n{error}\n{output}".Trim());
        }

        if (!HasMarkdownOutput(outputDirectory, baseName))
        {
            throw new InvalidOperationException(
                $"rhwp 변환 결과 Markdown 파일을 찾을 수 없습니다.\n{output}\n{error}".Trim());
        }
    }

    private static bool HasMarkdownOutput(string outputDirectory, string baseName)
    {
        if (File.Exists(Path.Combine(outputDirectory, $"{baseName}.md")))
            return true;

        return Directory.EnumerateFiles(outputDirectory, $"{baseName}_*.md", SearchOption.TopDirectoryOnly)
            .Any(path => PageMarkdownFileRegex.IsMatch(path));
    }

    private static async Task<string> ReadCombinedMarkdownAsync(
        string outputDirectory,
        string baseName,
        CancellationToken cancellationToken)
    {
        var pageFiles = Directory.EnumerateFiles(outputDirectory, $"{baseName}_*.md", SearchOption.TopDirectoryOnly)
            .Where(path => PageMarkdownFileRegex.IsMatch(path))
            .OrderBy(path => path, StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (pageFiles.Count > 0)
        {
            var builder = new StringBuilder();
            for (int i = 0; i < pageFiles.Count; i++)
            {
                if (i > 0)
                {
                    builder.AppendLine();
                    builder.AppendLine("<!-- page-break -->");
                    builder.AppendLine();
                }

                string pageMarkdown = await File.ReadAllTextAsync(pageFiles[i], Encoding.UTF8, cancellationToken)
                    .ConfigureAwait(false);
                builder.Append(pageMarkdown.TrimEnd());
            }

            return builder.ToString();
        }

        string singlePagePath = Path.Combine(outputDirectory, $"{baseName}.md");
        if (File.Exists(singlePagePath))
        {
            return await File.ReadAllTextAsync(singlePagePath, Encoding.UTF8, cancellationToken)
                .ConfigureAwait(false);
        }

        throw new InvalidOperationException("rhwp 변환 결과 Markdown 파일을 찾을 수 없습니다.");
    }
}
