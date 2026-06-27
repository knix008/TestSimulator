using System.Diagnostics;
using System.Text;

namespace HWP2DocWinV10.Services;

internal static class Hwp2MdConversionService
{
    public static async Task<string> ExportMarkdownAsync(
        HwpConversionEngine engine,
        string inputPath,
        string outputDirectory,
        CancellationToken cancellationToken = default)
    {
        if (engine is not (HwpConversionEngine.Hwp2MdRoboco or HwpConversionEngine.Hwp2MdHephaex))
            throw new ArgumentOutOfRangeException(nameof(engine), engine, "hwp2md 엔진이 아닙니다.");

        string baseName = Path.GetFileNameWithoutExtension(inputPath);
        string markdownPath = Path.Combine(outputDirectory, $"{baseName}.md");
        string assetsDirectory = Path.Combine(outputDirectory, "assets");
        Directory.CreateDirectory(assetsDirectory);

        string executable = engine switch
        {
            HwpConversionEngine.Hwp2MdRoboco => Hwp2MdRobocoLocator.GetExecutablePath(),
            HwpConversionEngine.Hwp2MdHephaex => Hwp2MdHephaexLocator.GetExecutablePath(),
            _ => throw new ArgumentOutOfRangeException(nameof(engine)),
        };

        string arguments = engine switch
        {
            HwpConversionEngine.Hwp2MdRoboco =>
                $"\"{inputPath}\" -o \"{markdownPath}\"",
            HwpConversionEngine.Hwp2MdHephaex =>
                $"to-md \"{inputPath}\" -o \"{markdownPath}\" --assets-dir \"{assetsDirectory}\"",
            _ => throw new ArgumentOutOfRangeException(nameof(engine)),
        };

        await RunAsync(executable, arguments, outputDirectory, engine, cancellationToken).ConfigureAwait(false);

        if (!File.Exists(markdownPath))
        {
            throw new InvalidOperationException(
                $"hwp2md 변환 결과 Markdown 파일을 찾을 수 없습니다: {markdownPath}");
        }

        return await File.ReadAllTextAsync(markdownPath, Encoding.UTF8, cancellationToken).ConfigureAwait(false);
    }

    private static async Task RunAsync(
        string executable,
        string arguments,
        string outputDirectory,
        HwpConversionEngine engine,
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
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetDirectoryName(executable) ?? outputDirectory,
        };

        using var process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("hwp2md 변환 프로세스를 시작하지 못했습니다.");

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
            string label = HwpConversionEngineCatalog.FormatLabel(engine);
            throw new InvalidOperationException(
                $"{label} 변환에 실패했습니다. (코드 {process.ExitCode})\n{error}\n{output}".Trim());
        }
    }
}
