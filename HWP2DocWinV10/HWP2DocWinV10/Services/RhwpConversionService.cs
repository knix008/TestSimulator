using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
using HWP2DocWinV10.Export;

namespace HWP2DocWinV10.Services;

/// <summary>
/// rhwp export-markdown 결과를 기반으로 변환합니다. 표·그림은 rhwp 출력을 최대한 그대로 유지합니다.
/// </summary>
internal static class RhwpConversionService
{
    private static readonly Regex PageMarkdownFileRegex = new(
        @"_\d{3}\.md$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static async Task<HwpConversionResult> ConvertAsync(
        string inputPath,
        string outputDirectory,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        string baseName = Path.GetFileNameWithoutExtension(inputPath);

        progress?.Report("rhwp로 문서를 변환하는 중 (표·그림·레이아웃)...");
        await RunRhwpExportMarkdownAsync(inputPath, outputDirectory, baseName, cancellationToken)
            .ConfigureAwait(false);

        string markdown = await ReadCombinedMarkdownAsync(outputDirectory, baseName, cancellationToken)
            .ConfigureAwait(false);

        progress?.Report("Markdown을 정리하는 중...");
        markdown = MarkdownLineBreakRestorer.Restore(markdown);
        markdown = MarkdownPipeTableNormalizer.Normalize(markdown);
        markdown = MarkdownAssetPathResolver.RewriteMarkdownImages(markdown, outputDirectory);

        string? structureMarkdown = await TryGetUnhwpStructureMarkdownAsync(
            inputPath,
            outputDirectory,
            cancellationToken).ConfigureAwait(false);

        if (!string.IsNullOrWhiteSpace(structureMarkdown))
            markdown = MarkdownHeadingMerger.MergeBodyWithStructureHints(markdown, structureMarkdown);

        markdown = MarkdownHeadingNormalizer.Normalize(markdown);

        string markdownPath = Path.Combine(outputDirectory, $"{baseName}.md");
        await File.WriteAllTextAsync(markdownPath, markdown, Encoding.UTF8, cancellationToken).ConfigureAwait(false);

        return new HwpConversionResult
        {
            Markdown = markdown,
            AssetDirectory = outputDirectory,
            MarkdownFilePath = markdownPath,
            SourceFilePath = inputPath
        };
    }

    private static async Task RunRhwpExportMarkdownAsync(
        string inputPath,
        string outputDirectory,
        string baseName,
        CancellationToken cancellationToken)
    {
        string arguments = $"export-markdown \"{inputPath}\" -o \"{outputDirectory}\"";
        await RunRhwpAsync(arguments, outputDirectory, baseName, cancellationToken).ConfigureAwait(false);
    }

    private static async Task RunRhwpAsync(
        string arguments,
        string outputDirectory,
        string baseName,
        CancellationToken cancellationToken)
    {
        string executable = RhwpLocator.GetExecutablePath();
        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };

        using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        if (!process.Start())
            throw new InvalidOperationException("rhwp 변환 프로세스를 시작하지 못했습니다.");

        var stdout = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderr = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);

        string output = await stdout.ConfigureAwait(false);
        string error = await stderr.ConfigureAwait(false);

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"rhwp 변환에 실패했습니다. (코드 {process.ExitCode})\n{error}\n{output}".Trim());
        }

        if (!HasRhwpMarkdownOutput(outputDirectory, baseName))
        {
            throw new InvalidOperationException(
                $"rhwp 변환 결과 Markdown 파일을 찾을 수 없습니다.\n{output}\n{error}".Trim());
        }
    }

    private static bool HasRhwpMarkdownOutput(string outputDirectory, string baseName)
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

    private static async Task<string?> TryGetUnhwpStructureMarkdownAsync(
        string inputPath,
        string outputDirectory,
        CancellationToken cancellationToken)
    {
        string unhwpExecutable = Path.Combine(AppContext.BaseDirectory, "Tools", "unhwp", "unhwp.exe");
        if (!File.Exists(unhwpExecutable))
            return null;

        string structureDirectory = Path.Combine(outputDirectory, "_unhwp");
        Directory.CreateDirectory(structureDirectory);
        string structurePath = Path.Combine(structureDirectory, "_structure.md");

        try
        {
            await RunUnhwpMarkdownAsync(unhwpExecutable, inputPath, structurePath, cancellationToken)
                .ConfigureAwait(false);
            if (!File.Exists(structurePath))
                return null;

            return await File.ReadAllTextAsync(structurePath, Encoding.UTF8, cancellationToken)
                .ConfigureAwait(false);
        }
        catch
        {
            return null;
        }
    }

    private static async Task RunUnhwpMarkdownAsync(
        string executable,
        string inputPath,
        string markdownPath,
        CancellationToken cancellationToken)
    {
        string arguments =
            $"markdown \"{inputPath}\" -o \"{markdownPath}\" --table-mode html --max-heading 6 --cleanup standard";

        await RunUnhwpAsync(executable, arguments, cancellationToken).ConfigureAwait(false);
    }

    private static async Task RunUnhwpAsync(
        string executable,
        string arguments,
        CancellationToken cancellationToken)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = executable,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8
        };

        using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        if (!process.Start())
            throw new InvalidOperationException("unhwp 프로세스를 시작하지 못했습니다.");

        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"unhwp 실행에 실패했습니다. (코드 {process.ExitCode})");
    }
}
