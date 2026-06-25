using System.Diagnostics;
using System.Text;

namespace HWP2DocWinV10.Services;

internal sealed class HwpConversionResult
{
    public required string Markdown { get; init; }
    public required string AssetDirectory { get; init; }
    public required string MarkdownFilePath { get; init; }
    public required string SourceFilePath { get; init; }
}

internal static class HwpConversionService
{
    private static readonly string[] SupportedExtensions = [".hwp", ".hwpx"];

    public static bool IsSupported(string path)
    {
        string ext = Path.GetExtension(path);
        return SupportedExtensions.Contains(ext, StringComparer.OrdinalIgnoreCase);
    }

    public static async Task<HwpConversionResult> ConvertAsync(
        string inputPath,
        IProgress<string>? progress = null,
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(inputPath))
            throw new FileNotFoundException("입력 파일을 찾을 수 없습니다.", inputPath);

        if (!IsSupported(inputPath))
            throw new NotSupportedException("지원하지 않는 파일 형식입니다. .hwp 또는 .hwpx 파일만 변환할 수 있습니다.");

        string outputDirectory = Path.Combine(
            Path.GetTempPath(),
            "HWP2DocWinV10",
            Path.GetFileNameWithoutExtension(inputPath) + "_" + Guid.NewGuid().ToString("N")[..8]);

        Directory.CreateDirectory(outputDirectory);

        progress?.Report("HWP 문서를 Markdown으로 변환하는 중...");
        await RunUnhwpConvertAsync(inputPath, outputDirectory, cancellationToken).ConfigureAwait(false);

        string baseName = Path.GetFileNameWithoutExtension(inputPath);
        string markdownPath = Path.Combine(outputDirectory, $"{baseName}.md");
        try
        {
            await RunUnhwpMarkdownAsync(inputPath, markdownPath, cancellationToken).ConfigureAwait(false);
        }
        catch (InvalidOperationException)
        {
            // convert 결과 Markdown을 사용합니다.
        }

        if (!File.Exists(markdownPath))
        {
            markdownPath = FindMarkdownFile(outputDirectory)
                ?? throw new InvalidOperationException("변환 결과 Markdown 파일을 찾을 수 없습니다.");
        }

        string markdown = await File.ReadAllTextAsync(markdownPath, Encoding.UTF8, cancellationToken)
            .ConfigureAwait(false);

        return new HwpConversionResult
        {
            Markdown = markdown,
            AssetDirectory = outputDirectory,
            MarkdownFilePath = markdownPath,
            SourceFilePath = inputPath
        };
    }

    private static async Task RunUnhwpConvertAsync(string inputPath, string outputDirectory, CancellationToken cancellationToken)
    {
        await RunUnhwpAsync(
            $"convert \"{inputPath}\" -o \"{outputDirectory}\" -q --cleanup standard",
            cancellationToken).ConfigureAwait(false);
    }

    private static async Task RunUnhwpMarkdownAsync(string inputPath, string markdownPath, CancellationToken cancellationToken)
    {
        await RunUnhwpAsync(
            $"markdown \"{inputPath}\" -o \"{markdownPath}\" --table-mode html --cleanup standard",
            cancellationToken).ConfigureAwait(false);
    }

    private static async Task RunUnhwpAsync(string arguments, CancellationToken cancellationToken)
    {
        string executable = UnhwpLocator.GetExecutablePath();
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
            throw new InvalidOperationException("HWP 변환 프로세스를 시작하지 못했습니다.");

        var stdout = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stderr = process.StandardError.ReadToEndAsync(cancellationToken);
        await process.WaitForExitAsync(cancellationToken).ConfigureAwait(false);

        if (process.ExitCode != 0)
        {
            string error = await stderr.ConfigureAwait(false);
            string output = await stdout.ConfigureAwait(false);
            throw new InvalidOperationException(
                $"HWP 변환에 실패했습니다. (코드 {process.ExitCode})\n{error}\n{output}".Trim());
        }
    }

    private static string? FindMarkdownFile(string directory)
    {
        return Directory.EnumerateFiles(directory, "*.md", SearchOption.AllDirectories)
            .OrderBy(path => path.Length)
            .FirstOrDefault();
    }
}
